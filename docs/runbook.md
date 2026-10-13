# Compact incident runbook

- **Backend down:** inspect `docker compose logs backend`, verify config and `/readiness`, then
  restart backend. Do not bypass failed migrations.
- **Database unavailable:** preserve volumes, check PostgreSQL health/capacity/connections and
  credentials. Restore only from a verified artifact after incident authorization.
- **Migration failed:** stop rollout, retain logs and DB snapshot, review the exact revision. Use a
  tested downgrade only when safe; never edit `alembic_version` manually.
- **Provider down:** platform remains ready; inspect retry/dead jobs and redacted errors. Disable the
  adapter or wait for bounded retry. Reconcile before replaying external writes.
- **Job stuck:** inspect lease/heartbeat/attempts. Restart invokes stale-lease recovery. Never change
  a job to succeeded manually; verify provider outcome/idempotency first.
- **Storage unavailable:** disable uploads/downloads at the edge if necessary, preserve DB metadata,
  restore storage separately and verify checksums.
- **AI unavailable:** disable AI feature flag/provider route while B2B APIs remain available. Never
  weaken tool authorization to restore service.

Escalation, monitoring links and incident owners are **NEEDS_CLIENT**.

