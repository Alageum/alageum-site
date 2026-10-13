# Test/anonymized sample data request

## Safety rules

- Prefer synthetic or anonymized real-like data; do not send production credentials or unnecessary personal data.
- Preserve formats, identifier relationships, nulls, duplicates and edge cases needed to understand the source.
- Supply through the approved secure channel with owner, extraction date, system/version and field description.
- Mark confidentiality and permitted use/retention for every package.

## Initial package

| ID | Requested sample | Quantity | Why needed | Required relationships/edge cases | Priority |
|---|---|---:|---|---|---|
| SAMPLE-001 | Corporate clients/legal entities | 1–3 | Validate organization identity and source IDs | Group with multiple legal entities if applicable | P0/P1 |
| SAMPLE-002 | Products from different families | 5–10 | Validate generic catalog model | Variant, attributes, units, locales, media/docs | P1 |
| SAMPLE-003 | Orders | 2–5 | Order mapping and tenant visibility | Items, currency/amount, status history, external IDs | P1 |
| SAMPLE-004 | Contract/specification/commercial offer | 1–3 each where applicable | Document types/version/access | Versions and order/company relation | P1 |
| SAMPLE-005 | Invoice/payment data | 2–5 | Finance ownership/freshness | Partial/prepayment/debt only if real process has them | P1 |
| SAMPLE-006 | Production status history | 2–5 orders | External-to-customer mapping | Repeated/out-of-order/corrected events if possible | P1 |
| SAMPLE-007 | Shipment | 1–3 | Logistics fields/privacy | Composition, carrier/ETA identifiers | P1 |
| SAMPLE-008 | Passport/certificate/warranty document | 1–3 each | Equipment/document linking | Serial number and version where applicable | P1 |
| SAMPLE-009 | Complaint/service case | 1–3 | Intake/status/attachment discovery | Invalid warranty or duplicate case if available | P1 |
| SAMPLE-010 | ERP/CRM API payloads | Happy + error/partial examples | Adapter and validation design | Missing optional field, duplicate, stale/update case | P0/P1 |

## Accompanying manifest

| File/dataset | Source system/version | Extracted at | Owner | Format/encoding | Primary/external IDs | Anonymization method | Classification | Retention/use permission |
|---|---|---|---|---|---|---|---|---|
| [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] |

Do not normalize away poor data quality before sharing a representative test set; quality issues must be visible for migration/reconciliation planning.
