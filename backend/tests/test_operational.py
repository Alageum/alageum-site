from datetime import timedelta

from sqlalchemy import event, select

from app.commerce.models import Invoice, Ticket
from app.core.database import AsyncSessionFactory, engine
from app.core.metrics import metrics
from app.core.models import utcnow
from app.integrations.models import IntegrationEvent, IntegrationJob
from app.integrations.service import IntegrationJobService
from tests.factories import login, tenant_fixture


async def test_liveness_readiness_and_metrics_are_separate(client):
    metrics.clear()
    health = await client.get("/api/v1/health")
    readiness = await client.get("/api/v1/readiness")
    snapshot = await client.get("/api/v1/metrics")
    assert health.status_code == readiness.status_code == snapshot.status_code == 200
    assert "database" not in health.json()
    assert readiness.json()["database"] == "ok"
    assert snapshot.json()["http_requests_total"] >= 2


async def test_stale_running_job_is_recovered_after_process_restart():
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        job = IntegrationJob(
            organization_id=data["org_a"].id,
            provider="mock_erp",
            operation="orders.sync",
            idempotency_key="restart-recovery",
            status="running",
            attempts=1,
            max_attempts=3,
            locked_by="dead-worker",
            lock_expires_at=utcnow() - timedelta(seconds=1),
        )
        session.add(job)
        await session.commit()
        recovered = await IntegrationJobService(session).recover_stale_jobs()
        await session.refresh(job)
        assert recovered == [job.id]
        assert job.status == "retrying"
        assert job.locked_by is None and job.next_attempt_at is not None
        assert any(
            item.event_type == "lease_recovered"
            for item in (
                await session.scalars(
                    select(IntegrationEvent).where(IntegrationEvent.job_id == job.id)
                )
            ).all()
        )


async def test_primary_list_query_counts_are_bounded(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
        session.add_all(
            [
                Invoice(
                    organization_id=data["org_a"].id,
                    order_id=data["order_a"].id,
                    number="QUERY-INV-1",
                    amount=1,
                    currency="KZT",
                    status="mock",
                    source="mock",
                ),
                Ticket(
                    organization_id=data["org_a"].id,
                    created_by_id=data["user_a"].id,
                    category_id=data["ticket_category"].id,
                    status_id=data["ticket_status"].id,
                    subject="Query baseline",
                ),
            ]
        )
        await session.commit()
    token = await login(client, "a@example.test")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }
    statements: list[str] = []

    def count_query(*args):
        statements.append(args[2])

    event.listen(engine.sync_engine, "before_cursor_execute", count_query)
    try:
        for path in [
            "/api/v1/catalog/products",
            "/api/v1/orders",
            "/api/v1/documents",
            "/api/v1/finance/invoices",
            "/api/v1/support/tickets",
        ]:
            statements.clear()
            response = await client.get(path, headers=headers)
            assert response.status_code == 200
            assert len(statements) <= 10, f"query regression for {path}: {len(statements)}"
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", count_query)
