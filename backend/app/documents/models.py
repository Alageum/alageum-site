import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDMixin


class DocumentType(UUIDMixin, Base):
    __tablename__ = "document_types"
    code: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Document(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("organization_id", "source", "external_id"),
        UniqueConstraint("id", "organization_id"),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    type_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("document_types.id"))
    number: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(300))
    external_id: Mapped[str | None] = mapped_column(String(200), index=True)
    source: Mapped[str] = mapped_column(String(60), default="manual")
    type: Mapped[DocumentType] = relationship(lazy="selectin")
    versions: Mapped[list["DocumentVersion"]] = relationship(lazy="selectin")


class DocumentVersion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "document_versions"
    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    version: Mapped[int] = mapped_column(Integer)
    file: Mapped["FileObject"] = relationship(lazy="selectin", overlaps="versions")
    __table_args__ = (
        UniqueConstraint("document_id", "version"),
        CheckConstraint("version > 0", name="version_positive"),
        ForeignKeyConstraint(
            ["document_id", "organization_id"],
            ["documents.id", "documents.organization_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["file_id", "organization_id"],
            ["file_objects.id", "file_objects.organization_id"],
        ),
    )


from app.files.models import FileObject  # noqa: E402
