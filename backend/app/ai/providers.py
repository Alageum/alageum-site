from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ChatTurn:
    role: str
    content: str


class AIProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[ChatTurn]) -> str: ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class MockAIProvider(AIProvider):
    async def chat(self, messages: list[ChatTurn]) -> str:
        last = messages[-1].content if messages else ""
        return f"Mock AI response: {last[:500]}"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(len(text) % 17), float(len(text.split()))] for text in texts]


class OpenAICompatibleProvider(AIProvider):
    async def chat(self, messages: list[ChatTurn]) -> str:
        raise NotImplementedError("AI provider endpoint and policy require configuration")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError("Embedding provider requires configuration")


class LocalModelProvider(OpenAICompatibleProvider):
    pass
