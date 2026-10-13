from sqlalchemy import func, select

from app.core.database import AsyncSessionFactory
from app.integrations.models import ExternalEntityLink, IntegrationError, IntegrationJob
from app.integrations.providers import (
    MockBehavior,
    MockCRMProvider,
    MockEDOProvider,
    MockERPProvider,
    MockLogisticsProvider,
    ProviderFailureMode,
)
from app.integrations.service import IntegrationJobService, ReconciliationService
from app.notifications.providers import FakeEmailProvider, NotificationMessage
from tests.factories import tenant_fixture


async def test_mock_providers_are_development_ready():
    assert (await MockERPProvider().get_order("1"))["external_id"] == "1"
    assert await MockCRMProvider().create_lead({}) == "mock-lead-1"
    assert await MockEDOProvider().get_signature_status("1") == "pending"
    assert (await MockLogisticsProvider().get_tracking("1"))["events"] == []
    email = FakeEmailProvider()
    await email.send(NotificationMessage("dev@example.test", "Test", "Body"))
    assert len(email.outbox) == 1


async def test_adversarial_mock_modes_are_deterministic():
    timeout = MockERPProvider(MockBehavior(ProviderFailureMode.TIMEOUT))
    try:
        await timeout.get_orders("org")
    except TimeoutError as exc:
        assert str(exc) == "mock_provider_timeout"
    else:
        raise AssertionError("timeout mode must fail")

    duplicate = MockERPProvider(MockBehavior(ProviderFailureMode.DUPLICATE))
    orders = await duplicate.get_orders("org")
    assert len(orders) == 2
    assert orders[0]["external_id"] == orders[1]["external_id"]


async def test_integration_job_is_idempotent_and_succeeds_once():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        service = IntegrationJobService(session)
        first, created = await service.enqueue(
            provider="mock_erp",
            operation="orders.sync",
            idempotency_key="orders:org-a:cursor-1",
            organization_id=data["org_a"].id,
        )
        second, duplicate = await service.enqueue(
            provider="mock_erp",
            operation="orders.sync",
            idempotency_key="orders:org-a:cursor-1",
            organization_id=data["org_a"].id,
        )
        assert created is True and duplicate is False and first.id == second.id
        await session.commit()

        calls = 0

        async def provider_call():
            nonlocal calls
            calls += 1
            return {"external_id": "order-1"}

        result = await service.execute(first.id, provider_call)
        repeated = await service.execute(first.id, provider_call)
        assert result.status == repeated.status == "succeeded"
        assert calls == 1


async def test_integration_retry_is_bounded_and_provider_failure_does_not_save_partial_data():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        service = IntegrationJobService(session)
        job, _ = await service.enqueue(
            provider="mock_erp",
            operation="orders.sync",
            idempotency_key="orders:org-a:failing",
            organization_id=data["org_a"].id,
            max_attempts=2,
        )
        await session.commit()

        async def failing_call():
            raise TimeoutError("secret=must-not-be-a-payload")

        first = await service.execute(job.id, failing_call)
        assert first.status == "retrying" and first.next_attempt_at is not None
        second = await service.execute(job.id, failing_call)
        assert second.status == "dead" and second.attempts == 2
        assert await session.scalar(select(func.count(IntegrationError.id))) == 2


async def test_reconciliation_upserts_same_external_entity():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        service = ReconciliationService(session)
        first = await service.record(
            organization_id=data["org_a"].id,
            provider="mock_erp",
            entity_type="order",
            external_id="ABC",
            internal_id=data["order_a"].id,
            checksum="one",
        )
        await session.commit()
        second = await service.record(
            organization_id=data["org_a"].id,
            provider="mock_erp",
            entity_type="order",
            external_id="ABC",
            internal_id=data["order_a"].id,
            checksum="two",
        )
        await session.commit()
        assert first.id == second.id and second.checksum == "two"
        assert await session.scalar(select(func.count(ExternalEntityLink.id))) == 1
        assert await session.scalar(select(func.count(IntegrationJob.id))) == 0
