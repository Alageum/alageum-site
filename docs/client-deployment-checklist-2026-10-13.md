# Client deployment checklist — 13 October 2026

Base source: `53f4ec681babcdd0f468059cdb93cfcfde294fa3`.
This is a handoff checklist, not production authorization or a deployment record.
Keep the current `APP_ENV=production` startup interlock until all release gates
have evidence and the responsible operator approves cutover.

## Select the current application

- Use `frontend/` with Node.js 24 and `backend-node/` with pinned Strapi 5.56.0.
- Install from the reviewed lockfiles with `npm ci`. Do not use `npm audit fix
  --force`, downgrade to legacy Strapi, or edit historical approval hashes.
- Use a new, isolated PostgreSQL 16+ database whose name begins with
  `alageum_strapi`. Never point Strapi at the historical Python database.
- `backend/`, root `docker-compose.yml` and `vercel.json` describe the legacy
  Python topology. In particular, the current Vercel API rewrite points to
  FastAPI. It must not be mistaken for a Node deployment configuration.
- `docker-compose.node.yml` is an isolated local-development example with
  loopback published ports. Do not expose it publicly as a production stack.
- Host Strapi as a persistent Node process/container; provide health checks,
  supervised restarts, logging and a reviewed deployment/rollback procedure.

## Identity and routing

- Native CMS lives at `/cms`; native administrator APIs also use `/admin`.
  CMS administrator registration/login is separate from business accounts.
- Next `/admin/catalog` uses B2B identity and the platform permission
  `catalog.manage`. An organization administrator does not automatically get
  this global catalog permission.
- Keep Strapi `users-permissions` disabled. Business registration must use the
  application's controlled domain routes, not a second generic user store.
- New personal accounts must not gain existing-company membership from an
  email/domain, company name or unverified business identifier. Verify the
  intended membership-approval and initial-operator procedure before use.
- Keep `ALAGEUM_SEED_DEMO=0` for non-disposable databases. Never ship shared
  demo credentials or use test seeding to provision client operators.
- Establish one reviewed browser/API origin for cookie sessions, exact Origin
  and CSRF enforcement, HTTPS and a trusted proxy boundary. Do not replace this
  with permissive credentialed CORS or blindly trusted forwarded headers.
- Next now has an opt-in server-only API rewrite. For a local same-origin
  example, set frontend `NEXT_PUBLIC_API_URL=/api/v1` and
  `API_INTERNAL_BASE_URL=http://127.0.0.1:8000/api/v1`; set backend
  `ALAGEUM_BROWSER_ORIGIN=http://127.0.0.1:3000` and open that exact frontend
  origin. The upstream accepts only HTTP(S) URLs ending in `/api/v1`, without
  embedded credentials, query or hash. Configure real deployment origins
  explicitly. The old Compose browser URL pointing directly to port 8000 is
  incompatible with the new same-origin password-cookie flow.
- Google requires an issued web client, server-only credentials and the exact
  callback `${ALAGEUM_BROWSER_ORIGIN}/api/v1/auth/google/callback`. Test at the
  actual intended origin. Keep the provider disabled until configured.
- Verify password login, registration verification/reset, organization
  approval, logout and stale-session invalidation using the integrated final
  source. A successful CMS registration does not prove these B2B flows work.
- Registration mail requires an explicitly selected
  `ALAGEUM_REGISTRATION_MAIL_PROVIDER`, `ALAGEUM_SMTP_HOST`,
  `ALAGEUM_SMTP_PORT`, `ALAGEUM_SMTP_USER`, `ALAGEUM_SMTP_PASSWORD` and
  `ALAGEUM_MAIL_FROM`. Keep credentials server-side. The adapter enforces TLS
  on port 465 and STARTTLS otherwise; do not add a plaintext override. Confirm
  real verification/reset delivery with the approved provider before release.

## Content and customer data

- The default public catalog uses the bundled source snapshot and editorial
  overlay. Starting CMS does not automatically switch the public site to it.
  Keep the existing static source until API/overlay compatibility is verified.
- The primary account navigation now points to `/account`, with authenticated
  personal identity and organization membership-request status. No company
  membership is needed to access it. A logged-out visit offers login and
  registration without reading private account data. `/b2b` remains the
  tenant-authorized server cabinet. `/client` remains explicitly labeled local
  drafts: browser-only data is neither transmitted nor synchronized by
  registration and is not a submitted RFQ, order or support ticket.
- `/register`, `/verify-email`, `/forgot-password` and `/reset-password` provide
  the public identity flows. Verification and reset do not auto-login; a user
  without membership reaches `/account` after explicit login. Organization
  access requests require explicit operator approval with a tenant role.
  SMTP remains disabled until configured, so real verification cannot complete
  before mail delivery is ready.
- Existing server order/invoice/document metadata reads are not a complete
  purchasing, payment or CRM workflow. Confirm precisely which live operations
  are included in client acceptance.
- Do not publish `backend-node/data/catalog-editorial` wholesale. Its candidate
  assets are private and publication approval is false.
- `frontend/public/documents/transformers-2026-original.pdf` was explicitly
  excluded from Git. Restore through an authorized separate transfer or make
  its download unavailable honestly; do not claim the missing original is
  bundled. Preserve the user's current imagery, neutral palette and layout.

## Operational release gates

1. Stable independent secrets injected outside Git, with documented ownership
   and rotation/recovery procedure. Never copy disposable test secrets.
