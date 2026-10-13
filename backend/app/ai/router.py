import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.application import AIToolApplicationServices
from app.ai.confirmation import ConfirmationService
from app.ai.models import AIConversation, AIMessage, AIToolCall
from app.ai.providers import ChatTurn, MockAIProvider
from app.ai.tools import ToolOperation, default_registry
from app.audit.service import record_audit
from app.auth.dependencies import AuthContext, auth_context
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AppError
from app.core.metrics import metrics
from app.core.rate_limit import RateLimitPolicy, rate_limit
from app.core.redaction import redact_sensitive
from app.core.schemas import APIRequest

router = APIRouter(prefix="/ai", tags=["AI"])


class ChatRequest(APIRequest):
    conversation_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=10000)


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message: str


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    _: None = Depends(rate_limit(RateLimitPolicy.AI_CHAT)),
    context: AuthContext = Depends(auth_context),
    session: AsyncSession = Depends(get_session),
):
    settings = get_settings()
    if len(body.message) > settings.ai_max_input_length:
        raise AppError("ai_input_too_large", "AI input exceeds configured limit", 413)
    metrics.increment("ai_requests_total")
    conversation = None
    if body.conversation_id:
        conversation = await session.scalar(
            select(AIConversation).where(
                AIConversation.id == body.conversation_id,
                AIConversation.user_id == context.user.id,
                AIConversation.organization_id == context.organization_id,
            )
        )
        if not conversation:
            raise AppError("conversation_not_found", "Conversation not found", 404)
    else:
        conversation = AIConversation(
            user_id=context.user.id,
            organization_id=context.organization_id,
            scope="b2b",
            title=body.message[:80],
        )
        session.add(conversation)
        await session.flush()
    session.add(AIMessage(conversation_id=conversation.id, role="user", content=body.message))
    response = await MockAIProvider().chat([ChatTurn(role="user", content=body.message)])
    session.add(AIMessage(conversation_id=conversation.id, role="assistant", content=response))
    await session.commit()
    return ChatResponse(conversation_id=conversation.id, message=response)


class ToolRequest(APIRequest):
    conversation_id: uuid.UUID
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    confirmation_id: uuid.UUID | None = None


class ToolResponse(BaseModel):
    result: Any


class ConfirmationResponse(BaseModel):
    confirmation_id: uuid.UUID
    status: str


@router.post("/tools/confirm/{confirmation_id}", response_model=ConfirmationResponse)
async def confirm_tool(
    confirmation_id: uuid.UUID,
    context: AuthContext = Depends(auth_context),
    session: AsyncSession = Depends(get_session),
):
    item = await ConfirmationService(session).confirm(confirmation_id, context)
    await session.commit()
    return ConfirmationResponse(confirmation_id=item.id, status="confirmed")


@router.post("/tools/execute", response_model=ToolResponse)
async def execute_tool(
    body: ToolRequest,
    request: Request,
    context: AuthContext = Depends(auth_context),
    session: AsyncSession = Depends(get_session),
):
    metrics.increment("ai_tool_calls_total")
    conversation = await session.scalar(
        select(AIConversation).where(
            AIConversation.id == body.conversation_id,
            AIConversation.user_id == context.user.id,
            AIConversation.organization_id == context.organization_id,
        )
    )
    if not conversation:
        raise AppError("conversation_not_found", "Conversation not found", 404)
    registry = default_registry()
    definition = registry.get(body.tool)
    if definition.permission not in context.permissions:
        metrics.increment("ai_tool_denied_total")
        raise AppError(
            "permission_denied", f"Permission '{definition.permission}' is required", 403
        )
    confirmation_granted = False
    confirmation_service = ConfirmationService(session)
    if definition.operation is ToolOperation.WRITE:
        if not body.confirmation_id:
            confirmation = await confirmation_service.request(context, body.tool, body.arguments)
            await session.commit()
            raise AppError(
                "confirmation_required",
                "Explicit confirmation is required",
                409,
                {
                    "confirmation_id": str(confirmation.id),
                    "expires_at": confirmation.expires_at.isoformat(),
                },
            )
        await confirmation_service.consume(
            body.confirmation_id, context, body.tool, body.arguments
        )
        confirmation_granted = True
    call = AIToolCall(
        conversation_id=conversation.id,
        user_id=context.user.id,
        organization_id=context.organization_id,
        tool_name=body.tool,
        operation_type=definition.operation.value,
        arguments=redact_sensitive(body.arguments),
        status="requested",
        confirmed=confirmation_granted,
    )
    session.add(call)
    try:
        result = await registry.execute(
            body.tool,
            body.arguments,
            context,
            AIToolApplicationServices(session),
            confirmation_granted=confirmation_granted,
        )
    except AppError:
        metrics.increment("ai_tool_denied_total")
        call.status = "denied"
        await session.commit()
        raise
    call.status = "completed"
    if definition.operation is ToolOperation.WRITE:
        await record_audit(
            session,
            request,
            "ai.tool.write",
            context.user.id,
            context.organization_id,
            "ai_tool_call",
            str(call.id),
            {"tool": body.tool},
            source="ai",
        )
    await session.commit()
    return ToolResponse(result=result)
