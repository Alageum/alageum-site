"""Run on SQLite normally and explicitly on PostgreSQL in CI (including concurrency)."""

import asyncio
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.audit.models import AuditEvent
from app.auth.security import hash_password
from app.catalog.models import Category, Product
from app.commerce.models import QuoteRequest, QuoteRequestItem
from app.core.database import AsyncSessionFactory, engine
from app.identity.models import Membership, User
from tests.factories import login, published_product, tenant_fixture


@pytest.fixture
async def rfq(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        product = await published_product(session, "first")
        second = await published_product(session, "second")
    token = await login(client, "a@example.test")
    data.update(
        product=product,
        second=second,
        headers={"Authorization": f"Bearer {token}", "X-Organization-ID": str(data["org_a"].id)},
        body={
            "comment": "Need specification clarification",
            "items": [
                {"product_id": str(second.id), "quantity": "2.125"},
                {"product_id": str(product.id), "quantity": "3"},
            ],
        },
    )
    return data


async def post_quote(client, data, body=None, key=None, headers=None):
    return await client.post(
        "/api/v1/quotes/catalog",
        headers={**(headers or data["headers"]), "Idempotency-Key": key or str(uuid.uuid4())},
        json=body if body is not None else data["body"],
    )


async def test_exact_items_snapshots_persist_after_relogin(client, rfq):
    result = await post_quote(client, rfq)
    assert result.status_code == 201, result.text
    quote = result.json()
    assert [item["product_id"] for item in quote["items"]] == [
        str(rfq["second"].id),
        str(rfq["product"].id),
    ]
    assert [Decimal(item["quantity"]) for item in quote["items"]] == [Decimal("2.125"), Decimal(3)]
    assert quote["items"][1]["product_snapshot"]["price"] == "120.50"
    assert quote["items"][1]["product_snapshot"]["specs"]["isOrderableSku"] is False
    assert "stock" not in quote["items"][1]["product_snapshot"]
    async with AsyncSessionFactory() as session:
        product = await session.get(Product, rfq["product"].id)
        product.translations = {"ru": {"name": "Renamed later"}}
        product.price = Decimal("999")
        product.status = "hidden"
        await session.commit()
    token = await login(client, "a@example.test")
    headers = {**rfq["headers"], "Authorization": f"Bearer {token}"}
    detail = await client.get(f"/api/v1/quotes/{quote['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["items"] == quote["items"]
    own = await client.get("/api/v1/quotes?mine=true", headers=headers)
    assert own.json()["total"] == 1
    assert own.json()["items"][0]["id"] == quote["id"]
    assert "items" not in own.json()["items"][0]


async def test_retry_replays_after_catalog_change_and_only_one_audit(client, rfq):
    key = str(uuid.uuid4())
    first = await post_quote(client, rfq, key=key)
    async with AsyncSessionFactory() as session:
        product = await session.get(Product, rfq["product"].id)
        product.status = "hidden"
        await session.commit()
    retry_body = {**rfq["body"], "items": list(reversed(rfq["body"]["items"]))}
    retry_body["items"][0] = {**retry_body["items"][0], "quantity": "3.000"}
    retry = await post_quote(client, rfq, body=retry_body, key=key)
    assert retry.status_code == 200, retry.text
    assert retry.json()["id"] == first.json()["id"]
    assert retry.json()["items"] == first.json()["items"]
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(QuoteRequest)) == 1
        assert await session.scalar(select(func.count()).select_from(QuoteRequestItem)) == 2
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.action == "quote.create")
            )
            == 1
        )


async def test_same_key_changed_payload_is_conflict(client, rfq):
    key = str(uuid.uuid4())
    first = await post_quote(client, rfq, key=key)
    retry = await post_quote(client, rfq, key=key, body={**rfq["body"], "comment": "Different"})
    assert first.status_code == 201
    assert retry.status_code == 409
    assert retry.json()["error"]["code"] == "idempotency_conflict"


