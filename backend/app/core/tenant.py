import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError


async def get_tenant_entity[T](
    session: AsyncSession,
    model: type[T],
    entity_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    options: tuple[Any, ...] = (),
    error_code: str = "not_found",
    message: str = "Resource not found",
) -> T:
    query = select(model).where(model.id == entity_id, model.organization_id == organization_id)
    if options:
        query = query.options(*options)
    item = await session.scalar(query)
    if not item:
        raise AppError(error_code, message, 404)
    return item
