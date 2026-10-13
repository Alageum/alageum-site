# Own saved RFQ print view

`/b2b/quotes/{id}/print` opens from **Версия для печати** on an own saved request.
The document is titled **Запрос коммерческого предложения**. It is a buyer's saved
request, not a seller's offer, order, stock confirmation or price commitment.
Prices are explicitly reference prices. There is no computed total, invented
seller/customer company requisites, signature, payment term or delivery promise.

## Saved data contract

The document reads the existing owner-constrained `GET /quotes/{id}` contract only.
It displays the saved ID/date/status/comment and ordered lines, saved product
name/SKU/version, quantity and reference unit price. Quantities and prices remain
decimal strings, including `999999999999999.999` and `9999999999999999.99`.
Dates state UTC explicitly. Multiline names/comments retain whitespace.

An empty or partial product snapshot stays visibly incomplete. Missing price mode
means the historical price was not saved; **По запросу** is used only when that
mode was explicitly saved. The live catalogue and current company profile are
never used to fill a historical gap. No backend contract or schema is changed.

## Access and browser lifecycle

The screen preview and every **Печать** invocation independently read fresh
`/auth/me`, verify the captured user/organization and current `quote.read`, then
read the own request. The existing server checks `quote.read` and constrains the
record by both current organization and creator. A successful profile read alone
never permits printing a cached request. The request client retains its no-store,
read-only token refresh and login-generation/current-tenant continuation guards.

A mounted auth scope and an operation sequence own the preview/print operation.
Starting a new check removes old private content. Denial, malformed data, network
failure, close/back, pagehide, logout, a new login or organization switch invalidate
pending results; cancellation also aborts fetches. Session changes synchronously
remove the print visibility grant before React completes its rerender. No data is
saved to browser storage, and opening/closing/printing does not create or change an
RFQ. The durable late-POST receipt flow is unchanged.

Native Ctrl+P / browser-menu printing cannot wait for asynchronous access checks.
It therefore prints a safe instruction, including on ordinary RFQ list/detail
pages, instead of cached RFQ data. Only the explicit button after the fresh checks
receives a one-use `beforeprint` grant. `afterprint`, return from `window.print`,
pagehide, unmount and session changes revoke it. A second or delayed `beforeprint`
without a new validated button operation fails closed. A missing `afterprint` does
not leave a reusable grant. The button starts a new read for every repeat attempt.

The browser controls its native dialog, destination, margins and optional browser
headers/footers (including page URL/date); page CSS does not control those settings.
Acceptance artifacts use Chromium PDF settings and do not prove physical printer
or native-dialog completion. Once it has captured an authorized print
snapshot, the page cannot recall that snapshot or a saved/printed copy after a
later logout or permission change. `afterprint` and return from `window.print` do
not prove that printing succeeded; cancellation is indistinguishable. The app
promises browser printing only, not automatic PDF export. The user can choose
available destinations in their browser. Browsers which defer `beforeprint` until
after `print()` returns fail closed and show the safe instruction.

## Layout and acceptance

A dedicated body portal contains printable content; site header, sidebar, controls
and screen preview are hidden in print media. A named A4 page uses 16/14 mm margins
without changing printing on unrelated routes. Multiline comments and oversized
item names can break across pages; short metadata groups avoid awkward splits.
Mobile preview uses a single-column field layout and 44 px print control.

Local checks: frontend lint, all unit tests, production build and browser test
discovery. Native local Chromium execution is blocked by the environment's verified Unix
socket policy. Local PostgreSQL and Strapi HTTP checks are supported; browser/PDF
cases require the hosted runner.

Browser acceptance uses fictitious accounts and documents only, with traces/videos
and automatic screenshots disabled. Explicit PDF/mobile screenshots contain only
fixture data. The mocked lifecycle suite covers current access refresh, exact
saved values, legacy gaps, native-print denial, account/tenant/login races,
expiry/revocation, cancellation/repeat, pagehide and back. Genuine Chromium PDF
capture uses the actual `beforeprint`/`afterprint` events; extracted text must
preserve long-content tail markers and exact decimal strings across multiple pages.
The separate disposable Node/Strapi runner verifies real owner/tenant authorization,
current permission revocation, persisted snapshot values and zero extra RFQs.

## Reproducible checks

- `npm --prefix frontend run lint`
- `npm --prefix frontend run test:unit` (248 cases at this checkpoint, including
  18 print-specific cases; the durable receipt regressions remain in the full run)
- From `frontend/`, build the static-default acceptance application with
  `ALAGEUM_QUOTES_BUILD=1 NEXT_PUBLIC_CATALOG_SOURCE=static NEXT_PUBLIC_API_URL=http://127.0.0.1:8016/api/v1 npm run build -- --webpack`
- From `frontend/`, use
  `E2E_QUOTES_PRODUCTION=1 NEXT_PUBLIC_CATALOG_SOURCE=static NODE_ENV=production npm run test:e2e:quote-print`
  with `E2E_QUOTES_BASE_URL` unset to start that build. The suite has 54 cases:
  28 desktop, including 2 real PDF cases, and 26 mobile. Retries and skips are
  disabled. Install Chromium and `poppler-utils` (`pdftotext`) on the hosted runner.
- Run `PG_BIN=... backend-node/scripts/run-quote-print-tests.sh --browser` with
  Node 24, installed locked backend/frontend dependencies and the existing
  `.next-quotes` build. Stop other servers using port 8016 first. The compiled
  frontend API URL must equal `E2E_QUOTE_PRINT_API_URL` (default above).

The isolated runner ignores an inherited database URL and creates its own exact
loopback database, role and per-run fictitious users. Its expected contract is
7 backend groups plus 5 real browser cases (4 desktop, 1 mobile), with no failed,
flaky or skipped cases. Only sanitized evidence from
`${TMPDIR}/alageum-quote-print-tests.*/evidence/` may be published; the result is
`quote-print-results.json`. The temporary database is removed only after confirmed
shutdown. Raw databases, password files, auth traces and storage dumps are excluded.
The mock suite saves only its explicit fixture screenshots/PDFs under
`frontend/playwright-report/quote-print-results/`.

Lint, 248 units, the production build and test discovery passed locally. The
completed disposable `--backend-only` runner passed all 7 real Strapi/PostgreSQL
groups; its report explicitly marks browsers not run. Database/password cleanup
was verified, leaving only sanitized evidence. Hosted browser/PDF execution and visual inspection are required before reporting the
print acceptance complete; local discovery is not a browser execution result.

The acceptance runner starts Next and Playwright in dedicated process groups and
retains their immutable spawn-time group IDs. Teardown signals all descendants
even after the direct child exits, bounds graceful and forced termination, and
bounds Strapi destruction to 10 seconds. A failed cleanup writes sanitized final
evidence synchronously and exits the runner explicitly, so lingering Strapi
handles cannot defeat the deadline. Five subprocess tests exercise stubborn
descendants, an already-exited leader, refusal of unowned groups and forced exit
after a hung destroy, in addition to the seven real database/HTTP groups.

The optional broad local `npm run check` stopped at the existing dependency-root
guard (`Refusing a symlinked or non-directory node_modules root`) while reusing an
identical locked dependency tree. That guard was respected; no aggregate-check
success is claimed. Clean-install hosted CI must run the complete backend checks.

Artifacts are generated in a private per-run staging directory outside the
always-upload path. Finalization always attempts sanitization even after teardown
failure. Only a fully validated artifact set is copied to `evidence/`; a sanitizer
or copy failure publishes only a minimal redacted failure report. The shell removes
the private staging directory during its disposable-run cleanup.
