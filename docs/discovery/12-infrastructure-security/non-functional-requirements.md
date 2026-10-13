# Non-functional requirements worksheet

Не использовать предполагаемые цифры. Baseline limits платформы конфигурируемы и должны быть подтверждены нагрузочными данными.

## Workload

| Metric | Current | Year 1 | Peak | Evidence/source | Priority |
|---|---:|---:|---:|---|---|
| B2B organizations | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| Users / concurrent users | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| Products / attributes | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| Orders/year | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| Documents and average/max file | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| API requests/day | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| Integration events/day | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |
| AI requests/day and max input | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | P1 |

## Service objectives

| NFR | Target | Measurement window/method | Exclusions | Owner | Acceptance evidence |
|---|---|---|---|---|---|
| Availability | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] |
| API/page performance | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] |
| Maintenance window | [NEEDS_CLIENT] | [NEEDS_CLIENT] | — | [NEEDS_CLIENT] | Calendar/process |
| RPO | [NEEDS_CLIENT] | Restore drill | [NEEDS_CLIENT] | [NEEDS_CLIENT] | Restore report |
| RTO | [NEEDS_CLIENT] | Recovery drill | [NEEDS_CLIENT] | [NEEDS_CLIENT] | Recovery report |
| Retention | [NEEDS_CLIENT] | Policy review | [NEEDS_CLIENT] | [NEEDS_CLIENT] | Approved matrix |
| Accessibility/browser/device | [NEEDS_CLIENT] | Test matrix | [NEEDS_CLIENT] | [NEEDS_CLIENT] | Test report |

Также определить локали, time zones, search response expectations, batch windows, provider degradation behavior и допустимую eventual consistency.
