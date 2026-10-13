# Legacy read-contract corrections

This document records the seven-read correction verified in [PR21](https://github.com/StiveMan1/Alageum_Temp/pull/21). It does not complete the migration. The local checkpoint evidence is recorded below; terminal hosted evidence is linked from that PR. Its published PR20 baseline is `2c762db62fd779595a3d78e336f7911f10953783`, tree `6421c05c2c2870d38888e9dda8a4951e9dbbbbb1`. The subsequent [system-read adapter](node-system-reads.md) updates the current route inventory separately.

## Corrected contracts

| Route | Scope and correction |
|---|---|
| `/catalog/categories` | Public published categories; page 1/size 50, clamp size to 100; sort_order then external UUID |
| `/catalog/products` | Existing published product/category predicates; compatible pagination |
| `/catalog/filters` | Public stored filterable definitions of the requested published category; actual metadata query and compatible pagination |
| `/admin/catalog/categories` | Existing global `catalog.manage` permission; compatible pagination; sort_order/public_key retained |
| `/admin/catalog/products` | Existing global `catalog.manage` permission and predicates; compatible pagination |
| `/organizations` | Current user's active memberships in active organizations; compatible pagination; no selected-tenant requirement |
| `/quotes` | Existing `quote.read` permission in the selected organization; omitted/false mine returns organization summaries; true adds owner scope; compatible pagination |

The common parser moves out of the support module to avoid an auth/support dependency cycle. The support exports remain available. The six newer lists retain their acceptance, values and pagination behavior, with one measured diagnostic correction: a whitespace-prefixed integer exceeding 4,300 digits now returns the frozen `int_parsing` detail instead of `int_parsing_size`. Both forms still return 422. Native CMS's separate default20 list contract remains unchanged. Response envelopes expose only `items`, `page`, `page_size`, `total`; the internal BigInt offset is never serialized.

Raw query handling takes the last exact decoded scalar key, ignores unknown/bracket keys, and consumes supported keys beyond Strapi's nested-parser parameter limit. It retains the frozen positive-integer spellings and errors. Shipped defaults are 50/100; deployment-specific Python setting overrides are not imported. A far page uses a safe empty-page shortcut after counting. This is an explicit adaptation when the hypothetical frozen SQL OFFSET would exceed PostgreSQL bigint, rather than evidence of unrestricted database offsets.

Frozen references: `backend/app/core/pagination.py`, public `backend/app/catalog/router.py`, `backend/app/catalog/admin.py`, `backend/app/identity/router.py`, and `backend/app/commerce/router.py`. The query-reference fixture records exact locked FastAPI/Starlette/Pydantic versions and reference source hashes. It tests the query declarations through FastAPI without invoking legacy database endpoints; separate Strapi/PostgreSQL integration tests exercise the actual Node routes.

## Filter definitions and source accuracy

`/catalog/filters` returns exactly `code`, `data_type`, nullable `unit`, and the stored `translations` object. It supplies no options, product counts, inferred ranges or product values. Definition UUID determines order even though that UUID is not exposed. Category publication and definition filterability are the only inclusion conditions; parent publication, product existence and `is_comparable` do not alter the result. Unknown/unpublished categories return an empty page.

The domain-owned `b2b.product_attribute_definitions` table retains the legacy fields and definition UUIDs. Its category reference adapts to the existing native category's stable string transport ID, with matching database type and a NO ACTION foreign key. It does not use Strapi's internal numeric/document identity. No generated CMS authoring endpoint is added. Schema preflight must reject drift before Strapi synchronization; initial creation is additive, and restart must preserve populated rows.

The first real startup exposed that the prior top-level `unique: true` did not create a SQL unique index for native category transport IDs. The adapter therefore declares database uniqueness through the category attribute's `column.unique`, owned by Strapi schema synchronization. Preflight rejects duplicate, null or noncanonical identities before DDL; a missing target index is permitted only before the definition store exists. Existing stores must retain their exact target and constraints. No ID regeneration, row deletion or automatic duplicate repair is allowed. Existing database rollout still requires a separately reviewed preflight, backup and migration execution.

Strapi documents [database column settings](https://docs.strapi.io/cms/backend-customization/models#database-validations-and-settings) as an experimental advanced API. The category has Draft & Publish disabled. The implementation is pinned to Strapi 5.56 and requires startup, drift and populated-restart regressions on upgrades; this is not a promise of stable behavior across future Strapi releases.

`data_type` is stored text, not a new enum; units and arbitrary translation keys are preserved. JSON integer digits beyond JavaScript's safe range are retained. Invalid selected outer translation shapes fail the response instead of becoming empty objects or partial successful pages.

The reviewed 238-product importer creates no attribute definitions. Its legitimate empty filter result is distinct from the former unconditional stub: populated fictitious definitions must produce actual metadata, visibility and pagination results. Product specifications, public facets and native form priorities cannot invent authoritative definitions. Real definition export/import, category mapping, collision handling, a definition editor and product-value normalization remain separate work.

## RFQ visibility and authority

The frozen GET `/quotes` contract includes organization-wide summaries when `mine` is omitted or false. Each summary contains exactly `id`, `status`, `comment`, `item_count`, `created_at`; peer comments are part of that existing summary contract. True aliases restrict summaries to the current creator in the selected organization. Aliases are ASCII case-insensitive `true/t/y/yes/on/1` and `false/f/n/no/off/0`; whitespace, blank values and other spellings are errors.

The customer UI still explicitly sends `mine=true&page_size=20`. Detail and printable requests remain owner-and-organization scoped. Seeing a peer summary does not grant its items, snapshots or print view. Unknown and peer detail IDs return the same 404. Global roles still require a current authorized membership in the selected tenant; native CMS accounts do not become business users.

The read transaction rechecks and holds the current caller's user, membership, organization and role rows in the existing lock order. This closes the authorization-to-read race as explicit hardening. Historical creators are not required to retain active accounts or current memberships. No creator-activity join hides valid historical summaries. Counts use only children of already scoped parent IDs and do not reconstruct history from the current catalog.

These GETs create no audit, session, grant or business mutation. Logging is separate. Creation/idempotency and immutable snapshots keep their existing contracts. Missing or corrupt selected summary fields fail the whole response rather than being coerced or silently filtered. Invalid current authority remains denied. Truly misattributed historical relationships require reviewed import/provenance handling, not GET repair.

## Local acceptance and remaining hosted checks

The backend aggregate passed all 351 checks. The disposable PostgreSQL/Strapi suite passed 102 checks with no failures or skips. It includes 653 actual HTTP comparisons: 312 across the four catalog lists, 120 filter queries, 78 organization queries and 143 RFQ queries. The 185 independently generated frozen query-reference vectors cover coercion and validation; their endpoint bodies and legacy database operations are not executed by the reference generator.

The application tests prove nonempty pages, scoped totals, exact allowlists, native CMS parser separation, read-only state fingerprints, current-authority races/locks, strict schema drift rejection before actual Strapi synchronization, and populated-definition restart with all 238 reviewed identities preserved. Organization-discovery fixtures use a disposable global role with zero permissions; a separate regression retains the documented foreign-role exclusion. Existing grants are preserved.

Frontend lint and all 339 units passed under both default and absolute API settings. Four real RFQ browser cases were discovered, covering desktop/mobile saved requests and the distinction between organization summaries, owner history and owner-only detail/print. Their execution and the full CMS/frontend production builds are pending hosted CI; discovery is not a browser pass. Existing native BFCache and production-transport limits remain unchanged.

## Deliberately unresolved compatibility

- Real Python RFQ storage permits nullable idempotency/hash/product fields, arbitrary status, repeated positions/products and additional external_id/parameters. Fresh Node RFQ tables are stricter. Restoring the GET predicate does not import those rows or establish storage parity
- Python datetime may preserve microseconds while current Node Date serialization uses milliseconds; exact historical timestamp wire parity remains open
- Organization listing currently excludes missing/foreign-role relationships before pagination. This existing fail-closed behavior remains an explicit deviation; the batch does not relax it
- Other catalog query validation/search/extra parameters are not broadly rewritten. Native CMS contracts remain separate
- Node authentication refresh format/session lifetime, audit storage/IP/source fields, and order storage/failure ordering have separate differences. The subsequent [system adapter](node-system-reads.md) corrects health/readiness DTOs with explicit runtime adaptations

## Finite coverage ledger

The inventory counts explicit method/path declarations, normalizing path parameter names to `{param}`. It excludes generated HEAD/OPTIONS/docs, frontend routes and native CMS surfaces. The source baseline contains **50 legacy routes: 46 business and four system**. At PR21, Node compatibility declared 33 routes, with 31 overlaps and two additional organization-profile routes. The subsequent system adapter adds metrics/version: the current declarations are **35 Node routes, 33 overlaps and 17 absent business routes**. Presence does not mean parity or product acceptance.

Overlapping groups: auth four; organizations two; public catalog five; catalog administration seven; support three; orders two; invoices one; documents two; RFQ three; system reads four. Each group's bounded verification is documented with its implementation. The new published Pages contract and native CMS are additional surfaces, not aliases for the absent legacy content routes.

The complete declaration inventory is [machine-readable](node-legacy-route-inventory.json). `python scripts/check_legacy_route_inventory.py` compares it with the current frozen Python declarations and Node manifest without starting either application. A changed declaration requires explicit inventory regeneration and review; a matching inventory certifies only route presence.

Every absent route needs a finite implement/adapt/retire decision; none is implicitly accepted by this document:

| Method | Legacy path, all under `/api/v1` | Remaining decision |
|---|---|---|
| POST | `/auth/invitations` | Invitation authority and delivery |
| POST | `/auth/invitations/{param}/accept` | Invitation acceptance and identity lifecycle |
| POST | `/auth/password/reset/request` | Reset delivery and abuse protection |
| POST | `/auth/password/reset/confirm` | Reset and session policy |
| PATCH | `/organizations/members/{param}/role` | Reviewed delegated role-change authority |
| POST | `/files` | Upload authorization, validation and durable storage |
| GET | `/files/{param}` | File-byte authorization and delivery |
| GET | `/finance/payments` | Read-only metadata migration; assessed, deferred |
| POST | `/quotes` | Generic quote creation compatibility |
| POST | `/ai/chat` | Approved provider, tenant isolation and data policy |
| POST | `/ai/tools/confirm/{param}` | Tool confirmation contract |
| POST | `/ai/tools/execute` | Tool execution authorization |
| GET | `/integrations/status` | Provider configuration and truthful status |
| GET | `/content/pages/{param}` | Explicit adaptation to the new Pages contract |
| GET | `/content/entries/{param}` | Entry model and content migration |
| POST | `/admin/content/pages` | Editorial API compatibility decision |
| POST | `/admin/content/pages/{param}/publication` | Publication API compatibility decision |

## Production and workflow gates

The [dated dependency assessment](dependency-audit-2026-10-03.md) remains blocked: the last verified PR20 audit reports backend 29 high/three moderate package entries and frontend five high. Functional evidence cannot override this gate. No dependency ignore, downgrade, unsupported fork or production guard removal is included.

An always-on Node host, PostgreSQL destination and import owner, HTTPS/proxy/CORS, durable media, monitoring, backup/restore and rollback rehearsal remain required. The current Python/Vercel configuration is not the Node deployment. Production startup continues to refuse. Per-tab bearer storage is still development transport; production browser/CSRF/session policy is unfinished.

Route parity also does not complete RFQ manager responses/status/attachments, order processing, support messages/assignment/SLA, financial ingestion/reconciliation, document signing, notifications or ERP/CRM integrations. Real sources, provider contracts and permission decisions must be supplied rather than inferred from fictitious fixtures.
