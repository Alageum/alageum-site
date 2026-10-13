import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDMixin

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class Category(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "catalog_categories"
    public_key: Mapped[str] = mapped_column(
        String(200), unique=True, index=True, default=lambda: str(uuid.uuid4())
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("catalog_categories.id", ondelete="SET NULL"), index=True
    )
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Product(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "catalog_products"
    public_key: Mapped[str] = mapped_column(
        String(240), unique=True, index=True, default=lambda: str(uuid.uuid4())
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("catalog_categories.id"), index=True
    )
    slug: Mapped[str] = mapped_column(String(240), unique=True, index=True)
    sku: Mapped[str | None] = mapped_column(String(120), unique=True)
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    comparable: Mapped[bool] = mapped_column(Boolean, default=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    currency: Mapped[str | None] = mapped_column(String(3))
    price_mode: Mapped[str] = mapped_column(String(20), default="on_request")
    version: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    specs: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    provenance: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    media: Mapped[list[dict[str, Any]]] = mapped_column(JSON_TYPE, default=list)
    # Immutable import evidence. Editors change structured fields, never this original record.
    source_data: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    __table_args__ = (
        CheckConstraint("status IN ('draft','published','hidden')", name="valid_catalog_status"),
        CheckConstraint("version >= 1", name="positive_catalog_version"),
        CheckConstraint(
            "(price_mode = 'on_request' AND price IS NULL) OR "
            "(price_mode = 'fixed' AND price IS NOT NULL AND price >= 0 "
            "AND currency IS NOT NULL)",
            name="valid_catalog_price",
        ),
        CheckConstraint(
            "currency IS NULL OR (length(currency) = 3 AND currency = upper(currency))",
            name="valid_catalog_currency",
        ),
    )
    category: Mapped[Category] = relationship(lazy="selectin")
    attribute_values: Mapped[list["ProductAttributeValue"]] = relationship(lazy="selectin")


class ProductAttributeDefinition(UUIDMixin, Base):
    __tablename__ = "product_attribute_definitions"
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("catalog_categories.id"), index=True
    )
    code: Mapped[str] = mapped_column(String(120))
    data_type: Mapped[str] = mapped_column(String(40))
    unit: Mapped[str | None] = mapped_column(String(50))
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    is_filterable: Mapped[bool] = mapped_column(Boolean, default=False)
    is_comparable: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("category_id", "code"),)


class ProductAttributeValue(UUIDMixin, Base):
    __tablename__ = "product_attribute_values"
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("catalog_products.id", ondelete="CASCADE"), index=True
    )
    definition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("product_attribute_definitions.id"), index=True
    )
    value_text: Mapped[str | None] = mapped_column(Text)
    value_number: Mapped[float | None] = mapped_column(Numeric)
    value_boolean: Mapped[bool | None] = mapped_column(Boolean)
    value_json: Mapped[Any | None] = mapped_column(JSON_TYPE)
    definition: Mapped[ProductAttributeDefinition] = relationship(lazy="selectin")
    __table_args__ = (UniqueConstraint("product_id", "definition_id"),)


class ProductMedia(UUIDMixin, Base):
    __tablename__ = "product_media"
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalog_products.id"))
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("file_objects.id"))
    kind: Mapped[str] = mapped_column(String(40), default="image")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProductDocument(UUIDMixin, Base):
    __tablename__ = "product_documents"
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalog_products.id"))
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("file_objects.id"))
    document_kind: Mapped[str | None] = mapped_column(String(80))
    translations: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
