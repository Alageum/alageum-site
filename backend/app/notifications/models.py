import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDMixin

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class Notification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notifications"
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default="pending")
    subject: Mapped[str | None] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    provider_message_id: Mapped[str | None] = mapped_column(String(200))


class NotificationTemplate(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notification_templates"
    code: Mapped[str] = mapped_column(String(120), unique=True)
    channel: Mapped[str] = mapped_column(String(40))
    locale: Mapped[str] = mapped_column(String(10))
    content: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class NotificationPreference(UUIDMixin, Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("membership_id", "event_code", "channel"),)
    membership_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("memberships.id"), index=True)
    event_code: Mapped[str] = mapped_column(String(120))
    channel: Mapped[str] = mapped_column(String(40))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
