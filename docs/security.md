# Security baseline

- Argon2 password hashing; short-lived access tokens; rotating, revocable refresh sessions.
- Membership-based organization context and permission checks on protected actions.
- Tenant-constrained object lookup for orders, documents, files, finance, quotes, tickets, AI conversations/tools, and RAG metadata.
- Request IDs, safe structured audit events, CORS allowlist, and baseline security headers.
- Upload size/type allowlist, generated storage keys, sanitized display filenames, checksums, and traversal-safe local paths.
- SQLAlchemy parameter binding and explicit Pydantic input/output schemas.
- AI tools declare READ/WRITE, require normal backend permissions, and every WRITE tool requires a scoped, expiring, one-time confirmation.
- Retrieved knowledge is marked untrusted data and must never be promoted to system instructions.

Production configuration rejects placeholder secrets, SQLite, debug mode, memory rate limiting,
wildcard credentialed CORS, the no-op file scanner, and the current JS-readable browser refresh
transport. PostgreSQL backup/restore is tested for Compose. Before go-live the approved topology
must supply secret management, TLS/proxy policy, CSP/HSTS at the edge, HttpOnly cookie/BFF plus
matching CSRF design, malware scanning, distributed rate limiting/metrics, key rotation, file-store
backup, monitoring, penetration testing and retention/privacy policies.
