# Bounded invoice metadata reading on Node/Strapi

This phase preserves only the existing invoice-list contract on Node 24,
Strapi 5.56.0 and isolated PostgreSQL. Next remains the frontend. It supplies
fictitious fixture compatibility: there is no real invoice feed or financial
integration. No legacy/customer database, real credentials, private documents or
commercial terms are copied. Production startup refusal and dependency gates
remain unchanged.

## Frozen contract

Only GET `/api/v1/finance/invoices` is implemented, matching
`backend/app/commerce/router.py` and its shared `FinanceOut` model. The route
requires existing `finance.read` and an active selected organization. Visibility
is organization-wide, with no owner or linked-order filter. Existing Node admin
and accountant grants remain unchanged; buyer, engineer and catalog roles do not
receive finance access.

The envelope is `{items, page, page_size, total}`. Each item has exactly six
fields: UUID `id`, nullable/default-null `number`, Decimal JSON string `amount`,
string `currency`, nullable/default-null `status`, and string `source`. Source and
status remain opaque stored strings. The amount is the stored nominal amount;
it does not represent a balance, debt, tax or payment obligation. No date,
order ID, external ID, organization ID or timestamp is exposed.

List ordering is `created_at DESC, id ASC`. Page defaults to 1 and size to 50,
capped at 100. The existing support request parser is reused unchanged to retain
raw exact scalar keys, last duplicate values, ignored brackets/unknown keys,
legacy whitespace and arbitrarily large integer semantics. SQL `amount::text`
bypasses Strapi's global NUMERIC `parseFloat` parser. Zero, fractions and the
NUMERIC(18,2) maximum retain exact strings. Stored NaN fails closed without repair.

Every request sets private/no-store headers, checks permission, then rechecks
and holds the active user, membership, organization and role under shared locks
in the same transaction as the reads. There is no invoice audit, provider/storage
call or business-row write. Native CMS identities cannot authorize this route.
Details, mutations, payments, downloads, documents and provider endpoints remain
unavailable.

## Isolated additive schema

`b2b.invoices` mirrors the legacy Invoice storage constraints:

- UUID primary key, non-null timezone timestamps and organization UUID FK
- Nullable order UUID with a single-column FK to `b2b.orders.id`
- Non-null `number varchar(120)`, `status varchar(60)` and `source varchar(60)`
- Non-null nonnegative `amount numeric(18,2)` and `currency varchar(3)`
- Nullable `external_id varchar(200)` and unique `(organization_id, source, external_id)`, permitting multiple null external IDs
- Both FKs retain default NO ACTION deletion behavior; organization/created and individual organization/order indexes are retained

UUID, timestamp and `source="ERP"` defaults in the original SQLAlchemy model are
application defaults, not database defaults. The isolated table has no server
defaults. Storage number/status remain non-null even though the shared response
DTO permits null. The internal order FK deliberately does not add a new
cross-organization restriction, is never joined and does not affect visibility.

Read-only invoice preflight runs before Strapi synchronization and page
preflight. Only an absent table can be added. Exact columns, nullability,
lengths, numeric precision/scale, timestamp precision, collation, defaults,
constraints, indexes, relation type, RLS, user triggers and inheritance are
verified. Drift requires a reviewed migration; it is never silently repaired.
A second check under an advisory transaction lock protects additive bootstrap.
Only explicitly invoked isolated fixtures insert invoice rows.

## Frontend

`/b2b/finance` retains the existing first-page number/amount/currency/status
presentation. It gates `finance.read` before fetching and validates invoice DTOs
and the envelope. Nullable number/status defaults and concurrent count/row
differences remain valid. Malformed 200 responses are errors, not empty results.
Loading, denied, empty and failed states are distinct, with explicit retry.

Captured session/organization scope, cancellation and request ownership suppress
obsolete results and errors after organization selection, new login, navigation
or Back/Forward. Shared auth guards remain unchanged. The only added login-return
allowlist entry is exact `/b2b/finance`; query, fragment, child, encoded and external
variants remain rejected. No pagination or financial action UI is introduced.

## Verification and evidence

With Node 24, PostgreSQL 16+ in `PG_BIN`, locked dependencies and Playwright
Chromium, run from the repository root:

```sh
bash backend-node/scripts/run-invoice-tests.sh --browser
```

The wrapper ignores caller DATABASE_URL and creates a fresh loopback cluster
with exactly `alageum_strapi_invoice_test`. Freshness is checked before Strapi
construction; non-test, wrong-name, remote, reused and query-overridden databases
are refused. Runtime credentials are random, fixture accounts are fictitious,
and reseeding or existing CMS administrators are refused.

`--backend-only` is a local diagnostic and is rejected by CI. It runs 19 checks:
freshness/seeding, exact schema/DTO/Decimal wire/sort/pagination, organization peers
and isolation, native CMS/denied/inactive/revoked authority, all authority locks,
no audit/business writes, legacy constraints/FK semantics, NaN, drift, unsupported
endpoints, actual pre-sync refusal and full Strapi restart persistence. Existing
full backend and PostgreSQL regressions additionally verify unchanged default
admin/accountant/denied-role behavior.

Browser acceptance requires all 21 runner checks: the 19 backend checks, a
production `.next-invoice` build and 28 browser cases (14 each for
`invoices-desktop` and `invoices-mobile`). The cases cover permission, empty,
error/retry, malformed DTO, null/count compatibility, refresh/expiry, login and
organization interruptions, Back/Forward races, and controlled persisted-pageshow
reconciliation after an unannounced tenant change or logout. These controlled
events are not native BFCache or first-paint privacy evidence; see
[`node-session-read-invalidation.md`](node-session-read-invalidation.md). The dedicated config is
excluded from broad/default and Vercel discovery, whose count remains 58.
The real 20/minute login limiter stays active, with fixture cooldown and a
61-second replacement/mobile-worker cooldown. There is no auth bypass or retry.

Exactly six explicit PNGs are required: `invoices-list`, `invoices-empty` and
`invoices-retry`, each on both projects. No retry, skip, flaky or expected failure
is accepted. This local executor cannot launch Chromium's Unix sockets; hosted CI
provides browser execution and screenshots. A successful build or discovery is
not browser acceptance.

Only `evidence/` under `alageum-invoice-tests.*` may be published. The stable
summary is `evidence/results.json`, with status/check/browser/cleanup fields.
Raw logs are redacted while streaming into private staging, then sanitization
must succeed before publication. A sanitizer failure publishes only a minimal
redacted report. Traces, videos, credentials, raw databases and unreviewed binary
artifacts are excluded. Teardown uses bounded owned process groups and Strapi
shutdown; the disposable database is removed only after confirmed PostgreSQL
stop. The runner does not inspect or change any customer/legacy database.
