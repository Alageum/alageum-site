import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDMixin

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


def retry_backoff_seconds(attempt: int, base: int = 5, maximum: int = 3600) -> int:
    """Deterministic exponential backoff; adapters may add jitter when scheduling."""
    return min(maximum, base * (2 ** max(0, attempt - 1)))


class IntegrationJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "integration_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed','retrying','dead')",
            name="valid_status",
        ),
        CheckConstraint("attempts >= 0", name="attempts_nonnegative"),
        CheckConstraint("max_attempts > 0", name="max_attempts_positive"),
        CheckConstraint("attempts <= max_attempts", name="attempts_within_limit"),
        Index("ix_integration_jobs_due", "status", "next_attempt_at", "lock_expires_at"),
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    provider: Mapped[str] = mapped_column(String(80), index=True)
    operation: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(40), default="queued", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_by: Mapped[str | None] = mapped_column(String(120))
    lock_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(120))
    error_message: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class IntegrationEvent(UUIDMixin, Base):
    __tablename__ = "integration_events"
    __table_args__ = (UniqueConstraint("job_id", "event_type", "external_id"),)
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("integration_jobs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(80))
    request_id: Mapped[str | None] = mapped_column(String(100))
    external_id: Mapped[str | None] = mapped_column(String(200))
    details: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class IntegrationError(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "integration_errors"
    job_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("integration_jobs.id"), index=True)
    error_type: Mapped[str] = mapped_column(String(120))
    safe_details: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class SyncCursor(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sync_cursors"
    __table_args__ = (UniqueConstraint("organization_id", "provider", "resource"),)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    provider: Mapped[str] = mapped_column(String(80))
    resource: Mapped[str] = mapped_column(String(100))
    cursor: Mapped[str | None] = mapped_column(String(500))


class ExternalEntityLink(UUIDMixin, TimestampMixin, Base):
    """Provider-neutral reconciliation record; it contains no provider business rules."""

    __tablename__ = "external_entity_links"
    __table_args__ = (
        UniqueConstraint("organization_id", "provider", "entity_type", "external_id"),
        CheckConstraint(
            "sync_status IN ('synced','pending','error','conflict')", name="valid_sync_status"
        ),
        Index("ix_external_entity_links_lookup", "provider", "entity_type", "external_id"),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(100))
    external_id: Mapped[str] = mapped_column(String(200))
    internal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    external_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_status: Mapped[str] = mapped_column(String(40), default="pending")
    last_error: Mapped[str | None] = mapped_column(Text)
    checksum: Mapped[str | None] = mapped_column(String(64))
