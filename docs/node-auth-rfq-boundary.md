# Node authentication and catalog RFQ boundary

This local migration implements a bounded Node domain behind the existing `/api/v1` contract. It uses Knex/PostgreSQL and independent `b2b` tables. It does not call the Python backend at runtime and does not expose generated Strapi CRUD for business-domain tables.

## Implemented

- Email/password login with Argon2 verification
- HS256 business access tokens with required UUID subject/JTI, issuer, audience, type and time claims
- Opaque, cryptographically random refresh tokens; only SHA-256 digests are persisted
- Atomic, row-locked refresh rotation; reused or revoked refresh tokens are rejected
- Logout revokes the presented live refresh session; repeated logout is harmless
- Active-user, active-membership, active-organization and role-organization checks
- Explicit organization selection when a user has multiple memberships
- `catalog.manage` can be conferred only by a global platform role, never a tenant role
- Current-user and organization-membership reads
- Catalog RFQ creation with server-owned ownership, tenant, status and public product snapshots
- Up to 100 unique products per request, quantities greater than zero fitting Decimal(18,3), at most three decimal places, and comments up to 4,000 characters
- Strict UUID `Idempotency-Key`: first success returns 201; same semantic payload returns 200 and the original quote; changed payload returns 409
- Per-tenant/per-owner idempotency, database unique constraints, cross-process transaction locking and one transactional audit per newly created quote
- Organization-scoped request summaries with an additive owner filter, owner-and-tenant-scoped detail, private/no-store responses and pagination

Product IDs in requests and responses remain UUIDs; internal Strapi numeric/document IDs are not business transport IDs. RFQ snapshots explicitly include only public catalog fields and survive subsequent product edits or removal. The catalog adapter must lock published products and visible categories within the same transaction as snapshot creation. An RFQ is an inquiry, not stock reservation, an order, a price commitment or confirmation of availability.

Request listing restores the frozen organization default: omitted `mine` or a false Boolean alias returns selected-organization summaries, including peer comments. `mine=true` returns the current owner's summaries. The customer UI explicitly uses that owner filter; detail and print access remain owner-and-tenant scoped. List/detail recheck current authority inside their read transaction without adding read audits. See [read-contract corrections and acceptance limits](node-legacy-read-compatibility.md).

## Local reset and migration boundary

The Node prototype starts with its own `b2b` schema. Existing Python users, memberships, refresh sessions, quote records and audit history are not automatically imported. The optional demo seed creates fresh deterministic Node test identities using the established demo account names. Before a real cutover, a reviewed import must preserve real user/organization/RFQ UUIDs and password hashes, reconcile role grants and catalog transport IDs, and validate record counts and ownership. Old Python access/refresh sessions must be invalidated and users must sign in again.

The Node refresh-token format intentionally differs from the legacy JWT refresh format. No existing browser session is assumed to survive this prototype reset. Logout revokes refresh access; an already-issued access token remains valid until its short expiry, subject to active-user/membership/organization checks on every authenticated request. A production BFF/cookie transport and production session policy remain separate work; the application configuration keeps the existing production-start guard.

Demo seeding requires `ALAGEUM_SEED_DEMO=1` and a development/test application environment. It never runs by default and is rejected outside those environments. Demo data is only a local test fixture.

## Not migrated by this slice

Invitation/password-reset flows, member-management writes, generic legacy quote creation, RFQ attachments, RFQ status transitions, manager responses, advanced support workflows, notifications, AI and integration workflows are not implemented here. Read-only orders, document metadata and invoice metadata have separate bounded Node slices. Their legacy code is a reference, not a runtime service or proof of complete Node feature parity. Real legacy RFQ import and historical timestamp precision remain unresolved.

## Verification

- `cd backend-node && node --test tests/auth-rfq.test.js`: strict validation, decimal canonicalization, duplicate detection, snapshot allowlisting, role boundaries, JWT claims and seed guard
- Dedicated PostgreSQL database only: `ALAGEUM_DOMAIN_TEST_DATABASE_URL=postgresql://.../alageum_strapi_domain_test node --test tests/auth-rfq.integration.js`
- The integration suite deliberately drops/recreates `b2b` only in that explicitly named database. Never point it at an application database
- Integration coverage includes active/tenant/role checks, simultaneous refresh reuse, logout, atomic RFQ persistence, same/different-body concurrency, transactional audit rollback, owner/tenant isolation, immutable retries and catalog row-lock lifetime
- Domain integration tests use a small PostgreSQL catalog fixture adapter. The Strapi-backed catalog adapter requires its own application integration coverage

The separately migrated [customer support boundary](node-support-tickets.md) covers only category lookup, organization-wide ticket summaries and creation with an initial message. It does not add manager or message-reading workflows.
