# Catalog administration verification — 2026-10-01

## Passed locally

- Frontend lint, unit tests and normal Next.js production build
- Backend complete existing security/domain suite plus catalog permission/CRUD/money/status,
  race/conflict, rollback/audit, source/media validation tests
- Exact 238-record canonical input schema validation and frontend overlay equivalence
- Production dependency lock audit after PyJWT 2.15.1 upgrade: no known vulnerabilities
- New additive migration isolated SQLite downgrade/upgrade and schema-drift comparison
- Existing production security configuration still rejects insecure session transport,
  in-memory rate limiting, noop scanner and SQLite

Final local integration counts: 101 backend tests and 103 frontend unit tests pass. Frontend
and backend lint pass. Normal and explicitly live-mode Next.js builds and isolated static export pass; export has no
admin/login route and no mounted authentication provider. Public-env and shipped-asset checks
also pass. Added 3 real-API browser tests, listed successfully but execution remains blocked
before browser startup as described below.

## Not verified here

- Full PostgreSQL upgrade/downgrade/check: no Docker or PostgreSQL service/binaries in this
  executor. Historical migrations already require PostgreSQL. GitHub CI has a PostgreSQL
  service and retains all migration checks
- Interactive browser flows: all three new Playwright tests were blocked before opening a
  page. Chromium aborts with `socket() failed: Operation not permitted`, including the approved
  escalated attempt. The supported cloud-browser route also rejects localhost with
  `ERR_BLOCKED_BY_CLIENT`. These are environment blockers, not passed UI tests
- No production deployment or production credentials/access provisioning was performed

## Dependency scope

The normal production audit (`pip-audit -r backend/requirements.lock`) passes. A separate
optional audit of every installed development-environment package found inherited DEV-tool
advisories for pytest 8.4.2 (fix requires 9.0.3, outside the current project's <9 constraint),
urllib3 2.7.0 (fixed 2.8.0), and the venv's bundled pip. Those do not appear in the production
requirements lock. No audit gate was disabled and no ignore list was introduced. A separately
reviewed DEV-tool upgrade is still advisable before treating all development tooling as clean.
