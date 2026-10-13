import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, require_permission
from app.commerce.models import (
    Invoice,
    Order,
    Payment,
    QuoteRequest,
    QuoteRequestItem,
    Ticket,
    TicketCategory,
    TicketMessage,
    TicketStatus,
)
from app.commerce.quotes import (
    QuoteDetailOut,
    QuoteIn,
    QuoteOut,
    own_quotes,
    quote_detail,
    quote_out,
    submit_quote,
)
from app.core.database import get_session
from app.core.errors import AppError
from app.core.pagination import Page, PageParams, paginate
from app.core.rate_limit import RateLimitPolicy, rate_limit
from app.core.schemas import APIRequest

orders_router = APIRouter(prefix="/orders", tags=["Orders"])
finance_router = APIRouter(prefix="/finance", tags=["Finance"])
quotes_router = APIRouter(prefix="/quotes", tags=["Quotes"])
support_router = APIRouter(prefix="/support", tags=["Support"])


class OrderItemOut(BaseModel):
    id: uuid.UUID
    description: str
    quantity: Decimal
    unit_price: Decimal | None
    configuration: dict[str, Any]

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: uuid.UUID
    external_id: str | None
    number: str
    currency: str
    amount: Decimal
    status: str
    items: list[OrderItemOut]


def order_out(item: Order) -> OrderOut:
    return OrderOut(
        id=item.id,
        external_id=item.external_id,
        number=item.number,
        currency=item.currency,
        amount=item.amount,
        status=item.status.code,
        items=[OrderItemOut.model_validate(value) for value in item.items],
    )


def order_query():
    return select(Order).options(selectinload(Order.status), selectinload(Order.items))


