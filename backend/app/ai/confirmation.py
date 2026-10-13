import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AIActionConfirmation
from app.auth.dependencies import AuthContext
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.models import utcnow


def action_hash(tool_name: str, arguments: dict[str, Any]) -> str:
    canonical = json.dumps(
        {"tool": tool_name, "arguments": arguments},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def is_expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value <= utcnow()


class ConfirmationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def request(
        self, context: AuthContext, tool_name: str, arguments: dict[str, Any]
    ) -> AIActionConfirmation:
        item = AIActionConfirmation(
            user_id=context.user.id,
            organization_id=context.organization_id,
            tool_name=tool_name,
            arguments_hash=action_hash(tool_name, arguments),
            expires_at=utcnow() + timedelta(minutes=get_settings().ai_confirmation_minutes),
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def confirm(
        self, confirmation_id: uuid.UUID, context: AuthContext
    ) -> AIActionConfirmation:
        item = await self._get_scoped(confirmation_id, context, lock=True)
        if item.consumed_at or item.confirmed_at or is_expired(item.expires_at):
            raise AppError("confirmation_invalid", "Confirmation is invalid or expired", 409)
        item.confirmed_at = utcnow()
        await self.session.flush()
        return item

    async def consume(
        self,
        confirmation_id: uuid.UUID,
        context: AuthContext,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> AIActionConfirmation:
        item = await self._get_scoped(confirmation_id, context, lock=True)
        if (
            not item.confirmed_at
            or item.consumed_at
            or is_expired(item.expires_at)
            or item.tool_name != tool_name
            or item.arguments_hash != action_hash(tool_name, arguments)
        ):
            raise AppError("confirmation_invalid", "Confirmation does not match this action", 409)
        item.consumed_at = utcnow()
        await self.session.flush()
        return item

    async def _get_scoped(
        self, confirmation_id: uuid.UUID, context: AuthContext, *, lock: bool
    ) -> AIActionConfirmation:
        statement = select(AIActionConfirmation).where(
            AIActionConfirmation.id == confirmation_id,
            AIActionConfirmation.user_id == context.user.id,
            AIActionConfirmation.organization_id == context.organization_id,
        )
        if lock:
            statement = statement.with_for_update()
        item = await self.session.scalar(statement)
        if not item:
            raise AppError("confirmation_not_found", "Confirmation not found", 404)
        return item
