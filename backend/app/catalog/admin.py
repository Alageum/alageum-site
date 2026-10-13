"""Global catalog administration, never authorized by an organization-local role."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, auth_context
from app.catalog.identity import validate_identity
from app.catalog.models import Category, Product
from app.catalog.router import product_out, product_query, product_search
from app.catalog.schemas import (
    CategoryOut,
    ProductCreate,
    ProductFields,
    ProductOut,
    ProductUpdate,
    Status,
    VersionRequest,
)
from app.core.database import get_session
from app.core.errors import AppError
from app.core.pagination import Page, PageParams, paginate


async def catalog_manager(context: AuthContext = Depends(auth_context)) -> AuthContext:
    if (
        context.membership.role.organization_id is not None
        or "catalog.manage" not in context.permissions
    ):
        raise AppError("permission_denied", "Global catalog management permission is required", 403)
    return context


catalog_manager.authentication_required = True
catalog_manager.tenant_required = True  # active organization is still required for the actor
catalog_manager.required_permission = "catalog.manage"
router = APIRouter(prefix="/admin/catalog", tags=["Catalog administration"])


@router.get("/categories", response_model=Page[CategoryOut])
async def categories(
    page: PageParams = Depends(),
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session, select(Category).order_by(Category.sort_order, Category.public_key), page
    )
    return Page(items=items, page=page.page, page_size=page.page_size, total=total)


@router.get("/products", response_model=Page[ProductOut])
async def products(
    page: PageParams = Depends(),
    category_id: uuid.UUID | None = None,
    status: Status | None = None,
    q: str | None = Query(default=None, max_length=200),
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    query = product_query()
    if category_id:
        query = query.where(Product.category_id == category_id)
    if status:
        query = query.where(Product.status == status)
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


async def get_product(session: AsyncSession, product_id: uuid.UUID) -> Product:
    item = await session.scalar(product_query().where(Product.id == product_id))
    if not item:
        raise AppError("product_not_found", "Product not found", 404)
    return item


async def validate_category(session: AsyncSession, fields: ProductFields):
    category = await session.get(Category, fields.category_id)
    if category is None:
        raise AppError("category_not_found", "Category not found", 422)
    if fields.status == "published" and not category.is_published:
        raise AppError("category_not_published", "Publish the category before its products", 422)


def unique_conflict():
    return AppError("catalog_unique_conflict", "Public key, slug or SKU is already in use", 409)


@router.post("/products", response_model=ProductOut, status_code=201)
async def create_product(
    body: ProductCreate,
    request: Request,
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    await validate_category(session, body)
    await validate_identity(session, body.public_key, body.slug)
    values = body.model_dump()
    values["media"] = [item.model_dump() for item in body.media]
    item = Product(**values)
    session.add(item)
    try:
        await session.flush()
        await record_audit(
            session,
            request,
            "catalog.product.create",
            context.user.id,
            context.organization_id,
            "catalog_product",
            str(item.id),
            {"after": body.model_dump(mode="json"), "version": item.version},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise unique_conflict() from exc
    return product_out(await get_product(session, item.id))


@router.get("/products/{product_id}", response_model=ProductOut)
async def product(
    product_id: uuid.UUID,
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    return product_out(await get_product(session, product_id))


async def apply_update(
    session: AsyncSession,
    item: Product,
    version: int,
    changes: dict,
    request: Request,
    context: AuthContext,
    action: str,
) -> ProductOut:
    if item.version != version:
        raise AppError(
            "catalog_version_conflict",
            "Product changed; reload before saving",
            409,
            {"current_version": item.version},
        )
    before = product_out(item).model_dump(mode="json")
    current = {key: getattr(item, key) for key in ProductFields.model_fields}
    try:
        validated = ProductFields.model_validate({**current, **changes})
    except ValidationError as exc:
        raise AppError(
            "validation_error",
            "Invalid product",
            422,
            [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()],
        ) from exc
    await validate_category(session, validated)
    await validate_identity(session, item.public_key, validated.slug, item.id)
    values = validated.model_dump()
    values["media"] = [ref.model_dump() for ref in validated.media]
    try:
        result = await session.execute(
            update(Product)
            .where(Product.id == item.id, Product.version == version)
            .values(**values, version=version + 1)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            await session.rollback()
            raise AppError("catalog_version_conflict", "Product changed; reload before saving", 409)
        await session.refresh(item)
        after = product_out(item).model_dump(mode="json")
        await record_audit(
            session,
            request,
            action,
            context.user.id,
            context.organization_id,
            "catalog_product",
            str(item.id),
            {"before": before, "after": after, "changed_fields": sorted(changes)},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise unique_conflict() from exc
    return product_out(item)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    request: Request,
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    changes = body.model_dump(exclude_unset=True, exclude={"version"})
    return await apply_update(
        session,
        await get_product(session, product_id),
        body.version,
        changes,
        request,
        context,
        "catalog.product.update",
    )


@router.post("/products/{product_id}/hide", response_model=ProductOut)
async def hide_product(
    product_id: uuid.UUID,
    body: VersionRequest,
    request: Request,
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    return await apply_update(
        session,
        await get_product(session, product_id),
        body.version,
        {"status": "hidden"},
        request,
        context,
        "catalog.product.hide",
    )


@router.post("/products/{product_id}/restore", response_model=ProductOut)
async def restore_product(
    product_id: uuid.UUID,
    body: VersionRequest,
    request: Request,
    context: AuthContext = Depends(catalog_manager),
    session: AsyncSession = Depends(get_session),
):
    item = await get_product(session, product_id)
    if item.status != "hidden":
        raise AppError("catalog_not_hidden", "Only hidden products can be restored", 409)
    # Restoration requires deliberate republishing; hidden products cannot leak accidentally.
    return await apply_update(
        session,
        item,
        body.version,
        {"status": "draft"},
        request,
        context,
        "catalog.product.restore",
    )
