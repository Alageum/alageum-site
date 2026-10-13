# Production readiness questionnaire

| Area | [NEEDS_CLIENT] decision/evidence | Priority | Owner | Status |
|---|---|---|---|---|
| Environments | PROD/UAT topology and promotion path | P0 | [NEEDS_CLIENT] | OPEN |
| Ownership | Service owner, deployment owner, DBA, security and on-call | P0 | [NEEDS_CLIENT] | OPEN |
| Network | DNS/TLS/proxy/firewall/VPN/outbound rules | P0 | [NEEDS_CLIENT] | OPEN |
| Secrets | Store, provisioning, rotation and emergency revocation | P0 | [NEEDS_CLIENT] | OPEN |
| Database | Service/version/HA/capacity/maintenance | P1 | [NEEDS_CLIENT] | OPEN |
| Storage | Object/file store, scanner, encryption, lifecycle | P1 | [NEEDS_CLIENT] | OPEN |
| Backup | RPO/RTO, destination, retention, restore drill | P1 | [NEEDS_CLIENT] | OPEN |
| Observability | Logs/metrics/traces/alerts/SIEM retention | P1 | [NEEDS_CLIENT] | OPEN |
| Operations | Incident, change, rollback, maintenance and escalation | P1 | [NEEDS_CLIENT] | OPEN |
| Integrations | Network, credentials, sandbox and provider support | P1 | [NEEDS_CLIENT] | OPEN |
| Capacity | Approved workload assumptions and limits | P1 | [NEEDS_CLIENT] | OPEN |
| Acceptance | Production readiness review authority and evidence | P1 | [NEEDS_CLIENT] | OPEN |

## Go-live evidence

[NEEDS_CLIENT] Define mandatory security approval, UAT sign-off, migration rehearsal, restore test, monitoring test, rollback rehearsal, support rota, external-system readiness and business go/no-go authority.
