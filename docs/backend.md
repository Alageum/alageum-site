# Backend

The API uses Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2 async sessions, PostgreSQL, and Alembic. Configuration is environment-driven through `APP_` settings. OpenAPI is available at `/docs`; application endpoints are versioned under `/api/v1`.

Authentication provides login, refresh rotation, logout/revocation, current-user context, invitations, acceptance, and password reset. Passwords use Argon2. Refresh sessions store a hash of the JWT ID and rotate on use. Real notification delivery of invitation/reset tokens must replace DEV response tokens before production.

Every schema change must be an Alembic revision. Apply migrations with `alembic upgrade head`; load disposable fixtures with `python -m scripts.seed`. The seed is deliberately replaceable and does not alter the schema.

Tests default to SQLite with foreign-key enforcement for fast isolation. CI runs Ruff, pytest and a clean PostgreSQL `upgrade head → downgrade base → upgrade head → alembic check` cycle. List APIs use the common bounded `{items,page,page_size,total}` envelope.
## Operations

FastAPI runs as a modular monolith on Python 3.12. Runtime dependencies are fully resolved in
`requirements.lock`; development/CI dependencies are in `requirements-dev.lock`. Regenerate them
from `pyproject.toml` with Python 3.12 and pip-tools, then review the diff.

`/api/v1/health` is process liveness. `/api/v1/readiness` checks PostgreSQL only and deliberately
does not depend on ERP/CRM/AI availability. `/api/v1/metrics` exposes the low-cardinality DEV memory
recorder; a production exporter implements `MetricsRecorder`.

Application startup validates settings and recovers expired integration job leases. Schema is
managed exclusively by Alembic; runtime code never creates or alters tables.
