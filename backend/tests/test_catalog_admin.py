import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.audit.models import AuditEvent
from app.auth.service import AuthService
from app.catalog.models import Category, Product
from app.core.database import AsyncSessionFactory
from app.identity.models import Membership, Permission, Role
from tests.factories import login, tenant_fixture


@pytest.fixture
async def catalog_access(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        permission = Permission(code="catalog.manage")
        session.add(permission)
        await session.flush()
        global_role = Role(
            organization_id=None,
            code="platform_catalog_manager",
            name="Catalog manager",
            permissions=[permission],
        )
        local_role = Role(
            organization_id=data["org_a"].id,
            code="bad_catalog",
            name="Local role with forbidden permission",
            permissions=[permission],
        )
        category = Category(
            public_key="transformers",
            slug="transformers",
            translations={"ru": {"name": "Трансформаторы"}},
            is_published=True,
        )
        unpublished = Category(
            public_key="private", slug="private", translations={}, is_published=False
        )
        session.add_all([global_role, local_role, category, unpublished])
        await session.flush()
        # Engineer-like empty user becomes the separately provisioned global catalog manager.
        membership = await session.scalar(
            select(Membership).where(Membership.user_id == data["user_empty"].id)
        )
        membership.role_id = global_role.id
        await session.commit()
        data.update(
            category=category,
            unpublished=unpublished,
            global_role=global_role,
            local_role=local_role,
            catalog_member=membership,
        )
    manager_token = await login(client, "empty@example.test")
    tenant_token = await login(client, "a@example.test")
    data["headers"] = {
        "Authorization": f"Bearer {manager_token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    data["tenant_headers"] = {
        "Authorization": f"Bearer {tenant_token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    data["body"] = {
        "public_key": "cat-transformer-100",
        "slug": "transformer-100",
        "category_id": str(category.id),
        "sku": "ТМГ-100",
        "translations": {"ru": {"name": "Трансформатор", "description": "Описание"}},
        "status": "published",
        "price_mode": "fixed",
        "price": "123.45",
        "currency": "USD",
        "specs": {"power": 100, "voltage": "10/0.4"},
        "provenance": {"sourcePages": [6]},
        "media": [{"path": "/catalog-products/cat-ktp-25-250.webp"}],
    }
    return data


async def test_catalog_crud_persists_money_status_and_transactional_audit(client, catalog_access):
    data = catalog_access
    response = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
    )
    assert response.status_code == 201, response.text
    product = response.json()
    assert product["price"] == "123.45"
    assert product["public_key"] == data["body"]["public_key"]
    assert product["version"] == 1
    product_id = product["id"]
    # A fresh session and independent request prove durable state, not a process-local fixture.
    async with AsyncSessionFactory() as session:
        stored = await session.get(Product, uuid.UUID(product_id))
        assert stored.price == Decimal("123.45")
        assert stored.specs["power"] == 100
    public = await client.get("/api/v1/catalog/products/cat-transformer-100")
    assert public.status_code == 200
    assert public.json()["id"] == product_id
    updated = await client.patch(
        f"/api/v1/admin/catalog/products/{product_id}",
        headers=data["headers"],
        json={"version": 1, "price": "129.99", "translations": {"ru": {"name": "Новое имя"}}},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["public_key"] == product["public_key"]
    assert updated.json()["slug"] == product["slug"]
    stale = await client.patch(
        f"/api/v1/admin/catalog/products/{product_id}",
        headers=data["headers"],
        json={"version": 1, "price": "999"},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "catalog_version_conflict"
    hidden = await client.post(
        f"/api/v1/admin/catalog/products/{product_id}/hide",
        headers=data["headers"],
        json={"version": 2},
    )
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["status"] == "hidden"
    assert (await client.get(f"/api/v1/catalog/products/{product_id}")).status_code == 404
    assert (await client.get("/api/v1/catalog/products")).json()["total"] == 0
    assert (await client.get("/api/v1/admin/catalog/products", headers=data["headers"])).json()[
        "total"
    ] == 1
    restored = await client.post(
        f"/api/v1/admin/catalog/products/{product_id}/restore",
        headers=data["headers"],
        json={"version": 3},
    )
    assert restored.status_code == 200
    assert restored.json()["status"] == "draft"
    assert (await client.get(f"/api/v1/catalog/products/{product_id}")).status_code == 404
    async with AsyncSessionFactory() as session:
        events = list(
            (
                await session.scalars(
                    select(AuditEvent)
                    .where(AuditEvent.entity_id == product_id)
                    .order_by(AuditEvent.timestamp)
                )
            ).all()
        )
        assert [e.action for e in events] == [
            "catalog.product.create",
            "catalog.product.update",
            "catalog.product.hide",
            "catalog.product.restore",
        ]
        assert events[1].event_metadata["before"]["price"] == "123.45"
        assert events[1].event_metadata["after"]["price"] == "129.99"
        assert all(e.actor_user_id == data["user_empty"].id for e in events)


async def test_tenant_admin_cannot_manage_global_catalog_even_with_permission(
    client, catalog_access
):
    data = catalog_access
    assert (await client.get("/api/v1/admin/catalog/products")).status_code == 401
    assert (
        await client.get("/api/v1/admin/catalog/products", headers=data["tenant_headers"])
    ).status_code == 403
    async with AsyncSessionFactory() as session:
        member = await session.scalar(
            select(Membership).where(Membership.user_id == data["user_a"].id)
        )
        member.role_id = data["local_role"].id
        await session.commit()
    response = await client.post(
        "/api/v1/admin/catalog/products", headers=data["tenant_headers"], json=data["body"]
    )
    assert response.status_code == 403
    me = await client.get("/api/v1/auth/me", headers=data["tenant_headers"])
    assert "catalog.manage" not in me.json()["permissions"]
    assert (await client.get("/api/v1/catalog/products")).json()["total"] == 0


async def test_inactive_organization_denied_and_other_tenant_header_denied(client, catalog_access):
    data = catalog_access
    wrong = {**data["headers"], "X-Organization-ID": str(data["org_b"].id)}
    assert (await client.get("/api/v1/admin/catalog/products", headers=wrong)).status_code == 403
    async with AsyncSessionFactory() as session:
        await session.merge(data["org_a"])
        organization = await session.get(type(data["org_a"]), data["org_a"].id)
        organization.is_active = False
        await session.commit()
    assert (
        await client.get("/api/v1/admin/catalog/products", headers=data["headers"])
    ).status_code == 403


async def test_tenant_role_change_and_invite_cannot_escalate(client, catalog_access):
    data = catalog_access
    for role in (data["global_role"], data["local_role"]):
        change = await client.patch(
            f"/api/v1/organizations/members/{data['catalog_member'].id}/role",
            headers=data["tenant_headers"],
            json={"role_id": str(role.id)},
        )
        assert change.status_code in {403, 404}
        invite = await client.post(
            "/api/v1/auth/invitations",
            headers=data["tenant_headers"],
            json={"role_id": str(role.id), "email": "escalate@example.test"},
        )
        assert invite.status_code in {403, 404}
    # A previously issued or forged privileged invitation is rejected at acceptance too.
    async with AsyncSessionFactory() as session:
        token, _ = await AuthService(session).create_one_time_token(
            "invitation", "escalate@example.test", data["org_a"].id, data["global_role"].id
        )
    accepted = await client.post(
        f"/api/v1/auth/invitations/{token}/accept",
        json={"display_name": "Escalate", "password": "Password123!"},
    )
    assert accepted.status_code == 400


@pytest.mark.parametrize(
    "change",
    [
        {"price": "-1"},
        {"price": "NaN"},
        {"price": "1.001"},
        {"price": "10000000000000000"},
        {"price": None},
        {"currency": None},
        {"currency": "usd"},
        {"currency": "XYZ"},
        {"price_mode": "on_request"},
        {"slug": "bad/path"},
        {"sku": " "},
        {"translations": {}},
        {"status": "deleted"},
        {"media": [{"path": "https://example.com/a.webp"}]},
        {"media": [{"path": "//example.com/a.webp"}]},
        {"media": [{"path": "/catalog-products/../a.webp"}]},
        {"media": [{"path": "/catalog-products/%2e%2e/a.webp"}]},
        {"media": [{"path": "/catalog-products/x.svg"}]},
    ],
)
async def test_catalog_rejects_invalid_create(client, catalog_access, change):
    data = catalog_access
    response = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json={**data["body"], **change}
    )
    assert response.status_code == 422, response.text


async def test_validation_uniqueness_partial_update_and_public_category_scope(
    client, catalog_access
):
    data = catalog_access
    response = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
    )
    assert response.status_code == 201
    item = response.json()
    duplicate = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
    )
    assert duplicate.status_code == 409
    unknown = await client.post(
        "/api/v1/admin/catalog/products",
        headers=data["headers"],
        json={**data["body"], "category_id": str(uuid.uuid4())},
    )
    assert unknown.status_code == 422
    hidden_category = await client.post(
        "/api/v1/admin/catalog/products",
        headers=data["headers"],
        json={**data["body"], "category_id": str(data["unpublished"].id)},
    )
    assert hidden_category.status_code == 422
    for change in (
        {"category_id": None},
        {"public_key": "change-key"},
        {"source_data": {}},
        {"price_mode": "on_request"},
        {"currency": "usd"},
        {"translations": {}},
    ):
        bad = await client.patch(
            f"/api/v1/admin/catalog/products/{item['id']}",
            headers=data["headers"],
            json={"version": 1, **change},
        )
        assert bad.status_code == 422, bad.text
    on_request = await client.patch(
        f"/api/v1/admin/catalog/products/{item['id']}",
        headers=data["headers"],
        json={"version": 1, "price_mode": "on_request", "price": None, "currency": None},
    )
    assert on_request.status_code == 200, on_request.text
    assert on_request.json()["price"] is None
    assert on_request.json()["currency"] is None
    async with AsyncSessionFactory() as session:
        category = await session.get(Category, data["category"].id)
        category.is_published = False
        await session.commit()
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.entity_id == item["id"])
            )
            == 2
        )
    assert (await client.get(f"/api/v1/catalog/products/{item['id']}")).status_code == 404
    assert (await client.get("/api/v1/catalog/categories")).json()["total"] == 0


