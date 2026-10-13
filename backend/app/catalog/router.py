import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog.models import Category, Product, ProductAttributeDefinition, ProductAttributeValue
from app.catalog.schemas import AttributeOut, CategoryOut, ProductOut, PublicProductOut
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AppError
from app.core.pagination import Page, PageParams, paginate
from app.core.schemas import APIRequest

router = APIRouter(prefix="/catalog", tags=["Catalog"])


def product_out(product: Product) -> ProductOut:
    values = []
    for item in product.attribute_values:
        value = item.value_text
        if item.value_number is not None:
            value = float(item.value_number)
        elif item.value_boolean is not None:
            value = item.value_boolean
        elif item.value_json is not None:
            value = item.value_json
        values.append(
            AttributeOut(code=item.definition.code, value=value, unit=item.definition.unit)
        )
    result = ProductOut.model_validate(product)
    result.attributes = values
    result.category_public_key = product.category.public_key
    return result


def product_query():
    return select(Product).options(
        selectinload(Product.attribute_values).selectinload(ProductAttributeValue.definition)
    )


def product_search(text: str):
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    fields = [Product.public_key, Product.slug, Product.sku]
    fields.extend(
        Product.translations[locale]["name"].as_string()
        for locale in get_settings().available_locales
    )
    return or_(*(field.ilike(f"%{escaped}%", escape="\\") for field in fields))


def public_product_query():
    return (
        product_query()
        .join(Category)
        .where(Product.status == "published", Category.is_published.is_(True))
    )


@router.get("/categories", response_model=Page[CategoryOut])
async def categories(page: PageParams = Depends(), session: AsyncSession = Depends(get_session)):
    items, total = await paginate(
        session,
        select(Category)
        .where(Category.is_published.is_(True))
        .order_by(Category.sort_order, Category.id),
        page,
    )
    return Page(items=items, page=page.page, page_size=page.page_size, total=total)


@router.get("/products", response_model=Page[PublicProductOut])
async def products(
    page: PageParams = Depends(),
    category_id: uuid.UUID | None = None,
    public_key: str | None = Query(default=None, max_length=240),
    q: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
):
    query = public_product_query()
    if category_id:
        query = query.where(Product.category_id == category_id)
    if public_key:
        query = query.where(Product.public_key == public_key)
    if q:
        query = query.where(product_search(q))
    items, total = await paginate(
        session, query.order_by(Product.sort_order, Product.public_key), page
    )
    return Page(
        items=[product_out(item) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@router.get("/products/{product_id}", response_model=PublicProductOut)
async def product(product_id: str, session: AsyncSession = Depends(get_session)):
    # Resolve against all rows before applying visibility. A hidden stable key must
    # never fall through to an unrelated published product's slug.
    item = await session.scalar(product_query().where(Product.public_key == product_id))
    if item is None:
        try:
            database_id = uuid.UUID(product_id)
        except ValueError:
            database_id = None
        if database_id is not None:
            item = await session.scalar(product_query().where(Product.id == database_id))
    if item is None:
        item = await session.scalar(product_query().where(Product.slug == product_id))
    if not item or item.status != "published" or not item.category.is_published:
        raise AppError("product_not_found", "Product not found", 404)
    return product_out(item)


class CompareRequest(APIRequest):
    product_ids: list[uuid.UUID]


@router.post("/compare", response_model=list[PublicProductOut])
async def compare(body: CompareRequest, session: AsyncSession = Depends(get_session)):
    ids = list(dict.fromkeys(body.product_ids))
    if not 2 <= len(ids) <= 5:
        raise AppError("invalid_comparison", "Select between 2 and 5 unique products", 422)
    items = (
        await session.scalars(
            public_product_query().where(Product.id.in_(ids), Product.comparable.is_(True))
        )
    ).all()
    return [product_out(item) for item in items]


class FilterOut(BaseModel):
    code: str
    data_type: str
    unit: str | None
    translations: dict


@router.get("/filters", response_model=Page[FilterOut])
async def filters(
    category_id: uuid.UUID,
    page: PageParams = Depends(),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        select(ProductAttributeDefinition)
        .join(Category)
        .where(
            ProductAttributeDefinition.category_id == category_id,
            ProductAttributeDefinition.is_filterable.is_(True),
            Category.is_published.is_(True),
        )
        .order_by(ProductAttributeDefinition.id),
        page,
    )
    return Page(
        items=[FilterOut.model_validate(item, from_attributes=True) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )
