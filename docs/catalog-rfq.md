# Catalogue request-for-quotation slice

## Implemented boundary

The live catalogue (`?source=api`, or `NEXT_PUBLIC_CATALOG_SOURCE=api`) now supports:

1. Add published catalogue records to a browser selection, retaining both the stable public key
   and the original database UUID; adjust whole-unit quantities (1–999 in this UI).
2. Open `/inquiry?source=api`, sign in when needed, review the selection and optionally add a
   comment. The login return destination is allowlisted; submitting never happens automatically.
3. Save a catalogue RFQ atomically, then view it in **Мои запросы КП** (`/b2b/quotes`) and its
   persisted detail page (`/b2b/quotes/{id}`). Reload and later login read the database again.

A saved RFQ is **not** an order, a reservation, confirmation of stock, a binding quote, manager
acknowledgement or CRM delivery. The only implemented status is the existing `submitted`, presented
as **Сохранён**. Catalogue series/family records can be requests for clarification; they are not
silently treated as an orderable SKU. Catalogue price snapshots are reference information only.
No attachments, notification sending, CRM/ERP connector, payment or manager workflow is added.

The static catalogue, local inquiry/workspace demonstration, imported 238-record reference set,
price administration, equipment icons, public company pages and Vercel Services routing remain
separate existing features. Existing production authentication/rate-limit deployment guards remain
unchanged. This work does not provision a production database, migrate a deployed environment or
make the development session transport production-ready.

## Additive API contract

All paths are relative to `/api/v1`; bearer authentication and an active selected organization
membership are required. Existing permissions `quote.create` and `quote.read` are reused.

- `POST /quotes/catalog`: new strict catalogue-RFQ endpoint. Requires an `Idempotency-Key` UUID
  header and body `{comment: string|null, items: [{product_id: UUID, quantity: decimal}]}`.
  Quantities must be positive finite decimals fitting `NUMERIC(18,3)`. There are 1–100 distinct
  products and a maximum 4,000-character comment. Unknown input fields are rejected.
- Successful first creation returns `201`; exact semantic retry returns `200` and the same RFQ.
  Responses contain summary fields (`id`, `status`, `comment`, `item_count`, `created_at`) and
  `items` (`id`, `product_id`, `quantity`, `product_snapshot`). `Location` points to its detail API.
- `GET /quotes?mine=true&page=1&page_size=20`: current-user, current-organization summaries only.
- `GET /quotes/{id}`: current-user/current-organization detail only; unknown, other-user and
  other-organization IDs return the same `404`.
- Existing `GET /quotes` without `mine=true` retains its permission-protected organization-wide
  summary semantics. Existing generic `POST /quotes` remains compatible with its original optional
  product/parameter contract. Neither that legacy path nor the existing mock AI quote tool gains
  catalogue-submission guarantees. New UI submits only to `/quotes/catalog`.

New catalogue snapshots are produced only on the server, recording public key, slug, SKU,
translations, specifications, catalogue version, category public key and price mode/price/currency.
They never trust client-supplied names, prices or snapshots and are never changed by subsequent
catalogue edits. Product visibility (`published` and a published category) is checked at creation;
there is no inventory source, so stock quantities are neither invented nor checked.

The create operation persists the request, all ordered lines and one audit event in a transaction.
A unique database constraint on `(organization_id, created_by_id, idempotency_key)` arbitrates
concurrent submissions across processes. A canonical SHA-256 payload fingerprint normalizes
quantity representation and line order. The same key with different content returns `409
idempotency_conflict`. A previously successful retry remains replayable even if the product is
later hidden. Validation rejects the whole request; no line is silently dropped.

Missing/hidden/draft products or unpublished categories return `422 quote_product_unavailable`;
duplicate product IDs return `422 quote_duplicate_product`. Existing auth, permission, validation,
rate-limit and infrastructure failures retain the normal API error envelope. New catalogue-create, list and detail responses use
`Cache-Control: private, no-store`.

## Browser persistence and interruption behavior

Public catalogue selections remain in the existing browser local storage, with original database
UUIDs added. Older selections without original IDs must be re-added from the live catalogue rather
than silently resolved to a replacement record. Catalogue mode is explicit and independent of the
static demo selection.

Comments and submission attempts live in per-tab session storage, scoped to both user and
organization. A request key and exact payload must persist before a POST is allowed. Ambiguous
network failures retain that key for safe retry after refresh/re-authentication. Changed payloads
receive new keys; the UI warns that an earlier ambiguous attempt may already have saved and links
to My requests. Storage failures and malformed drafts fail closed for submission. Private request
data is fetched only for an authenticated current scope, and stale asynchronous responses cannot
replace the active scope's page state.

## Migration and deployment review

`f05b719aec42` follows `e90a41c37b28` and adds nullable request idempotency metadata, a unique
constraint, ordered lines and a non-null snapshot JSON field. Historic rows receive `{}` snapshots
and position `0`; their missing historical facts are not reconstructed from today's catalogue.
Review and apply migrations explicitly through the existing release procedure. Downgrading this
migration removes the added snapshot/idempotency data, so take an appropriate backup first.

## Verification commands

Run from `backend`:

```sh
ruff check .
pytest
# DESTRUCTIVE to the named disposable test database only; never point at application data.
ALAGEUM_TEST_POSTGRES_URL=postgresql+asyncpg://USER:PASSWORD@HOST/DB_test pytest tests/test_quote_requests.py
alembic upgrade head
alembic downgrade base
alembic upgrade head
alembic check
```

`tests/conftest.py` defaults to isolated SQLite. The explicit PostgreSQL pass requires a database
name ending in `_test` or `_ci`, resets its model tables per test, and exercises real PostgreSQL
concurrent retries and conflicts in addition to validation, snapshot durability, ownership,
permissions, all-or-nothing rollback and retry recovery. CI runs it against disposable PostgreSQL
separately from the default suite, after the migration round-trip checks.

Frontend unit/browser checks and the final verified results are recorded in
[catalog-rfq-validation.md](catalog-rfq-validation.md).

## Decisions still required before extending this slice

- Confirm the long-term backend/CMS architecture. This reversible increment uses the existing
  FastAPI/PostgreSQL foundation and does not introduce a second competing runtime.
- Confirm whether coworkers and managers may read or manage someone else's RFQ, and define the
  role/organization matrix before widening the new own-detail boundary.
- Define request numbering, manager assignment, notifications, receipt/response SLA and lifecycle
  transitions. `submitted` currently means database persistence only.
- Confirm required business/contact fields, retention and attachment rules before collecting more
  data. Existing authenticated membership supplies user/organization identity.
- Confirm catalogue SKU/series distinctions, quantity units, commercial pricing rules and a real
  availability source. The integer UI is a bounded first increment, not a universal unit model.
- Select and provision the production authentication/session topology and distributed rate limiter
  through the existing guarded setup; establish operational backups before a release.
- Plan any later deprecation of the generic legacy quote API/mock AI path through the documented
  API-versioning policy rather than silently breaking existing consumers.
