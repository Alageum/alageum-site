# Vercel Services configuration

This change prepares one Vercel project containing the existing FastAPI backend and
Next.js frontend. It does not deploy, create infrastructure, run remote migrations,
configure credentials, or make the application production-ready.

## Service and route contract

The root `vercel.json` defines exactly two services:

- `backend`: root `backend`, framework `fastapi`, entrypoint `app.main:app`
- `frontend`: root `frontend`, framework `nextjs`

Top-level rules run in order:

1. `/api/(.*)` routes to `backend`, preserving the full path. Existing API routes
   therefore remain `/api/v1/...`. `/api/openapi.json` is also publicly routed.
2. `/(.*)` routes everything else to `frontend`, including `/`, `/catalog`,
   `/admin/catalog`, `/login`, `/_next/...` and static assets.

The backend's Swagger `/docs` and ReDoc `/redoc` paths are not exposed by this
configuration; those URLs reach the frontend and return its not-found page.
Unmatched `/api/...` URLs return the backend's 404 without falling through to Next.js.
The bare `/api` path matches the frontend fallback, not the `/api/` prefix rule.

Both services have public ingress. There are no internal-only services and no
bindings. All existing API calls originate in the browser through
`frontend/lib/api/client.js`, so an internal binding would not be usable by the caller.
The browser defaults to same-origin `/api/v1`. Docker and separate-port development
can continue setting the existing `NEXT_PUBLIC_API_URL` override.

Public routing does not remove application authentication or authorization. Existing
auth/admin/file permissions remain in FastAPI. This rule also exposes the existing
unauthenticated health/readiness/version/DEV-metrics endpoints under `/api/v1`, as
well as the OpenAPI schema. Decide whether to retain, restrict or remove that surface
before any real-data deployment; the configuration itself adds no access controls.

If server-side calls are introduced later, the calling service must declare a binding
with all four fields (`type: service`, target `service`, `format: url`, and a private
`env` name). That generated URL is for server functions at runtime only, never browser
`NEXT_PUBLIC_*` values, build-time data fetching, or middleware. A private-backend
design would also require an explicit server route/BFF and a separately reviewed
auth/CSRF design; it is not part of this change.

## Build and dependency assumptions

- Import the repository root into Vercel, not `frontend/` or `backend/` individually.
  Do not add top-level framework, build, install or function settings: service roots
  own them. Framework detection uses each service's existing manifests.
- `backend/.python-version` selects Python 3.12, matching Docker and CI.
  `backend/uv.lock` is Vercel's supported lockfile. Its 40 runtime package versions
  match `requirements.lock`; optional development dependencies are not production
  requirements. CI checks that the audited runtime pins stay aligned.
- Next.js uses `frontend/package-lock.json` and the existing `npm run build` script.
  The normal Next.js application is used, not the standalone static-preview export.
- Leave `NEXT_PUBLIC_API_URL` unset, or set it to `/api/v1` before building. A stale
  `http://localhost:8000/api/v1` project variable would send visitors to their own
  computer. `NEXT_PUBLIC_*` values are embedded at build time, so changing them
  requires rebuilding.
- `NEXT_PUBLIC_CATALOG_SOURCE` remains unchanged: default `static` preserves the
  reviewed 238-record public snapshot. Set `api` explicitly only after the database
  import is complete and live catalog behavior is intended. The admin always uses
  the database API; static catalog data is not a fallback for failed live API calls.
- No binding variable is required for the frontend build. Do not put backend
  secrets in public variables or committed configuration.

When updating runtime dependencies, update and audit `requirements.lock`, regenerate
`uv.lock` with matching package versions, then run:

```sh
python3 scripts/check_vercel_runtime_lock.py
cd backend
uv lock --check
uv export --frozen --no-dev --no-emit-project --format requirements.txt
```

Review the exported runtime set against the audited lock; do not silently resolve to
newer unaudited versions. The Python builder includes reachable files and dependencies;
only an actual Vercel build can establish the final function bundle size.

## Local development

Use a current Vercel CLI with Services and local-mode support (62.1.0 was checked).
From the repository root, with frontend dependencies installed and a prepared local
database:

