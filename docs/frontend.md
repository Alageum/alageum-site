# Frontend foundation

The Next.js App Router frontend is a neutral functional shell, not final branding. All network
access is centralized in `frontend/lib/api`; components never consume ORM/provider shapes or embed
backend business rules. Permission checks hide UI for UX only; backend authorization is decisive.

`AuthProvider` loads `/auth/me`. The client serializes refresh rotation, retries once, and clears
expired/replayed sessions. Browser persistence is isolated in `sessionTransport.js`; the current
per-tab `sessionStorage` adapter is DEV/pre-Discovery only. A Secure HttpOnly cookie/BFF adapter
requires approved domain topology, SameSite and CSRF/origin policy, so production config rejects the
current transport.

`NEXT_PUBLIC_API_URL` is public routing configuration. The non-secret, build-time
`NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED=1` flag exposes the optional EDS panel; it defaults off
and requires a rebuild. Server verification and permissions remain decisive. Never expose secrets
through a `NEXT_PUBLIC_*` variable. See [EDS boundary](node-document-signing.md).

Routes cover public home/catalog/login and B2B orders/documents/finance/RFQ/support/profile/AI. The
Playwright suite covers login, tenant denial, RFQ/ticket, AI READ/WRITE confirmation and
reauthentication UX against deterministic synthetic seed data.
