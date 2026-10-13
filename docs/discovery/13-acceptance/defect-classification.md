# Defect classification working template

Юридические/договорные определения имеют приоритет и должны быть подтверждены Заказчиком.

| Severity | Working definition | Examples | Release implication | Response/resolve target |
|---|---|---|---|---|
| Critical | Core service unavailable, unrecoverable corruption, cross-tenant/security breach, or no workaround for a critical process | Login impossible for all; foreign documents exposed | Blocks acceptance/go-live unless formally governed otherwise | [NEEDS_CLIENT] |
| Major | Material requirement fails or degrades a key process; workaround is costly/risky | Approved role cannot complete RFQ; ERP sync consistently fails | Normally blocks affected scope acceptance | [NEEDS_CLIENT] |
| Minor | Limited issue with safe workaround and no material security/data impact | Cosmetic/layout or non-critical validation discrepancy | May be deferred by authorized decision | [NEEDS_CLIENT] |

For every defect record environment/build, requirement ID, steps, expected/actual, evidence, data impact, security impact, owner, target release and retest result. Priority is a planning decision distinct from severity.
