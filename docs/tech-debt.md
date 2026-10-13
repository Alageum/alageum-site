# Technical trade-offs and debt

No broken authorization or known cross-tenant defect is deferred here.

## Intentional pre-Discovery trade-offs

| Item | Current boundary | Exit criterion |
|---|---|---|
| Mock providers/vector data | Interfaces/security are real; payloads are synthetic | Approved contracts, provider and data governance |
| Generic statuses/roles/catalog | Configurable placeholders only | Client-approved workflows, taxonomy and RBAC matrix |
| SQLite unit suite | Fast FK-enabled isolation; PostgreSQL migration/Compose checks are separate | Add dialect-specific tests as real queries/contracts arrive |

## Needs production infrastructure

| Item | Current boundary | Exit criterion |
|---|---|---|
| Memory rate limiter/metrics | Bounded single-process DEV; production rejects limiter | Atomic distributed backend and approved exporter |
| In-process runner | Job state and leases durable in PostgreSQL | Select runner/worker topology and heartbeat operations |
| No-op scanner/local storage | Production rejects scanner; strict validation/checksums remain | Approved scanner, quarantine and object storage |
| Local DB backups | Restore is tested; file bytes excluded | Destination, encryption, schedule, retention, RPO/RTO and storage backup |

## Needs client decision

| Item | Current boundary | Exit criterion |
|---|---|---|
| Browser refresh in `sessionStorage` | Central transport module; short tokens; XSS risk remains | Approve same-site/BFF topology, HttpOnly cookie and matching CSRF policy |
| Nullable global role scope | No global-role API; tenant roles constrained | Decide whether global/shared roles exist |
| AI external WRITE semantics | DB writes have scoped confirmation | Approve actions, second approval, provider idempotency and reconciliation |

## Engineering debt

None knowingly left that can be resolved without production infrastructure or client decisions.
