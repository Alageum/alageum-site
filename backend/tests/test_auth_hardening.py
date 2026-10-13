from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.auth.security import hash_token
from app.core.database import AsyncSessionFactory
from app.identity.models import Membership, OneTimeToken, User
from tests.factories import login, tenant_fixture


async def issue_pair(client):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "a@example.test", "password": "Password123!"}
    )
    assert response.status_code == 200
    return response.json()


async def test_refresh_rotation_rejects_replay(client):
    async with AsyncSessionFactory() as session:
        await tenant_fixture(session)
    first = await issue_pair(client)
    rotated = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    replay = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert rotated.status_code == 200
    assert replay.status_code == 401


async def test_logout_revokes_refresh_session(client):
    async with AsyncSessionFactory() as session:
        await tenant_fixture(session)
    pair = await issue_pair(client)
    assert (
        await client.post("/api/v1/auth/logout", json={"refresh_token": pair["refresh_token"]})
    ).status_code == 204
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]})
    ).status_code == 401


async def test_disabled_user_and_membership_are_rejected(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    async with AsyncSessionFactory() as session:
        membership = await session.scalar(
            select(Membership).where(Membership.user_id == data["user_a"].id)
        )
        membership.is_active = False
        await session.commit()
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 403
    async with AsyncSessionFactory() as session:
        membership = await session.scalar(
            select(Membership).where(Membership.user_id == data["user_a"].id)
        )
        membership.is_active = True
        user = await session.get(User, data["user_a"].id)
        user.is_active = False
        await session.commit()
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_reset_and_invitation_tokens_are_single_use(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    reset = await client.post(
        "/api/v1/auth/password/reset/request", json={"email": "a@example.test"}
    )
    body = {"token": reset.json()["token"], "password": "UpdatedPassword123!"}
    assert (await client.post("/api/v1/auth/password/reset/confirm", json=body)).status_code == 204
    assert (await client.post("/api/v1/auth/password/reset/confirm", json=body)).status_code == 400

    # Login with the updated password to create the invitation as the same active account.
    pair = await client.post(
        "/api/v1/auth/login",
        json={"email": "a@example.test", "password": "UpdatedPassword123!"},
    )
    headers = {
        "Authorization": f"Bearer {pair.json()['access_token']}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    invitation = await client.post(
        "/api/v1/auth/invitations",
        headers=headers,
        json={"email": "once@example.test", "role_id": str(data["role_a"].id)},
    )
    accept = {"display_name": "Once", "password": "NewPassword123!"}
    path = f"/api/v1/auth/invitations/{invitation.json()['token']}/accept"
    assert (await client.post(path, json=accept)).status_code == 200
    assert (await client.post(path, json=accept)).status_code == 400


async def test_expired_one_time_token_and_mass_assignment_are_rejected(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    requested = await client.post(
        "/api/v1/auth/password/reset/request", json={"email": "a@example.test"}
    )
    raw = requested.json()["token"]
    async with AsyncSessionFactory() as session:
        stored = await session.scalar(
            select(OneTimeToken).where(OneTimeToken.token_hash == hash_token(raw))
        )
        stored.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()
    assert (
        await client.post(
            "/api/v1/auth/password/reset/confirm",
            json={"token": raw, "password": "UpdatedPassword123!"},
        )
    ).status_code == 400
    token = await login(client, "a@example.test")
    response = await client.post(
        "/api/v1/auth/invitations",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Organization-ID": str(data["org_a"].id),
        },
        json={
            "email": "mass@example.test",
            "role_id": str(data["role_a"].id),
            "organization_id": str(data["org_b"].id),
        },
    )
    assert response.status_code == 422
