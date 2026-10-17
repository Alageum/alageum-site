# Public frontend demonstration

This release can run the existing Next application without a backend. It keeps
company pages, locales, the bundled reference catalogue, 3D views, comparisons,
and browser-local project/draft tools. Drafts do not send data to Alageum.

## Build and host

Use Node **24.x**. The existing Vercel project can keep its repository root and
Services framework: the root `vercel.json` now defines exactly one Next service,
rooted at `frontend`, with `npm ci` and `ALAGEUM_PUBLIC_ONLY=1 npm run build`.
An explicit low-level service route runs before filesystem lookup. High-level
`rewrites` are intentionally not used: the pinned Vercel CLI otherwise serves
repository files before applying a rewrite. The root `.vercelignore` also permits
only frontend build inputs and config, excluding frontend environment files.
All ingress, including `/api`, reaches that frontend; public-mode policy refuses
API requests. There is no Python or Strapi service in this deployment config.
The original two-service configuration remains in Git history, not active config.

Alternatively, a Next-only project rooted directly at **frontend** uses its
frontend-specific `vercel.json` with the same explicit public-mode commands.
Leave the output directory at the framework default. Do not copy backend files
or credentials into either deployment. Services is a Vercel Beta feature; this
change retains the existing project model rather than changing account settings.
The supported single-service shape and service-scoped commands are documented at
https://vercel.com/docs/services and https://vercel.com/docs/services/config-reference.

The flag is compiled into the server and client. A capability change requires a
new build; changing an environment variable after the build does not enable
accounts. Do not set `API_INTERNAL_BASE_URL`, `NEXT_PUBLIC_API_URL`, an API
catalogue, CMS company source, or `PAGES_STATIC_PREVIEW=1` for this build. Conflicting
settings fail the build. No database, SMTP, Google or application secrets are
needed for the frontend demonstration. Do not copy backend environment files.

The root must remain `frontend` when choosing a different supported Node/Next host.
For a local production smoke use the same build command, then
`node scripts/check-public-deployment.mjs` (the emitted standalone server).
For a standalone container, copy `.next/static` and `public` alongside its emitted
server as required by Next; do not publish the repository as a static directory.

## Deliberate unavailable state

Login, registration/reset/verification, accounts, company cabinets, CMS/admin,
AI and live CMS editorial reads redirect to an explicit unavailable page with
no credential/submission form; writes are refused with HTTP503. Redirects discard
query parameters and preserve the locale. `/api/**` returns uncached503 JSON. Explicit
live-catalogue links also remain unavailable; they never silently fall back to a
bundled record. The header labels the unavailable account entry. Existing public
company routes still use their current bundled content. Public API clients refuse
before sending any network request, including a stale session marker.

This is a progress demonstration, not evidence that the backend, mail delivery,
company approval or server-side saving is deployed. Browser-local drafts remain
honestly labelled and must not be mistaken for sent orders or support tickets.

## Publication boundary and remaining checks

Only `frontend/public` assets and Next-generated static assets are public output;
backend/data, private editorial
packages, docs, tests and environment files must not be copied into it. Next's
source-byte verifier stays enabled. The 805MiB original transformer PDF was
excluded from Git by the handoff and is unavailable until separately provided.
Some large source assets are present remotely but omitted from the cloud test
checkout; use the real repository tree for deployment, not this partial copy.

Provider account/team eligibility, any paid plan, domain ownership and a successful
provider build/live HTTP check are separate prerequisites. This file does not
select a team, approve a purchase, accept new terms, or claim a live URL.
