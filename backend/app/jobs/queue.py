from abc import ABC, abstractmethod
from typing import Any


class JobQueue(ABC):
    @abstractmethod
    async def enqueue(self, name: str, payload: dict[str, Any]) -> str: ...


class InProcessJobQueue(JobQueue):
    """Deterministic DEV/test queue. Production adapter can use Celery + Redis."""

    def __init__(self):
        self.jobs: list[tuple[str, dict[str, Any]]] = []

    async def enqueue(self, name: str, payload: dict[str, Any]) -> str:
        self.jobs.append((name, payload))
        return f"dev-job-{len(self.jobs)}"
