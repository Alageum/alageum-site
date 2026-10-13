# Node.js + Strapi migration foundation

## Status and boundaries

This is an opt-in first-phase migration, not a production cutover or a finished
B2B platform. `backend-node/` uses Node.js 24 and pinned Strapi 5.56.0. The existing
Next.js application remains the frontend. Its Dockerfile still uses Node.js 22;
the migration CI validates both applications on Node.js 24.

The implemented boundary covers the compatibility catalog API, catalog editor,
demo B2B identity/organization access, catalog RFQ persistence and the bounded
[three-route customer support API](node-support-tickets.md) and
[read-only organization members](node-organization-members.md). The Strapi CMS
is served at `/cms`; the existing Next catalog editor stays at `/admin/catalog`.
These are distinct interfaces and authentication systems. Strapi administrators
are not B2B demo users. The native CMS uses its own administrator registration
and login; it is not automatically seeded with a shared administrator password.
The ALAGEUM catalog plugin adds a CMS editor at `/cms/plugins/alageum-catalog`.
Its native CMS permission and session checks are separate from B2B accounts, while
mutations share the same identity, version, validation and audit transactions.
Generated Content Manager writes remain hidden and blocked by lifecycle guards.
See [CMS catalog authoring](node-strapi-cms-catalog.md) for its exact scope. The native page content type is only an editorial
foundation; existing public pages have not been migrated into CMS delivery.

Compatibility business routes remain under `/api/v1`. Unimplemented legacy
paths fail closed with HTTP 404 and the standard error envelope; unsupported
methods may return 405. They do not silently fall back to Python.
Other legacy areas, including purchasing/order workflows, files and scanning,
manager notifications and CRM integration, require separate implementation and
acceptance. Saving an RFQ records a request; it does not send an email or place an
order. Existing `backend/`, `docker-compose.yml`, and `vercel.json` remain the
legacy Python topology. A working Vercel/Python preview is evidence only for that
legacy topology, not evidence that Strapi has been deployed.

`APP_ENV=production` is deliberately rejected at startup. The browser still uses
development sessionStorage bearer-token transport. Production-safe session
transport, distributed abuse controls, media scanning, backup/restore rehearsal
and an approved cutover must be completed before removing this interlock.
`NODE_ENV=production` optimizes a build/runtime; it does not override this
application-level guard. CI uses `APP_ENV=test` throughout.

## Database isolation is mandatory

Use a new database named `alageum_strapi` (or an isolated test name beginning with
`alageum_strapi`). Never pass the existing Python database URL to Strapi, even for
a one-time smoke test. The Node configuration validates this prefix, but naming
is only an additional guard: operators must still verify the host, database,
owner and backup target before startup.

Strapi owns its native tables in the new database's `public` schema. Custom B2B
identity, session, quote, support and audit tables are managed by the Node domain layer in
the separate `b2b` schema. This is not permission to attach the old database, move
its tables, or run Strapi synchronization there. No legacy customer data is
migrated by this foundation.

