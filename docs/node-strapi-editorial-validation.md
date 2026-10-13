# Reimplemented Page validation

The unpublished Page worktree was lost on 2026-10-02. This source was reimplemented
from visible requirements and published Vite base c4fc67e. It is not an exact
restoration of 1e6c7e0. The results below are fresh execution of this source;
earlier workspace results are not counted.

## Fresh local checks

- Backend syntax and 35 unit tests pass
- Expanded Page suite: 12 reported native HTTP/PostgreSQL tests pass, covering
  11 grouped scenarios plus the enclosing test
- Existing catalog/auth/RFQ/native CMS PostgreSQL suite: 45/45 pass, including
  preservation of all 238 catalog identities
- Frontend full lint and 150 units pass, including 18 Page-focused checks
- Normal production Next build passes with API catalog mode; the editorial
  route remains dynamic and no live Page paths are prerendered
- Explicit static-preview build passes, exporting only `/pages/ru/about` for
  editorial content across 278 exported HTML files, excluding b2b, ai, login,
  admin and api directories
- Source/manifest parity preserves all 30 baseline page URL patterns and robots:
  36 files moved under `(site)`, exactly four shared CSS import adjustments, and
  byte-identical root layout/error/not-found/robots/shared CSS
- Production HTTP fault matrix: 58/58 checks pass with browser and bot user
  agents, hard 404/500 on absent/error/invalid/timeout responses, no fallback,
  and 15 existing catalog/admin/navigation paths with the shared shell. The
  initial 38-case run passed before the navigation matrix was expanded
- Real native CMS/PostgreSQL → production Next harness: 12 grouped HTTP checks
  pass, including draft privacy, publication, republish, unpublish, exact locale,
  changed slugs, native role denial, reseeding refusal and actual backend shutdown
  returning hard 500 without stale content. Its browser mode was explicitly not run

The Page suite proves an actual failed Strapi startup preserves legacy rows and
columns and invokes no schema sync. Native writes preserve separate editor and
publisher permissions and audit identity. A deliberately failed audit insertion
rolls back both update and publication. The complete session chain rejects an
old rotated-parent bearer after the current child is revoked. Blocked users and
role/permission/session/account changes after native controller authorization
cannot write or publish. Narrowed field grants cannot commit partially sanitized
input, and refreshed native ownership conditions deny a stale publish grant while
allowing the creator to edit its own draft. Denials preserve all stored Page rows,
public content and every stored Page audit event.

Race tests wrap the real native document-manager operation only after controller
permission checks and input sanitization. Independent database connections commit
revocations before the Page transaction loads authority. Production code has no
test hook. Initial valid native sessions are reused except for deliberately
rotated/revoked sessions; the native login rate limiter is unchanged. Per-request
public error IDs are validated as UUIDv4 and matched against X-Request-ID, then
only that volatile response field is omitted from content snapshots.

## Hosted acceptance still required

Five Page browser cases are authored: native editor/publisher lifecycle, denied
native role, desktop rendering, mobile rendering and hard 404 requests. Native
browser execution and PNG/visual acceptance are not claimed locally. Local
Chromium was previously blocked by the executor; no alternate route around that
restriction was attempted.

Separate `page-contracts` and `page-delivery` jobs use independent fresh
PostgreSQL services and exact Page database names. Existing 36 catalog/RFQ browser
cases remain selected by their dedicated configs; two new desktop/mobile login
hydration regressions bring that selection to 38 cases. The RFQ capture step
now waits for its exact detail URL, unique heading, fonts and visible footer.
The Page job retains successful PNG files and sanitized JSON/logs; native auth
traces are disabled to avoid persisting login/session secrets. Every failure
fails its job. New hosted jobs and screenshots must pass before functional
acceptance. The dependency audit and production environment guard remain release
blocks; no merge, deployment or production provisioning is authorized here.

### First hosted run and scoped corrections

