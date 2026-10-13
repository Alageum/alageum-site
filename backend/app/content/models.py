import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDMixin

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class Page(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "content_pages"
    slug: Mapped[str] = mapped_column(String(240), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    seo: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class PageBlock(UUIDMixin, Base):
    __tablename__ = "content_page_blocks"
    page_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("content_pages.id", ondelete="CASCADE"), index=True
    )
    block_type: Mapped[str] = mapped_column(String(100))
    content: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ContentEntry(UUIDMixin, TimestampMixin, Base):
    """Extensible base for news, projects, vacancies, and contact locations."""

    __tablename__ = "content_entries"
    entry_type: Mapped[str] = mapped_column(String(60), index=True)
    slug: Mapped[str] = mapped_column(String(240), index=True)
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    seo: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)


class Media(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "content_media"
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("file_objects.id"))
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    usage: Mapped[str | None] = mapped_column(String(80))
