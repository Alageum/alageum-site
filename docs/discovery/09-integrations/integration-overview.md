# Integration Discovery Overview

Каждая реальная связь получает отдельный [Integration Passport](integration-passport-template.md)
и строки в [Data Source Matrix](../10-data/data-source-matrix-template.md). Questionnaire фиксирует
facts; passport фиксирует согласованный contract.

## Required sequence

1. Identify business owner, system owner, integrator and environments.
2. Confirm source of truth and read/write direction per entity/attribute.
3. Obtain docs plus anonymized request/response/error samples.
4. Validate authentication/network/access process.
5. Agree stable IDs, ordering, duplicate/replay/conflict semantics.
6. Agree timeout/retry/idempotency/reconciliation and monitoring ownership.
7. Define acceptance in sandbox/UAT with evidence.

Existing provider boundaries do not require Alageum to adopt internal implementation; they prevent
unknown external contracts from changing platform domain/security boundaries.

