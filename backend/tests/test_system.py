from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.database import get_session
from app.main import app
from scripts import seed as seed_module


async def test_health(client):
    response = await client.get("/api/v1/health", headers={"X-Request-ID": "test-request"})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"] == "test-request"


async def test_version(client):
    response = await client.get("/api/v1/version")
    assert response.status_code == 200
    assert response.json()["version"] == "0.1.0"


async def test_validation_error_shape(client):
    response = await client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_validation_error_does_not_echo_password(client):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "invalid", "password": "secret"}
    )
    assert response.status_code == 422
    assert "secret" not in response.text


async def test_unhandled_error_is_safe_and_correlated():
    async def broken_session():
        raise RuntimeError("database password must remain server-side")
        yield

    app.dependency_overrides[get_session] = broken_session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            response = await client.get(
                "/api/v1/readiness", headers={"X-Request-ID": "safe-id"}
            )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "internal_error",
            "message": "Internal server error",
            "details": None,
            "request_id": "safe-id",
        }
    }
    assert "password" not in response.text


async def test_dev_seed_refuses_production(monkeypatch):
    monkeypatch.setattr(seed_module, "get_settings", lambda: SimpleNamespace(env="production"))
    with pytest.raises(RuntimeError, match="disabled in production"):
        await seed_module.seed()


async def test_declared_oversized_request_is_rejected_before_parsing(client):
    response = await client.post(
        "/api/v1/auth/login",
        content=b"{}",
        headers={"Content-Length": str(20 * 1024 * 1024), "X-Request-ID": "oversize-test"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"
    assert response.json()["error"]["request_id"] == "oversize-test"


def test_production_refuses_unapproved_browser_token_transport():
    with pytest.raises(ValueError, match="HttpOnly cookie/BFF topology"):
        Settings(
            env="production",
            secret_key="a-production-secret-with-more-than-thirty-two-characters",
            database_url="postgresql+asyncpg://user:password@db/platform",
            rate_limit_backend="redis",
            file_scanner_backend="scanner",
        )
