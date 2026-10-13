"""Catalogue RFQs: server-owned snapshots, explicit ownership and atomic retry handling."""

import hashlib
import json
import uuid
from copy import deepcopy
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit.service import record_audit
from app.auth.dependencies import AuthContext
from app.catalog.models import Category, Product
from app.commerce.models import QuoteRequest, QuoteRequestItem
from app.core.errors import AppError
from app.core.schemas import APIRequest


class QuoteItemIn(APIRequest):
    product_id: uuid.UUID
    quantity: Decimal = Field(gt=0, max_digits=18, decimal_places=3, allow_inf_nan=False)


class QuoteIn(APIRequest):
    comment: str | None = Field(default=None, max_length=4000)
    items: list[QuoteItemIn] = Field(min_length=1, max_length=100)


class QuoteOut(BaseModel):
    id: uuid.UUID
    status: str
    comment: str | None
    item_count: int
    created_at: datetime


class QuoteItemOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    quantity: Decimal
    product_snapshot: dict[str, Any]
    model_config = {"from_attributes": True}


class QuoteDetailOut(QuoteOut):
    items: list[QuoteItemOut]


def quote_out(quote: QuoteRequest) -> QuoteOut:
    return QuoteOut(
        id=quote.id,
        status=quote.status,
        comment=quote.comment,
        item_count=len(quote.items),
        created_at=quote.created_at,
    )


def quote_detail(quote: QuoteRequest) -> QuoteDetailOut:
    return QuoteDetailOut(
        **quote_out(quote).model_dump(),
        items=[QuoteItemOut.model_validate(item) for item in quote.items],
    )


def own_quotes(context: AuthContext):
    return (
        select(QuoteRequest)
        .where(
            QuoteRequest.organization_id == context.organization_id,
            QuoteRequest.created_by_id == context.user.id,
        )
        .options(selectinload(QuoteRequest.items))
    )


def request_fingerprint(body: QuoteIn) -> str:
    # Semantically identical decimal representations and reordered lines are safe retries.
    content = {
        "comment": body.comment,
        "items": sorted(
            [
                {
                    "product_id": str(item.product_id),
                    "quantity": format(item.quantity.normalize(), "f"),
                }
                for item in body.items
            ],
            key=lambda item: item["product_id"],
        ),
    }
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()


def snapshot(product: Product) -> dict[str, Any]:
    # Only public catalogue data. No client-supplied name, price, status or availability is trusted.
    return {
        "public_key": product.public_key,
        "slug": product.slug,
        "sku": product.sku,
        "translations": deepcopy(product.translations),
        "specs": deepcopy(product.specs),
        "category_public_key": product.category.public_key,
        "version": product.version,
        "price": str(product.price) if product.price is not None else None,
        "currency": product.currency,
        "price_mode": product.price_mode,
    }


def replay(quote: QuoteRequest, fingerprint: str) -> QuoteRequest:
    if quote.request_hash != fingerprint:
        raise AppError(
            "idempotency_conflict",
            "This submission key was already used for a different request",
            409,
        )
    return quote


async def submit_quote(
    session: AsyncSession,
    context: AuthContext,
    body: QuoteIn,
    key: uuid.UUID,
    request: Request,
) -> tuple[QuoteRequest, bool]:
    ids = [item.product_id for item in body.items]
    if len(set(ids)) != len(ids):
        raise AppError("quote_duplicate_product", "Use one line per product", 422)
    fingerprint = request_fingerprint(body)
    lookup = own_quotes(context).where(QuoteRequest.idempotency_key == key)
    existing = await session.scalar(lookup)
    if existing:
        # A catalogue change after successful persistence must not turn a retry into a new RFQ.
        return replay(existing, fingerprint), False

    # Publication is the only availability fact present in this catalogue. This is an inquiry,
    # not inventory validation, a reservation, an order, or a price commitment.
    products = list(
        (
            await session.scalars(
                select(Product)
                .join(Category)
                .where(
                    Product.id.in_(ids),
                    Product.status == "published",
                    Category.is_published.is_(True),
                )
                .order_by(Product.id)
                .with_for_update(of=(Product, Category))
            )
        ).all()
    )
    by_id = {product.id: product for product in products}
    missing = [str(product_id) for product_id in ids if product_id not in by_id]
    if missing:
        raise AppError(
            "quote_product_unavailable",
            "Some selected products are no longer available for inquiry",
            422,
            {"product_ids": missing},
        )
    quote = QuoteRequest(
        organization_id=context.organization_id,
        created_by_id=context.user.id,
        status="submitted",
        comment=body.comment,
        idempotency_key=key,
        request_hash=fingerprint,
        items=[
            QuoteRequestItem(
                product_id=item.product_id,
                quantity=item.quantity.quantize(Decimal("0.001")),
                position=index,
                product_snapshot=snapshot(by_id[item.product_id]),
                parameters={},
            )
            for index, item in enumerate(body.items)
        ],
    )
    try:
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
    except IntegrityError:
        # A database unique constraint arbitrates concurrent workers, not an in-memory lock.
        await session.rollback()
        existing = await session.scalar(lookup)
        if existing is None:
            raise
        return replay(existing, fingerprint), False
    return quote, True
