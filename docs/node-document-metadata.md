# Bounded document metadata reading on Node/Strapi

This phase preserves the existing document-list and document-detail metadata
contracts on Node 24, Strapi 5.56.0 and isolated PostgreSQL. Next remains the
frontend. All fixtures are fictitious. No customer database, private document,
real credential, stored file bytes or provider configuration is copied.

This is a metadata-only compatibility phase. Uploads, downloads, previews,
signed URLs, storage access, EDO, signatures and document mutation remain out of
scope. Functional fixture acceptance does not clear the dependency security
gate: that gate remains blocked, and this phase is not production or cutover
approval. Existing production startup refusal remains active.

## Frozen routes and response

Only GET `/api/v1/documents` and GET `/api/v1/documents/{document_id}` are added,
matching `backend/app/documents/router.py`. Both require `document.read` and an
active selected organization. Visibility is organization-wide, without an owner
filter. Existing role grants are preserved; fixture roles receive only
`document.read` or no permissions. Native CMS identities cannot authorize these
B2B routes.

Each document has exactly seven fields: UUID `id`, required-but-nullable
`number`, string `title`, required-but-nullable `external_id`, opaque string
`source`, string `type_code` and required-but-nullable UUID `latest_file_id`.
Nullable fields are present even when null. The file identifier is metadata; it
is not a download URL or permission to fetch bytes. No storage key, content type,
checksum, provider, organization, timestamp, version history or file bytes are
exposed. Documents with inactive types remain visible, preserving legacy reads.

The list envelope is `{items, page, page_size, total}`. Ordering is
`created_at DESC, id ASC`, with page 1 and page size 50 by default and size capped
at 100. The shared support parser preserves raw scalar query keys, last duplicate
values, ignored brackets/unknown keys, legacy whitespace and arbitrarily large
integer semantics. Concurrent count/row differences remain valid.

`latest_file_id` comes from the greatest integer document version in the selected
organization. Timestamps and file identifiers do not decide the latest version.
A document without versions returns null. The unique `(document_id, version)`
constraint forbids ties; startup refuses a missing constraint instead of choosing
an arbitrary tied row. Unknown or other-organization detail IDs return the same
`document_not_found` 404. Invalid UUID path values return 422 after authorization.

Every list/detail response is private and non-cacheable. Both handlers recheck
and hold the active user, membership, organization and role under shared locks in
the same transaction as the read. A revocation waits for an accepted read to
finish, and subsequent reads reject revoked authority. Reads do not change
business metadata. No provider or storage service participates in the read path.

## Detail audit boundary

List requests write no document audit event. A found detail writes one
`document.view` event with the acting B2B user, selected organization,
`entity_type="document"`, canonical document UUID, request ID and empty event
metadata. Unauthorized, forbidden, invalid and not-found requests write no view
event. A failed audit insert makes detail fail and rolls back its transaction;
it cannot return a successful unaudited response.

Legacy detail commits its audit before serializing the DTO. Node preserves that
order: if serialization fails after a successful commit, the request fails but
the completed view event remains. Audit-insert rollback and later DTO failure
are different outcomes and have separate checks.

The existing Node audit writer/schema is reused unchanged. It has `created_at`
and does not contain the legacy `ip_address` or `source` columns. This phase
preserves the supported event fields and write ordering; it does not claim full
legacy audit-schema parity or add IP/source capture.

Authentication is unchanged. Logout revokes the refresh session, and the browser
clears its session and suppresses obsolete results. An already issued stateless
access JWT remains valid until expiry, subject to the live authority checks.
This phase does not add immediate access-token revocation.

## Isolated additive schema

Four `b2b` tables mirror `backend/app/documents/models.py`,
`backend/app/files/models.py` and tenant migration `c24e3a19f4b1`:

- `document_types`: UUID primary key, unique non-null `code varchar(100)`,
  `name varchar(200)` and non-null boolean `is_active`
- `documents`: UUID primary key, non-null organization/type references, nullable
  `number varchar(120)` and `external_id varchar(200)`, non-null
  `title varchar(300)`, `source varchar(60)` and timezone timestamps; unique
  `(organization_id, source, external_id)` and `(id, organization_id)`
- `file_objects`: UUID primary key, nullable organization reference, unique
  non-null `storage_key varchar(500)`, non-null name/content-type/checksum/backend
  metadata, nonnegative bigint size and timezone timestamps; unique
  `(id, organization_id)` permits global null-organization metadata
- `document_versions`: UUID primary key, non-null organization/document/file
  UUIDs, positive integer version and timezone timestamps; unique
  `(document_id, version)`, composite document/organization and file/organization
  foreign keys retain the legacy tenant boundary

