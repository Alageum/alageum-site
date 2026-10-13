from sqlalchemy import select

from app.audit.models import AuditEvent
from app.core.database import AsyncSessionFactory
from tests.factories import login, tenant_fixture


async def test_login_refresh_and_me(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    response = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.test", "password": "Password123!"}
    )
    assert response.status_code == 200
    pair = response.json()
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] != pair["refresh_token"]
    headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["organization"]["id"] == str(data["org_a"].id)
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(AuditEvent).where(AuditEvent.action == "login"))


async def test_order_cross_tenant_is_hidden(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    headers = {"Authorization": f"Bearer {token}", "X-Organization-ID": str(data["org_a"].id)}
    own = await client.get(f"/api/v1/orders/{data['order_a'].id}", headers=headers)
    foreign = await client.get(f"/api/v1/orders/{data['order_b'].id}", headers=headers)
    assert own.status_code == 200
    assert foreign.status_code == 404


async def test_rbac_denies_missing_permission(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "empty@example.test")
    response = await client.get(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {token}", "X-Organization-ID": str(data["org_a"].id)},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


async def test_file_cross_tenant_is_hidden_before_storage_access(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    response = await client.get(
        f"/api/v1/files/{data['file_b'].id}",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Organization-ID": str(data["org_a"].id),
        },
    )
    assert response.status_code == 404
