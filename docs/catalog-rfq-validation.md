# Catalogue RFQ validation

**Architecture stop:** Node.js + Strapi are mandatory. This is an unpublished FastAPI-reference
checkpoint, not the approved implementation. Late in-progress frontend guards were closed only to
preserve work; the build results below predate those guards. See [handoff](rfq-checkpoint-handoff.md).

This file records actual local results for the first bounded catalogue-RFQ increment, based on
`581e4c05c17dea3432deab1cdffda0a6ad791530`. It is not a deployment or production-readiness claim.

## Backend: verified locally

- Ruff lint: passed.
- Full default backend suite: **127 passed, 2 skipped**. The skips are deliberately
  PostgreSQL-only concurrency cases; the default fixture uses disposable SQLite.
- Explicit PostgreSQL 17.11 RFQ suite: **28 passed**, including six simultaneous identical
  submissions yielding one request/one audit event and differing payloads racing on the same key
  yielding one creation plus one conflict.
- PostgreSQL migration round-trip: upgrade to head, downgrade to base, upgrade to head: passed.
- Alembic schema consistency: no pending upgrade operations.
- Existing-data migration test: two synthetic historical requests/items preserved, original
  contents unchanged, null idempotency keys/hashes, empty snapshots, position zero and temporary
  backfill defaults removed.
- Server checks cover exact original product IDs and quantities, all-or-nothing validation,
  renamed/hidden products after persistence, missing/invalid/reused keys, permission/auth errors,
  tenant and coworker own-detail isolation, forged system/snapshot fields, pagination, CORS and
  rollback after an injected transaction failure.

PostgreSQL was installed only into disposable local test storage from official Debian packages;
no external database, production account, deployment or secret was used.

## Frontend and integration

- ESLint: passed.
- Frontend unit suite: **128 passed**, including request payload, original UUID preservation,
  safe login destinations, per-account draft isolation, canonical stored-payload validation,
  honest historic-item snapshot fallback,
  changed/no-op/reverted edits, quota failures and durable retry keys.
- Production Next.js build: passed (including dynamic `/b2b/quotes/[id]`).
- Isolated static public-preview export: passed; public demo/export routes remain supported.
- Playwright discovery: **20 cases** registered across desktop and mobile projects. Assertions
  include anonymous login continuation, repeated clicks, unknown network outcome and reload,
  edited resubmission, unavailable/legacy selections, list/detail guarding, keyboard/overflow,
  expired-session reauthentication, multi-item Back/Forward, account switching and storage denial.
- Frontend public-environment allowlist, catalogue asset manifest and Vercel runtime lock checks:
  passed. Imported catalogue sources/assets, icons, catalogue admin and Vercel routing configuration
  have no changes in this increment.
- Production HTTP smoke: catalogue, live inquiry, own list, dynamic detail, company and contact
  routes all returned HTTP 200. This does not substitute for hydrated browser interaction checks.
- `git diff --check`: passed.

The first local build invocation encountered a read-only telemetry configuration directory and an
out-of-project dependency symlink; rerunning with telemetry disabled and a real local dependency
copy completed both normal production and static-preview builds without project-config changes.

Local Chromium cannot start in this execution runtime: its process-singleton Unix socket creation
returns `Operation not permitted`, including the allowed escalated launch. Browser assertions did
not run locally. This is an execution limit, not a passing browser result. No repeated workaround
attempts or changes to security settings are required.

The dedicated `.github/workflows/catalog-rfq.yml` runs the desktop/mobile mocked-interruption
suite and the existing actual-backend security journey against migrated PostgreSQL and a production
Next build. It includes bounded installation/readiness/test/job deadlines and retains logs and
browser artifacts. Its results must be checked for the published commit before calling browser
behavior verified. CI and publication are not implied by this local validation report.

## Final safe edit at the architecture stop

The in-progress frontend interruption/account-switch edit was closed coherently without continuing
the FastAPI feature. Final frontend lint and **132 unit tests** passed. Scoped late-response UI
guards, explicit RFQ reauthentication, matching-session expiry, refresh-flight context guards and
the AuthProvider profile-load generation guard are present. Three gated browser flows were added
(six further desktop/mobile cases, 26 authored total), but none ran locally. Production/preview
builds above predate these final guards; no final guarded build or dedicated AuthProvider runtime
test was run after the stop. Revalidate these pieces in the required Node.js + Strapi migration.