```sh
NEXT_PUBLIC_API_URL=/api/v1 vercel dev -L
```

`-L` does not need a Vercel login or linked project and does not deploy. It does not
pull cloud environment variables. Set local `APP_DATABASE_URL`, `APP_SECRET_KEY` and
storage settings in your shell or ignored `.env` first. The Docker example's
`postgres` hostname is only reachable inside Docker; a host-run Vercel process must
use a database address reachable from the host. Do not reuse development credentials
or deterministic demo users for a public deployment.

Use the existing PostgreSQL migration and seed/import workflow for local integration:
Alembic first, DEV seed only for disposable development data, then the reviewed
catalog import described in [catalog administration](catalog-admin.md).
Startup queries the integration-job table, so an empty database is not sufficient.
`vercel dev -L --listen 3100` can use a different public port if 3000 is occupied.
Open the server as `http://localhost:3100` (or the chosen port), not `127.0.0.1`.
Next.js permits `localhost` for development resources by default; using the numeric
host through the Vercel proxy blocks HMR and can prevent client hydration. The CI
job uses `localhost` without expanding Next.js's development-origin allowlist.

Check `/api/v1/health`, `/api/v1/readiness`, `/api/v1/catalog/products`, `/catalog`,
`/login`, `/admin/catalog`, a static asset and an unknown API path. Run the existing
catalog/admin browser suites against the shared origin; set `E2E_API_URL` to that
origin plus `/api/v1`. An API response alone is not a frontend/routing test.

The `vercel-services` CI job uses disposable PostgreSQL, the frozen Python lock,
Vercel CLI 62.1.0 and `vercel dev -L`. It runs the full browser suite plus explicit
API/page ownership, OpenAPI, 404 and same-origin request checks. It uses no Vercel
token or project link and performs no deployment. Startup and the job are bounded;
the local server is cleaned up on exit. Run this suite with
`E2E_VERCEL_SERVICES=1 npm run test:e2e:vercel` from `frontend/` after starting the
shared-origin server and setting `E2E_BASE_URL` and `E2E_API_URL`.

## Required before any deployment

1. Confirm the exact service names, public paths, OpenAPI/system-route exposure,
   absence of internal services/bindings, catalog mode and deployment environment.
2. Provision an approved managed PostgreSQL database and supply its async driver
   URL securely as `APP_DATABASE_URL`. Apply reviewed Alembic migrations as a separate
   release step. Import all 238 catalog records using the reviewed importer before
   selecting live catalog mode. Startup/build must not create schema or seed users.
   Keep preview data isolated from production data and define backups/rollback.
3. Replace local file persistence with an implemented durable object-storage adapter
   before using uploads/documents. The current `s3` class is only a placeholder.
   Vercel function-local files and SQLite are not durable application storage;
   a writable temporary directory is not a persistence solution. Do not bundle local
   databases, uploads, `.env` files or credentials.
4. Complete the existing production security requirements: approved HttpOnly
   cookie/BFF transport and CSRF policy, distributed limiter, real file scanner,
   PostgreSQL and a non-placeholder secret. `APP_ENV=production` deliberately fails
   with the current session-storage-only auth adapter. This patch does not relax
   that guard, rename insecure adapters to bypass it, or select `development` for
   a production deployment.
5. Review connection pooling, job execution/recovery and proxy trust for scaled
   functions. In-memory counters and rate limits are per process, and cold-start
   recovery is not a durable worker/scheduler. Confirm upload/body limits against
   the selected Vercel plan and the application's current 10 MiB upload limit.
6. Run a real authorized Vercel build/preview to verify runtime packaging, dependency
   installation, application startup, migrations, routing and browser flows. Local
   tests cannot establish cloud provisioning or production readiness.

## Official references

- [Services overview](https://vercel.com/docs/services)
- [Routing and preserved paths](https://vercel.com/docs/services/routing)
- [Runtime-only caller bindings](https://vercel.com/docs/services/bindings)
- [Service settings](https://vercel.com/docs/services/config-reference)
- [FastAPI entrypoints and lifespan](https://vercel.com/docs/frameworks/backend/fastapi)
- [Python dependencies and bundle limits](https://vercel.com/docs/functions/runtimes/python)
