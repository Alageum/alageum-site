import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum

from app.ai.providers import AIProvider


@dataclass
class RetrievedChunk:
    document_id: uuid.UUID
    content: str
    score: float
    metadata: dict


class KnowledgeVisibility(StrEnum):
    PUBLIC = "PUBLIC"
    TENANT_PRIVATE = "TENANT_PRIVATE"


class VectorIndex(ABC):
    @abstractmethod
    async def index(self, chunk_id: uuid.UUID, vector: list[float], metadata: dict) -> None: ...

    @abstractmethod
    async def search(
        self, vector: list[float], organization_id: uuid.UUID | None, limit: int = 5
    ) -> list[RetrievedChunk]: ...


class InMemoryVectorIndex(VectorIndex):
    def __init__(self):
        self.entries: dict[uuid.UUID, tuple[list[float], dict]] = {}

    async def index(self, chunk_id: uuid.UUID, vector: list[float], metadata: dict) -> None:
        self.entries[chunk_id] = (vector, metadata)

    async def search(
        self, vector: list[float], organization_id: uuid.UUID | None, limit: int = 5
    ) -> list[RetrievedChunk]:
        # DEV implementation still enforces tenant filtering before returning data.
        result = []
        for _, (_, metadata) in self.entries.items():
            visibility = metadata.get("visibility", KnowledgeVisibility.TENANT_PRIVATE)
            is_public = visibility == KnowledgeVisibility.PUBLIC
            is_own_private = (
                visibility == KnowledgeVisibility.TENANT_PRIVATE
                and organization_id is not None
                and metadata.get("organization_id") == organization_id
            )
            if not (is_public or is_own_private):
                continue
            result.append(
                RetrievedChunk(
                    document_id=metadata["document_id"],
                    content=metadata["content"],
                    score=1.0,
                    metadata={
                        "trust_level": "untrusted_data",
                        "visibility": visibility,
                        "instruction_priority": "data_only",
                    },
                )
            )
        return result[:limit]


class KnowledgeParser(ABC):
    @abstractmethod
    async def parse(self, content: bytes, content_type: str) -> str: ...


class PlainTextParser(KnowledgeParser):
    async def parse(self, content: bytes, content_type: str) -> str:
        if content_type not in {"text/plain", "text/markdown"}:
            raise ValueError("No parser configured for this content type")
        return content.decode("utf-8", errors="replace")


class KnowledgePipeline:
    def __init__(
        self,
        provider: AIProvider,
        index: VectorIndex,
        parser: KnowledgeParser,
        chunk_size: int = 1000,
    ):
        self.provider = provider
        self.index = index
        self.parser = parser
        self.chunk_size = chunk_size

    async def ingest(
        self,
        document_id: uuid.UUID,
        organization_id: uuid.UUID | None,
        content: bytes,
        content_type: str,
    ) -> int:
        text = await self.parser.parse(content, content_type)
        chunks = [
            text[start : start + self.chunk_size] for start in range(0, len(text), self.chunk_size)
        ]
        vectors = await self.provider.embed(chunks)
        for chunk, vector in zip(chunks, vectors, strict=True):
            await self.index.index(
                uuid.uuid4(),
                vector,
                {
                    "document_id": document_id,
                    "organization_id": organization_id,
                    "visibility": (
                        KnowledgeVisibility.PUBLIC
                        if organization_id is None
                        else KnowledgeVisibility.TENANT_PRIVATE
                    ),
                    "content": chunk,
                    "trust_level": "untrusted_data",
                },
            )
        return len(chunks)
