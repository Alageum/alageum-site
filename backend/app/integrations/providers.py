import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class ProviderFailureMode(StrEnum):
    NONE = "none"
    TIMEOUT = "timeout"
    NETWORK_ERROR = "network_error"
    SERVER_ERROR = "server_error"
    RATE_LIMITED = "rate_limited"
    MALFORMED = "malformed"
    DUPLICATE = "duplicate"
    STALE = "stale"
    MISSING_FIELD = "missing_field"
    UNAVAILABLE = "unavailable"
    DELAYED = "delayed"


class ProviderError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = True):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass
class MockBehavior:
    mode: ProviderFailureMode = ProviderFailureMode.NONE
    delay_seconds: float = 0.01

    async def before_call(self) -> None:
        if self.mode == ProviderFailureMode.DELAYED:
            await asyncio.sleep(self.delay_seconds)
        elif self.mode == ProviderFailureMode.TIMEOUT:
            raise TimeoutError("mock_provider_timeout")
        elif self.mode == ProviderFailureMode.NETWORK_ERROR:
            raise ConnectionError("mock_provider_network_error")
        elif self.mode == ProviderFailureMode.SERVER_ERROR:
            raise ProviderError("provider_500")
        elif self.mode == ProviderFailureMode.RATE_LIMITED:
            raise ProviderError("provider_429")
        elif self.mode == ProviderFailureMode.UNAVAILABLE:
            raise ProviderError("provider_unavailable")

    def transform(self, value: Any) -> Any:
        if self.mode == ProviderFailureMode.MALFORMED:
            return "malformed"
        if self.mode == ProviderFailureMode.MISSING_FIELD and isinstance(value, dict):
            value.pop("external_id", None)
        if self.mode == ProviderFailureMode.STALE and isinstance(value, dict):
            value["stale"] = True
        if self.mode == ProviderFailureMode.DUPLICATE and isinstance(value, list) and value:
            return [*value, value[0].copy()]
        return value


class ERPProvider(ABC):
    @abstractmethod
    async def get_orders(self, organization_external_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def get_order(self, external_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    async def get_documents(self, organization_external_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def get_invoices(self, organization_external_id: str) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def get_payments(self, organization_external_id: str) -> list[dict[str, Any]]: ...


class CRMProvider(ABC):
    @abstractmethod
    async def create_lead(self, data: dict[str, Any]) -> str: ...

    @abstractmethod
    async def create_ticket(self, data: dict[str, Any]) -> str: ...

    @abstractmethod
    async def get_customer(self, external_id: str) -> dict[str, Any] | None: ...


class EDOProvider(ABC):
    @abstractmethod
    async def send_document(self, document_id: str) -> str: ...

    @abstractmethod
    async def get_signature_status(self, external_id: str) -> str: ...


class LogisticsProvider(ABC):
    @abstractmethod
    async def get_shipment(self, order_external_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    async def get_tracking(self, shipment_external_id: str) -> dict[str, Any] | None: ...


class MockERPProvider(ERPProvider):
    def __init__(self, behavior: MockBehavior | None = None):
        self.behavior = behavior or MockBehavior()

    async def get_orders(self, organization_external_id: str) -> list[dict[str, Any]]:
        await self.behavior.before_call()
        value = [{"external_id": f"mock-{organization_external_id}-1", "status": "received"}]
        return self.behavior.transform(value)

    async def get_order(self, external_id: str) -> dict[str, Any] | None:
        await self.behavior.before_call()
        return self.behavior.transform({"external_id": external_id, "status": "received"})

    async def get_documents(self, organization_external_id: str) -> list[dict[str, Any]]:
        return []

    async def get_invoices(self, organization_external_id: str) -> list[dict[str, Any]]:
        return []

    async def get_payments(self, organization_external_id: str) -> list[dict[str, Any]]:
        return []


class MockCRMProvider(CRMProvider):
    def __init__(self, behavior: MockBehavior | None = None):
        self.behavior = behavior or MockBehavior()

    async def create_lead(self, data: dict[str, Any]) -> str:
        await self.behavior.before_call()
        return "mock-lead-1"

    async def create_ticket(self, data: dict[str, Any]) -> str:
        return "mock-ticket-1"

    async def get_customer(self, external_id: str) -> dict[str, Any] | None:
        return {"external_id": external_id, "source": "mock"}


class MockEDOProvider(EDOProvider):
    def __init__(self, behavior: MockBehavior | None = None):
        self.behavior = behavior or MockBehavior()

    async def send_document(self, document_id: str) -> str:
        await self.behavior.before_call()
        return f"mock-edo-{document_id}"

    async def get_signature_status(self, external_id: str) -> str:
        return "pending"


class MockLogisticsProvider(LogisticsProvider):
    def __init__(self, behavior: MockBehavior | None = None):
        self.behavior = behavior or MockBehavior()

    async def get_shipment(self, order_external_id: str) -> dict[str, Any] | None:
        await self.behavior.before_call()
        return {"external_id": f"shipment-{order_external_id}", "status": "mock"}

    async def get_tracking(self, shipment_external_id: str) -> dict[str, Any] | None:
        return {"external_id": shipment_external_id, "events": []}
