# Compact threat model

## Assets

Accounts and sessions; organization membership and permissions; orders, documents, files and
finance data; RFQs and support messages; integration credentials/state; audit records; AI
conversations, tool arguments and RAG context.

## Trust boundaries

- Browser ↔ backend API: all browser input, IDs, permissions and organization headers are untrusted.
- Backend ↔ PostgreSQL/storage: application authorization precedes reads; DB constraints preserve
  universal invariants and tenant-consistent document/file links.
- Backend ↔ ERP/CRM/EDO/logistics: provider payloads are untrusted, fallible and replayable.
- Backend ↔ AI provider: only minimal messages/context cross this boundary; model output has no
  authority.
- File/RAG ingestion ↔ retrieval: content is data, may be malicious, and is filtered by visibility
  before reaching a model.

## Principal threats and mitigations

| Threat | Mitigation |
|---|---|
| IDOR / cross-tenant leakage | Membership-derived tenant context, ID+organization predicates, 404 policy, composite document/file FK, REST/AI/E2E regressions |
| Privilege escalation | Generic permission dependencies, no role-name behavior, route inventory test, system-owned request fields forbidden |
| Token theft/replay | Argon2, short access lifetime, hashed refresh JTI, locked rotation, revoke/logout, one-time reset/invite tokens |
| Brute force / abuse | Per-purpose limiter interface, trusted-proxy parsing, bounded DEV state, configurable limits |
| Malicious files | Size/MIME/extension/signature checks, random keys, traversal protection, scanner boundary, production fail-closed config |
| External spoof/replay/failure | Provider interfaces, idempotency keys, attempt ledger, bounded exponential retry/dead state, reconciliation links |
| Secret/log leakage | Structured route-template logs, request IDs, safe 500, centralized recursive redaction, no payload logging |
| AI unauthorized tool call | Registry → permission gate → application service; no session supplied to tool; tenant predicates reused |
| AI WRITE manipulation | WRITE registration invariant plus one-time user/tenant/tool/argument-hash/TTL confirmation |
| Prompt injection | Retrieved content marked untrusted `data_only`; tenant filtering precedes model; backend authorization remains authoritative |
| XSS/token exposure | No unsafe HTML, React escaping, tokens limited to sessionStorage, security headers; production cookie topology remains a deployment gate |

Residual operational risks and required pre-production adapters are tracked in `tech-debt.md` and
client-owned decisions in `discovery-todos.md`.

