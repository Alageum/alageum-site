import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, require_permission
from app.core.database import get_session
from app.core.errors import AppError
from app.core.pagination import Page, PageParams, paginate
from app.documents.models import Document, DocumentVersion

router = APIRouter(prefix="/documents", tags=["Documents"])


class DocumentOut(BaseModel):
    id: uuid.UUID
    number: str | None
    title: str
    external_id: str | None
    source: str
    type_code: str
    latest_file_id: uuid.UUID | None


def serialize(item: Document) -> DocumentOut:
    latest = max(item.versions, key=lambda value: value.version) if item.versions else None
    return DocumentOut(
        id=item.id,
        number=item.number,
        title=item.title,
        external_id=item.external_id,
        source=item.source,
        type_code=item.type.code,
        latest_file_id=latest.file_id if latest else None,
    )


def query():
    return select(Document).options(
        selectinload(Document.type),
        selectinload(Document.versions).selectinload(DocumentVersion.file),
    )


@router.get("", response_model=Page[DocumentOut])
async def list_documents(
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("document.read")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        query()
        .where(Document.organization_id == context.organization_id)
        .order_by(Document.created_at.desc(), Document.id),
        page,
    )
    return Page(
        items=[serialize(item) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID,
    request: Request,
    context: AuthContext = Depends(require_permission("document.read")),
    session: AsyncSession = Depends(get_session),
):
    item = await session.scalar(
        query().where(
            Document.id == document_id, Document.organization_id == context.organization_id
        )
    )
    if not item:
        raise AppError("document_not_found", "Document not found", 404)
    await record_audit(
        session,
        request,
        "document.view",
        context.user.id,
        context.organization_id,
        "document",
        str(item.id),
    )
    await session.commit()
    return serialize(item)
