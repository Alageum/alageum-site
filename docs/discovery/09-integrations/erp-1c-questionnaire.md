# ERP / 1C Technical Questionnaire

## System and access — P0

1. Exact product name, version, configuration and customizations? `[NEEDS_CLIENT]`
2. Business owner, technical owner, current integrator/vendor and support SLA?
3. Available contracts: REST/OData/SOAP/DB/file exchange/message bus; existing integrations?
4. DEV/TEST/UAT environments, anonymized data, credentials approval, VPN/firewall/IP restrictions?
5. API/schema/error docs, request/response samples, rate limits, maintenance windows and change policy?

## Entity inventory

Для Customers, Legal entities, Products, Prices, Orders, Contracts, Invoices, Payments, Production,
Shipments, Documents, Serial numbers, Warranty заполнить:

| Entity | Read/Write | Master source | Stable external ID | Update/delta frequency | Expected volume/history | Endpoint/exchange | Required fields | Optional fields | Deletes/corrections | Owner | Sample received |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [NEEDS_CLIENT] | | | | | | | | | | | |

## Reliability

Ordering, duplicate/replay behavior, idempotency support, partial batches, timeout/unknown outcome,
reconciliation/export, schema versioning, monitoring and incident contact. ERP availability alone
не означает согласованный business meaning — каждый field/status подтверждается owner-ом.

