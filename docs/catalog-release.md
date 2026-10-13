> Historical catalog-only checkpoint. Current scope: [full-site verification](full-site-verification.md), [meeting questions](full-site-meeting-questions.md) and [public sources](public-content-sources.md).

# Technical catalog release / 2026-09-30

## Current scope

This increment prioritizes a **public technical catalog**, with backend-independent demo behavior:
search, category/parameter filters, sorting, pagination, product details, comparison (2–4 items),
a local selection list with quantity and CSV export, and responsive shared site navigation/footer.
Main, company, solutions and contact routes provide the site foundation. Company claims and contact
channels are not invented. Existing backend, API clients, B2B/auth flows and security tests remain.
No payment, production ERP integration, account onboarding or quote transmission was added.

## Design source

`Design/` is the existing ALAGEUM 2026 styleboard and remains unchanged. Its red/white/graphite tokens,
square/4px controls, fixed header, dual navigation underlines, restrained motion, circular selection
indicators and technical data treatment are translated into shared React components and responsive CSS.
Only supplied logo/transformer assets are reused. The transformer is an illustration, not evidence of
an actual model. Fonts use the existing local/system fallback policy; no external font dependency.

## Data honesty and mode

- `/catalog` uses isolated fixtures in `frontend/lib/catalog/data.js`. All nine positions are visibly
  marked synthetic. `DEMO-001` preserves the SKU/name of the backend's original synthetic seed;
  unknown technical parameters stay empty. Eight additional synthetic rows only exercise UI states.
- Categories/attributes/units are provisional UI examples, not an approved Alageum taxonomy or
  engineering specification. No stock, prices, certifications, manufacturer claims or documents are
  fabricated. Missing values render as `—`, with explanatory copy.
- `/catalog?source=api` calls the existing public API through `frontend/lib/api/client.js` and uses
  bounded pagination. Errors remain visible; an API failure never silently changes to demo mode.
- Existing UUID product URLs still resolve through the API. API technical attributes remain raw
  code/value/unit data until mapping is approved. API comparison/selection integration is deferred;
  its existing backend endpoints and API client functions are untouched.
- Demo selection is localStorage-only under `alageum.catalog.selection.v1`, validates IDs/quantities,
  and survives reload. It falls back to in-memory state when storage is unavailable. It contains no
  contact, account, financial or authentication information. The CSV is clearly marked demo/not order.

## Developer start

From `frontend`: `npm ci`, then `npm run dev`. Public demo pages do not require Docker/backend.
The original Compose startup still applies when testing API/B2B. `NEXT_PUBLIC_API_URL` remains the
only allowed browser environment variable. See `docs/catalog-verification.md` for exact verified
checks and limitations; the existing full security E2E suite requires seeded Compose services.

## Deferred, intentionally

Approved product import, category-dependent production attributes, real document downloads/access,
server-side filtering at production scale, localization/content approvals, real price/availability,
transmitted RFQ, production auth and integration workflows. Decisions are tracked in
`docs/catalog-meeting-questions.md` and the existing Discovery catalog questionnaire.
