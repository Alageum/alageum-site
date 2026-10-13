import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.models import UUIDMixin, utcnow

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class AuditEvent(UUIDMixin, Base):
    __tablename__ = "audit_events"
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id"))
    action: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(100))
    entity_id: Mapped[str | None] = mapped_column(String(100))
    request_id: Mapped[str | None] = mapped_column(String(100), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(40), default="api")
    event_metadata: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    __table_args__ = (Index("ix_audit_org_time", "organization_id", "timestamp"),)
