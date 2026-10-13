# Discovery TODOs

Nothing below may be inferred from synthetic seed data. Every item is `[NEEDS_CLIENT]`.

## Identity / SSO

- **Question:** Which SSO/AD/OAuth, MFA, password, invitation and account lifecycle policies apply?
- **Why needed:** identity assurance and session lifetime are governance decisions.
- **Affected modules:** auth, users, audit, frontend session UX.
- **Current safe default:** local Argon2 credentials, rotating short access/refresh lifecycle, mock invitation/reset.
- **Risk if unresolved:** enterprise identity and production login cannot be enabled.

## Organizations / Roles

- **Question:** What is the legal organization hierarchy, multi-membership rule, final permission matrix, delegated administration and approval authority?
- **Why needed:** seed roles are deliberately non-authoritative.
- **Affected modules:** organizations, memberships, RBAC, every B2B endpoint.
- **Current safe default:** flat demo tenants and generic permission checks.
- **Risk if unresolved:** only synthetic roles may be used.

## Catalog

- **Question:** What are product taxonomy, identifiers, attributes, units, locales, configurator constraints, price/discount/tax/availability sources and publishing workflow?
- **Why needed:** these are client product and commercial rules.
- **Affected modules:** catalog, content, RFQ, ERP adapter, frontend.
- **Current safe default:** generic attribute-value catalog with one fictional product and no pricing logic.
- **Risk if unresolved:** real catalog import/configuration remains blocked.

## ERP / 1C and Production

- **Question:** Which ERP/1C version/protocol/schemas/IDs/delta rules are used; what are authoritative order and production statuses and transitions?
- **Why needed:** provider contracts and status mappings require real payloads and ownership.
- **Affected modules:** orders, finance, documents, integrations, reconciliation.
- **Current safe default:** adversarial MockERPProvider, generic mock status mapping, bounded jobs.
- **Risk if unresolved:** real ERP adapter and production tracking remain disabled.

## CRM

- **Question:** Which Bitrix24/CRM APIs, fields, routing, ownership and idempotency rules apply to RFQ/leads/support?
- **Why needed:** field mapping and duplicate side effects cannot be guessed.
- **Affected modules:** RFQ, support, CRM provider, integration jobs.
- **Current safe default:** MockCRMProvider with synthetic identifiers.
- **Risk if unresolved:** CRM writes remain mock-only.

## Documents / EDO

- **Question:** What are document taxonomy/access/versioning/retention/watermark rules, EDO provider and legally significant signing workflow?
- **Why needed:** legal document behavior requires approved policy and provider contracts.
- **Affected modules:** files, documents, EDO, audit, storage.
- **Current safe default:** tenant-scoped generic documents, versions and MockEDOProvider.
- **Risk if unresolved:** legal signing and production retention cannot be enabled.

## Finance

- **Question:** Which system owns invoices/payments/schedules; what reconciliation, currency/tax and visibility semantics apply?
- **Why needed:** accounting truth and calculation rules are external/client-owned.
- **Affected modules:** finance, orders, ERP, reconciliation.
- **Current safe default:** read-oriented generic mock records with source/external IDs.
- **Risk if unresolved:** no real financial decisions or calculations may run.

## Logistics

- **Question:** Which carrier/provider, shipment IDs, tracking states, webhook/replay and visibility rules apply?
- **Why needed:** provider contracts and customer-visible state are unknown.
- **Affected modules:** logistics adapter, orders, notifications.
- **Current safe default:** MockLogisticsProvider only.
- **Risk if unresolved:** real shipment tracking remains disabled.

## Infrastructure

- **Question:** What hosting, network zones, domains/TLS, trusted proxy/CDN chain, storage, secret manager, Redis/job runner, backup destination, RPO/RTO, DR, monitoring and incident ownership are required?
- **Why needed:** production security and recovery configuration depends on the target environment.
- **Affected modules:** deployment, auth transport, rate limits, jobs, files, observability, backups.
- **Current safe default:** pinned Compose DEV, local storage, memory adapters, local PostgreSQL dumps.
- **Risk if unresolved:** production guards intentionally prevent go-live.

## Security

- **Question:** Is frontend/backend same-site; is BFF or Secure HttpOnly refresh cookie allowed; what CSRF/CORS/CSP, malware/DLP scanner, penetration-test and key-rotation policies apply?
- **Why needed:** cookie SameSite/domain/origin controls and scanner failure policy depend on topology/governance.
- **Affected modules:** auth transport, frontend client, ingress, files, rate limiter.
- **Current safe default:** isolated per-tab sessionStorage transport, strict CORS, DEV no-op scanner, trusted forwarded headers disabled.
- **Risk if unresolved:** browser auth and uploads are not approved for production.

## AI

- **Question:** Which AI/embedding providers, regions/DPAs, allowed/prohibited tools, confirmation/second-approver rules, budgets, retention and evaluation/red-team criteria apply?
- **Why needed:** these are security, legal and operational decisions.
- **Affected modules:** AI provider/chat/tools/confirmations/RAG/audit.
- **Current safe default:** MockAI, public+own-tenant retrieval, every WRITE one-time confirmed.
- **Risk if unresolved:** production AI and consequential tools remain disabled.

## Data retention

- **Question:** What classification, residency, privacy, deletion, audit/document/chat retention and export obligations apply?
- **Why needed:** storage and deletion cannot be safely inferred.
- **Affected modules:** all persistence, audit, documents, AI/RAG, backups.
- **Current safe default:** synthetic data only; no automatic destructive retention jobs.
- **Risk if unresolved:** production personal/confidential data must not be loaded.

## Performance

- **Question:** What are expected users/tenants, catalog/order/document volumes, upload sizes, request rates, integration windows, AI usage, latency SLOs and growth?
- **Why needed:** production page/payload/rate/job/DB sizing requires measured targets.
- **Affected modules:** pagination, uploads, AI, PostgreSQL indexes, workers, infrastructure.
- **Current safe default:** configurable bounded DEV limits and query-count regression baseline.
- **Risk if unresolved:** capacity and cost commitments cannot be made.

## Content

- **Question:** What public information architecture, editorial workflow, translations, SEO/media rights and content sources apply?
- **Why needed:** content is owned by the client and design team.
- **Affected modules:** CMS/content, localization, public frontend.
- **Current safe default:** generic draft/publish/localized content models without real copy.
- **Risk if unresolved:** production content publication remains blocked.

## Design

- **Question:** What approved brand system, accessibility target, navigation, responsive behavior and final UX flows apply?
- **Why needed:** the current shell is intentionally neutral.
- **Affected modules:** Next.js public/B2B/AI interfaces.
- **Current safe default:** functional accessible generic states and forms.
- **Risk if unresolved:** frontend remains a technical shell, not final UI.
