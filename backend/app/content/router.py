import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import AuthContext, require_permission
from app.content.models import ContentEntry
from app.content.models import Page as ContentPage
from app.core.database import get_session
from app.core.errors import AppError
from app.core.pagination import Page, PageParams, paginate
from app.core.schemas import APIRequest

public_router = APIRouter(prefix="/content", tags=["Content"])
admin_router = APIRouter(prefix="/admin/content", tags=["Admin"])


class PageOut(BaseModel):
    id: uuid.UUID
    slug: str
    status: str
    translations: dict[str, Any]
    seo: dict[str, Any]

    model_config = {"from_attributes": True}


@public_router.get("/pages/{slug}", response_model=PageOut)
async def public_page(slug: str, session: AsyncSession = Depends(get_session)):
    page = await session.scalar(
        select(ContentPage).where(ContentPage.slug == slug, ContentPage.status == "published")
    )
    if not page:
        raise AppError("page_not_found", "Page not found", 404)
    return page


class ContentEntryOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    slug: str
    translations: dict[str, Any]
    seo: dict[str, Any]
    payload: dict[str, Any]

    model_config = {"from_attributes": True}


@public_router.get("/entries/{entry_type}", response_model=Page[ContentEntryOut])
async def public_entries(
    entry_type: str,
    page: PageParams = Depends(),
    session: AsyncSession = Depends(get_session),
):
    entries, total = await paginate(
        session,
        select(ContentEntry).where(
            ContentEntry.entry_type == entry_type, ContentEntry.status == "published"
        ).order_by(ContentEntry.created_at.desc(), ContentEntry.id),
        page,
    )
    return Page(items=entries, page=page.page, page_size=page.page_size, total=total)


class PageCreate(APIRequest):
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-/]*$", max_length=240)
    translations: dict[str, Any] = Field(default_factory=dict)
    seo: dict[str, Any] = Field(default_factory=dict)


@admin_router.post("/pages", response_model=PageOut, status_code=201)
async def create_page(
    body: PageCreate,
    _: AuthContext = Depends(require_permission("content.manage")),
    session: AsyncSession = Depends(get_session),
):
    if await session.scalar(select(ContentPage.id).where(ContentPage.slug == body.slug)):
        raise AppError("slug_conflict", "Page slug already exists", 409)
    page = ContentPage(
        slug=body.slug, status="draft", translations=body.translations, seo=body.seo
    )
    session.add(page)
    await session.commit()
    await session.refresh(page)
    return page


class PublishRequest(APIRequest):
    published: bool


@admin_router.post("/pages/{page_id}/publication", response_model=PageOut)
async def set_publication(
    page_id: uuid.UUID,
    body: PublishRequest,
    _: AuthContext = Depends(require_permission("content.manage")),
    session: AsyncSession = Depends(get_session),
):
    page = await session.get(ContentPage, page_id)
    if not page:
        raise AppError("page_not_found", "Page not found", 404)
    page.status = "published" if body.published else "draft"
    await session.commit()
    return page
