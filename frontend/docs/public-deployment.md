# Frontend hosting: connected server and optional public preview

The normal server target is **connected mode**: real account flows, live API
catalogue and Strapi CMS behind one HTTPS origin. See the root
[server deployment guide](../../docs/server-deployment.md). No Vercel CLI,
Services configuration or platform dependency is required.

The production container builds with `ALAGEUM_PUBLIC_ONLY=0`,
`NEXT_PUBLIC_API_URL=/api/v1` and `NEXT_PUBLIC_CATALOG_SOURCE=api`. The browser
always uses the same origin; only the Next server receives
`API_INTERNAL_BASE_URL=http://backend:8000/api/v1`. The backend need not be live
while compiling the frontend. Public mode is a build-time choice, so changing
an env variable after compilation does not enable account features.

## Standalone Node alternative

From `frontend`, on Node 24.x:

```sh
npm ci
ALAGEUM_PUBLIC_ONLY=0 NEXT_PUBLIC_API_URL=/api/v1 NEXT_PUBLIC_CATALOG_SOURCE=api npm run build:standalone
HOSTNAME=127.0.0.1 PORT=3000 API_INTERNAL_BASE_URL=http://127.0.0.1:8000/api/v1 npm run start:standalone
```

This starts Next only. Supply the same-origin reverse proxy separately and route
`/api/v1`/CMS/media to the backend. Do not expose a repository directory as a
static site. `/healthz` is process liveness, not backend/SMTP/scanner readiness.
Production runtime credentials belong in backend env only; no secret `NEXT_PUBLIC_*`
variable is permitted. Standalone preparation copies `public` and `.next/static`
next to the generated server, as required for portable Next hosting.

## Explicit frontend-only demonstration

A backend-free demonstration remains available when deliberately selected:

```sh
npm ci
ALAGEUM_PUBLIC_ONLY=1 npm run build:standalone
HOSTNAME=127.0.0.1 PORT=3000 npm run start:standalone
```

Do not combine that build with API catalogue/source settings, backend variables
or live CMS settings. The existing policy intentionally blocks credentials,
account writes and `/api/**` in this mode; browser-local drafts do not send an
order or request. Connected-mode account capabilities must be tested separately.
`npm run build:preview` is the separately guarded static-export experiment;
its export checks must pass before distributing that output.

Only frontend public assets and Next-generated assets are public output. Never
copy backend/data, source context, docs, environment files, private business
files or backups to the web root. The full tracked source asset tree is required
for source-byte verification; a partial checkout is not a deployment package.
The omitted original transformer PDF is not restored by this server change.

Historical Vercel evidence remains archived for provenance. It does not describe
the active server commands or authorize any provider/account changes.