@orders_router.get("", response_model=Page[OrderOut])
async def list_orders(
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("order.read")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        order_query()
        .where(Order.organization_id == context.organization_id)
        .order_by(Order.created_at.desc(), Order.id),
        page,
    )
    return Page(
        items=[order_out(item) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@orders_router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: uuid.UUID,
    request: Request,
    context: AuthContext = Depends(require_permission("order.read")),
    session: AsyncSession = Depends(get_session),
):
    item = await session.scalar(
        order_query().where(Order.id == order_id, Order.organization_id == context.organization_id)
    )
    if not item:
        raise AppError("order_not_found", "Order not found", 404)
    await record_audit(
        session,
        request,
        "order.view",
        context.user.id,
        context.organization_id,
        "order",
        str(item.id),
    )
    await session.commit()
    return order_out(item)


class FinanceOut(BaseModel):
    id: uuid.UUID
    number: str | None = None
    amount: Decimal
    currency: str
    status: str | None = None
    source: str


@finance_router.get("/invoices", response_model=Page[FinanceOut])
async def invoices(
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("finance.read")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        select(Invoice)
        .where(Invoice.organization_id == context.organization_id)
        .order_by(Invoice.created_at.desc(), Invoice.id),
        page,
    )
    return Page(
        items=[FinanceOut.model_validate(item, from_attributes=True) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@finance_router.get("/payments", response_model=Page[FinanceOut])
async def payments(
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("finance.read")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        select(Payment)
        .where(Payment.organization_id == context.organization_id)
        .order_by(Payment.created_at.desc(), Payment.id),
        page,
    )
    return Page(
        items=[
            FinanceOut(id=item.id, amount=item.amount, currency=item.currency, source=item.source)
            for item in items
        ],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@quotes_router.get("", response_model=Page[QuoteOut])
async def list_quotes(
    response: Response,
    mine: bool = False,
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("quote.read")),
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "private, no-store"
    # Keep the existing organization-summary contract; the My requests UI explicitly uses mine.
    query = select(QuoteRequest).where(QuoteRequest.organization_id == context.organization_id)
    if mine:
        query = query.where(QuoteRequest.created_by_id == context.user.id)
    items, total = await paginate(
        session,
        query.options(selectinload(QuoteRequest.items).load_only(QuoteRequestItem.id)).order_by(
            QuoteRequest.created_at.desc(), QuoteRequest.id
        ),
        page,
    )
    return Page(
        items=[quote_out(item) for item in items],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@quotes_router.get("/{quote_id}", response_model=QuoteDetailOut)
async def get_quote(
    quote_id: uuid.UUID,
    response: Response,
    context: AuthContext = Depends(require_permission("quote.read")),
    session: AsyncSession = Depends(get_session),
):
    response.headers["Cache-Control"] = "private, no-store"
    quote = await session.scalar(own_quotes(context).where(QuoteRequest.id == quote_id))
    if quote is None:
        raise AppError("quote_not_found", "Request not found", 404)
    return quote_detail(quote)


@quotes_router.post("/catalog", response_model=QuoteDetailOut, status_code=201)
async def create_quote(
    body: QuoteIn,
    request: Request,
    response: Response,
    idempotency_key: uuid.UUID = Header(alias="Idempotency-Key"),
    _: None = Depends(rate_limit(RateLimitPolicy.QUOTE_CREATE)),
    context: AuthContext = Depends(require_permission("quote.create")),
    session: AsyncSession = Depends(get_session),
):
    quote, created = await submit_quote(session, context, body, idempotency_key, request)
    response.status_code = 201 if created else 200
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Location"] = f"/api/v1/quotes/{quote.id}"
    return quote_detail(quote)


# Pre-existing generic RFQ API remains compatible. Catalogue clients must use /quotes/catalog.
class LegacyQuoteItemIn(APIRequest):
    product_id: uuid.UUID | None = None
    quantity: Decimal = Field(gt=0)
    parameters: dict[str, Any] = Field(default_factory=dict)


class LegacyQuoteIn(APIRequest):
    comment: str | None = Field(default=None, max_length=4000)
    items: list[LegacyQuoteItemIn] = Field(min_length=1, max_length=100)


@quotes_router.post("", response_model=QuoteOut, status_code=201)
async def create_legacy_quote(
    body: LegacyQuoteIn,
    request: Request,
    _: None = Depends(rate_limit(RateLimitPolicy.QUOTE_CREATE)),
    context: AuthContext = Depends(require_permission("quote.create")),
    session: AsyncSession = Depends(get_session),
):
    quote = QuoteRequest(
        organization_id=context.organization_id,
        created_by_id=context.user.id,
        status="submitted",
        comment=body.comment,
        items=[QuoteRequestItem(**item.model_dump()) for item in body.items],
    )
    session.add(quote)
    await session.flush()
    await record_audit(
        session,
        request,
        "quote.create",
        context.user.id,
        context.organization_id,
        "quote",
        str(quote.id),
    )
    await session.commit()
    return quote_out(quote)


class TicketIn(APIRequest):
    category_id: uuid.UUID
    subject: str = Field(min_length=1, max_length=300)
    message: str = Field(min_length=1, max_length=10000)


class TicketOut(BaseModel):
    id: uuid.UUID
    subject: str
    category: str
    status: str


class TicketCategoryOut(BaseModel):
    id: uuid.UUID
    code: str
    label: str

    model_config = {"from_attributes": True}


@support_router.get("/categories", response_model=Page[TicketCategoryOut])
async def ticket_categories(
    page: PageParams = Depends(),
    _: AuthContext = Depends(require_permission("ticket.create")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session, select(TicketCategory).order_by(TicketCategory.code, TicketCategory.id), page
    )
    return Page(items=items, page=page.page, page_size=page.page_size, total=total)


@support_router.get("/tickets", response_model=Page[TicketOut])
async def list_tickets(
    page: PageParams = Depends(),
    context: AuthContext = Depends(require_permission("ticket.read")),
    session: AsyncSession = Depends(get_session),
):
    items, total = await paginate(
        session,
        select(Ticket)
        .where(Ticket.organization_id == context.organization_id)
        .options(selectinload(Ticket.category), selectinload(Ticket.status))
        .order_by(Ticket.created_at.desc(), Ticket.id),
        page,
    )
    return Page(
        items=[
            TicketOut(id=x.id, subject=x.subject, category=x.category.code, status=x.status.code)
            for x in items
        ],
        page=page.page,
        page_size=page.page_size,
        total=total,
    )


@support_router.post("/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    body: TicketIn,
    request: Request,
    context: AuthContext = Depends(require_permission("ticket.create")),
    session: AsyncSession = Depends(get_session),
):
    category = await session.get(TicketCategory, body.category_id)
    status = await session.scalar(select(TicketStatus).where(TicketStatus.code == "new"))
    if not category or not status:
        raise AppError(
            "ticket_configuration_missing", "Ticket category or initial status missing", 422
        )
    ticket = Ticket(
        organization_id=context.organization_id,
        created_by_id=context.user.id,
        category_id=category.id,
        status_id=status.id,
        subject=body.subject,
    )
    session.add(ticket)
    await session.flush()
    session.add(
        TicketMessage(ticket_id=ticket.id, author_user_id=context.user.id, body=body.message)
    )
    await record_audit(
        session,
        request,
        "ticket.create",
        context.user.id,
        context.organization_id,
        "ticket",
        str(ticket.id),
    )
    await session.commit()
    return TicketOut(
        id=ticket.id, subject=ticket.subject, category=category.code, status=status.code
    )
