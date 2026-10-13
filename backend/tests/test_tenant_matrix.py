from decimal import Decimal

from app.commerce.models import Invoice, Payment, QuoteRequest, Ticket
from app.core.database import AsyncSessionFactory
from tests.factories import login, tenant_fixture


def ids(response) -> set[str]:
    assert response.status_code == 200, response.text
    return {item["id"] for item in response.json()["items"]}


async def test_all_tenant_lists_exclude_foreign_entities(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        invoice_a = Invoice(
            organization_id=data["org_a"].id,
            order_id=data["order_a"].id,
            number="A-INV",
            amount=Decimal("1"),
            currency="KZT",
            status="mock",
            source="mock",
        )
        invoice_b = Invoice(
            organization_id=data["org_b"].id,
            order_id=data["order_b"].id,
            number="B-INV",
            amount=Decimal("2"),
            currency="KZT",
            status="mock",
            source="mock",
        )
        payment_a = Payment(
            organization_id=data["org_a"].id,
            amount=Decimal("1"),
            currency="KZT",
            source="mock",
        )
        payment_b = Payment(
            organization_id=data["org_b"].id,
            amount=Decimal("2"),
            currency="KZT",
            source="mock",
        )
        quote_a = QuoteRequest(
            organization_id=data["org_a"].id,
            created_by_id=data["user_a"].id,
            status="mock",
        )
        quote_b = QuoteRequest(
            organization_id=data["org_b"].id,
            created_by_id=data["user_b"].id,
            status="mock",
        )
        ticket_a = Ticket(
            organization_id=data["org_a"].id,
            created_by_id=data["user_a"].id,
            category_id=data["ticket_category"].id,
            status_id=data["ticket_status"].id,
            subject="A",
        )
        ticket_b = Ticket(
            organization_id=data["org_b"].id,
            created_by_id=data["user_b"].id,
            category_id=data["ticket_category"].id,
            status_id=data["ticket_status"].id,
            subject="B",
        )
        session.add_all(
            [invoice_a, invoice_b, payment_a, payment_b, quote_a, quote_b, ticket_a, ticket_b]
        )
        await session.commit()

    token = await login(client, "a@example.test")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    assert str(data["order_a"].id) in ids(await client.get("/api/v1/orders", headers=headers))
    assert str(data["order_b"].id) not in ids(await client.get("/api/v1/orders", headers=headers))
    assert str(invoice_a.id) in ids(
        await client.get("/api/v1/finance/invoices", headers=headers)
    )
    assert str(invoice_b.id) not in ids(
        await client.get("/api/v1/finance/invoices", headers=headers)
    )
    assert str(payment_a.id) in ids(
        await client.get("/api/v1/finance/payments", headers=headers)
    )
    assert str(payment_b.id) not in ids(
        await client.get("/api/v1/finance/payments", headers=headers)
    )
    assert str(quote_a.id) in ids(await client.get("/api/v1/quotes", headers=headers))
    assert str(quote_b.id) not in ids(await client.get("/api/v1/quotes", headers=headers))
    assert str(ticket_a.id) in ids(
        await client.get("/api/v1/support/tickets", headers=headers)
    )
    assert str(ticket_b.id) not in ids(
        await client.get("/api/v1/support/tickets", headers=headers)
    )
    assert str(data["document_b"].id) not in ids(
        await client.get("/api/v1/documents", headers=headers)
    )


async def test_request_organization_mass_assignment_and_huge_page_are_safe(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    rejected = await client.post(
        "/api/v1/quotes",
        headers=headers,
        json={
            "organization_id": str(data["org_b"].id),
            "items": [{"quantity": "1"}],
        },
    )
    assert rejected.status_code == 422
    page = await client.get("/api/v1/orders?page_size=1000000", headers=headers)
    assert page.status_code == 200
    assert page.json()["page_size"] <= 100
