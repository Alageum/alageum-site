# Bounded customer order reading on Node/Strapi

This phase preserves the existing Python customer order-reading contract on Node
24, Strapi 5.56.0 and isolated PostgreSQL. Next remains the frontend. It supplies
fixture compatibility only: real order ingestion does not exist, and these routes
do not make live customer orders available. No customer database, product links,
real credentials or production data are migrated. Production startup refusal and
dependency gates remain unchanged.

## Contract and storage boundary

Only GET `/api/v1/orders` and GET `/api/v1/orders/{UUID}` are implemented. Both
require the existing `order.read` permission and an active selected organization.
The list is organization-wide, including snapshots visible to other members; it
has no owner filter. It returns `{items, page, page_size, total}` ordered by
`created_at DESC, id ASC`. Default page size is 50, capped at 100. The existing
support parser preserves the legacy last exact scalar, bracket-key, whitespace
and arbitrarily large page-integer behavior. Unknown query keys are ignored.

Orders expose only `id, external_id, number, currency, amount, status, items`.
Items expose only `id, description, quantity, unit_price, configuration`.
`external_id` and `unit_price` can be null; item order is unspecified. Empty
organizations and orders with no items remain valid. Amount and unit price retain
NUMERIC(18,2) strings; quantity retains NUMERIC(18,3) strings. Explicit SQL text
projections avoid Strapi's global floating-point NUMERIC parser. Invalid stored
non-finite numbers fail closed without repairing data.

Configuration remains an object with nested JSON types. PostgreSQL JSONB is
selected as text; Node 24's JSON reviver source context and JSON.rawJSON preserve
unsafe integer tokens, including ±9007199254740993 inside nested arrays. Ordinary
fractional numbers retain the Python JSON float behavior. The wire values are
not converted to strings. This uses the native [JSON parse-with-source
proposal](https://tc39.es/proposal-json-parse-with-source/) implementation.

A valid but missing or foreign UUID returns 404 `order_not_found`; an invalid
UUID returns the v1 422 validation envelope. Successful detail reads append
`order.view` within the same transaction. List, denied and missing reads do not
append order audits. Fresh transaction checks hold active user, membership,
organization and role rows under shared locks. An audit failure prevents a
successful detail response and rolls back its audit insertion. No read changes
business snapshots. Native CMS identities cannot authorize B2B reads.

The existing Node audit core retains actor, organization, action, entity,
metadata, request ID and timestamp. Its table does not contain the legacy
`ip_address` or `source` audit columns; this phase does not claim complete audit
storage parity or introduce an audit-schema migration.

Three additive tables live only in `b2b`: order statuses, orders and order items.
Bootstrap verifies exact columns, numeric precision/scale, constraints and unique
index counts. Incompatible existing tables or views require reviewed migration;
bootstrap does not repair them. The unused external product snapshot reference
has no catalog relationship. Demo role grants are unchanged. Only explicitly
invoked disposable test fixtures create fictitious order snapshots.

Order creation, updates, status transitions, event history, payments, shipping,
ERP integrations, product relationships and role provisioning are outside scope.

## Frontend behavior

The existing first-page list and detail views keep stored amount and quantity
strings. Both pages require `order.read` before issuing order requests. A malformed
response is an explicit error rather than an empty result; retry is deliberate.
Loading, denied, missing, empty and failed reads have distinct states. Each read
has its own cancellation token and captured auth scope. Route ID, selected
organization, session/login changes and Back/Forward navigation invalidate older
completions and errors. Login return paths are allowlisted to the exact list and
UUID detail destinations. There is no new pagination UI or order-editing workflow.

## Isolated verification

With Node 24, PostgreSQL 16+ binaries in `PG_BIN`, installed locked dependencies
and Playwright Chromium, run from the repository root:

```sh
bash backend-node/scripts/run-orders-tests.sh --browser
```

The wrapper ignores a caller's DATABASE_URL and creates a fresh loopback cluster
and exactly `alageum_strapi_orders_test`. Preflight rejects non-test, remote,
wrong-name and reused databases before Strapi construction. Disposable random
secrets and fictitious accounts are generated for that invocation. Fixtures
refuse reseeding and existing CMS administrators. The backend tests cover raw
HTTP decimal/JSON precision, nulls, empty/multiple items, pagination, peer and
cross-tenant reads, native CMS rejection, inactive/revoked authority, audits,
audit rollback, read-only business rows, schema drift, unsupported writes and a
full Strapi reload against persisted snapshots.

`--backend-only` runs the 20 backend checks as a local diagnostic; CI rejects it. The local executor permits
real loopback PostgreSQL/Strapi but cannot launch Chromium's Unix sockets. Hosted
CI provides browser acceptance. Acceptance requires 22 runner checks: 20 HTTP/PostgreSQL/fixture/reload checks,
a dedicated `.next-orders` production build and 14 browser tests (11 desktop,
3 mobile). The browser suite covers desktop/mobile list/detail, permissions,
empty/error/retry states, refresh/expiration and interrupted navigation. Eight
explicit screenshots cover list, detail, empty and retry states on each project.
The runner enforces these totals and exact screenshot attachment names. No retry,
skip, flaky case or expected failure is accepted.

Only the sanitized `evidence` directory inside `alageum-orders-tests.*` may be
published. Results use `results.json` with the established support-compatible
status/check/browser/cleanup fields. Private staging is sanitized before copying;
failure publishes only a minimal redacted report. Only explicit fictitious PNGs
are allowed; traces, video, credentials, tokens and raw database artifacts are
excluded. Owned process groups and Strapi shutdown have bounded teardown, and
the disposable cluster is removed only after confirmed PostgreSQL shutdown.
