# Disposable verification fixtures

## Isolated catalog quote quota

`bash backend-node/scripts/run-quote-limit-tests.sh` creates its own loopback
cluster and exact `alageum_strapi_quote_limit_test` database. Use Node 24, locked
backend dependencies and PostgreSQL 16+ in `PG_BIN`. It refuses reused databases
before Strapi initialization, clears inherited libpq connection overrides and
uses only generated disposable secrets and fictitious actors.

The runtime uses real source socket addresses and waits for the real 60-second
window. It never raises, clears or replaces the application's default quota.
Only the printed `alageum-quote-limit-tests.*/evidence` directory is publishable;
application, confirmed cluster removal and private-fixture cleanup must all pass.
The separate hosted browser case uses the already-built frontend/backend after
the existing Node RFQ suite. See
[`docs/node-quote-throttle.md`](../../docs/node-quote-throttle.md) for its exact
scope, response contract and remaining production limitations.

## Isolated system reads and database outage

`bash backend-node/scripts/run-system-tests.sh` runs all 23 system HTTP/PostgreSQL
groups without a browser or build. It accepts no selection or external-database
options. Use Node 24, installed locked backend dependencies, and PostgreSQL 16+
binaries in `PG_BIN`. The runner creates its own loopback cluster and exactly
`alageum_strapi_system_test`, ignores inherited connection/seeding settings, and
generates private disposable secrets. It refuses a reused database before Strapi
initialization and any existing B2B rows before inserting fictitious fixtures.

The suite deliberately stops only that invocation's owned PostgreSQL cluster
while Strapi remains running, verifies process reads and safe failed readiness,
then restores it and verifies recovery. It compares all public/B2B table rows,
columns and constraints before/after the requests and verifies B2B persistence
plus metrics reset across application recreation. Production/staging startup
refusal remains an explicit real-startup check.

The printed `alageum-system-tests.*/evidence` directory contains sanitized logs
and `results.json`. Share only this verified directory. App shutdown, confirmed
owned-cluster stop/removal and private-fixture removal have separate mandatory
result fields; cleanup failure fails acceptance. Never publish the sibling raw
database, credentials or staging files. See
[`docs/node-system-reads.md`](../../docs/node-system-reads.md) for the exact public
DTOs, allowed metadata and deliberate legacy adaptations.

## Native CMS administrators

`seed-test-cms-admins.js` is an explicit test command, never application bootstrap.
It uses Strapi's native role and user services, including native password hashing.
The editor has only `plugin::alageum-catalog.manage`; the second administrator has
no catalog permission. Neither identity is a B2B user or a Strapi Super Admin.

The command requires `APP_ENV=test`, `ALAGEUM_TEST_ADMIN_FIXTURES=1`, a loopback
PostgreSQL URL naming an allowlisted isolated test database, and independently
generated `E2E_CMS_EDITOR_PASSWORD` / `E2E_CMS_DENIED_PASSWORD` values. It verifies
the connected database and refuses existing administrators rather than resetting
their credentials or widening permissions. CI/local browser checks use their own
fresh `alageum_strapi_browser_test` database, separate from integration fixtures.

No password is printed or written by the helper. CI masks its generated values;
test-only browser traces can contain short-lived test sessions. Do not use real
credentials, production databases, or persistent administrator accounts here.

The native CMS login UI is `/cms/auth/login`; the guarded editor is
`/cms/plugins/alageum-catalog`. Pinned Strapi 5.56 still serves authentication APIs
under `/admin`, while its browser UI reads the access cookie under `/cms`. Their
shared cookie path is therefore `/`, not `/cms` or `/admin`. Cookies remain
host-only: a dedicated backend/CMS origin is a production prerequisite, rather
than placing unrelated applications on the same host. The `secure` option is
intentionally not overridden: Strapi 5.56 sets
Secure on production HTTPS requests, and isolated test HTTP needs no globally
weakened cookie setting. Rebuild the admin bundle when cookie/path config changes.

The fixture guard and least-privilege behavior have dependency-free unit tests:

```sh
node --test tests/cms-fixtures.test.js
```

