from decimal import Decimal

from sqlalchemy import select

from app.audit.models import AuditEvent
from app.commerce.models import Invoice, Order, TicketCategory
from app.core.database import AsyncSessionFactory
from app.integrations.providers import MockCRMProvider, MockERPProvider
from app.integrations.service import IntegrationJobService, ReconciliationService
from app.notifications.models import Notification
from app.notifications.providers import FakeEmailProvider, NotificationMessage
from tests.factories import login, tenant_fixture


async def test_full_platform_mock_scenario(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    admin_token = await login(client, "a@example.test")
    admin_headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    invitation = await client.post(
        "/api/v1/auth/invitations",
        headers=admin_headers,
        json={"email": "invited@example.test", "role_id": str(data["role_a"].id)},
    )
    assert invitation.status_code == 201
    accepted = await client.post(
        f"/api/v1/auth/invitations/{invitation.json()['token']}/accept",
        json={"display_name": "Invited Buyer", "password": "InvitedPassword123!"},
    )
    assert accepted.status_code == 200
    buyer_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "invited@example.test", "password": "InvitedPassword123!"},
    )
    assert buyer_login.status_code == 200
    buyer_token = buyer_login.json()["access_token"]
    headers = {
        "Authorization": f"Bearer {buyer_token}",
        "X-Organization-ID": str(data["org_a"].id),
    }

    catalog = await client.get("/api/v1/catalog/products")
    assert catalog.status_code == 200 and "items" in catalog.json()
    quote = await client.post(
        "/api/v1/quotes",
        headers=headers,
        json={"comment": "Generic lifecycle", "items": [{"quantity": "1"}]},
    )
    assert quote.status_code == 201
    assert await MockCRMProvider().create_lead({"quote_id": quote.json()["id"]}) == "mock-lead-1"

    async with AsyncSessionFactory() as session:
        jobs = IntegrationJobService(session)
        job, created = await jobs.enqueue(
            provider="mock_erp",
            operation="order.sync",
            idempotency_key="full-scenario-order",
            organization_id=data["org_a"].id,
        )
        await session.commit()

        async def persist_order(payload, transaction):
            order = Order(
                organization_id=data["org_a"].id,
                external_id=payload["external_id"],
                number="MOCK-SYNC-1",
                currency="KZT",
                amount=Decimal("10"),
                status_id=data["status"].id,
            )
            transaction.add(order)
            await transaction.flush()
            await ReconciliationService(transaction).record(
                organization_id=data["org_a"].id,
                provider="mock_erp",
                entity_type="order",
                external_id=payload["external_id"],
                internal_id=order.id,
            )

        synced = await jobs.execute(
            job.id, lambda: MockERPProvider().get_order("FULL-MOCK-1"), persist_order
        )
        assert created and synced.status == "succeeded"
        session.add(
            Invoice(
                organization_id=data["org_a"].id,
                number="FULL-INV-1",
                amount=Decimal("10"),
                currency="KZT",
                status="mock",
                source="mock_erp",
                external_id="FULL-INV-1",
            )
        )
        await session.commit()

    orders = await client.get("/api/v1/orders", headers=headers)
    invoices = await client.get("/api/v1/finance/invoices", headers=headers)
    documents = await client.get("/api/v1/documents", headers=headers)
    assert any(item["number"] == "MOCK-SYNC-1" for item in orders.json()["items"])
    assert any(item["number"] == "FULL-INV-1" for item in invoices.json()["items"])
    own_document = next(
        item for item in documents.json()["items"] if item["id"] == str(data["document_a"].id)
    )
    download = await client.get(f"/api/v1/files/{own_document['latest_file_id']}", headers=headers)
    assert download.status_code == 200

    async with AsyncSessionFactory() as session:
        category_id = await session.scalar(
            select(TicketCategory.id).where(TicketCategory.code == "other")
        )
    ticket = await client.post(
        "/api/v1/support/tickets",
        headers=headers,
        json={"category_id": str(category_id), "subject": "Lifecycle", "message": "Help"},
    )
    assert ticket.status_code == 201

    email = FakeEmailProvider()
    provider_id = await email.send(
        NotificationMessage("invited@example.test", "Lifecycle", "Created")
    )
    async with AsyncSessionFactory() as session:
        session.add(
            Notification(
                organization_id=data["org_a"].id,
                user_id=(await session.scalar(
                    select(AuditEvent.actor_user_id).where(
                        AuditEvent.action == "document.download",
                        AuditEvent.organization_id == data["org_a"].id,
                    )
                )),
                channel="email",
                status="sent",
                subject="Lifecycle",
                body="Created",
                provider_message_id=provider_id,
            )
        )
        await session.commit()
        assert await session.scalar(
            select(AuditEvent.id).where(
                AuditEvent.action == "document.download",
                AuditEvent.organization_id == data["org_a"].id,
            )
        )
        assert await session.scalar(select(Notification.id).where(Notification.status == "sent"))
