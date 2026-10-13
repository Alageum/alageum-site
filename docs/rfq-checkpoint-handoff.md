# Unpublished RFQ checkpoint: architecture change

## Stop condition

Node.js and Strapi are confirmed mandatory. Implementation on the existing FastAPI backend stopped
before publication, merge or deployment. This branch is a local, reusable checkpoint only; it is
not the approved backend implementation or a release-ready candidate. Do not apply its Python
migration to a deployed database as part of the required Node/Strapi work.

Base: `581e4c05c17dea3432deab1cdffda0a6ad791530`.

## Reusable work

- Frontend catalogue database-ID preservation: `frontend/lib/catalog/apiData.js`,
  `frontend/components/catalog/ApiSelectionProvider.js`, `LiveCatalog.js`.
- RFQ review/login continuation, private attempt persistence and list/detail:
  `frontend/components/quotes/`, `frontend/lib/quotes/`, `frontend/lib/api/quotes.js`,
  `frontend/lib/api/loginRedirect.js`, `frontend/app/(site)/b2b/quotes/` (relocated from `app/b2b/quotes/`) and inquiry entry/CSS.
- Behavioral contract and honest feature boundaries: `docs/catalog-rfq.md`.
- Frontend unit/browser cases: `frontend/tests/quotes.test.mjs`, `frontend/e2e/quotes.spec.js`
  and updated real-backend flow in `frontend/e2e/security.spec.js`.
- Python implementation/tests are executable behavior references for the Node service, not
  production dependencies to carry into the required architecture: `backend/app/commerce/quotes.py`,
  new migration, and `backend/tests/test_quote_requests.py`.
- CI job is a useful bounded browser-test blueprint, but its Python server setup must be replaced
  for the Node/Strapi backend. Do not publish it as proof that Node integration is ready.

## Contract to preserve or explicitly adapt

New strict endpoint: `POST /api/v1/quotes/catalog` with UUID `Idempotency-Key` and
`{comment, items:[{product_id,quantity}]}`. New UI uses original selected database IDs, not re-resolved
public keys. Verify Strapi's identifier conventions against this UUID transport assumption before
porting; preserve public catalogue keys and explicit product identity mappings.

The service validates active user/organization membership and permission, distinct published
products/published categories, positive bounded quantities and a bounded comment. It creates the
request, ordered items, server-owned product snapshots and audit atomically. A database uniqueness
constraint on organization/user/key and canonical payload hash provide concurrent deduplication and
409 conflicting reuse. Retry after a successful save must still work if a product is later hidden.

Own request list uses `GET /quotes?mine=true`; owner/current-tenant detail is `GET /quotes/{id}`.
List/detail survive refresh and relogin. Existing generic create and organization-wide summaries
were retained for compatibility in this checkpoint; explicitly decide legacy migration boundaries.
Snapshots are historical facts, not today's catalogue data. No manager delivery, CRM, stock,
reservation, order or payment guarantee is implied.

Strapi's administration role system alone must not be treated as the business tenant/membership
matrix. Port and verify authentication, ownership, organization switching, permissions, snapshots,
transactions, audit and persistence against the real Node/Strapi service and PostgreSQL.

## Verification at the architecture stop

The completed pre-interruption-fix snapshot passed 127 backend tests (2 PG-only skips), all 28 RFQ
cases on real PostgreSQL including concurrency, full Alembic upgrade/downgrade/upgrade consistency
and preservation of historical rows. Frontend passed lint, 128 units, production build, static
preview export and six production HTTP route smoke checks. These are **FastAPI-reference** results,
not evidence for a Node/Strapi implementation. See `catalog-rfq-validation.md` for detail.

Local browser assertions never ran because this runtime cannot start Chromium's required sockets.
Browser specifications and CI configuration exist; final hydrated browser behavior remains unverified.
Late frontend guard changes after those builds require revalidation before reuse.

## Outstanding account-switch review findings

1. Late RFQ success/error must not navigate or update UI after a newer route or account/scope.
   The original scoped receipt should still be persisted for later recovery.
2. RFQ writes must not automatically replay an old user's private payload under credentials of a
   newly logged-in user. The narrow checkpoint fix opts RFQ POST out of generic automatic retry
   and expires an unauthorized response only if its captured credentials still match.
3. The shared refresh flight also needs a context guard: a refresh started for A must not overwrite
   B's session, be shared with B's refresh or expire B on a stale failure.
4. AuthProvider's initial profile load must not replace a newer explicitly logged-in profile (or
   clear it on stale failure). A generation guard is a small compatible approach.

The final safe edit closed all four guards above in code. Final frontend lint and **132 unit tests**
passed, including new deterministic transport races in `frontend/tests/session-races.test.mjs`.
Three additional gated browser flows (six desktop/mobile cases) were authored for newer-navigation,
account-switch success and late unauthorized response. They did not run locally. The final guarded
frontend was not rebuilt after the architecture stop, and the AuthProvider generation guard has no
dedicated runtime test yet. These final guards need independent review, build and real browser
revalidation when reused in the Node/Strapi implementation.
