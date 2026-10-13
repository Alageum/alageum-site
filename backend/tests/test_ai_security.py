from datetime import timedelta

from sqlalchemy import select

from app.ai.models import AIActionConfirmation
from app.commerce.models import TicketCategory
from app.core.database import AsyncSessionFactory
from app.core.models import utcnow
from tests.factories import login, tenant_fixture


async def test_ai_cannot_read_another_tenant_order(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    headers = {"Authorization": f"Bearer {token}", "X-Organization-ID": str(data["org_a"].id)}
    response = await client.post(
        "/api/v1/ai/tools/execute",
        headers=headers,
        json={
            "conversation_id": str(data["conversation_a"].id),
            "tool": "get_order",
            "arguments": {"order_id": str(data["order_b"].id)},
        },
    )
    assert response.status_code == 404


async def test_ai_write_requires_confirmation(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        category_id = await session.scalar(
            select(TicketCategory.id).where(TicketCategory.code == "other")
        )
    token = await login(client, "a@example.test")
    headers = {"Authorization": f"Bearer {token}", "X-Organization-ID": str(data["org_a"].id)}
    body = {
        "conversation_id": str(data["conversation_a"].id),
        "tool": "create_ticket",
        "arguments": {
            "category_id": str(category_id),
            "subject": "test",
            "message": "confirmed message",
        },
    }
    denied = await client.post("/api/v1/ai/tools/execute", headers=headers, json=body)
    assert denied.status_code == 409
    confirmation_id = denied.json()["error"]["details"]["confirmation_id"]
    confirmed = await client.post(
        f"/api/v1/ai/tools/confirm/{confirmation_id}", headers=headers
    )
    assert confirmed.status_code == 200
    accepted = await client.post(
        "/api/v1/ai/tools/execute",
        headers=headers,
        json={**body, "confirmation_id": confirmation_id},
    )
    assert accepted.status_code == 200
    replay = await client.post(
        "/api/v1/ai/tools/execute",
        headers=headers,
        json={**body, "confirmation_id": confirmation_id},
    )
    assert replay.status_code == 409


async def test_ai_confirmation_is_bound_to_arguments_and_tenant(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        category_id = await session.scalar(
            select(TicketCategory.id).where(TicketCategory.code == "other")
        )
    token_a = await login(client, "a@example.test")
    token_b = await login(client, "b@example.test")
    headers_a = {
        "Authorization": f"Bearer {token_a}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    headers_b = {
        "Authorization": f"Bearer {token_b}",
        "X-Organization-ID": str(data["org_b"].id),
    }
    body = {
        "conversation_id": str(data["conversation_a"].id),
        "tool": "create_ticket",
        "arguments": {
            "category_id": str(category_id),
            "subject": "original",
            "message": "message",
        },
    }
    proposal = await client.post("/api/v1/ai/tools/execute", headers=headers_a, json=body)
    confirmation_id = proposal.json()["error"]["details"]["confirmation_id"]
    assert (
        await client.post(f"/api/v1/ai/tools/confirm/{confirmation_id}", headers=headers_b)
    ).status_code == 404
    assert (
        await client.post(f"/api/v1/ai/tools/confirm/{confirmation_id}", headers=headers_a)
    ).status_code == 200
    changed = {**body, "arguments": {**body["arguments"], "subject": "changed"}}
    changed["confirmation_id"] = confirmation_id
    assert (
        await client.post("/api/v1/ai/tools/execute", headers=headers_a, json=changed)
    ).status_code == 409


async def test_expired_ai_confirmation_is_denied(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        item = AIActionConfirmation(
            user_id=data["user_a"].id,
            organization_id=data["org_a"].id,
            tool_name="create_ticket",
            arguments_hash="0" * 64,
            expires_at=utcnow() - timedelta(seconds=1),
        )
        session.add(item)
        await session.commit()
    token = await login(client, "a@example.test")
    response = await client.post(
        f"/api/v1/ai/tools/confirm/{item.id}",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Organization-ID": str(data["org_a"].id),
        },
    )
    assert response.status_code == 409


async def test_ai_foreign_conversation_and_anonymous_private_tool_are_denied(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    response = await client.post(
        "/api/v1/ai/tools/execute",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Organization-ID": str(data["org_a"].id),
        },
        json={
            "conversation_id": str(data["conversation_b"].id),
            "tool": "get_order",
            "arguments": {"order_id": str(data["order_a"].id)},
        },
    )
    assert response.status_code == 404
    anonymous = await client.post(
        "/api/v1/ai/tools/execute",
        json={
            "conversation_id": str(data["conversation_a"].id),
            "tool": "get_order",
            "arguments": {"order_id": str(data["order_a"].id)},
        },
    )
    assert anonymous.status_code == 401
