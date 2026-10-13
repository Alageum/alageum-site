from abc import ABC, abstractmethod
from dataclasses import dataclass

import structlog

logger = structlog.get_logger()


@dataclass
class NotificationMessage:
    recipient: str
    subject: str | None
    body: str


class NotificationProvider(ABC):
    @abstractmethod
    async def send(self, message: NotificationMessage) -> str: ...


class ConsoleNotificationProvider(NotificationProvider):
    async def send(self, message: NotificationMessage) -> str:
        logger.info("notification.dev_delivered", recipient=message.recipient)
        return "console-delivery"


class FakeEmailProvider(NotificationProvider):
    def __init__(self):
        self.outbox: list[NotificationMessage] = []

    async def send(self, message: NotificationMessage) -> str:
        self.outbox.append(message)
        return f"fake-email-{len(self.outbox)}"


class SMSProvider(NotificationProvider):
    async def send(self, message: NotificationMessage) -> str:
        raise NotImplementedError("SMS provider must be selected after Discovery")


class WhatsAppProvider(NotificationProvider):
    async def send(self, message: NotificationMessage) -> str:
        raise NotImplementedError("WhatsApp provider must be selected after Discovery")
