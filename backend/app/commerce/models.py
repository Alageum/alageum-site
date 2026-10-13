import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
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
from app.core.models import TimestampMixin, UUIDMixin, utcnow

JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class OrderStatus(UUIDMixin, Base):
    __tablename__ = "order_statuses"
    code: Mapped[str] = mapped_column(String(80), unique=True)
    label: Mapped[str] = mapped_column(String(160))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("organization_id", "external_id"),
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
        Index("ix_orders_organization_created", "organization_id", "created_at"),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(200), index=True)
    number: Mapped[str] = mapped_column(String(120), index=True)
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    status_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("order_statuses.id"))
    status: Mapped[OrderStatus] = relationship(lazy="selectin")
    items: Mapped[list["OrderItem"]] = relationship(lazy="selectin")


class OrderItem(UUIDMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price IS NULL OR unit_price >= 0", name="unit_price_nonnegative"),
    )
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("catalog_products.id"))
    external_product_id: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    configuration: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class OrderEvent(UUIDMixin, Base):
    __tablename__ = "order_events"
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id", ondelete="CASCADE"))
    status_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("order_statuses.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source: Mapped[str] = mapped_column(String(60))
    external_status: Mapped[str | None] = mapped_column(String(160))
    details: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class ExternalStatusMapping(UUIDMixin, Base):
    __tablename__ = "external_status_mappings"
    __table_args__ = (UniqueConstraint("provider", "external_status"),)
    provider: Mapped[str] = mapped_column(String(80), index=True)
    external_status: Mapped[str] = mapped_column(String(160))
    platform_status_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("order_statuses.id"))


class Invoice(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("organization_id", "source", "external_id"),
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
        Index("ix_invoices_organization_created", "organization_id", "created_at"),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("orders.id"), index=True)
    number: Mapped[str] = mapped_column(String(120))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(60))
    source: Mapped[str] = mapped_column(String(60), default="ERP")
    external_id: Mapped[str | None] = mapped_column(String(200))


class Payment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("organization_id", "source", "external_id"),
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
        Index("ix_payments_organization_created", "organization_id", "created_at"),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("orders.id"))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("invoices.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3))
    source: Mapped[str] = mapped_column(String(60), default="ERP")
    external_id: Mapped[str | None] = mapped_column(String(200))


class PaymentScheduleItem(UUIDMixin, Base):
    __tablename__ = "payment_schedule_items"
    __table_args__ = (CheckConstraint("amount >= 0", name="amount_nonnegative"),)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(60))


class QuoteRequest(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "quote_requests"
    __table_args__ = (
        Index("ix_quote_requests_organization_created", "organization_id", "created_at"),
        UniqueConstraint(
            "organization_id",
            "created_by_id",
            "idempotency_key",
            name="uq_quote_request_submission",
        ),
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(60), default="submitted")
    comment: Mapped[str | None] = mapped_column(Text)
    external_id: Mapped[str | None] = mapped_column(String(200))
    # Nullable for pre-existing/AI mock requests; HTTP catalogue submissions require both.
    idempotency_key: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    request_hash: Mapped[str | None] = mapped_column(String(64))
    items: Mapped[list["QuoteRequestItem"]] = relationship(
        lazy="selectin", order_by="(QuoteRequestItem.position, QuoteRequestItem.id)"
    )


class QuoteRequestItem(UUIDMixin, Base):
    __tablename__ = "quote_request_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)
    quote_request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("quote_requests.id", ondelete="CASCADE")
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("catalog_products.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)
    product_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON_TYPE, default=dict)


class QuoteAttachment(Base):
    __tablename__ = "quote_attachments"
    quote_request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("quote_requests.id", ondelete="CASCADE"), primary_key=True
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("file_objects.id"), primary_key=True
    )


class TicketCategory(UUIDMixin, Base):
    __tablename__ = "ticket_categories"
    code: Mapped[str] = mapped_column(String(80), unique=True)
    label: Mapped[str] = mapped_column(String(160))


class TicketStatus(UUIDMixin, Base):
    __tablename__ = "ticket_statuses"
    code: Mapped[str] = mapped_column(String(80), unique=True)
    label: Mapped[str] = mapped_column(String(160))


class Ticket(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "tickets"
    __table_args__ = (Index("ix_tickets_organization_created", "organization_id", "created_at"),)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), index=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("ticket_categories.id"))
    status_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("ticket_statuses.id"))
    subject: Mapped[str] = mapped_column(String(300))
    category: Mapped[TicketCategory] = relationship(lazy="selectin")
    status: Mapped[TicketStatus] = relationship(lazy="selectin")


class TicketMessage(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ticket_messages"
    ticket_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("tickets.id", ondelete="CASCADE"))
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(60), default="portal")


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"
    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("ticket_messages.id", ondelete="CASCADE"), primary_key=True
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("file_objects.id"), primary_key=True
    )