@pytest.mark.parametrize("change", ["hidden", "draft", "unpublished_category", "unknown"])
async def test_unavailable_product_rejects_whole_request(client, rfq, change):
    async with AsyncSessionFactory() as session:
        product = await session.get(Product, rfq["product"].id)
        if change == "unpublished_category":
            category = await session.get(Category, product.category_id)
            category.is_published = False
        elif change == "unknown":
            rfq["body"]["items"][1]["product_id"] = str(uuid.uuid4())
        else:
            product.status = change
        await session.commit()
    response = await post_quote(client, rfq)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "quote_product_unavailable"
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(QuoteRequest)) == 0
        assert await session.scalar(select(func.count()).select_from(QuoteRequestItem)) == 0


@pytest.mark.parametrize("quantity", ["0", "-1", "NaN", "Infinity", "0.0001", "1000000000000000"])
async def test_invalid_quantity_never_rounds_or_persists(client, rfq, quantity):
    rfq["body"]["items"][0]["quantity"] = quantity
    response = await post_quote(client, rfq)
    assert response.status_code == 422, response.text
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(QuoteRequest)) == 0


async def test_duplicate_product_and_missing_product_rejected(client, rfq):
    rfq["body"]["items"] = [rfq["body"]["items"][0]] * 2
    response = await post_quote(client, rfq)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "quote_duplicate_product"
    response = await post_quote(client, rfq, body={"items": [{"quantity": "1"}]})
    assert response.status_code == 422
    response = await post_quote(client, rfq, body={"items": []})
    assert response.status_code == 422
    response = await post_quote(client, rfq, body={"items": rfq["body"]["items"] * 51})
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["product_snapshot", "price", "name", "parameters"])
async def test_forged_item_fields_rejected(client, rfq, field):
    rfq["body"]["items"][0][field] = {"price": "0"} if field == "product_snapshot" else "forged"
    response = await post_quote(client, rfq)
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["organization_id", "created_by_id", "status", "external_id"])
async def test_authoritative_request_fields_rejected(client, rfq, field):
    rfq["body"][field] = str(uuid.uuid4())
    assert (await post_quote(client, rfq)).status_code == 422


async def test_required_idempotency_key_auth_permission_and_cors(client, rfq):
    for key in [None, "", "invalid", "x" * 1000]:
        headers = rfq["headers"] if key is None else {**rfq["headers"], "Idempotency-Key": key}
        response = await client.post("/api/v1/quotes/catalog", headers=headers, json=rfq["body"])
        assert response.status_code == 422
    response = await client.post("/api/v1/quotes/catalog", json=rfq["body"])
    assert response.status_code == 401
    token = await login(client, "empty@example.test")
    denied = {**rfq["headers"], "Authorization": f"Bearer {token}"}
    assert (await post_quote(client, rfq, headers=denied)).status_code == 403
    assert (await client.get("/api/v1/quotes?mine=true", headers=denied)).status_code == 403
    assert (await client.get(f"/api/v1/quotes/{uuid.uuid4()}", headers=denied)).status_code == 403
    cors = await client.options(
        "/api/v1/quotes/catalog",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Idempotency-Key,Authorization,X-Organization-ID",
        },
    )
    assert cors.status_code == 200


