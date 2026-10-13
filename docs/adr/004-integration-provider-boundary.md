# 004 — Integration provider boundary

## Context
ERP/CRM/EDO/logistics contracts and ownership are unknown and unreliable networks are expected.

## Decision
Application services depend on narrow provider interfaces with validated adapters, durable attempts, idempotency and reconciliation.

## Consequences
Mocks support adversarial failures; real adapters cannot leak vendor DTOs into public/domain contracts.

## Alternatives
Random HTTP calls from routers and long DB transactions around network I/O were rejected.