2. Production-safe browser session transport and CSRF tests for every auth path.
3. Distributed abuse/rate limits with a verified trusted-client-address policy.
4. Upload authorization, malware scanning, durable private media storage and
   recovery. Metadata-only APIs do not establish file-transfer readiness.
5. Database backup/restore rehearsal, schema migration/restart checks and
   rollback. Strapi synchronization can change native tables during startup.
6. Reviewed dependencies and CMS roles, HTTPS/proxy configuration and logs that
   redact OAuth callback query strings and credentials.
7. Final exact-commit CI, real browser acceptance and explicit cutover approval.

## Verification status of the transferred base

The exact base commit's Node workflow is
[38353349041](https://github.com/Alageum/alageum-site/actions/runs/38353349041).
Orders, invoices, organization selection/profile/members, quote throttling and
page contracts passed, but the workflow failed overall.

Known blockers include dependency findings, historical source-proof mismatches
after sanitized transfer, stale schema-inventory expectations and unsuccessful
document/support/page-delivery browser acceptance. General frontend coverage
also contains assertions for superseded UI behavior. Each needs diagnosis and
fresh evidence; presence of tests or a successful isolated check is not a full
release pass.

The current Node organization/profile/support/order/invoice/document/member
browser runners and Node RFQ environment now use the same-origin proxy and
cookie login. Migrated E2E helpers carry only the public tab boundary, retain
real tenant-denial checks and require reauthentication on cookie-session 401s.
Each cabinet runner also checks cookie relay, boundary/tenant/Origin denial and
logout through the actual Next proxy before its browser suite. This HTTP proof
is separate from Chromium acceptance. The historical `catalog-rfq.yml` still
starts Python and must not be presented as a current Node deployment test.
Do not re-enable bearer persistence or weaken origin checks to accommodate old
fixtures. Final real-browser results remain a release requirement.

The CI repair candidate updates Handlebars to the official 4.7.10 patch, makes
the existing Nodemailer version an explicit SMTP dependency, fixes an ambiguous
support-field locator and aligns the palette test with the intentional neutral
gray design. The native storage proof excludes only the unrelated private
editorial archive while preserving its 180 MiB cap, runtime catalog/media copy,
source-integrity check and cleanup verification. These changes still require
the final integrated CI run; they do not remove the release gates above.

## Dependency review on 13 October 2026

The reviewed backend lockfile changes Handlebars 4.7.9 to the official
[4.7.10 security release](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.10).
The only other lockfile change makes the already locked Nodemailer 10.0.13 a
direct dependency of the SMTP adapter. All 30 installed Strapi generator
templates produced identical output with the old and patched Handlebars using
Strapi's actual helpers. Three focused escaping/type-validation tests pass.

A fresh `npm audit --json` snapshot still reports findings:

- Backend: 32 affected package entries (29 high, 3 moderate, 0 critical), down
  from 33 entries including 5 critical classifications. Counts include parent
  packages affected through dependency chains; they are not independent
  vulnerabilities or a complete application-exploitability assessment.
- Frontend: 5 high entries, unchanged.
- [Braces has no published patched version](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
  for the reported recursive-pattern denial of service at the time checked.
- React Router's applicable advisory points to
  [7.18.0](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), while this pinned
  Strapi integration uses the 6.x API. Stream JSON also requires a major-version
  compatibility assessment. Neither was blindly overridden.

The audit gate remains failing. Do not suppress it, silently accept the risk,
or use the suggested major Strapi/Next downgrade to obtain a green result.
Complete a supported dependency/compatibility upgrade and repeat native CMS,
webpack and application acceptance before public release.

## Local validation of the integrated candidate

- Backend aggregate: 701/703 checks pass. The two failures are the unchanged
  historical `backend/app/core/config.py` source pins in `legacy-query.test.js`
  and `quote-rate-limit.test.js`; the transfer README records sanitized legacy
  defaults. Do not restore credentials or rewrite approvals to silence them.
- Frontend aggregate remains red: 647/787 pass, 140 fail in the bounded local
  checkout. Diagnostics include 67 missing local fixtures/assets, 32 catalog
  component transform/module-resolution failures, 24 historical approval/source
  checks and 17 other catalog/content/collection assertions. These counts are
  diagnostic groups, not a claim that every failure is inherited or harmless.
- The full frontend production build completed all 1,220 generated pages and
  full lint passed. Focused cookie/organization frontend checks and real
  PostgreSQL auth checks have separate passing reports; neither substitutes for
  the red aggregate or browser acceptance.
- The complete native Strapi/PostgreSQL 17 storage proof passes 16 checks and
  rejects 27 malformed-schema startups. Its 180 MiB cap, protected source
  hashes, process/port shutdown and owned-fixture cleanup remain enforced.
- Cookie-harness migration checks pass: 191 focused frontend tests, targeted
  E2E lint and discovery of 153 configured cases. Discovery is not execution.
  This executor cannot start Chromium because required socket operations are
  restricted. Run the real-browser suites in the reviewed CI environment.

The real Next/Strapi/PostgreSQL support fixture also passed all eight HTTP
cookie-proxy checks and its production Next build; 22 backend/build checks
passed. Its browser stage failed before a page opened because the default
Playwright executable was absent. A separate attempt with installed Chromium
confirmed the executor's socket restriction. The runner completed cleanup and
published only sanitized evidence. No browser pass is claimed.
