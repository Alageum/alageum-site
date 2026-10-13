from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AIConversation
from app.auth.security import hash_password
from app.commerce.models import Order, OrderStatus, TicketCategory, TicketStatus
from app.documents.models import Document, DocumentType, DocumentVersion
from app.files.models import FileObject
from app.files.storage import get_file_storage
from app.identity.models import Membership, Organization, Permission, Role, User


async def tenant_fixture(session: AsyncSession) -> dict:
    permission_codes = [
        "order.read",
        "document.read",
        "document.create",
        "finance.read",
        "ticket.create",
        "ticket.read",
        "quote.create",
        "quote.read",
        "organization.manage_users",
    ]
    permissions = {code: Permission(code=code) for code in permission_codes}
    org_a = Organization(name="A", external_id="A")
    org_b = Organization(name="B", external_id="B")
    session.add_all([*permissions.values(), org_a, org_b])
    await session.flush()
    role_a = Role(
        organization_id=org_a.id,
        code="test_a",
        name="Test A",
        permissions=list(permissions.values()),
    )
    role_b = Role(
        organization_id=org_b.id,
        code="test_b",
        name="Test B",
        permissions=list(permissions.values()),
    )
    no_access_role = Role(organization_id=org_a.id, code="empty", name="Empty", permissions=[])
    session.add_all([role_a, role_b, no_access_role])
    await session.flush()
    user_a = User(
        email="a@example.test", display_name="A", password_hash=hash_password("Password123!")
    )
    user_b = User(
        email="b@example.test", display_name="B", password_hash=hash_password("Password123!")
    )
    user_empty = User(
        email="empty@example.test",
        display_name="Empty",
        password_hash=hash_password("Password123!"),
    )
    session.add_all([user_a, user_b, user_empty])
    await session.flush()
    session.add_all(
        [
            Membership(user_id=user_a.id, organization_id=org_a.id, role_id=role_a.id),
            Membership(user_id=user_b.id, organization_id=org_b.id, role_id=role_b.id),
            Membership(user_id=user_empty.id, organization_id=org_a.id, role_id=no_access_role.id),
        ]
    )
    status = OrderStatus(code="mock", label="Mock")
    session.add(status)
    await session.flush()
    order_a = Order(
        organization_id=org_a.id,
        number="A-1",
        currency="KZT",
        amount=Decimal("1"),
        status_id=status.id,
    )
    order_b = Order(
        organization_id=org_b.id,
        number="B-1",
        currency="KZT",
        amount=Decimal("2"),
        status_id=status.id,
    )
    session.add_all([order_a, order_b])
    await session.flush()
    content = b"%PDF-1.4\nMock tenant A document"
    key_a, checksum_a = await get_file_storage().upload(content)
    file_a = FileObject(
        organization_id=org_a.id,
        storage_key=key_a,
        original_name="own.pdf",
        content_type="application/pdf",
        size_bytes=len(content),
        checksum_sha256=checksum_a,
        storage_backend="local",
    )
    file_b = FileObject(
        organization_id=org_b.id,
        storage_key="test/foreign",
        original_name="foreign.pdf",
        content_type="application/pdf",
        size_bytes=1,
        checksum_sha256="0" * 64,
        storage_backend="local",
    )
    session.add_all([file_a, file_b])
    await session.flush()
    document_type = DocumentType(code="generic", name="Generic")
    session.add(document_type)
    await session.flush()
    document_a = Document(
        organization_id=org_a.id,
        type_id=document_type.id,
        title="Own document",
        source="mock",
    )
    document_b = Document(
        organization_id=org_b.id,
        type_id=document_type.id,
        title="Foreign document",
        source="mock",
    )
    session.add_all([document_a, document_b])
    await session.flush()
    ticket_category = TicketCategory(code="other", label="Other")
    ticket_status = TicketStatus(code="new", label="New")
    session.add_all(
        [
            DocumentVersion(
                organization_id=org_b.id,
                document_id=document_b.id,
                file_id=file_b.id,
                version=1,
            ),
            DocumentVersion(
                organization_id=org_a.id,
                document_id=document_a.id,
                file_id=file_a.id,
                version=1,
            ),
            ticket_category,
            ticket_status,
        ]
    )
    conversation_a = AIConversation(user_id=user_a.id, organization_id=org_a.id, scope="b2b")
    conversation_b = AIConversation(user_id=user_b.id, organization_id=org_b.id, scope="b2b")
    session.add_all([conversation_a, conversation_b])
    await session.commit()
    return locals()


async def login(client, email: str) -> str:
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def published_product(session: AsyncSession, key: str = "rfq-product"):
    from app.catalog.models import Category, Product

    category = Category(slug=key, public_key=key, is_published=True)
    session.add(category)
    await session.flush()
    product = Product(
        slug=key,
        public_key=key,
        category_id=category.id,
        status="published",
        translations={"ru": {"name": "Test catalogue product"}},
        price_mode="fixed",
        price=Decimal("120.50"),
        currency="KZT",
        specs={"series": "Test series", "isOrderableSku": False},
    )
    session.add(product)
    await session.commit()
    return product
