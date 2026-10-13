> Historical catalog-only checkpoint. Current scope: [full-site verification](full-site-verification.md), [meeting questions](full-site-meeting-questions.md) and [public sources](public-content-sources.md).

# Demo catalog verification

The catalog has a backend-free browser suite, separate from the API/security
suite. It uses the synthetic catalog fixtures, not approved ALAGEUM product data.
No backend, database, API credentials, or network product source is required.

## Install

Use Node.js 22 and npm 11.6.2 to match CI:

```sh
cd frontend
npm ci
```

The lockfile repair adds the missing optional `@emnapi/core` and
`@emnapi/runtime` peer packages. Security patch updates also advance Next.js and
its matching ESLint configuration from 16.3.3 to 16.3.8 and update the vulnerable
transitive `brace-expansion` packages. No major dependency upgrades are involved.
The repair does not use `--legacy-peer-deps` or disable lockfile validation.

## Run the catalog suite

```sh
cd frontend
npx playwright install chromium
npm run test:e2e:catalog
```

For an existing Chromium installation:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e:catalog
```

The suite starts Next.js on `http://127.0.0.1:3100` and runs in desktop and mobile
Chromium profiles. Set `E2E_CATALOG_PORT` to choose a different local port.
Set `E2E_CATALOG_BASE_URL` to test an already-running frontend instead; in that
case Playwright does not start a server. Failure screenshots and traces are
written to the ignored `frontend/test-results/` directory.

## Existing security coverage

`frontend/e2e/security.spec.js` and `frontend/playwright.config.js` are unchanged.
The default `npm run test:e2e` continues to use that existing config. To run only
the original API-backed security suite against the bootstrapped application:

```sh
npm run test:e2e -- e2e/security.spec.js
```

That suite requires the backend, database and deterministic synthetic seed data
as documented in the existing project setup. Passing the backend-free catalog
suite does not verify authentication, permissions, API integrations, or backend
security.

## Coverage

The dedicated suite defines 13 scenarios in both desktop and Pixel 7 profiles
(26 cases):

- Backend-free demo list, shared header/footer and document-width overflow check
- Search, URL persistence, empty result and reset
- Category and facets, reload, Back and Forward
- Pagination and ascending/descending power sort
- Detail page, unknown values, absent documents and keyboard-operated tabs
- Unknown product recovery
- Comparison deep links, differences-only mode, removal, invalid IDs and four-item cap
- Repeated selection adds, persistence, quantity bounds, CSV export and removal
- Corrupt local storage and blocked local storage
- Explicit API failure/retry with no silent demo fallback
- Shared navigation dismissal and route changes

The scenarios are implemented but their browser assertions have not yet been
verified in this execution environment. The API-failure scenario intercepts its
own response and does not need a backend.

## Verification record — 2026-09-30

Passed:

- Full `npm ci`, including install scripts, with Node 22.23.3 / npm 11.6.2
- Full `npm ci` with Node 24.19.0 / npm 11.9.0
- `npm audit --audit-level=high`: zero vulnerabilities after the scoped patches
- `npm run lint`
- `npm run build` with Node 22.23.3 / npm 11.6.2: production build succeeds,
  including catalog, comparison, selection and dynamic product routes
- `node --test tests/catalog.test.mjs`: all eight unit tests pass
- Playwright configuration and discovery: 26 catalog cases found
- `git diff --check`

Blocked / not verified:

- Catalog E2E execution: both normal and approved escalated launches stop before
  any browser test action. System Chromium cannot create its local process socket
  (`process_singleton_posix.cc`, `socket() failed: Operation not permitted`).
  The runner reports 26 setup failures; these are not UI assertion results.
- The cloud browser cannot reach the worker's local preview URL
  (`net::ERR_BLOCKED_BY_CLIENT`). No screenshots or visual approval were produced.
- The existing backend/API security suite was not run. Its source and existing
  Playwright configuration are unchanged.

The initial duplicate dynamic-route startup issue was repaired by retaining the
existing `[slug]` route. The subsequent development server and production build
start successfully. Browser checks still need a supported preview connection or
an execution environment that can launch Chromium; do not label this a complete
E2E or visual pass.
