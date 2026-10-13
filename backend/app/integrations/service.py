import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.metrics import metrics
from app.core.models import utcnow
from app.core.redaction import redact_sensitive
from app.integrations.models import (
    ExternalEntityLink,
    IntegrationError,
    IntegrationEvent,
    IntegrationJob,
    retry_backoff_seconds,
)
from app.integrations.providers import ProviderError

ProviderCall = Callable[[], Awaitable[Any]]
SuccessHandler = Callable[[Any, AsyncSession], Awaitable[None]]


class IntegrationJobService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def enqueue(
        self,
        *,
        provider: str,
        operation: str,
        idempotency_key: str,
        organization_id: uuid.UUID | None,
        payload: dict[str, Any] | None = None,
        max_attempts: int = 5,
    ) -> tuple[IntegrationJob, bool]:
        existing = await self.session.scalar(
            select(IntegrationJob).where(IntegrationJob.idempotency_key == idempotency_key)
        )
        if existing:
            return existing, False
        job = IntegrationJob(
            provider=provider,
            operation=operation,
            idempotency_key=idempotency_key,
            organization_id=organization_id,
            payload=redact_sensitive(payload or {}),
            max_attempts=max_attempts,
            status="queued",
        )
        try:
            async with self.session.begin_nested():
                self.session.add(job)
                await self.session.flush()
        except IntegrityError:
            existing = await self.session.scalar(
                select(IntegrationJob).where(IntegrationJob.idempotency_key == idempotency_key)
            )
            if not existing:
                raise
            return existing, False
        metrics.increment("integration_jobs_total")
        return job, True

    async def execute(
        self,
        job_id: uuid.UUID,
        provider_call: ProviderCall,
        on_success: SuccessHandler | None = None,
        request_id: str | None = None,
        worker_id: str = "in-process-worker",
    ) -> IntegrationJob:
        job = await self.session.scalar(
            select(IntegrationJob).where(IntegrationJob.id == job_id).with_for_update()
        )
        if not job:
            raise LookupError("integration_job_not_found")
        now = utcnow()
        if job.status in {"succeeded", "dead", "failed"}:
            return job
        if job.status == "running" and job.lock_expires_at and job.lock_expires_at > now:
            return job
        if job.attempts >= job.max_attempts:
            job.status = "dead"
            job.finished_at = now
            await self.session.commit()
            return job

        job.status = "running"
        job.attempts += 1
        job.started_at = now
        job.heartbeat_at = now
        job.last_attempt_at = now
        job.locked_by = worker_id
        job.lock_expires_at = now + timedelta(
            seconds=get_settings().integration_job_lease_seconds
        )
        job.next_attempt_at = None
        self.session.add(
            IntegrationEvent(job_id=job.id, event_type="attempt_started", request_id=request_id)
        )
        await self.session.commit()

        try:
            result = await provider_call()
            if on_success:
                await on_success(result, self.session)
            job = await self.session.get(IntegrationJob, job_id)
            if not job:
                raise LookupError("integration_job_not_found")
            job.status = "succeeded"
            job.finished_at = utcnow()
            job.locked_by = None
            job.lock_expires_at = None
            job.error_code = None
            job.error_message = None
            self.session.add(
                IntegrationEvent(job_id=job.id, event_type="succeeded", request_id=request_id)
            )
            await self.session.commit()
            return job
        except Exception as exc:
            await self.session.rollback()
            job = await self.session.scalar(
                select(IntegrationJob).where(IntegrationJob.id == job_id).with_for_update()
            )
            if not job:
                raise
            retryable = not isinstance(exc, ProviderError) or exc.retryable
            exhausted = job.attempts >= job.max_attempts
            job.status = "dead" if exhausted else ("retrying" if retryable else "failed")
            metrics.increment("integration_jobs_failed")
            if job.status == "dead":
                metrics.increment("integration_jobs_dead")
            job.error_code = getattr(exc, "code", type(exc).__name__)
            job.error_message = str(exc)[:1000]
            if job.status == "retrying":
                delay = retry_backoff_seconds(job.attempts)
                job.next_attempt_at = utcnow() + timedelta(seconds=delay)
            else:
                job.finished_at = utcnow()
            job.locked_by = None
            job.lock_expires_at = None
            self.session.add(
                IntegrationError(
                    job_id=job.id,
                    error_type=type(exc).__name__,
                    safe_details=redact_sensitive({"message": str(exc)[:1000]}),
                )
            )
            await self.session.commit()
            return job

    async def heartbeat(self, job_id: uuid.UUID, worker_id: str) -> bool:
        job = await self.session.scalar(
            select(IntegrationJob).where(
                IntegrationJob.id == job_id,
                IntegrationJob.status == "running",
                IntegrationJob.locked_by == worker_id,
            ).with_for_update()
        )
        if not job:
            return False
        now = utcnow()
        job.heartbeat_at = now
        job.lock_expires_at = now + timedelta(
            seconds=get_settings().integration_job_lease_seconds
        )
        await self.session.commit()
        return True

    async def recover_stale_jobs(self) -> list[uuid.UUID]:
        """Return abandoned work to retrying; execution remains adapter/worker-owned."""
        now = utcnow()
        stale = list(
            (
                await self.session.scalars(
                    select(IntegrationJob)
                    .where(
                        IntegrationJob.status == "running",
                        or_(
                            IntegrationJob.lock_expires_at.is_(None),
                            IntegrationJob.lock_expires_at <= now,
                        ),
                    )
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )
        for job in stale:
            job.status = "retrying" if job.attempts < job.max_attempts else "dead"
            job.next_attempt_at = now if job.status == "retrying" else None
            job.finished_at = now if job.status == "dead" else None
            job.locked_by = None
            job.lock_expires_at = None
            self.session.add(
                IntegrationEvent(job_id=job.id, event_type="lease_recovered")
            )
            if job.status == "dead":
                metrics.increment("integration_jobs_dead")
        await self.session.commit()
        return [job.id for job in stale]


class ReconciliationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def record(
        self,
        *,
        organization_id: uuid.UUID,
        provider: str,
        entity_type: str,
        external_id: str,
        internal_id: uuid.UUID | None,
        checksum: str | None = None,
    ) -> ExternalEntityLink:
        item = await self.session.scalar(
            select(ExternalEntityLink).where(
                ExternalEntityLink.organization_id == organization_id,
                ExternalEntityLink.provider == provider,
                ExternalEntityLink.entity_type == entity_type,
                ExternalEntityLink.external_id == external_id,
            )
        )
        if not item:
            item = ExternalEntityLink(
                organization_id=organization_id,
                provider=provider,
                entity_type=entity_type,
                external_id=external_id,
            )
            self.session.add(item)
        item.internal_id = internal_id
        item.checksum = checksum
        item.sync_status = "synced"
        item.last_error = None
        item.last_synced_at = utcnow()
        await self.session.flush()
        return item
