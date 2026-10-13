import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.auth.security import hash_password
from app.catalog.models import (
    Category,
    Product,
    ProductAttributeDefinition,
    ProductAttributeValue,
)
from app.commerce.models import (
    Invoice,
    Order,
    OrderItem,
    OrderStatus,
    TicketCategory,
    TicketStatus,
)
from app.core.config import get_settings
from app.core.database import AsyncSessionFactory
from app.documents.models import Document, DocumentType, DocumentVersion
from app.files.models import FileObject
from app.files.storage import get_file_storage
from app.identity.models import Membership, Organization, Permission, Role, User

PERMISSIONS = {
    "catalog.read",
    "catalog.manage",
    "order.read",
    "order.create",
    "document.read",
    "document.create",
    "finance.read",
    "quote.read",
    "quote.create",
    "ticket.read",
    "ticket.create",
    "organization.manage_users",
    "integration.read",
    "content.manage",
}


async def seed() -> None:
    if get_settings().env == "production":
        raise RuntimeError("DEV seed is disabled in production")
    async with AsyncSessionFactory() as session:
        if await session.scalar(select(User.id).limit(1)):
            print("Seed skipped: users already exist")
            return
        permissions = {}
        for code in PERMISSIONS:
            permission = await session.scalar(select(Permission).where(Permission.code == code))
            if permission is None:
                permission = Permission(code=code, description="DEV example")
                session.add(permission)
            permissions[code] = permission
        org_a = Organization(
            name="Demo Industrial Company", external_id="DEMO-ORG-A", is_active=True
        )
        org_b = Organization(name="Demo Supplier", external_id="DEMO-ORG-B", is_active=True)
        session.add_all([org_a, org_b])
        await session.flush()

        admin_role = Role(
            organization_id=org_a.id,
            code="dev_admin",
            name="DEV Admin (placeholder)",
            permissions=[permissions[code] for code in PERMISSIONS if code != "catalog.manage"],
        )
        catalog_role = await session.scalar(
            select(Role).where(
                Role.organization_id.is_(None), Role.code == "platform_catalog_manager"
            )
        )
        if catalog_role is None:
            catalog_role = Role(
                organization_id=None,
                code="platform_catalog_manager",
                name="Platform catalog manager",
                permissions=[permissions["catalog.manage"], permissions["catalog.read"]],
            )
            session.add(catalog_role)
        buyer_role = Role(
            organization_id=org_a.id,
            code="dev_buyer",
            name="DEV Buyer (placeholder)",
            permissions=[
                permissions[code]
                for code in [
                    "catalog.read",
                    "order.read",
                    "document.read",
                    "quote.read",
                    "quote.create",
                    "ticket.read",
                    "ticket.create",
                ]
            ],
        )
        accountant_role = Role(
            organization_id=org_b.id,
            code="dev_accountant",
            name="DEV Accountant (placeholder)",
            permissions=[
                permissions["order.read"],
                permissions["finance.read"],
                permissions["document.read"],
            ],
        )
        engineer_role = Role(
            organization_id=org_a.id,
            code="dev_engineer",
            name="DEV Engineer (placeholder)",
            permissions=[
                permissions["catalog.read"],
                permissions["order.read"],
                permissions["document.read"],
                permissions["ticket.read"],
                permissions["ticket.create"],
            ],
        )
        session.add_all([admin_role, buyer_role, accountant_role, engineer_role])
        await session.flush()
        password = hash_password("ChangeMe123!")
        admin = User(email="admin@demo.example", display_name="Demo Admin", password_hash=password)
        buyer = User(email="buyer@demo.example", display_name="Demo Buyer", password_hash=password)
        accountant = User(
            email="accountant@demo.example",
            display_name="Demo Accountant",
            password_hash=password,
        )
        engineer = User(
            email="engineer@demo.example", display_name="Demo Engineer", password_hash=password
        )
        catalog_admin = User(
            email="catalog@demo.example",
            display_name="Demo Catalog Manager",
            password_hash=password,
        )
        session.add_all([admin, buyer, accountant, engineer, catalog_admin])
        await session.flush()
        session.add_all(
            [
                Membership(user_id=admin.id, organization_id=org_a.id, role_id=admin_role.id),
                Membership(
                    user_id=catalog_admin.id, organization_id=org_a.id, role_id=catalog_role.id
                ),
                Membership(user_id=buyer.id, organization_id=org_a.id, role_id=buyer_role.id),
                Membership(
                    user_id=accountant.id, organization_id=org_b.id, role_id=accountant_role.id
                ),
                Membership(user_id=engineer.id, organization_id=org_a.id, role_id=engineer_role.id),
            ]
        )

        category = Category(
            slug="demo-equipment",
            translations={"en": {"name": "Demo Equipment"}},
            is_published=True,
        )
        session.add(category)
        await session.flush()
        attribute = ProductAttributeDefinition(
            category_id=category.id,
            code="demo_parameter",
            data_type="string",
            unit=None,
            translations={"en": {"name": "Demo parameter"}},
            is_filterable=True,
            is_comparable=True,
        )
        product = Product(
            category_id=category.id,
            slug="demo-transformer-a",
            sku="DEMO-001",
            translations={"en": {"name": "Demo Transformer A"}},
            status="published",
        )
        session.add_all([attribute, product])
        await session.flush()
        session.add(
            ProductAttributeValue(
                product_id=product.id, definition_id=attribute.id, value_text="example"
            )
        )

        received = OrderStatus(code="received", label="DEV Received", sort_order=10)
        session.add(received)
        await session.flush()
        order_a = Order(
            organization_id=org_a.id,
            external_id="ERP-MOCK-A-1",
            number="DEV-A-001",
            currency="KZT",
            amount=Decimal("1000.00"),
            status_id=received.id,
        )
        order_b = Order(
            organization_id=org_b.id,
            external_id="ERP-MOCK-B-1",
            number="DEV-B-001",
            currency="KZT",
            amount=Decimal("2000.00"),
            status_id=received.id,
        )
        session.add_all([order_a, order_b])
        await session.flush()
        session.add_all(
            [
                OrderItem(
                    order_id=order_a.id,
                    product_id=product.id,
                    description="Demo Transformer A",
                    quantity=1,
                ),
                OrderItem(
                    order_id=order_b.id,
                    product_id=product.id,
                    description="Demo Transformer A",
                    quantity=2,
                ),
                Invoice(
                    organization_id=org_a.id,
                    order_id=order_a.id,
                    number="DEV-INV-A-1",
                    amount=Decimal("1000.00"),
                    currency="KZT",
                    status="mock",
                    source="ERP",
                ),
                Invoice(
                    organization_id=org_b.id,
                    order_id=order_b.id,
                    number="DEV-INV-B-1",
                    amount=Decimal("2000.00"),
                    currency="KZT",
                    status="mock",
                    source="ERP",
                ),
                TicketCategory(code="other", label="DEV Other"),
                TicketStatus(code="new", label="DEV New"),
            ]
        )
        document_type = DocumentType(code="generic", name="DEV Generic document")
        session.add(document_type)
        await session.flush()
        content = b"DEMO ONLY. Synthetic technical document."
        storage_key, checksum = await get_file_storage().upload(content)
        storage_key_b, checksum_b = await get_file_storage().upload(content)
        file_object = FileObject(
            organization_id=org_a.id,
            storage_key=storage_key,
            original_name="mock-document.txt",
            content_type="text/plain",
            size_bytes=len(content),
            checksum_sha256=checksum,
            storage_backend="local",
        )
        session.add(file_object)
        file_object_b = FileObject(
            organization_id=org_b.id,
            storage_key=storage_key_b,
            original_name="mock-document-b.txt",
            content_type="text/plain",
            size_bytes=len(content),
            checksum_sha256=checksum_b,
            storage_backend="local",
        )
        session.add(file_object_b)
        await session.flush()
        document = Document(
            organization_id=org_a.id,
            type_id=document_type.id,
            number="DEV-DOC-A-1",
            title="Demo organization document",
            external_id="MOCK-DOC-A-1",
            source="mock",
        )
        session.add(document)
        document_b = Document(
            organization_id=org_b.id,
            type_id=document_type.id,
            number="DEV-DOC-B-1",
            title="Demo supplier document",
            external_id="MOCK-DOC-B-1",
            source="mock",
        )
        session.add(document_b)
        await session.flush()
        session.add_all(
            [
                DocumentVersion(
                    organization_id=org_a.id,
                    document_id=document.id,
                    file_id=file_object.id,
                    version=1,
                ),
                DocumentVersion(
                    organization_id=org_b.id,
                    document_id=document_b.id,
                    file_id=file_object_b.id,
                    version=1,
                ),
            ]
        )
        await session.commit()
        print("DEV-only deterministic demo seed created. Password: ChangeMe123!")


if __name__ == "__main__":
    asyncio.run(seed())