Organization deletion cascades to documents and file metadata; document deletion
cascades to versions. The type reference and composite file reference retain
NO ACTION behavior. Global file metadata cannot be referenced by a non-null
organization's version. Nullable external IDs retain PostgreSQL null uniqueness.
The original UUID, timestamp, `source="manual"` and `is_active=true` defaults are
ORM defaults, so none becomes a server default here. Legacy indexes and declared
field lengths remain intact.

Read-only preflight runs before invoice, Strapi and Page synchronization. Every
existing metadata relation must match exact columns, nullability, lengths,
numeric/timestamp precision, defaults, collation, identity/generated/domain
status, constraints and indexes. Relation type, RLS, user triggers and
inheritance are checked. Only absent tables can be added, under an advisory
transaction lock with another preflight. Drift requires a reviewed migration and
is never silently repaired. Only explicitly invoked isolated fixtures insert
these metadata records.

## Frontend

`/b2b/documents` retains a first-page metadata list. It checks `document.read`
before fetching and validates the seven-field DTO and envelope. Missing nullable
fields and malformed success responses become errors. Loading, denied, empty
and failed states are distinct, with explicit retry.

Captured session/organization scope, cancellation and request ownership suppress
obsolete success/error responses during organization changes, new login,
logout, navigation and Back/Forward. Shared authentication guards remain
unchanged. The only added login-return allowlist entry is exact
`/b2b/documents`; query, fragment, child, encoded and external variants remain
rejected. No upload, download, preview, signing or mutation controls are added.

## Disposable verification

With Node 24, PostgreSQL 16+ binaries in `PG_BIN`, locked dependencies and
Playwright Chromium installed, run from the repository root:

```sh
bash backend-node/scripts/run-document-tests.sh --browser
```

The wrapper ignores caller `DATABASE_URL` and creates a new loopback PostgreSQL
cluster with exactly `alageum_strapi_document_test`. The helper requires
`APP_ENV=test`, `ALAGEUM_TEST_DOCUMENT_FIXTURES=1` and an explicit long random
`E2E_DOCUMENT_PASSWORD`. Freshness is checked before Strapi construction.
Non-test, remote, wrong-name, query-overridden and reused databases are refused,
as are existing CMS administrators and any preexisting fixture/business rows.
Default/demo seeding and catalog import are disabled; no existing roles widen.

Six fixture users have `document-{reader,peer,denied,other,multi,empty}@fixture.invalid`
addresses, with organizations A, B and empty. A has `newest`, `versioned` and
`empty` documents in that order; B has `foreign`. The versioned document uses an
inactive type and versions 1 and 9. Both the version-9 and its file timestamps
predate version 1, proving integer-version selection. The unversioned document
has null number/external ID. File rows include A, B and unreferenced global
metadata; no file content or providers are created.

The backend runner requires 24 passing checks of real Strapi HTTP/PostgreSQL
behavior, including
seven-field output, pagination and deterministic ordering, tenant peers and
isolation, denied/native/inactive/revoked authority, lock ordering, detail audit
and failure boundaries, storage constraints, drift and unsupported routes. It
also destroys Strapi, removes `(document_id, version)` uniqueness and proves
actual startup refuses before synchronization, without restoring the constraint
itself. The runner then explicitly restores the fixture constraint and verifies
that a full Strapi restart preserves all metadata, grants and audit counts.

`--backend-only` is a local diagnostic and is rejected in CI. Browser acceptance
requires 26 passing runner checks: the 24 backend checks, a production
`.next-document` build and all 26 browser cases (13 each) in
`playwright.document.config.js`, for `documents-desktop` and
`documents-mobile`. Exactly six explicit PNGs are required: `documents-list`,
`documents-empty` and `documents-retry` in each project. No retries, skips,
flakiness or expected failures are accepted. The real 20/minute login limiter
stays active with bounded fixture/worker cooldowns. A production build or test
discovery alone is not browser acceptance. The dedicated suite is excluded from
default and Vercel discovery, which both remain at 58 cases.

Only `evidence/` under `alageum-document-tests.*` may be published. Its stable
summary is `results.json`, with check, browser, status and cleanup fields.
Credentials are redacted in complete output lines before private staging writes,
then sanitization must succeed before publication. Sanitizer failure publishes
only a minimal redacted report. Traces, videos, raw databases, credentials and
unreviewed binaries are excluded. Bounded owned-process shutdown is shared with
the existing runners. The disposable database is removed only after confirmed
PostgreSQL shutdown. The runner never accesses a customer or legacy database.
