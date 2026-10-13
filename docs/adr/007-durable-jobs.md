# 007 — PostgreSQL durable job leases

## Context
Process restart must not lose integration work, while the production queue vendor is unknown.

## Decision
Persist job state, attempt/idempotency, lease owner/expiry and heartbeat in PostgreSQL. Startup recovers expired running leases to bounded retry.

## Consequences
DEV is restart-safe without selecting Redis/Celery; adapters must heartbeat long work and remain idempotent.

## Alternatives
In-memory-only work and an unneeded distributed queue were rejected.
