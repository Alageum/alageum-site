# Security questionnaire and requirement matrix

## Governance questionnaire

- [NEEDS_CLIENT] Кто принимает security architecture и кто принимает residual risk?
- [NEEDS_CLIENT] Какие политики/стандарты/законы/договорные требования применимы?
- [NEEDS_CLIENT] SSO, AD/LDAP, MFA, password policy и lifecycle учетных записей?
- [NEEDS_CLIENT] VPN, IP restrictions, WAF, DLP, SIEM/SOC и pentest requirements?
- [NEEDS_CLIENT] Encryption at rest/in transit и customer-managed keys?
- [NEEDS_CLIENT] Antivirus/file scanning provider и правила quarantine?
- [NEEDS_CLIENT] Audit, business data, documents, backups and AI history retention?
- [NEEDS_CLIENT] Incident notification channel, SLA and required evidence?
- [NEEDS_CLIENT] Third-party processor and external AI approval policy?
- [NEEDS_CLIENT] Personal data categories, residency, consent, subject requests and deletion constraints?

## Security Requirement Matrix

| ID | Area | Requirement | Source/policy | Environment | Evidence | Owner | Priority | Status |
|---|---|---|---|---|---|---|---|---|
| SEC-REQ-001 | Identity | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P0/P1 | OPEN |
| SEC-REQ-002 | Network | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P0/P1 | OPEN |
| SEC-REQ-003 | Data protection | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P0/P1 | OPEN |
| SEC-REQ-004 | Logging/audit | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1/P2 | OPEN |
| SEC-REQ-005 | AI/provider | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P0/P1 | OPEN |

## Architecture mapping

Существующие tenant isolation, generic RBAC, audit redaction, secure files и AI permission gate являются baseline controls. Discovery подтверждает требования и acceptance evidence, но не ослабляет эти границы устным решением.
