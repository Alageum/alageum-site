# Master Material Request Register

Запрашивать минимально необходимые, предпочтительно тестовые/обезличенные материалы через согласованный защищенный канал. Получение не означает пригодность: Validation Status фиксируется отдельно.

| ID | Type | Item | Description | Preferred format | Owner | Priority | Required before | Received | Validation Status |
|---|---|---|---|---|---|---|---|---|---|
| MAT-001 | Governance | Current scope/contract inputs | Goals, exclusions, commitments and dependencies | PDF/DOCX | [NEEDS_CLIENT] | P0 | Kickoff | No | NOT REVIEWED |
| MAT-002 | Brand | Brandbook and logo kit | Current approved rules, SVG/AI logos, fonts and license evidence | PDF/SVG/AI/OTF + licenses | [NEEDS_CLIENT] | P1 | Design workshop | No | NOT REVIEWED |
| MAT-003 | Content | Corporate content inventory | Company, factory, projects, contacts, careers, social/investor materials | XLSX/DOCX + archive | [NEEDS_CLIENT] | P1 | Design/content scope | No | NOT REVIEWED |
| MAT-004 | Media | Approved photo/video/3D archive | Rights, owner, locale and intended use | Original files + manifest | [NEEDS_CLIENT] | P1 | Design prototypes | No | NOT REVIEWED |
| MAT-005 | Catalog | Product taxonomy/export | Categories, products, attributes, units, locales, documents/media | XLSX/CSV/JSON + schema | [NEEDS_CLIENT] | P0/P1 | Catalog workshop | No | NOT REVIEWED |
| MAT-006 | Catalog | 5–10 varied product examples | Different families/variants, not one homogeneous sample | Anonymized export/files | [NEEDS_CLIENT] | P1 | Catalog modeling | No | NOT REVIEWED |
| MAT-007 | ERP | System/version/configuration documentation | Interfaces, customization, owners/vendor, auth and sandbox | Official docs/diagram | [NEEDS_CLIENT] | P0 | ERP workshop | No | NOT REVIEWED |
| MAT-008 | ERP | Entity/API samples | Customers, products, orders, invoices, payments, status, documents, shipment | OpenAPI/WSDL/JSON/XML/CSV | [NEEDS_CLIENT] | P0/P1 | Integration passport | No | NOT REVIEWED |
| MAT-009 | CRM | Bitrix24 configuration samples | Objects, custom fields, statuses, forms, automation and deduplication | Export/screens/docs/API | [NEEDS_CLIENT] | P1 | CRM workshop | No | NOT REVIEWED |
| MAT-010 | Documents | Document set and register | Type, source, audience, format, size, retention, confidentiality | Anonymized files + XLSX | [NEEDS_CLIENT] | P1 | Documents workshop | No | NOT REVIEWED |
| MAT-011 | Finance | Finance display samples | Invoice, payment, debt/schedule, acts and visibility rules | Anonymized JSON/XLSX/PDF | [NEEDS_CLIENT] | P1 | Finance workshop | No | NOT REVIEWED |
| MAT-012 | Production | Actual stage/status export | Internal codes, timestamps, source and examples | XLSX/CSV/API sample | [NEEDS_CLIENT] | P0/P1 | Production workshop | No | NOT REVIEWED |
| MAT-013 | Logistics | Shipment/tracking examples | Composition, carrier, ETA and privacy fields | Anonymized export/docs | [NEEDS_CLIENT] | P1 | Logistics workshop | No | NOT REVIEWED |
| MAT-014 | Service | Warranty/complaint/service samples | Intake, identifiers, status, SLA, documents | Anonymized cases/regulation | [NEEDS_CLIENT] | P1 | Service workshop | No | NOT REVIEWED |
| MAT-015 | EDO | Provider/API/legal process | Contract status, sandbox, signature flow, callbacks/archive | Official provider docs | [NEEDS_CLIENT] | P1 | EDO decision | No | NOT REVIEWED |
| MAT-016 | Infrastructure | Topology/network/environment standards | Domains, proxy, firewall/VPN, storage, database, CI/CD | Diagram/policy | [NEEDS_CLIENT] | P0 | Infra workshop | No | NOT REVIEWED |
| MAT-017 | Security | Applicable policies and requirements | Identity, retention, scanning, audit, incident, AI/provider policy | Approved policies | [NEEDS_CLIENT] | P0/P1 | Security workshop | No | NOT REVIEWED |
| MAT-018 | AI knowledge | Candidate source inventory | Owner, classification, format, update and external-AI permission | Register + samples | [NEEDS_CLIENT] | P1 | AI workshop | No | NOT REVIEWED |
| MAT-019 | NFR | Workload and service evidence | Users/products/orders/files/events/AI, SLO, RPO/RTO | Metrics/reports/table | [NEEDS_CLIENT] | P1 | Architecture freeze | No | NOT REVIEWED |

## Validation

Validate origin/version, completeness, encoding, identifiers, relations, confidentiality classification, malware handling and permission to use. Record rejected/replaced artifacts without deleting audit history.
