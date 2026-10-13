# Verification — full public site, 2026-09-30

## Passed on final integrated frontend

- `npm run lint`: full ESLint pass
- `npm run test:unit`: 40/40 pass (8 catalog, 7 official/public-content,
  11 inquiry, 14 local-workspace tests)
- `npm run build`: Next.js 16.3.8 production build succeeds; 66 generated routes;
  original dynamic `/b2b/orders/[id]` remains supported
- `npm run build:preview`: isolated static public build succeeds; 57 HTML files
- Static output inspection: all 46 unique local route/resource references resolve;
  public route index pages exist; `/b2b`, `/login`, `/ai` excluded from static copy;
  robots disallow/noindex enabled
- `npm audit --audit-level=high`: 0 vulnerabilities
- Playwright catalog suite discovery: 26 desktop/mobile scenarios
- `git diff --check`: clean

The project is JavaScript; Next's build compile stage passed. No separate TypeScript
application typecheck is claimed. Original backend/API test suite was not run in
this environment, and backend code was not modified.

## Browser verification limitation

Local Chromium could not initialize its process socket: `socket() failed:
Operation not permitted`. Normal and approved escalated launches both failed
before UI assertions. This is a browser-environment blocker, not an E2E pass.
No local visual screenshot or complete browser sign-off is claimed. Test-preview
hosting may permit a separate remote browser check; record those results separately.

## Important covered behaviors

Search, filtering, ordering, unknown values, comparison bounds, safe selection
normalization and provenance-aware exports. Official sources remain separate from
synthetic fixtures. Inquiry validation includes optional-contact errors, string
bounds, filename-only metadata, encoded mailto length fallback and no-selected-item
flow. Workspace tests cover review lifecycle, normalization, history, comments,
corrupt storage, blocked/quota storage, record limits and external clearing.

## Acceptance still needed

- Desktop/mobile visual review and full keyboard/browser flows
- Approved product schema and content/brand/media publication sign-off
- Real document upload, secure permissions, server delivery/manager routing
- Production authentication, integrations, privacy/legal rules and rollout
