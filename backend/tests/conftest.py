# ruff: noqa: E402
import os

# Opt-in PostgreSQL regression pass must target a disposable, explicitly named test database.
postgres_test_url = os.environ.get("ALAGEUM_TEST_POSTGRES_URL")
if postgres_test_url:
    from sqlalchemy.engine import make_url

    url = make_url(postgres_test_url)
    if url.drivername != "postgresql+asyncpg" or not (url.database or "").endswith(
        ("_ci", "_test")
    ):
        raise RuntimeError(
            "ALAGEUM_TEST_POSTGRES_URL must target a disposable *_ci or *_test database"
        )
os.environ["APP_DATABASE_URL"] = postgres_test_url or "sqlite+aiosqlite:///./test.db"
os.environ["APP_SECRET_KEY"] = "test-secret-key-that-is-long-enough"
os.environ["APP_LOCAL_STORAGE_PATH"] = "./test-storage"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.database import Base, engine
from app.core.rate_limit import memory_rate_limiter
from app.main import app


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    memory_rate_limiter.clear()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield
    # asyncpg pools cannot reuse connections bound to a prior function-scoped event loop.
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value