async def test_cross_tenant_and_coworker_own_requests_isolation(client, rfq):
    key = str(uuid.uuid4())
    created = (await post_quote(client, rfq, key=key)).json()
    foreign_token = await login(client, "b@example.test")
    foreign_headers = {
        "Authorization": f"Bearer {foreign_token}",
        "X-Organization-ID": str(rfq["org_b"].id),
    }
    assert (
        await client.get(f"/api/v1/quotes/{created['id']}", headers=foreign_headers)
    ).status_code == 404
    assert (await client.get("/api/v1/quotes?mine=true", headers=foreign_headers)).json()[
        "total"
    ] == 0
    denied_org = {**rfq["headers"], "X-Organization-ID": str(rfq["org_b"].id)}
    assert (await post_quote(client, rfq, headers=denied_org)).status_code == 403
    # Same key in another tenant/user is independent and must never replay somebody else's data.
    foreign = await post_quote(client, rfq, headers=foreign_headers, key=key)
    assert foreign.status_code == 201
    assert foreign.json()["id"] != created["id"]
    async with AsyncSessionFactory() as session:
        coworker = User(
            email="coworker@example.test",
            display_name="Coworker",
            password_hash=hash_password("Password123!"),
        )
        session.add(coworker)
        await session.flush()
        session.add(
            Membership(
                user_id=coworker.id, organization_id=rfq["org_a"].id, role_id=rfq["role_a"].id
            )
        )
        await session.commit()
    coworker_token = await login(client, "coworker@example.test")
    coworker_headers = {**rfq["headers"], "Authorization": f"Bearer {coworker_token}"}
    mine = await client.get("/api/v1/quotes?mine=true", headers=coworker_headers)
    assert mine.json()["total"] == 0
    assert (
        await client.get(f"/api/v1/quotes/{created['id']}", headers=coworker_headers)
    ).status_code == 404
    # Preserve the existing explicitly organization-scoped summary-list contract.
    organization = await client.get("/api/v1/quotes", headers=coworker_headers)
    assert organization.json()["total"] == 1


async def test_pagination_and_unknown_detail(client, rfq):
    first = await post_quote(client, rfq)
    second = await post_quote(client, rfq)
    assert first.json()["id"] != second.json()["id"]
    page = await client.get("/api/v1/quotes?mine=true&page=2&page_size=1", headers=rfq["headers"])
    assert page.json()["total"] == 2
    assert len(page.json()["items"]) == 1
    assert (
        await client.get(f"/api/v1/quotes/{uuid.uuid4()}", headers=rfq["headers"])
    ).status_code == 404


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Real PostgreSQL concurrency pass")
async def test_concurrent_postgres_submissions_commit_one_request(client, rfq):
    key = str(uuid.uuid4())
    responses = await asyncio.gather(*[post_quote(client, rfq, key=key) for _ in range(6)])
    assert sorted(response.status_code for response in responses) == [200] * 5 + [201]
    assert len({response.json()["id"] for response in responses}) == 1
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(QuoteRequest)) == 1
        assert await session.scalar(select(func.count()).select_from(QuoteRequestItem)) == 2
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.action == "quote.create")
            )
            == 1
        )


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Real PostgreSQL concurrency pass")
async def test_concurrent_postgres_key_conflict_does_not_overwrite(client, rfq):
    key = str(uuid.uuid4())
    different = {**rfq["body"], "comment": "Different concurrent request"}
    responses = await asyncio.gather(
        post_quote(client, rfq, key=key), post_quote(client, rfq, key=key, body=different)
    )
    assert sorted(response.status_code for response in responses) == [201, 409]
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(QuoteRequest)) == 1


async def test_failed_transaction_can_retry_without_partial_request(client, rfq, monkeypatch):
    from app.commerce import quotes
    from app.core.errors import AppError

    original = quotes.record_audit

    async def audit_failure(*args, **kwargs):
        raise AppError("test_failure", "Injected test-only transaction failure", 503)

    monkeypatch.setattr(quotes, "record_audit", audit_failure)
    key = str(uuid.uuid4())
    failure = await post_quote(client, rfq, key=key)
    assert failure.status_code == 503
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(QuoteRequest)) == 0
        assert await session.scalar(select(func.count()).select_from(QuoteRequestItem)) == 0
    monkeypatch.setattr(quotes, "record_audit", original)
    success = await post_quote(client, rfq, key=key)
    assert success.status_code == 201
    assert success.headers["cache-control"] == "private, no-store"