They are also included in the normal `npm run check` / `npm test` glob.

The fixture CLI awaits native administrator metrics started by user creation
before closing Strapi. This prevents an unawaited count query from racing pool
shutdown, even when telemetry is disabled; metric failures still propagate.
`run-local-tests.sh --fixtures-only` verifies the actual CLI in a new isolated
cluster without building or launching the browser.

## Separate company-profile fixtures

`bash backend-node/scripts/run-profile-tests.sh --browser` (from repository root)
creates a new local PostgreSQL cluster and the exact `alageum_strapi_profile_test`
database, starts actual Strapi, creates only fictitious B2B profile users, builds
Next into `.next-profile`, and runs the explicit 17-case desktop/mobile profile
suite. Set `PG_BIN` to the installed PostgreSQL 16+ binaries and use Node 24 with
locked dependencies and Playwright Chromium already installed. The runner ignores
the caller's database URL and generates fresh runtime secrets/passwords.

`--backend-only` runs the real HTTP fixture/permission/persistence/conflict checks
without a browser or frontend build. It is a local diagnostic mode; CI rejects it
so a partial pass cannot be mistaken for browser acceptance. Existing default 45
and optional webpack 4 browser cases keep their original scopes.

`seed-test-profile-users.js` requires `APP_ENV=test`,
`ALAGEUM_TEST_PROFILE_FIXTURES=1`, an explicit long disposable
`E2E_PROFILE_PASSWORD`, and the exact loopback test database. Its CLI preflight
refuses any existing application tables before Strapi synchronization. Seeding
refuses existing B2B rows/CMS administrators and creates dedicated role grants;
existing/demo roles are never widened. Do not run it on any customer database.

The runner prints the sanitized evidence directory. Share only its sanitized
logs/results and explicitly captured fictitious saved-state PNGs; never raw
databases, credentials, cookies, tokens or network traces. See
[`docs/company-profile.md`](../../docs/company-profile.md) for contract and limits.

## Separate customer support fixtures

`bash backend-node/scripts/run-support-tests.sh --browser` creates a new loopback
PostgreSQL cluster and the exact `alageum_strapi_support_test` database. Before
constructing Strapi it rejects wrong/shared/nonfresh databases; fixtures refuse
reseeding and never widen default roles. All users and ticket text are fictitious.

Acceptance consists of 21 real HTTP/PostgreSQL checks, a dedicated `.next-support`
production build and 20 desktop/mobile browser cases with four explicit PNGs.
`--backend-only` is a local diagnostic mode and is forbidden in CI. The runner
prints a sanitized evidence directory; only that directory's sanitized reports,
logs and explicit PNGs may be shared. Never share the sibling database cluster,
credentials or browser authentication traces. See
[`docs/node-support-tickets.md`](../../docs/node-support-tickets.md) for the
three-route boundary, non-idempotent submission behavior and exact evidence gate.

## Separate invoice metadata fixtures

`bash backend-node/scripts/run-invoice-tests.sh --browser` creates a fresh
loopback PostgreSQL cluster with exactly `alageum_strapi_invoice_test`, refuses
reused/non-test/remote inputs before Strapi startup, and inserts only fictitious
invoice metadata. No real financial feed or default-role provisioning is added.

Acceptance requires 19 backend/HTTP/PostgreSQL checks, an isolated `.next-invoice`
production build, and 28 browser cases (14 desktop + 14 mobile), with exactly six
explicit list/empty/retry PNGs. `--backend-only` is local diagnostic mode and is
forbidden in CI. Publish only the sanitized `alageum-invoice-tests.*/evidence`
directory, whose stable report is `results.json`; never raw databases, credentials
or browser authentication traces. See
[`docs/node-invoice-metadata.md`](../../docs/node-invoice-metadata.md) for the
six-field read-only contract, schema preflight and evidence gate.

## Separate document metadata fixtures

`bash backend-node/scripts/run-document-tests.sh --browser` creates a fresh
loopback PostgreSQL cluster with exactly `alageum_strapi_document_test`, refusing
reused/non-test/remote inputs before Strapi starts. It inserts only fictitious
document/type/version/file metadata and six least-privilege B2B users. No bytes,
providers, signed URLs or real documents are created or fetched.

