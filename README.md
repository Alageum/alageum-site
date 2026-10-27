# ALAGEUM site and B2B foundation

Next.js frontend and a Node.js/Strapi backend, with PostgreSQL-backed business
accounts, catalogue and CMS. The active server package is portable and does not
require Vercel.

## Server transfer

For the administrator, start with [the short Russian handoff](docs/ADMINISTRATOR-RU.md)
and [the current verification report](docs/release-2026-10-23/README.md).

Read [the server deployment guide](docs/server-deployment.md) and
[deployment package](deploy/README.md). It provides:

- Next standalone and Strapi production images, locked dependency/base-image inputs
- HTTPS same-origin Nginx, PostgreSQL with verified TLS and a non-superuser app role
- ClamAV/FreshClam scanning before public media writes
- Persistent uploads and private quarantine, DB-backed SMTP outbox worker
- Paired PostgreSQL/media backup, isolated empty-target restore and rollback guidance

Use `deploy/compose.production.yml` alone. Fill private server env files and
supply the domain, TLS, approved SMTP, independent secrets and existing data.
The package does **not** claim an already deployed server, successful real mail,
verified mounted storage or approved production cutover. Read the explicit
acceptance checklist before enabling real traffic.

## Development and checks

- Backend: `cd backend-node && npm ci && npm run check`
- Frontend: `cd frontend && npm ci && npm run lint && npm run test:unit`
- Portable frontend: `npm run build:standalone` and `npm run start:standalone`
- Local Node stack: `docker-compose.node.yml`, isolated development only
- Production configuration: `deploy/scripts/check-config.sh /absolute/private/stack.env`

Node 24.x is the common supported toolchain. The complete tracked source-media
package is required for builds; byte/hash guards must stay enabled. The normal
server build is connected mode. The optional explicitly selected public-only
preview is documented [here](frontend/docs/public-deployment.md).

## Domain and safety boundaries

Business and CMS identities remain separate. New public media uploads require
scanner admission and currently accept PNG/JPEG/WebP only; binary replacement
and arbitrary new public PDF admission remain unsupported. Registration and
password reset need verified SMTP; company/workspace access still requires the
server-side approval/role model. EDS/Google/demo seeding and automatic catalogue
import are disabled in the server template.

No production credentials or real company workflows are inferred from synthetic
DEV data. ERP/1C, CRM, EDO, logistics and commercial decisions retain their agreed
scope. See [catalogue RFQ](docs/catalog-rfq.md),
[catalogue administration](docs/catalog-admin.md),
[media security](backend-node/docs/media-upload-security.md), and the domain docs
under `backend-node/docs` for implemented behavior and remaining boundaries.

## Historical material

The Python `backend/`, root `docker-compose.yml`, Makefile bootstrap/reset/restore
commands and older Vercel notes are legacy references. They are not the current
Node server deployment instructions. Existing source/proof material is preserved;
this migration does not modify or delete any remote hosting project.

Minimal retired-host configuration rejects future ordinary Vercel builds/routes;
it is not a runtime dependency or remote disconnection. The project owner must
separately unlink the old Vercel Git/project integration and review existing
deployments. Existing published sites are not changed by repository guards, and
the old integration may fetch source before a build guard runs.
