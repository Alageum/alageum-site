from app.core.database import AsyncSessionFactory
from tests.factories import login, tenant_fixture


async def test_invitation_acceptance(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    invited = await client.post(
        "/api/v1/auth/invitations",
        headers=headers,
        json={
            "email": "invited@example.test",
            "role_id": str(data["role_a"].id),
        },
    )
    assert invited.status_code == 201
    accepted = await client.post(
        f"/api/v1/auth/invitations/{invited.json()['token']}/accept",
        json={"display_name": "Invited", "password": "NewPassword123!"},
    )
    assert accepted.status_code == 200


async def test_password_reset_changes_credentials(client):
    async with AsyncSessionFactory() as session:
        await tenant_fixture(session)
    requested = await client.post(
        "/api/v1/auth/password/reset/request", json={"email": "a@example.test"}
    )
    confirmed = await client.post(
        "/api/v1/auth/password/reset/confirm",
        json={"token": requested.json()["token"], "password": "UpdatedPassword123!"},
    )
    assert confirmed.status_code == 204
    old = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.test", "password": "Password123!"}
    )
    new = await client.post(
        "/api/v1/auth/login",
        json={"email": "a@example.test", "password": "UpdatedPassword123!"},
    )
    assert old.status_code == 401
    assert new.status_code == 200
