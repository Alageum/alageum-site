"""Insert-only reviewed catalog import. Existing records are never overwritten."""

import copy
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.identity import validate_identity
from app.catalog.models import Category, Product
from app.catalog.schemas import ProductCreate
from app.core.errors import AppError

NAMESPACE = uuid.UUID("541788ee-fbf0-4d85-9d33-e593b82f303c")
CATEGORIES = {
    "transformers": "Трансформаторы",
    "switchgear": "Коммутация и распределение",
    "substations": "Комплектные подстанции",
    "cabinets": "Шкафы, щиты и управление",
    "protection": "Катодная защита и измерение",
}
SPEC_FIELDS = (
    "technicalSpecs",
    "configurations",
    "power",
    "voltage",
    "voltageUnit",
    "cooling",
    "installation",
    "subtype",
    "manufacturer",
    "manufacturers",
    "recordKind",
    "recordType",
    "isOrderableSku",
    "series",
    "familyId",
    "familyName",
    "variantIds",
    "variantSpecs",
    "notes",
)
PROVENANCE_FIELDS = (
    "sourceKind",
    "sourceUrl",
    "sourceTitle",
    "sourceCheckedAt",
    "sourcePages",
    "imageSourcePage",
    "additionalSources",
)


async def import_records(
    session: AsyncSession, records: Sequence[dict[str, Any]]
) -> dict[str, int]:
    """Insert one atomic batch; caller commits once, any failure rolls back the transaction."""
    try:
        return await _import_records(session, records)
    except Exception:
        await session.rollback()
        raise


async def _import_records(
    session: AsyncSession, records: Sequence[dict[str, Any]]
) -> dict[str, int]:
    keys = [record["id"] for record in records]
    if len(keys) != len(set(keys)):
        raise ValueError("Duplicate catalog public keys")
    if any(record["category"] not in CATEGORIES for record in records):
        raise ValueError("Unknown catalog category")
    result = {"categories_created": 0, "created": 0, "skipped": 0}
    categories = {}
    for position, (key, label) in enumerate(CATEGORIES.items()):
        category = await session.scalar(select(Category).where(Category.public_key == key))
        if category is None:
            conflict = await session.scalar(select(Category).where(Category.slug == key))
            if conflict:
                raise ValueError(f"Category slug collision: {key}")
            category = Category(
                id=uuid.uuid5(NAMESPACE, f"category:{key}"),
                public_key=key,
                slug=key,
                translations={"ru": {"name": label}},
                is_published=True,
                sort_order=position,
            )
            session.add(category)
            await session.flush()
            result["categories_created"] += 1
        categories[key] = category
    for position, record in enumerate(records):
        key = record["id"]
        existing_id = await session.scalar(select(Product.id).where(Product.public_key == key))
        if existing_id is not None:
            if existing_id != uuid.uuid5(NAMESPACE, f"product:{key}"):
                raise ValueError(f"Product public key collision with a different identity: {key}")
            result["skipped"] += 1
            continue
        try:
            await validate_identity(session, key, key)
        except AppError as exc:
            raise ValueError(f"Product identity collision: {key}") from exc
        conditions = [Product.slug == key]
        if record.get("sku"):
            conditions.append(Product.sku == record["sku"])
        if await session.scalar(select(Product.id).where(or_(*conditions))):
            raise ValueError(f"Product slug/SKU collision: {key}")
        image = record.get("image")
        product = Product(
            id=uuid.uuid5(NAMESPACE, f"product:{key}"),
            public_key=key,
            slug=key,
            category_id=categories[record["category"]].id,
            sku=record.get("sku"),
            translations={
                "ru": {"name": record["name"], "description": record.get("description", "")}
            },
            status="published",
            comparable=True,
            price_mode="on_request",
            price=None,
            currency=None,
            version=1,
            sort_order=position,
            specs={field: copy.deepcopy(record[field]) for field in SPEC_FIELDS if field in record},
            provenance={
                field: copy.deepcopy(record[field])
                for field in PROVENANCE_FIELDS
                if field in record
            },
            media=[{"path": image, "kind": "image", "alt": record.get("imageCaption", "")}]
            if image
            else [],
            source_data=copy.deepcopy(record),
        )
        # Import and admin writes share the same validation boundary, including shipped media.
        ProductCreate.model_validate(
            {name: getattr(product, name) for name in ProductCreate.model_fields}
        )
        session.add(product)
        await session.flush()
        result["created"] += 1
    return result