async def test_catalog_concurrent_edits_do_not_lose_updates(client, catalog_access):
    import asyncio

    data = catalog_access
    created = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
    )
    product_id = created.json()["id"]
    responses = await asyncio.gather(
        *[
            client.patch(
                f"/api/v1/admin/catalog/products/{product_id}",
                headers=data["headers"],
                json={"version": 1, "price": price},
            )
            for price in ("130.00", "140.00")
        ]
    )
    assert sorted(response.status_code for response in responses) == [200, 409]
    async with AsyncSessionFactory() as session:
        product = await session.get(Product, uuid.UUID(product_id))
        assert product.version == 2
        assert product.price in (Decimal("130.00"), Decimal("140.00"))
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.entity_id == product_id)
            )
            == 2
        )


async def test_catalog_audit_failure_rolls_back_product_change(client, catalog_access, monkeypatch):
    data = catalog_access
    created = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
    )
    product_id = created.json()["id"]

    async def failing_audit(*args, **kwargs):
        raise RuntimeError("Simulated audit store failure")

    monkeypatch.setattr("app.catalog.admin.record_audit", failing_audit)
    with pytest.raises(RuntimeError, match="Simulated audit store failure"):
        await client.patch(
            f"/api/v1/admin/catalog/products/{product_id}",
            headers=data["headers"],
            json={"version": 1, "price": "500.00"},
        )
    async with AsyncSessionFactory() as session:
        product = await session.get(Product, uuid.UUID(product_id))
        assert product.version == 1
        assert product.price == Decimal("123.45")


