# Order Lifecycle Template

| Stage/transition | Actor/system | Trigger | Preconditions | Input data | Business action | Source-of-truth update | Customer visibility | Notification | Document/evidence | Exception/recovery | SLA/date rule | Permission/approval | Acceptance ID |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [NEEDS_CLIENT] | | | | | | | | | | | | | |

Attach at least one normal and one exception lifecycle. Mark each transition read-only from ERP or
platform-write candidate; any external WRITE requires passport idempotency/reconciliation.

