# Security test matrix

This matrix maps security boundaries to executable regressions. `PASS` means the test is in the
default backend or E2E suite; it does not replace a production penetration test.

| ID | Threat / invariant | Expected behavior | Automated test | Test file | Status |
|---|---|---|---|---|---|
| AUTH-001 | Refresh replay | Rotated token cannot be reused | `test_refresh_token_rotation_rejects_replay` | `backend/tests/test_auth_hardening.py` | PASS |
| AUTH-002 | Logout replay | Logged-out refresh token is invalid | `test_logout_revokes_refresh_token` | `backend/tests/test_auth_hardening.py` | PASS |
| AUTH-003 | Reset replay | Reset token is single-use | `test_password_reset_token_is_single_use` | `backend/tests/test_auth_hardening.py` | PASS |
| AUTH-004 | Invitation replay/expiry | Invitation is single-use and expires | invitation hardening tests | `backend/tests/test_auth_hardening.py` | PASS |
| AUTH-005 | Disabled principal | Disabled user or membership is denied | disabled user/membership tests | `backend/tests/test_auth_hardening.py` | PASS |
| TENANT-001 | Foreign order / finance | Lists and detail never expose tenant B | tenant matrix and order tests | `backend/tests/test_tenant_matrix.py`, `test_auth_and_tenants.py` | PASS |
| TENANT-002 | Foreign document/file | List, metadata and bytes are hidden | document/file isolation tests | `backend/tests/test_domain_workflows.py`, `test_auth_and_tenants.py` | PASS |
| TENANT-003 | Cross-tenant document link | DB rejects version→foreign file | `test_document_version_cannot_reference_file_from_another_tenant` | `backend/tests/test_database_constraints.py` | PASS |
| TENANT-004 | Foreign quote/ticket | Tenant lists exclude foreign aggregates | `test_all_tenant_lists_exclude_foreign_entities` | `backend/tests/test_tenant_matrix.py` | PASS |
| RBAC-001 | Missing permission | Backend returns 403 | `test_rbac_denies_missing_permission` | `backend/tests/test_auth_and_tenants.py` | PASS |
| RBAC-002 | Unprotected new route | Route inventory fails without auth/tenant/permission markers | route inventory tests | `backend/tests/test_route_security.py` | PASS |
| MASS-001 | Organization mass assignment | Extra system-owned field returns 422 | tenant/mass-assignment test | `backend/tests/test_tenant_matrix.py` | PASS |
| FILE-001 | Traversal/header injection | Random key, normalized filename, safe disposition | file security tests | `backend/tests/test_file_security.py` | PASS |
| FILE-002 | MIME/extension/signature/size | Mismatch or oversize is rejected | upload validation tests | `backend/tests/test_file_security.py` | PASS |
| RATE-001 | Abuse and key growth | Policy returns 429 and cache is bounded | limiter tests | `backend/tests/test_rate_limit_and_redaction.py` | PASS |
| RATE-002 | Spoofed X-Forwarded-For | Header ignored unless peer is trusted | proxy trust test | `backend/tests/test_rate_limit_and_redaction.py` | PASS |
| AUDIT-001 | Secret persistence | Nested sensitive fields are redacted | redaction test | `backend/tests/test_rate_limit_and_redaction.py` | PASS |
| API-001 | Internal exception disclosure | Client receives safe correlated 500 | internal error test | `backend/tests/test_system.py` | PASS |
| DB-001 | Universal invariants | Uniqueness/check constraints reject invalid writes | DB constraint tests | `backend/tests/test_database_constraints.py` | PASS |
| INT-001 | Duplicate external action | Enqueue and terminal execution are idempotent | job idempotency test | `backend/tests/test_integrations.py` | PASS |
| INT-002 | Provider timeout | Retry is bounded and ends dead | retry test | `backend/tests/test_integrations.py` | PASS |
| INT-003 | Reconciliation | Provider/external mapping upserts once | reconciliation test | `backend/tests/test_integrations.py` | PASS |
| AI-001 | Cross-tenant order/document/conversation | Normal application authorization returns 404/401 | AI isolation tests | `backend/tests/test_ai_security.py` | PASS |
| AI-002 | WRITE without confirmation | Returns 409 and no action occurs | confirmation test | `backend/tests/test_ai_security.py` | PASS |
| AI-003 | Confirmation theft/replay/tamper | Scoped hash, TTL and one-time consume deny use | confirmation matrix tests | `backend/tests/test_ai_security.py` | PASS |
| AI-004 | Indirect prompt injection | Chunk remains `data_only`; permissions are unchanged | malicious RAG test | `backend/tests/test_rag.py` | PASS |
| RAG-001 | Private retrieval leakage | Retrieval returns public + own tenant before model | RAG visibility test | `backend/tests/test_rag.py` | PASS |
| SEED-001 | DEV data in production | Seed refuses production | seed guard test | `backend/tests/test_system.py` | PASS |
| E2E-001 | Browser/API security journey | Login, IDOR, RFQ, ticket, AI and reauth flows | Playwright suite | `frontend/e2e/security.spec.js` | PASS |
| OPS-001 | Liveness/readiness coupling | Liveness is process-only; readiness checks DB | operational endpoints test | `backend/tests/test_operational.py` | PASS |
| OPS-002 | Process dies during job | Expired running lease returns to bounded retry | recovery test | `backend/tests/test_operational.py` | PASS |
| OPS-003 | Backup corruption/data loss | Archive is validated; restored seed passes smoke | CI/manual restore scenario | `scripts/backup.sh`, `scripts/restore.sh` | PASS |
| PERF-001 | N+1 regression | Primary list query counts remain bounded | query baseline test | `backend/tests/test_operational.py` | PASS |
| PAYLOAD-001 | Oversized body | Rejected with correlated 413 before parsing | request limit test | `backend/tests/test_system.py` | PASS |

