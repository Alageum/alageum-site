# Node/Strapi migration checkpoint validation

Date: 2026-10-02 UTC. This records a bounded migration checkpoint, not a deployment,
completed migration or production acceptance. Hosted results must be checked for
its exact published commit; configured jobs alone are not evidence of a pass.

## Verified locally

- Node.js 24.19.0, Strapi 5.56.0 and isolated PostgreSQL 17.11
- Clean locked installation and full valid npm dependency tree; the scoped
  Nodemailer 10.0.13 override was checked through Strapi's actual mail provider
  using an in-memory transport with file/URL attachments still denied
- Backend syntax and **31/31 unit/security checks**, including native CMS permission,
  refresh-chain validation, UI request guards and disposable fixture isolation
- **45/45 real PostgreSQL/Strapi integration checks**, no skips. These include the
  previous **34/34** catalog/auth/RFQ checks and actual native CMS HTTP sessions
- CMS create/edit and PUT/PATCH routes, published edits visible publicly,
  immutable identifier rejection, stale-version409, hide/restore and distinct
  CMS audit identity all passed
- Permission/role changes, inactive users, native logout and session revocation
  between initial authorization and transactional write are denied. A real
  refresh-rotation regression proves a retained parent access token cannot
  write after the current child session is revoked; version and audit count
  remain unchanged
- Version/audit atomicity, rollback, tenant/owner isolation, server snapshots and
  concurrent idempotency remained covered. All **238** reviewed catalog keys and
  UUIDv5 identities survived; reimport remains insert-only
- Exact **100-line RFQ / Decimal(18,3)** maximum round-trip passed; PostgreSQL
  quantities are selected as text to avoid Strapi's numeric float parser
- Frontend lint and **132/132 frontend unit tests** passed again
- CMS JSX and local plugin module graph transpiled/bundled successfully with
  external dependencies left external. This is a syntax/import-graph check,
  not a full Strapi administrator build
- Independent read-only review confirmed the session-chain fix and UI guards;
  no remaining confirmed backend bypass was identified in its scoped findings.
  A completed final independent review was not delivered; browser acceptance
  and final review are still required

The previous checkpoint also passed **19/19 backend units**, **34/34 integrations**
and a Next production build with the Node API/live catalog configuration
(**287 pages**). The current CMS changes require their own complete administrator
build and browser acceptance; earlier builds do not count for them.

## Hosted verification and fixture correction

[GitHub run 36978704755](https://github.com/StiveMan1/Alageum_Temp/actions/runs/36978704755)
validated remote commit `f2b2c9b21be9f2c3d714bfc6c8b1ef22c9fec189`: full Strapi CMS
build, 45 PostgreSQL/Strapi tests, 132 frontend units, lint, 287-page Next build and
Chromium installation passed. The initial browser step stopped before app startup
because Strapi's unawaited administrator metrics read raced fixture shutdown.
No browser case ran in that attempt. The audit gate failed as expected.

The fixture CLI now drains its native metrics work before destroying Strapi and
propagates any rejection. Two focused regression tests cover the drain and error
path. A new isolated `--fixtures-only` local run created both native accounts and
exited cleanly with the actual Strapi/PostgreSQL runtime. No telemetry, permission
or application checks are disabled. Hosted browser acceptance must be repeated
on this correction.

## CMS and browser verification still required

The earlier final-lock Strapi build could not complete in this sandbox: 2 GiB
heap attempts exited137, and a 1 GiB single-thread attempt exhausted the V8 heap
(exit134). The full build was subsequently established by the hosted run above. Hosted CI
retains the complete `npm run build` gate with no weakening.

Earlier Chromium startup failed before any action with
`process_singleton_posix.cc: socket() ... Operation not permitted`. No browser
flow is claimed to pass locally. The temporary earlier API smoke disabled CMS
asset serving only in its own test process; committed runtime and CI gates were
unchanged.

Hosted CI now includes a fresh, separate native CMS fixture database and tests
for native login/reload, CMS edit-to-public-Next visibility, hide/restore,
permission denial, stale edits, real native refresh and interrupted editor
flows. Live CRUD/permission/conflict cases use the real Strapi API. Separate
negative cases inject a single401 or delay a response to exercise client races;
they do not substitute for backend authorization tests.

The legacy Playwright configuration excludes Node-only CMS and RFQ files. Their
own configurations cover the native CMS and real Node/PostgreSQL RFQ respectively.
Existing Next catalog-admin and mocked quote-interruption suites remain enabled;
the mocked suite uses a separate static-default test server without weakening
the live frontend's fail-closed catalog-source rules.

## Dependency and operational blocks

The current audit reports **18 affected packages: 3 high, 15 moderate, 0 critical**.
Its command exits1 and the independent hosted dependency gate intentionally stays
red. See [the security review](node-strapi-security-review.md) and
[exact audit JSON](../backend-node/docs/dependency-audit.json). Functional test
passes do not waive these findings.

Docker is unavailable locally; container build and Compose startup were not
executed. Existing customer data and the old database were not migrated. No
hosting, external credential, merge or deployment was performed. The public
preview remains on its previous topology until a separate approved cutover.

## Remaining acceptance scope

The guarded native CMS plugin now implements a bounded catalog editor; its exact
field/feature boundary is documented in [CMS catalog authoring](node-strapi-cms-catalog.md).
Generated Content Manager writes remain blocked to prevent a bypass. Full
structured-specification/media/category authoring, connected editorial pages,
legacy identities/business data and remaining B2B endpoints are still pending.
Production browser transport, distributed rate limits, secure media, recovery,
patched dependencies and approved hosting/cutover remain open. The production
startup interlock stays on.