At head `e11d74ec051ad54777c046d6c1099b268e9fd14b`,
[run 36991430398](https://github.com/StiveMan1/Alageum_Temp/actions/runs/36991430398)
passed Page contracts (12), the HTTP matrix (58), backend/frontend checks and
the actual CMS/Next builds. Page browsers had four passes and one failure:
the native Slate editor includes a sibling Drag control in its text. The test
now checks the actual content paragraph, retaining exact saved JSON assertions.
The lifecycle stopped before its first save; later native publication assertions
and the hosted static-preview build were not reached in this run.

The existing 10 CMS/admin/real-RFQ browser cases passed. The interruption suite
had 25 clean passes and one retry-pass. Its retained trace showed an early login
click caused native GET `/login?` without any authentication API request, losing
the return URL. The login form now keeps its server-rendered controls disabled
until hydration attaches handlers. New deterministic desktop/mobile cases hold
JavaScript delivery, verify disabled controls and no submission, then release
scripts and require one login plus the original inquiry destination. No sleeps,
longer assertions, authentication retries or route allowlist changes are used.

Retained public Page and real RFQ desktop/mobile PNGs were visually inspected:
the shared header, full content, text wrapping and full footer are visible
without horizontal clipping. Native Page publication/browser acceptance still
requires a successful corrected run. The audit remains blocked at 3 high and
13 moderate affected packages; the gate is unchanged.

### Corrected native Page acceptance and production interruption runner

At head `936da692fedc0dbc8606c6d9ffbcec7cbb7051c0`,
[run 36992974841](https://github.com/StiveMan1/Alageum_Temp/actions/runs/36992974841)
passed all five Page browsers without retries, all 13 native delivery groups,
58 fault-matrix cases, Page contracts and the explicit static-preview build.
Native editor/private-draft and separate-publisher/republished screenshots were
inspected alongside complete public desktop/mobile captures. The native images
cover the editor viewport, not the entire long Content Manager form.

Both new login hydration cases passed. The Node job's development interruption
suite had 27 clean passes and one retry at a different point: a successful 201
RFQ POST was followed by a detail RSC request, then a full document reload to the
inquiry while Fast Refresh was rebuilding. No save error or explicit runtime
exception was reported; development reload causation remains an inference.
The same 28 cases passed cleanly in the separate production RFQ workflow.

The Node job now builds a separate static-default production application in
`.next-quotes` and selects it with `ALAGEUM_QUOTES_BUILD=1`. The normal API-default
`.next` build remains separate. `E2E_QUOTES_PRODUCTION=1` starts that production
server for the identical interruption cases; assertion timeouts, retries and
flow assertions are unchanged. Ordinary local development remains available.
This runner correction requires its own hosted result; the prior retry is not
counted as a clean pass. The dependency audit remains enforced.

## Repeatable commands

Backend: `npm run check`, then
`PG_BIN=/path/to/postgresql/bin bash scripts/run-page-tests.sh`. The runner ignores
the caller's database URL and creates a disposable loopback cluster. Existing
regressions use `bash scripts/run-local-tests.sh --integration-only`. Use a
workspace-backed TMPDIR to avoid RAM-disk pressure.

Frontend: `npm run lint`, `npm run test:unit`, `npm run build`,
`node scripts/verify-editorial-http.mjs`, and `npm run build:preview`.
The fault matrix starts only its own fixture API and production Next server;
it does not establish native CMS or browser acceptance.

With the frontend build available, `bash scripts/run-page-tests.sh
--delivery-http` creates a fresh Page database and exercises the actual native
HTTP→Next path. It explicitly reports browser not run and is forbidden when CI
is set. Hosted delivery runs `node backend-node/scripts/run-page-delivery.js`
without that flag, after both CMS and Next builds, and now requires all seven browser
cases plus their screenshots. Every runner stops its own children and retains
bounded evidence under ignored `page-delivery-evidence/` or its disposable test
folder. No credentials are committed.


## Explicit company CMS delivery (PR9 successor, 2026-10-02)

This bounded integration starts from frozen PR9 head
`7515df3499471c62c3981b0485b908e051eb70ff`, tree
`61ec0c0e442b7e3bd00c7bc3ff6002b9497ea433`. Historical counts above belong to those
older checkpoints. The current slice changes no dependencies, schema, API,
production database or root shell. Only `/company` moves out of the existing
loading boundary; its entire rich component and original metadata are preserved
byte-for-byte except the relative CSS import location. Static remains the default.

The installed Next 16.3.8 guides on previous-model dynamic route configuration,
metadata/cache and not-found streaming were read before implementation. The
normal build explicitly renders `/company` at request time, allowing that same
build to start under unset, static and CMS selectors.

Local validation on Node 24.19.0 and PostgreSQL 17:

- Frontend lint and full units: 154/154 (including the child-process sentinel that
  proves rejected CMS/invalid preview selection leaves staging and output intact)
- Backend syntax and units: 55/55; native PostgreSQL Page contracts: 12/12
- Normal production Next build and explicit static preview export pass
- Production HTTP matrix: 196/196; all original 58 checks remain, plus 138 company
  checks covering runtime selection, publication lifecycle, hard404/500 for browser
  and Twitterbot, delayed faults/timeouts, canonical origin/config rejection,
  invalid selector isolation, shared shell, SEO freshness and no fallback
- Native Strapi/production Next delivery: 13 local HTTP groups pass against a new
  exact-name disposable PostgreSQL database. Company and alias both cover draft,
  publish, private edit, republish, moved/restored slug, unpublish, restored
  publication, and actual backend shutdown. The hosted browser group makes 14
- Browser discovery: 45/45 across all existing suites, including seven Page cases.
  The two added company executions use existing desktop/mobile projects and retain
  full screenshots. All prior cases and zero-retry assertions are retained

A deliberately stricter intermediate HTTP assertion exposed two upstream reads
on a browser API500 response. Inspection confirmed Next 16.3.8 creates a new RSC
error render and reruns metadata after a generic error; each render gets a fresh
React cache. The final matrix preserves the prior bound of at most two reads for
all-error responses, requires at least one actual read, and verifies hard500/no
content even when the recovery read succeeds. Success, shared metadata/body
first-read-only snapshots and 404 require exactly one read; preflight configuration
failures require zero. The next request independently observes publication or an
outage. No global cache, unsupported framework internals or assertion retries are
used to hide this framework behavior.

Local Chromium execution remains blocked by the executor's verified process
singleton socket policy; no browser was launched or bypass attempted. Discovery
and HTTP evidence do not establish browser acceptance. The hosted workflow must
still prove all seven Page cases, retained desktop/mobile company screenshots,
and the unchanged earlier suites for the final commit. Optional webpack probes
remain enforced in that workflow. Dependency audit, production environment guards,
optimistic Page conflict handling, history restoration and production readiness
remain unchanged limits; this slice authorizes no merge or deployment.


### Hosted mobile navigation failure and containment candidate

PR10 head `006aa2e2` passed six Page cases, including desktop company delivery,
but the mobile company case could not click the existing menu toggle. The public
trace shows a 390×844 viewport while the catalog loading shell is visible, then
589×1275 after the real table mounts and before the first click. The failed PNG
is horizontally displaced; click points such as (349,34) hit the header rail.
This is layout inflation evidence, not justification to force a click or change
header stacking.

The compiled CSS in that trace matches source: the two table-header `.sr-only`
labels are absolutely positioned; the horizontal `.catalog-table-wrap` has no
positioned containing block. CSS overflow does not clip absolutely positioned
descendants whose containing block lies outside the scroller
([W3C CSS2 overflow](https://www.w3.org/TR/CSS2/visufx.html#overflow-clipping)).
The narrow candidate sets `position: relative` on that existing scroll wrapper.
It leaves the table's horizontal scrolling, hidden accessible text and every
header rule intact. This explains the likely escaped-label overflow; the fix
still requires fresh hosted browser confirmation.

The company desktop/mobile case now waits for the hydrated table and asserts
configured viewport width, no document overflow/horizontal displacement, normal
visual scale, and real navigation-center hit testing before ordinary clicks.
The existing catalog navigation case adds the same public-catalog checks while
retaining its original demo open/Escape/reopen/navigation flow. Mobile checks also
require that the wide table actually scrolls with ArrowRight inside its own
region while document scrollX stays zero. No force
click, JavaScript click, timeout increase, retry or footer shortcut is introduced.


Local checks for this containment candidate pass: lint, all 154 frontend units,
normal production and disposable static builds, 45 candidate-browser discovery
and 46 existing catalog-browser discovery. No local browser was launched; those
discovery counts do not establish interaction acceptance.
