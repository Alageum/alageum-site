import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
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


class AIConversation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (
        CheckConstraint("scope IN ('public','b2b')", name="valid_scope"),
        CheckConstraint(
            "(scope = 'public') OR (user_id IS NOT NULL AND organization_id IS NOT NULL)",
            name="b2b_has_principal",
        ),
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    scope: Mapped[str] = mapped_column(String(40), default="public")
    title: Mapped[str | None] = mapped_column(String(300))


class AIMessage(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_messages"
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(30))
    content: Mapped[str] = mapped_column(Text)
    message_metadata: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class AIToolCall(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_tool_calls"
    conversation_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("ai_conversations.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id"))
    tool_name: Mapped[str] = mapped_column(String(120))
    operation_type: Mapped[str] = mapped_column(String(20))
    arguments: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    status: Mapped[str] = mapped_column(String(40))
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)


class KnowledgeSource(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_sources"
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    source_type: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(200))
    trust_level: Mapped[str] = mapped_column(String(40), default="untrusted_data")


class KnowledgeDocument(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (UniqueConstraint("source_id", "external_id"),)
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("knowledge_sources.id"))
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    content_hash: Mapped[str] = mapped_column(String(64))


class KnowledgeChunk(UUIDMixin, Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "sequence"),
        CheckConstraint("sequence >= 0", name="sequence_nonnegative"),
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), index=True
    )
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    chunk_metadata: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class AIActionConfirmation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_action_confirmations"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    tool_name: Mapped[str] = mapped_column(String(120))
    arguments_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
