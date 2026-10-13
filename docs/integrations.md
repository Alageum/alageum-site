# Integrations

Provider contracts exist for ERP, CRM, EDO, logistics, notification, file storage, AI, vector search, and background jobs. DEV uses Mock ERP/CRM/EDO/logistics, console/fake email, local files, Mock AI, and an in-memory vector index.

`IntegrationJobService` persists an attempt before provider I/O, closes the database transaction during the network call, and then atomically records success or bounded retry/dead failure. Re-executing a terminal job is a no-op. `IntegrationJob`, `IntegrationEvent`, `IntegrationError`, and `SyncCursor` retain idempotency, retry/backoff, request/external IDs, redacted errors, and cursors. `ExternalEntityLink` records provider/entity/external/internal identity, sync time, checksum, status and conflict/error state for lightweight reconciliation.

Running work owns a configurable PostgreSQL lease (`locked_by`, `heartbeat_at`,
`lock_expires_at`). Application startup recovers expired leases to `retrying` or `dead` according
to the existing attempt bound. Recovery never claims an external action succeeded; real workers
must heartbeat and provider writes must remain idempotent/reconciled.

Adversarial mock behavior covers timeout, network/500/429/unavailable, malformed/missing/stale, duplicate and delayed responses. Actual adapters must validate external DTOs before calling application services and must never keep a database transaction open during provider I/O.

Celery + Redis is a supported future `JobQueue` adapter, but is not fixed until workload, operations ownership, and infrastructure constraints are known. The in-process queue is only for deterministic DEV/test use.
