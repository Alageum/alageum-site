# Data ownership classification

| Class | Current examples | Authority / rule |
|---|---|---|
| Platform-owned | users, memberships, sessions, confirmations, tickets created in portal | Platform database; tenant and RBAC protected |
| External-system-owned | future ERP orders/invoices/payments, CRM lead IDs, EDO signature state | Provider remains authority; exact ownership **NEEDS_CLIENT** |
| Cached external data | mock orders, finance rows, external document metadata | Store source/external ID, sync state and reconciliation link |
| Derived data | comparison output, RAG chunks/embeddings, sync checksum | Rebuildable where source remains available; retention **NEEDS_CLIENT** |
| Audit data | security and critical action events | Append-oriented, redacted; retention/access/export **NEEDS_CLIENT** |
| AI/RAG data | conversations, messages, tool calls, public/private knowledge chunks | User+tenant scoped; provider retention and deletion **NEEDS_CLIENT** |
| File bytes | local DEV storage; future object storage | Metadata in PostgreSQL, bytes in storage provider; backup ownership **NEEDS_CLIENT** |

Provider DTOs never become platform truth implicitly. Real adapters must document source of truth,
conflict behavior and deletion propagation before enabling writes.