@pytest.mark.parametrize(
    "change",
    [
        {"provenance": {"sourceUrl": "javascript:alert(1)"}},
        {"provenance": {"additionalSources": [{"url": "data:text/html,bad"}]}},
        {"provenance": {"sourcePages": ["one"]}},
        {"specs": {"technicalSpecs": {"wrong": "shape"}}},
        {"specs": {"technicalSpecs": [{"label": "Test", "value": {"nested": True}}]}},
        {"specs": {"configurations": ["bad"]}},
        {"specs": {"notes": "bad"}},
        {"specs": {"voltage": {"nested": "bad"}}},
    ],
)
async def test_catalog_safe_source_and_structured_specs(client, catalog_access, change):
    response = await client.post(
        "/api/v1/admin/catalog/products",
        headers=catalog_access["headers"],
        json={**catalog_access["body"], **change},
    )
    assert response.status_code == 422


async def test_catalog_searches_translated_names_and_updates_category_key(client, catalog_access):
    data = catalog_access
    created = await client.post(
        "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
    )
    product_id = created.json()["id"]
    assert created.json()["category_public_key"] == "transformers"
    for endpoint in ("/api/v1/catalog/products", "/api/v1/admin/catalog/products"):
        result = await client.get(endpoint, headers=data["headers"], params={"q": "Трансформатор"})
        assert result.status_code == 200
        assert result.json()["total"] == 1
    invalid_version = await client.patch(
        f"/api/v1/admin/catalog/products/{product_id}",
        headers=data["headers"],
        json={"version": True, "status": "draft"},
    )
    assert invalid_version.status_code == 422
    async with AsyncSessionFactory() as session:
        second = Category(
            public_key="switchgear", slug="switchgear", translations={}, is_published=True
        )
        session.add(second)
        await session.commit()
    updated = await client.patch(
        f"/api/v1/admin/catalog/products/{product_id}",
        headers=data["headers"],
        json={"version": 1, "category_id": str(second.id)},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["category_public_key"] == "switchgear"


async def test_catalog_configured_currencies_do_not_invent_a_default(
    client, catalog_access, monkeypatch
):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "catalog_allowed_currencies", ["EUR"])
    denied = await client.post(
        "/api/v1/admin/catalog/products",
        headers=catalog_access["headers"],
        json=catalog_access["body"],
    )
    assert denied.status_code == 422
    allowed = await client.post(
        "/api/v1/admin/catalog/products",
        headers=catalog_access["headers"],
        json={**catalog_access["body"], "currency": "EUR"},
    )
    assert allowed.status_code == 201
    assert allowed.json()["currency"] == "EUR"


