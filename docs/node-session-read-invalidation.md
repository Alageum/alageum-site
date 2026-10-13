# Defensive invalidation of obsolete frontend reads

This narrow follow-up starts from frozen PR 19 commit
`7f8fbfbb97d8b1b6318daca0cb15141c847c14d2` (tree
`84558d8995e1339a0697162a13b54e1479dfb204`). It changes frontend read ownership
and lifecycle notification only. No AuthProvider redesign, backend route,
permission grant, schema, dependency, persistent credential, browser flag or
response-header change is included.

## Concrete behavior

The invoice, document, order and member reader factories now handle a
non-disposed `reload()` in this order:

1. Abort and invalidate the preceding request
2. Publish the existing empty loading state, removing old values and errors
3. Check whether the captured authorization scope may still load
4. Start a new request only for a current scope

An obsolete reader therefore clears its own state without another fetch. Its
old fulfillment or rejection cannot repopulate that state, even if the transport
ignores abort or a later scope predicate happens to return true again. Disposed
readers publish nothing and cannot reload. Current-scope ready/error behavior and
explicit retry remain unchanged; the empty loading state retains its existing
meaning while the authorization boundary chooses the appropriate screen.

`subscribeSession` also notifies its existing subscribers on a persisted
`pageshow` event. The existing `getSessionGeneration` fingerprint determines
whether stored credentials or selected organization changed. The listener does
not write credentials, increment generation, force login, fetch directly, or
remount all children. Nonpersisted pageshow is ignored; storage and custom
session events keep their previous behavior. Unsubscribe removes all three
listeners and preserves other subscriptions.

The existing AuthProvider consequently reconciles a changed snapshot through
its established boundary. Identical storage stays in the same boundary, as does
legitimate `setSession(..., { preserveGeneration: true })` token rotation.
Ordinary company/support drafts are not reloaded just because a controlled
same-session event arrives. Member-specific clear/reload behavior and the
quote-print safeguards remain intact.

## Evidence and limits

An in-memory reproduction established the old defensive gap: a reader could
retain ready state after its scope became obsolete and `reload()` returned
early. No real cross-account browser disclosure was demonstrated.

The [Web Storage broadcast algorithm](https://html.spec.whatwg.org/multipage/webstorage.html#concept-storage-broadcast)
queues storage-event tasks for eligible same-origin documents; inactive documents
can receive those events when they become fully active again. A frozen document
must not be assumed to miss every storage notification. The added pageshow
notification is an additional reconciliation opportunity.

Pinned Playwright 1.62.1 launches Chromium with
`--disable-back-forward-cache` (installed `playwright-core/lib/coreBundle.js`,
`chromiumSwitches`). Its pinned `types/types.d.ts` declaration for `goBack` and
the [official Playwright navigation documentation](https://playwright.dev/docs/api/class-page#page-go-back)
explicitly say BFCache testing is unsupported: enabling it can desynchronize
Playwright because restoration omits its expected network navigation events.
Removing the flag therefore does not provide supported BFCache testing.
Existing Back/Forward tests cover ordinary history navigation. New
`PageTransitionEvent('pageshow', { persisted: true })` cases are explicitly
controlled lifecycle events in a browser. They establish application response
to that signal, not genuine BFCache restoration, native event ordering or
first-paint privacy. Flags and no-store headers are unchanged.

Unchanged same-session storage does not acquire new server-authority
revalidation from this notification. This change does not establish that an
unchanged session has fresh membership/permission authority while idle or
restored. Existing server checks continue to apply when a request occurs.

## Regression coverage

Shared factory tests exercise all four readers with initially obsolete, ready,
error and pending state; no replacement fetch on invalidation; late fulfillment
and rejection after the scope predicate returns true again; and no publication
after disposal. Session transport tests cover changed account/tenant/logout
storage, repeated events and multiple subscribers, unchanged storage,
preserved-generation refresh, ignored nonpersisted events, compatible
storage/custom notifications and complete unsubscription.

The existing invoice production fixture suite adds two cases on both projects:
an unannounced tenant change with real `/auth/me` held pending, and unannounced
session removal. Both use a controlled persisted-pageshow signal and assert old
invoice rows clear through the shared AuthProvider boundary. The tenant case
then allows validation to settle and reads only the replacement tenant.

The company-profile suite adds one desktop case: save once, create a new unsaved
draft, dispatch a controlled same-session event, preserve the inputs and verify
no automatic profile reload or mutation replay and an unchanged saved snapshot.
The existing real login limiter and interrupted-flow cases remain enabled.

Discovery after these additions is:

| Suite | Browser cases | Projects |
| --- | ---: | --- |
| Invoice | 28 | 14 desktop + 14 mobile |
| Company profile | 17 | 15 desktop + 2 mobile |
| Document | 26 | Unchanged |
| Order | 14 | Unchanged |
| Member | 19 | Unchanged |
| Default / Vercel | 58 each | Unchanged |

The invoice runner still requires 21 acceptance groups and six explicit PNGs;
its parsed browser total is now 28. The profile runner still requires six
acceptance groups. Existing production fixture runners/build paths are reused;
no extra backend, schema or runner is introduced.

## Validation status

Local verification on 2026-10-03 with Node 24.19.0 / npm 11.9.0 passed:

- 68 focused frontend reader/session tests
- All 339 frontend unit tests with `NEXT_PUBLIC_API_URL` unset
- All 339 frontend unit tests with
  `NEXT_PUBLIC_API_URL=http://127.0.0.1:8016/api/v1`
- Full frontend ESLint
- Next 16.3.8 production build using the existing `.next-invoice` output,
  `ALAGEUM_INVOICE_BUILD=1`, the explicit API URL above, static catalog/company
  and page fixtures, and all 287 generated static pages
- Browser discovery totals listed above, changed runner/test syntax and diff
  whitespace checks

No backend/runtime code or dependencies changed, so the inherited backend and
PostgreSQL baseline was not rerun for this frontend-only follow-up. Existing
build directories were reused with no cache/data cleanup or dependency copies.

Local Chromium process-singleton sockets remain blocked, so browser cases are
discovered but not executed locally. Hosted browser execution remains required;
unit tests, syntax, discovery and a successful production build are not browser
acceptance. No duplicate server or local browser attempt is needed for this
follow-up.

The inherited security gate remains blocked by the previously recorded audit:
backend 29 high / 3 moderate and frontend 5 high vulnerabilities, including
unpatched `braces`. This follow-up does not ignore, downgrade or alter those
gates and is not a dependency remediation.