## Catalogue RFQ increment

- RFQ-001: current-user/current-organization list and detail isolation, foreign IDs and missing
  permissions: `backend/tests/test_quote_requests.py`
- RFQ-002: server-owned immutable snapshots; forged fields, duplicate/unknown/hidden/draft products,
  unpublished categories and invalid quantities reject the whole request: same backend test file
- RFQ-003: concurrent repeated submissions produce one request and one audit event; reused key with
  different content conflicts; failed transaction leaves no partial data: same test file, explicit
  PostgreSQL CI pass (the two concurrency cases skip on default SQLite)
- RFQ-004: login interruption, expired session, unknown network outcome, refresh/back/forward,
  account scope, storage failure and mobile/keyboard cases: `frontend/e2e/quotes.spec.js`; corrupt
  drafts and retry state also have pure unit coverage in `frontend/tests/quotes.test.mjs`
- RFQ-005: actual authenticated live catalogue → persisted RFQ → reload detail in the existing
  real-backend browser security journey: `frontend/e2e/security.spec.js`

Browser assertions run under `.github/workflows/catalog-rfq.yml` with bounded dependency, browser
installation, server readiness and test deadlines. Presence here is a coverage mapping; consult
[catalogue RFQ validation](catalog-rfq-validation.md) for which checks actually ran.

## Node organization member reads

See [the bounded member contract](node-organization-members.md) for the exact
GET-only scope. The dedicated runner covers selected-tenant isolation, exact
manage-users authorization, private headers, no CMS identity crossover, fresh
and held caller authority locks, legacy pagination and inactive/global target
parity. Cross-tenant target roles and missing/malformed relationship projections
fail the affected page generically without identity/foreign-label disclosure.
Every read path preserves identity, session, audit and business rows; no schema
repair, role grants or writes are introduced. The fixture browser suite checks
permission-gated navigation, strict DTO errors, history/paging, stale tenant and
session responses, canceled selection, and escaped mobile/desktop presentation.
Functional checks do not clear the existing blocked dependency security gate.