async def test_catalog_rejects_cross_namespace_aliases_and_never_shadows_hidden_keys(
    client, catalog_access
):
    data = catalog_access
    first = (
        await client.post(
            "/api/v1/admin/catalog/products", headers=data["headers"], json=data["body"]
        )
    ).json()
    for alias in (first["public_key"], first["slug"], first["id"]):
        response = await client.post(
            "/api/v1/admin/catalog/products",
            headers=data["headers"],
            json={**data["body"], "public_key": "different-key", "slug": alias, "sku": "OTHER"},
        )
        assert response.status_code == 409
    response = await client.post(
        "/api/v1/admin/catalog/products",
        headers=data["headers"],
        json={
            **data["body"],
            "public_key": first["slug"],
            "slug": "different-slug",
            "sku": "OTHER",
        },
    )
    assert response.status_code == 409
    second = (
        await client.post(
            "/api/v1/admin/catalog/products",
            headers=data["headers"],
            json={
                **data["body"],
                "public_key": "second-key",
                "slug": "second-slug",
                "sku": "OTHER",
            },
        )
    ).json()
    response = await client.patch(
        f"/api/v1/admin/catalog/products/{second['id']}",
        headers=data["headers"],
        json={"version": 1, "slug": first["public_key"]},
    )
    assert response.status_code == 409
    # Defensive resolver handles legacy/manual collisions deterministically, including hidden keys.
    async with AsyncSessionFactory() as session:
        original = await session.get(Product, uuid.UUID(first["id"]))
        other = await session.get(Product, uuid.UUID(second["id"]))
        other.slug = original.public_key
        original.status = "hidden"
        await session.commit()
    response = await client.get(f"/api/v1/catalog/products/{first['public_key']}")
    assert response.status_code == 404
    response = await client.get(f"/api/v1/catalog/products/{second['public_key']}")
    assert response.json()["id"] == second["id"]
