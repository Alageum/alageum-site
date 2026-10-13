"""Stable catalog keys take precedence; aliases cannot shadow another known identity."""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.models import Product
from app.core.errors import AppError


async def validate_identity(
    session: AsyncSession,
    public_key: str,
    slug: str,
    product_id: uuid.UUID | None = None,
) -> None:
    aliases = {public_key, slug}
    clauses = [Product.public_key.in_(aliases), Product.slug.in_(aliases)]
    for alias in aliases:
        try:
            clauses.append(Product.id == uuid.UUID(alias))
        except ValueError:
            pass
    query = select(Product.id).where(or_(*clauses))
    if product_id is not None:
        query = query.where(Product.id != product_id)
    if await session.scalar(query.limit(1)):
        raise AppError(
            "catalog_unique_conflict", "Public key or slug shadows another product identity", 409
        )
