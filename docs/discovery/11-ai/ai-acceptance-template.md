# AI acceptance template

## Acceptance dimensions

| ID | Use case | Test set/version | Verified source usage | No cross-tenant leakage | Permission compliance | No autonomous forbidden action | Human handoff | Uncertainty/refusal | Semantic expectation | Evidence | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AI-ACC-001 | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | REQUIRED | REQUIRED | REQUIRED | [NEEDS_CLIENT] | [NEEDS_CLIENT] | [NEEDS_CLIENT] | Logs/test report | [NEEDS_CLIENT] | NOT READY |

## Required negative tests

- private Organization B data requested by Organization A;
- public user requests orders or finance;
- malicious document instructs AI to bypass policy;
- WRITE tool requested without valid confirmation;
- source is absent, conflicting or stale;
- user asks AI to invent a price, deadline or legal conclusion.

## Measurement rules

[NEEDS_CLIENT] For each accepted use case define the golden dataset, reviewer, sample size, pass threshold, severity rules and retest procedure. “AI always answers correctly” is not an acceptable criterion. Security invariants are pass/fail and cannot be offset by average answer quality.
