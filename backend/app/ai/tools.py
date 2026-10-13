from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

from app.ai.application import AIToolApplicationServices, required_uuid
from app.auth.dependencies import AuthContext
from app.core.errors import AppError


class ToolOperation(StrEnum):
    READ = "READ"
    WRITE = "WRITE"


class ToolHandler(Protocol):
    async def __call__(
        self,
        arguments: dict[str, Any],
        context: AuthContext,
        services: AIToolApplicationServices,
    ) -> Any: ...


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    operation: ToolOperation
    permission: str
    handler: ToolHandler
    requires_confirmation: bool = False


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, definition: ToolDefinition) -> None:
        if definition.name in self._tools:
            raise ValueError(f"Duplicate AI tool: {definition.name}")
        if definition.operation is ToolOperation.WRITE and not definition.requires_confirmation:
            raise ValueError("AI WRITE tools must require confirmation")
        self._tools[definition.name] = definition

    def get(self, name: str) -> ToolDefinition:
        tool = self._tools.get(name)
        if not tool:
            raise AppError("ai_tool_not_found", "AI tool not found", 404)
        return tool

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        context: AuthContext,
        services: AIToolApplicationServices,
        *,
        confirmation_granted: bool = False,
    ) -> Any:
        tool = self.get(name)
        if tool.permission not in context.permissions:
            raise AppError("permission_denied", f"Permission '{tool.permission}' is required", 403)
        if tool.requires_confirmation and not confirmation_granted:
            raise AppError("confirmation_required", "Explicit confirmation is required", 409)
        return await tool.handler(arguments, context, services)


async def get_order_tool(arguments, context, services):
    return await services.get_order(context, required_uuid(arguments, "order_id"))


async def get_document_tool(arguments, context, services):
    return await services.get_document(context, required_uuid(arguments, "document_id"))


async def create_ticket_tool(arguments, context, services):
    return await services.create_ticket(context, arguments)


async def create_quote_tool(arguments, context, services):
    return await services.create_quote(context, arguments)


def default_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(ToolDefinition("get_order", ToolOperation.READ, "order.read", get_order_tool))
    registry.register(
        ToolDefinition("get_document", ToolOperation.READ, "document.read", get_document_tool)
    )
    registry.register(
        ToolDefinition(
            "create_ticket",
            ToolOperation.WRITE,
            "ticket.create",
            create_ticket_tool,
            requires_confirmation=True,
        )
    )
    registry.register(
        ToolDefinition(
            "create_quote",
            ToolOperation.WRITE,
            "quote.create",
            create_quote_tool,
            requires_confirmation=True,
        )
    )
    return registry