Strapi performs synchronization on startup and can remove obsolete structures
that it managed. Review changes and rehearse backups before any future cutover.
The migration runner is not a general rollback mechanism. See the official
[database migrations guidance](https://docs.strapi.io/cms/database-migrations).
The database configuration uses PostgreSQL with a zero-minimum connection pool,
following the [database configuration guidance](https://docs.strapi.io/cms/configurations/database).

## Runtime and secrets

The backend requires all of the following, with no production fallback values:

- `DATABASE_URL`: the dedicated PostgreSQL database
- `APP_KEYS`: comma-separated application signing keys
- `ADMIN_JWT_SECRET`: Strapi administrator authentication secret
- `API_TOKEN_SALT`: Strapi API token salt
- `TRANSFER_TOKEN_SALT`: Strapi transfer token salt
- `ENCRYPTION_KEY`: Strapi encryption key
- `ALAGEUM_JWT_SECRET`: separate compatibility B2B token signing secret

Supply random values of at least 32 characters. Keep real environment keys
stable across restarts and outside version control. Do not reuse CI secrets or
demo account passwords for any public service. No external credentials are
needed for the local test workflow. BuildKit mounts the local build configuration
as a secret, rather than embedding the env file or using credential build args.

Additional controls:

- `APP_ENV`: `development` or `test` only during this phase
- `HOST` and `PORT`: bind address and HTTP port; default port is 8000
- `CORS_ORIGINS`: comma-separated exact frontend origins
- `DATABASE_SSL=1`: verified TLS for a future remote PostgreSQL connection
- `ALAGEUM_SEED_DEMO=1`: explicit opt-in for known local demo identities
- `ALAGEUM_IMPORT_CATALOG=1`: explicit opt-in for reviewed bundled catalog data

Both opt-ins are disabled by default. The fixtures under `backend-node/data/`
are a reviewed snapshot for reproducible local testing, not a live import of
private business data. Update and re-review them deliberately when changing the
source catalog. Known B2B demo credentials such as `buyer@demo.example` /
`ChangeMe123!` exist only after opting into demo seeding.

## Isolated local Docker topology

Requirements: Docker Engine with Compose v2 and BuildKit. The standalone
`docker-compose.node.yml` creates a separate PostgreSQL 16 service, named volumes
and network. Do not combine it with the legacy Compose file using multiple `-f`
flags. The database has no host port mapping. Backend and frontend ports bind to
loopback only. No service is provisioned or published by committing these files.

Generate a private development env file outside the checkout. This command
creates new random local-only keys and fails if the file already exists:

```sh
export NODE_ENV_FILE="$HOME/.config/alageum/node-dev.env"
umask 077
mkdir -p "$(dirname "$NODE_ENV_FILE")"
node <<'NODE'
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const key = () => randomBytes(32).toString('hex');
const password = key();
const env = {
  APP_ENV: 'development',
  NODE_POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgresql://alageum_strapi:${password}@postgres-node:5432/alageum_strapi`,
  APP_KEYS: `${key()},${key()}`,
  ADMIN_JWT_SECRET: key(), API_TOKEN_SALT: key(),
  TRANSFER_TOKEN_SALT: key(), ENCRYPTION_KEY: key(), ALAGEUM_JWT_SECRET: key(),
  ALAGEUM_SEED_DEMO: '1', ALAGEUM_IMPORT_CATALOG: '1',
};
writeFileSync(process.env.NODE_ENV_FILE,
  Object.entries(env).map(([name, value]) => `${name}=${value}\n`).join(''),
  { mode: 0o600, flag: 'wx' });
NODE
docker compose --env-file "$NODE_ENV_FILE" -f docker-compose.node.yml up --build
```

Visit the frontend at `http://localhost:3000`, API readiness at
`http://localhost:8000/api/v1/readiness`, and CMS at
`http://localhost:8000/cms`. Stop the legacy stack first if it already uses these
ports, or set `NODE_API_PORT` and `NODE_FRONTEND_PORT` before building. Changing
the browser API origin requires rebuilding Next.js. Keep the same private env
file for subsequent restarts of this local database.

The container image contains the built admin UI. This local Compose file runs
the backend with `NODE_ENV=development` so loopback HTTP CMS authentication can
use development cookies. A production-mode CMS requires HTTPS and correctly
configured trusted-proxy headers. Do not expose the development stack to the
internet. Shut it down without deleting its volumes:

```sh
docker compose --env-file "$NODE_ENV_FILE" -f docker-compose.node.yml down
```

## Verification without Docker

Requirements: Linux, Node.js 24, npm, PostgreSQL 16+ server binaries, `setsid`,
`curl`, and Playwright Chromium. Dependency installation is explicit:

```sh
npm --prefix backend-node ci
npm --prefix frontend ci
(cd frontend && npx playwright install chromium)
PG_BIN=/path/to/postgresql/bin backend-node/scripts/run-local-tests.sh
```

The runner initializes a new temporary PostgreSQL cluster with a random local
password and dedicated `alageum_strapi_test`, `alageum_strapi_domain_test` and
`alageum_strapi_browser_test` databases. Destructive domain fixtures use only the
domain database; browser CMS accounts exist only in the fresh browser database. It replaces inherited
database configuration and generates disposable application keys. It never
connects to a shared database. It stops its own database and application process
groups on exit, retaining the temporary logs and database for inspection.
`PG_BIN` can be omitted when `pg_config --bindir` locates the server binaries.
Use the same PostgreSQL 16 version as CI when verifying exact environment parity;
PostgreSQL 17 is also useful for a separately identified local compatibility run.

The default runner executes:

1. Backend `npm run check`, `npm run test:integration`, and `npm run build`
2. Frontend `npm run lint`, `npm run test:unit`, and `npm run build`
3. Real Strapi readiness, built `/cms` availability, and `/_health`
4. Native CMS login, publication, role denial, refresh and interrupted-editor
   browser checks, plus existing Next catalog-admin tests against the Node server
5. New `playwright.node.config.js` desktop/mobile RFQ tests against real Node and
   PostgreSQL, including anonymous selection/login handoff, save, exact
   idempotent retry, detail reload and own-list persistence
6. Existing `quotes.spec.js` mocked interruption/race tests on desktop and mobile,
   using a separate static-default development server for its demo-mode cases

The mocked quote suite is complementary UI coverage, not proof of database
persistence. The separate Node RFQ suite contains no route interception. In a
live API-default build, `?source=static` is deliberately ignored; the additional
mock-suite server preserves coverage of the legacy demo without weakening that
guard. For a shorter isolated backend run, pass `--backend-only`; for integration tests only,
pass `--integration-only`. Dependencies must already be installed in both cases.

`.github/workflows/node-strapi.yml` runs these checks against its own PostgreSQL
16 service, with `APP_ENV=test`, fresh disposable application keys, and explicit
fixture opt-ins. The workflow uploads server logs and Playwright failure
artifacts. It has read-only repository permissions and contains no deployment,
cloud provisioning, push, or production-secret step. A workflow file being
present does not establish that hosted CI passed; check the actual run for the
commit under review.

The separate `dependency-audit` CI job installs the locked backend dependency
tree, runs `npm audit --audit-level=high`, and always uploads the JSON report.
Its failures are not suppressed and it has no dependency on the functional job.
The reviewed lock still has high-severity transitive findings at this phase;
passing functional tests is therefore insufficient for security approval or
production release. See `backend-node/docs/dependency-audit.json` and the current
CI artifact for the exact advisory set. Do not apply unreviewed forced major
dependency upgrades merely to make the audit indicator green.

## Hosting decision and remaining work

Strapi is designed as an always-on service; its
[official FAQ](https://docs.strapi.io/cms/faq#can-strapi-be-run-in-serverless-environments)
warns against serverless cold-start deployment. Vercel Functions have bounded
invocation lifetimes; see [Vercel's current function limits](https://vercel.com/docs/functions/limitations).
For this foundation, do not treat a Vercel Function or the unchanged Python
Services configuration as a supported Strapi host.

The proposed later topology is a persistent Node process/container on a
separately approved host, a dedicated PostgreSQL database, durable media storage,
HTTPS ingress and a process supervisor. Next.js may remain on Vercel, using the
approved backend URL and exact CORS origins. No hosting provider, paid plan or
deployment has been selected or authorized by these implementation files.

Strapi's [deployment guide](https://docs.strapi.io/cms/deployment) documents
supported Node LTS runtimes, PostgreSQL requirements, the admin build/start
sequence and deployment isolation. Rebuild the admin UI when its public backend
origin or `/cms` configuration changes. An external host still needs its own
reviewed environment injection, health checks, logging, patching and recovery.

Before production approval:

- Complete and security-review browser session/cookie transport and CSRF policy
- Replace demo identities with an approved organization/membership migration
- Finish unsupported business endpoints and prevent accidental legacy cutover
- Establish multi-instance rate limits and any required background workers
- Implement and verify upload authorization, malware scanning and durable storage
- Rehearse immutable snapshots, backup/restore, schema migrations and rollback
- Review dependency security, CMS roles, HTTPS/proxy settings and access policy
- Obtain explicit hosting, secrets, data-migration and final cutover approval

Until then, the production startup guard must remain enabled.

## Security review evidence

See [the security review and current dependency gate](node-strapi-security-review.md). CMS authoring verification is tracked separately from the still-blocked production cutover.

See [checkpoint validation](node-strapi-validation.md) for exact passed, failed, and never-run checks on this local implementation.

The subsequent [legacy read-contract corrections and route ledger](node-legacy-read-compatibility.md) distinguish route presence from behavioral acceptance, document the seven pagination/filter/RFQ corrections, and retain the finite missing-route and production-readiness backlog.


## Reimplemented editorial Page slice

The separate Page branch adds guarded native Draft & Publish and exact-locale
public delivery. The rich company route remains the default; the subsequent
`COMPANY_SOURCE=cms` integration makes published `ru/about` authoritative at
`/company` with strict fail-closed delivery and shared alias canonical. The Page
slice was reimplemented after a workspace reset; each new integration checkpoint
requires its own hosted acceptance. See
[node-strapi-editorial-pages.md](node-strapi-editorial-pages.md) for migration,
authority and indexing boundaries, and
[node-strapi-editorial-validation.md](node-strapi-editorial-validation.md) for
actual checks and remaining release blocks.
