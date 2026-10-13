import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, require_permission
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AppError
from app.core.metrics import metrics
from app.core.rate_limit import RateLimitPolicy, rate_limit
from app.core.tenant import get_tenant_entity
from app.files.models import FileObject
from app.files.storage import (
    FileScanner,
    FileStorage,
    content_disposition,
    get_file_scanner,
    get_file_storage,
    safe_filename,
)

router = APIRouter(prefix="/files", tags=["Documents"])
ALLOWED_CONTENT_TYPES = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
}


def content_matches_declared_type(content: bytes, content_type: str) -> bool:
    signatures = {
        "application/pdf": (b"%PDF-",),
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b"PK\x03\x04",),
    }
    return any(content.startswith(signature) for signature in signatures.get(content_type, ()))


class FileOut(BaseModel):
    id: uuid.UUID
    original_name: str
    content_type: str
    size_bytes: int

    model_config = {"from_attributes": True}


@router.post("", response_model=FileOut, status_code=201)
async def upload_file(
    upload: UploadFile = File(...),
    _: None = Depends(rate_limit(RateLimitPolicy.FILE_UPLOAD)),
    context: AuthContext = Depends(require_permission("document.create")),
    session: AsyncSession = Depends(get_session),
    storage: FileStorage = Depends(get_file_storage),
    scanner: FileScanner = Depends(get_file_scanner),
):
    settings = get_settings()
    content = await upload.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise AppError("file_too_large", "File exceeds configured upload limit", 413)
    filename = safe_filename(upload.filename or "file")
    extension = Path(filename).suffix.lower()
    if upload.content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError("file_type_not_allowed", "Unsupported file type", 415)
    if extension not in ALLOWED_CONTENT_TYPES[upload.content_type]:
        raise AppError("file_extension_mismatch", "File extension does not match type", 415)
    if not content_matches_declared_type(content, upload.content_type):
        raise AppError("file_signature_mismatch", "File content does not match type", 415)
    await scanner.scan(content, filename, upload.content_type)
    key, checksum = await storage.upload(content)
    item = FileObject(
        organization_id=context.organization_id,
        storage_key=key,
        original_name=filename,
        content_type=upload.content_type,
        size_bytes=len(content),
        checksum_sha256=checksum,
        storage_backend=settings.storage_backend,
    )
    session.add(item)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await storage.delete(key)
        raise
    await session.refresh(item)
    metrics.increment("file_upload_total")
    return item


async def load_tenant_file(
    file_id: uuid.UUID, context: AuthContext, session: AsyncSession
) -> FileObject:
    return await get_tenant_entity(
        session,
        FileObject,
        file_id,
        context.organization_id,
        error_code="file_not_found",
        message="File not found",
    )


@router.get("/{file_id}")
async def download_file(
    file_id: uuid.UUID,
    request: Request,
    context: AuthContext = Depends(require_permission("document.read")),
    session: AsyncSession = Depends(get_session),
    storage: FileStorage = Depends(get_file_storage),
):
    item = await load_tenant_file(file_id, context, session)
    try:
        content = await storage.download(item.storage_key)
    except FileNotFoundError as exc:
        raise AppError("file_content_missing", "File content is unavailable", 404) from exc
    await record_audit(
        session,
        request,
        "document.download",
        context.user.id,
        context.organization_id,
        "file",
        str(item.id),
    )
    await session.commit()
    headers = {"Content-Disposition": content_disposition(item.original_name)}
    return Response(content, media_type=item.content_type, headers=headers)
