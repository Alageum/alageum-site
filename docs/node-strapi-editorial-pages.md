# Reimplemented native editorial Page delivery

This bounded slice was reimplemented on 2026-10-02 after the workspace containing
unpublished checkpoints was lost. Its base is the published Vite candidate
`c4fc67e92c0778ddb901a6465f926628710d3b42`. It is not an exact restoration of the
lost Page commits. Fresh validation is recorded separately; previous execution
results do not establish acceptance of this source.

## Public delivery

The only Page content API is `GET /api/v1/pages/:slug?locale=ru`. Slugs are bounded
lowercase ASCII words separated by single hyphens. Locale is exactly one of
`ru`, `kk`, `en`, `zh`, `uz`; omission means `ru`. No fallback language is selected.
Extra, nested or repeated query parameters fail. No generic public Page CRUD,
Strapi filters, populate or publication-status selection is exposed.

The handler explicitly reads `status: published` and allowlists only `slug`,
`title`, `locale_code`, `body`, `seo_title`, `seo_description`, `published_at` and
`updated_at`. Missing, draft and unpublished content returns 404. Existing API
middleware supplies no-store, request IDs and the bounded error envelope.

Next renders `/pages/[locale]/[slug]` through a server-only loader using explicit
`API_INTERNAL_BASE_URL` ending `/api/v1`. It sends no browser credentials or
native tokens, uses no-store, refuses redirects, bounds each read to five seconds
and 512 KiB, and strictly validates the response. Only an upstream 404 maps to
not-found. All other backend, decoding and configuration failures remain errors;
no bundled text is substituted. Backend body validation caps serialized Blocks
at 480 KiB so metadata fits the frontend response budget.

The template accepts bounded text Blocks: paragraphs, headings, safe links,
quoted/code text, lists and native text marks. It escapes content and rejects
HTML, media, unknown fields, unsafe URL schemes and excessive nesting/content.
The template owns the only level-one heading. No translations are invented.

## Native CMS authority and transactions

Page uses native Draft & Publish, with separate native roles for reading/editing
and publishing. Writes require a real authenticated native admin/session, not a
B2B identity. The Page Document Service middleware opens a Strapi transaction
and takes metadata-derived locks before rechecking authority:

- Active, unblocked native admin row
- Complete session lineage, including retained rotated parents and live terminal
- Current user-role links, roles, role-permission links and all permission rows
- Creator role membership used by native ownership conditions

The session validator is the existing catalog `validateSessionChain` helper.
Missing, expired, revoked, cyclic, cross-user or invalid device chains fail
closed. Native ability is regenerated in the transaction. The Page-specific
Content Manager checker evaluates the fresh entity, native conditions and each
supplied Page field. It cannot silently retain input sanitized by a stale route
ability after a field grant narrows. Create/update cannot publish implicitly;
publishing requires the separate native publish action. Unsupported mutations
fail closed.

Mutation and `b2b.audit_events` insertion use the same actual Strapi transaction
context. Audit identity is native `cms_admin_id` with `source: cms`; B2B actor and
organization stay null. Audit entries record before/after content digests and
publication timestamps for create/update/delete/publish/unpublish/discardDraft.
An audit failure rolls back the native mutation. Digests are not content history.

Optimistic Page version locking and historical restoration remain gaps. Native
draft/published snapshots do not provide catalog-equivalent conflict handling.
This slice makes no claim of a production-ready workflow or automatic migration.

## Migration boundary

`register` preflight runs before Strapi database/schema synchronization. An old
populated `alageum_pages` table, an ambiguous migration marker, or a legacy manual
`published` column with rows blocks startup before schema changes. Nothing is
deleted or automatically published. Existing data requires a separately reviewed
manual migration. A fresh/empty table may adopt native Draft & Publish through
`b2b.editorial_page_schema` marker `native-page-draft-publish-v1`, pending→ready.
A ready native schema can restart without changing Page data.

## Routes, preview and indexing

Existing routes and their original loading component live under route group
`app/(site)`. Public URLs and the single shared root layout are preserved. The
company and generic editorial routes sit outside that loading/Suspense boundary, so missing pages
and backend failures can return hard 404/500 before streaming begins. There is
no proxy precheck and no second fetch solely to decide route availability.

`COMPANY_SOURCE` is a strict server-only runtime selector. Unset or exact `static`
keeps the full original `/company` presentation and metadata with no Page reads or
backend configuration. Exact `cms` makes published `ru/about` authoritative whole
content through the existing text template; it does not append static history or
mission sections. Empty or unknown values fail. Query strings, cookies and client
state cannot override it. CMS requires `PAGES_SOURCE` unset or `api`, rejects the
static-preview flag, and requires valid explicit `PAGES_SITE_ORIGIN`. Missing,
draft and unpublished content is hard404; configuration/upstream/payload/timeout
failures are hard500, with no fixture, stale or static content substituted.

CMS `/company` and only the exact `/pages/ru/about` alias canonicalize to the
configured origin plus `/company`, with noindex/nofollow and no redirects. Generic
routes retain optional self-canonicals. Company configuration is validated only
on the company route/alias, so an invalid selector cannot break other published
slugs. The company page explicitly forces request-time rendering. Each route's
React cache resolver validates metadata together with content, so errors precede
streaming and successful metadata/body share one API read. Next's separate RSC
error recovery may make a bounded second metadata read after a generic throw;
first-error/second-success still returns hard500 without the successful body.
No shared content cache or availability precheck is introduced.

Static preview is an explicit separate source: `PAGES_SOURCE=static` requires
`PAGES_STATIC_PREVIEW=1`, injected only into the disposable build adapter alongside
`COMPANY_SOURCE=static`. CMS or invalid company selectors are rejected before any
staging deletion or copy; a static wrapper is written only in that disposable tree. It
exports only `/pages/ru/about` with verified text copied from the existing company
component. Provenance and review date are in `pagesPreview.js`; its timestamps are
fixture-review metadata, not native publication dates. Live errors never select
this preview source. Private application routes remain excluded from export.

## Isolated verification

Page fixture roles are separate from catalog roles and never Super Admin. The
fixture requires test mode, explicit opt-in, loopback PostgreSQL and exact empty
`alageum_strapi_pages_test`, and refuses all preexisting native administrators.
Generated passwords stay in memory. Hosted contract and delivery jobs use
separate fresh PostgreSQL services; existing 36 catalog/RFQ browser cases retain
their own fixture database.

Native browser login traces are disabled to avoid recording credentials. Success
and failure PNG evidence is retained. Browser stdout/stderr is redacted before
log capture; mask commands containing raw passwords must not be written into
tee artifacts. Native HTTP regressions compare full stored Page rows, publication
and audit records after denied/raced writes. Only volatile response request IDs
are normalized, with their validity checked independently.

New hosted Page jobs and desktop/mobile screenshots must pass before functional
acceptance. The enforced dependency audit and production environment guard remain
release blocks. No publication, merge, deployment or production provisioning is
part of local reimplementation.
