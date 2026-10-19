# Deployment

The active deployment target is the portable Node.js/Strapi + Next.js server
package. Follow [server deployment](server-deployment.md) and
[`deploy/README.md`](../deploy/README.md).

Use `deploy/compose.production.yml` independently. It includes PostgreSQL with
verified TLS, ClamAV/FreshClam, persistent uploads/private quarantine and an HTTPS
same-origin reverse proxy. Backend mail delivery runs from the database outbox.
No Vercel runtime or Vercel project configuration is required.

Do not use the historical Python `make bootstrap`, `make restore` or root
`docker-compose.yml` for this deployment. The opt-in `docker-compose.node.yml`
remains local-development only. Production schema changes happen during the
reviewed single-backend Strapi startup; there is no separate migration command
that can be claimed without implementing and testing one.

The templates do not select a server, create secrets, issue certificates, configure
SMTP, migrate real data or approve a production cutover. The full live acceptance
and backup/restore checklist is in the server guide.
