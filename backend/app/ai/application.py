import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import AuthContext
from app.commerce.models import (
    Order,
    QuoteRequest,
    QuoteRequestItem,
    Ticket,
    TicketCategory,
    TicketMessage,
    TicketStatus,
)
from app.core.errors import AppError
from app.documents.models import Document, DocumentVersion


def required_uuid(arguments: dict[str, Any], key: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(arguments[key]))
    except (KeyError, TypeError, ValueError) as exc:
        raise AppError("invalid_tool_arguments", f"Valid {key} is required", 422) from exc


class AIToolApplicationServices:
    """Narrow application boundary exposed to AI tools; the registry never gets a DB session."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_order(self, context: AuthContext, order_id: uuid.UUID) -> dict[str, Any]:
        order = await self._session.scalar(
            select(Order)
            .where(Order.id == order_id, Order.organization_id == context.organization_id)
            .options(selectinload(Order.status))
        )
        if not order:
            raise AppError("order_not_found", "Order not found", 404)
        return {"id": str(order.id), "number": order.number, "status": order.status.code}

    async def get_document(
        self, context: AuthContext, document_id: uuid.UUID
    ) -> dict[str, Any]:
        document = await self._session.scalar(
            select(Document)
            .where(
                Document.id == document_id,
                Document.organization_id == context.organization_id,
            )
            .options(selectinload(Document.versions).selectinload(DocumentVersion.file))
        )
        if not document:
            raise AppError("document_not_found", "Document not found", 404)
        return {"id": str(document.id), "title": document.title, "number": document.number}

    async def create_ticket(
        self, context: AuthContext, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        category_id = required_uuid(arguments, "category_id")
        subject = str(arguments.get("subject", "")).strip()
        message = str(arguments.get("message", "")).strip()
        if not 1 <= len(subject) <= 300 or not 1 <= len(message) <= 10_000:
            raise AppError("invalid_tool_arguments", "Valid subject and message are required", 422)
        category = await self._session.get(TicketCategory, category_id)
        status = await self._session.scalar(select(TicketStatus).where(TicketStatus.code == "new"))
        if not category or not status:
            raise AppError("ticket_configuration_missing", "Ticket configuration missing", 422)
        ticket = Ticket(
            organization_id=context.organization_id,
            created_by_id=context.user.id,
            category_id=category.id,
            status_id=status.id,
            subject=subject,
        )
        self._session.add(ticket)
        await self._session.flush()
        self._session.add(
            TicketMessage(
                ticket_id=ticket.id, author_user_id=context.user.id, body=message, source="ai"
            )
        )
        return {"id": str(ticket.id), "status": status.code}

    async def create_quote(
        self, context: AuthContext, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        raw_items = arguments.get("items")
        if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 100:
            raise AppError("invalid_tool_arguments", "Between 1 and 100 items are required", 422)
        quote = QuoteRequest(
            organization_id=context.organization_id,
            created_by_id=context.user.id,
            status="submitted",
            comment=str(arguments.get("comment", ""))[:4000] or None,
        )
        self._session.add(quote)
        await self._session.flush()
        for raw in raw_items:
            if not isinstance(raw, dict):
                raise AppError("invalid_tool_arguments", "Invalid quote item", 422)
            try:
                quantity = Decimal(str(raw["quantity"]))
            except (KeyError, InvalidOperation, ValueError) as exc:
                raise AppError(
                    "invalid_tool_arguments", "Positive quantity is required", 422
                ) from exc
            if quantity <= 0:
                raise AppError("invalid_tool_arguments", "Positive quantity is required", 422)
            product_id = raw.get("product_id")
            self._session.add(
                QuoteRequestItem(
                    quote_request_id=quote.id,
                    product_id=uuid.UUID(str(product_id)) if product_id else None,
                    quantity=quantity,
                    parameters=raw.get("parameters", {}),
                )
            )
        return {"id": str(quote.id), "status": quote.status}
