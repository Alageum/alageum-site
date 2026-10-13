from collections.abc import AsyncIterator

from sqlalchemy import MetaData, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


# Imported centrally so Alembic and test schema creation discover every table.
from app.ai import models as ai_models  # noqa: E402,F401
from app.audit import models as audit_models  # noqa: E402,F401
from app.catalog import models as catalog_models  # noqa: E402,F401
from app.commerce import models as commerce_models  # noqa: E402,F401
from app.content import models as content_models  # noqa: E402,F401
from app.documents import models as document_models  # noqa: E402,F401
from app.files import models as file_models  # noqa: E402,F401
from app.identity import models as identity_models  # noqa: E402,F401
from app.integrations import models as integration_models  # noqa: E402,F401
from app.notifications import models as notification_models  # noqa: E402,F401

settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)


if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


AsyncSessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionFactory() as session:
        yield session