The runner requires 24 backend checks of real HTTP/PostgreSQL list/detail behavior, tenant isolation,
shared authority locks, precise audit boundaries, metadata constraints and drift.
It removes document/version uniqueness to prove actual pre-sync startup refusal,
explicitly restores that fixture constraint, and verifies a complete restart.
Browser acceptance requires all 26 runner checks: those 24 backend checks, an
isolated `.next-document` production build and all 26 browser cases (13 desktop
and 13 mobile), with exactly six list/empty/retry PNGs.
`--backend-only` is local diagnostic mode and is forbidden in CI.

Publish only sanitized `alageum-document-tests.*/evidence`, whose stable report is
`results.json`; never raw databases, credentials or authentication traces. The
existing dependency security gate remains blocked; functional acceptance does
not approve a production cutover. See
[`docs/node-document-metadata.md`](../../docs/node-document-metadata.md) for the
seven-field metadata contract, audit schema limits and evidence requirements.

## Separate organization member fixtures

`bash backend-node/scripts/run-member-tests.sh --browser` creates a fresh loopback
PostgreSQL cluster with exactly `alageum_strapi_member_test`. It ignores the
caller's database URL and creates fresh runtime secrets. The fixture preflight
rejects reused databases before constructing Strapi; seeding refuses existing
B2B rows or CMS administrators. Use Node 24, PostgreSQL 16+ via `PG_BIN`, and
existing locked dependencies and Playwright Chromium.

Fixtures contain 55 tenant A memberships and two tenant B memberships, including
inactive target memberships/users, tenant-local and global roles, equal creation
timestamps, and blank, Unicode, nonstandard-email and HTML-looking synthetic
text. Test-only reader roles grant exactly `organization.manage_users`; a separate
profile-only actor has only profile read/update grants and cannot read members. No
existing role or organization fixture is changed. The six-string list DTO keeps
those values as plain data. Authentication changes remain covered separately.

Acceptance runs 21 backend checks: the exact 17-case HTTP/PostgreSQL matrix,
freshness and seeding guards, full Strapi restart persistence, and final identity/
business-row invariance without non-authentication audit events. Full acceptance
requires all 23 runner checks, adding the `.next-member` production build and the
exact 19 browser cases (15 desktop and four responsive mobile) selected by
`playwright.members.config.js`, with zero retries, skips, flakes or unexpected
outcomes. Exactly eight PNGs are required: `members-list-viewport`,
`members-page-two`, `members-empty`, and `members-error` in each of the
`member-desktop` and `member-mobile` projects.
`--backend-only` runs only backend acceptance as a local diagnostic and is
forbidden in CI.

The runner requires `APP_ENV=test`, `ALAGEUM_TEST_MEMBER_FIXTURES=1`, a long random
`E2E_MEMBER_PASSWORD`, and its exact loopback database. Raw artifacts are staged
privately until complete sanitization. Publish only the printed
`alageum-member-tests.*/evidence` directory, whose stable summary is `results.json`.
Never publish the sibling database cluster, password files or authentication
traces. Cleanup has bounded Strapi and owned-process-group teardown, and removes
only this invocation's temporary database and private staging. Functional
acceptance does not approve a production cutover or resolve the existing
dependency-security gate.

## Bounded native Page fast-save probe

The existing fresh-database Page delivery harness accepts an explicit
`--fast-save-probe` option only with `ALAGEUM_TEST_PAGE_FAST_SAVE=1` and full
browser mode. It preserves the original editor/publisher roles and adds a
disposable Page-only create/read/update/publish actor. After the existing seven
Page browser cases it runs one serial diagnostic containing 12 measured save or
publish attempts, with no retries or artificial delays and a 180-second budget.

Only selected synthetic Page data, event timings and screenshots are retained.
Native login traffic, tokens, passwords and browser storage are excluded. The
first mismatch stops the probe; passing all attempts gives bounded evidence,
not a general guarantee against editor races. See
[`docs/native-page-fast-save.md`](../../docs/native-page-fast-save.md).
