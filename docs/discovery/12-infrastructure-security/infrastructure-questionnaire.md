# Infrastructure questionnaire

## P0 — ownership and topology

| Question | Why needed | Evidence |
|---|---|---|
| [NEEDS_CLIENT] Кто владеет PROD и кто предоставляет доступы? | Deployment responsibility | Contact/RACI |
| [NEEDS_CLIENT] Cloud, on-premise or hybrid; какие ограничения размещения данных? | Target topology and compliance | Approved architecture constraints |
| [NEEDS_CLIENT] Какие DEV/TEST/UAT/STAGING/PROD среды обязательны? | Delivery and acceptance plan | Environment matrix |
| [NEEDS_CLIENT] Domain, DNS, TLS termination and reverse proxy chain? | Cookies, CORS, trusted proxy, certificates | Network diagram |
| [NEEDS_CLIENT] Разрешены ли Linux, Docker и orchestration; Kubernetes обязателен или запрещен? | Deployment packaging | Platform standard |

## Network and runtime

- [NEEDS_CLIENT] Inbound/outbound Internet, firewall, WAF, VPN and allowlists?
- [NEEDS_CLIENT] Private connectivity to ERP/CRM/EDO/logistics and DNS rules?
- [NEEDS_CLIENT] Compute sizing process, autoscaling policy and maintenance windows?
- [NEEDS_CLIENT] Managed PostgreSQL or self-hosted; supported version and HA expectations?
- [NEEDS_CLIENT] Redis/message broker available or prohibited?
- [NEEDS_CLIENT] Object/file storage, encryption, lifecycle and signed URL capability?
- [NEEDS_CLIENT] SMTP/SMS/WhatsApp gateways and test environments?

## Operations

- [NEEDS_CLIENT] CI/CD platform, runner placement and approval gates?
- [NEEDS_CLIENT] Secrets manager and rotation process?
- [NEEDS_CLIENT] Backup destination, encryption, retention and restore owner?
- [NEEDS_CLIENT] Logs, metrics, traces, alerting, SIEM and on-call ownership?
- [NEEDS_CLIENT] Access approval, privileged access and break-glass process?

Результат: approved topology constraints, environment/network/access matrices и решения для `docs/deployment.md`. Текущий Docker Compose — DEV baseline, не предположение о PROD.
