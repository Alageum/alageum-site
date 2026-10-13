# Acceptance Matrix

Центральный реестр проверяемых требований. Каждая строка должна ссылаться на утвержденное требование Final ТЗ и воспроизводимое доказательство.

| Requirement ID | Module | Scenario | Preconditions | Action | Expected Result | Acceptance Evidence | Criticality | Responsible JSJ | Responsible Client | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-001 | AUTH | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | Test/report/screenshot/log | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | DRAFT |
| RBAC-001 | RBAC | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | DRAFT |

## ID namespaces

`AUTH`, `RBAC`, `CAT`, `RFQ`, `ORDER`, `DOC`, `FIN`, `CRM`, `ERP`, `SERVICE`, `LOG`, `AI`, `SEC`, `PERF`.

## Rules

- Expected Result must be observable, not “works correctly”.
- Preconditions and test data are versioned.
- Negative access, integration failure and recovery scenarios are included.
- Any changed expected result goes through the Decision Log and, when scope changes, CR assessment.
- Security boundary failures cannot be waived as Minor without the authorized security decision owner.
