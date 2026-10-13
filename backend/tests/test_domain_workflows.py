from sqlalchemy import select

from app.commerce.models import TicketCategory
from app.core.database import AsyncSessionFactory
from tests.factories import login, tenant_fixture


async def test_foreign_document_is_hidden(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    response = await client.get(
        f"/api/v1/documents/{data['document_b'].id}",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Organization-ID": str(data["org_a"].id),
        },
    )
    assert response.status_code == 404


async def test_quote_and_ticket_workflows(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    quote = await client.post(
        "/api/v1/quotes",
        headers=headers,
        json={"comment": "Mock RFQ", "items": [{"quantity": "2", "parameters": {}}]},
    )
    assert quote.status_code == 201
    async with AsyncSessionFactory() as session:
        category_id = await session.scalar(
            select(TicketCategory.id).where(TicketCategory.code == "other")
        )
    ticket = await client.post(
        "/api/v1/support/tickets",
        headers=headers,
        json={"category_id": str(category_id), "subject": "Mock ticket", "message": "Test"},
    )
    assert ticket.status_code == 201
