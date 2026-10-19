# Current-source CI evidence (2026-10-14)

## Historical references remain historical

The initial independent Git transfer at `53f4ec681babcdd0f468059cdb93cfcfde294fa3` intentionally sanitized inactive legacy default credentials. `README_HANDOFF.md` documents that change and says the original Git history was not transferred. Consequently `backend/app/core/config.py` is not byte-identical to the old reference snapshot. Restoring credentials or changing an old approval hash would be incorrect.

The following files remain byte-for-byte unchanged:

- `backend-node/tests/reference/legacy-query.json`
- `backend-node/tests/reference/legacy-quote-limit.json`
- Their two `generate_legacy_*.py` generators

`current-legacy-reference.json` is **new current-source execution evidence, not historical approval**. It records the transferred base, inspected feature revision, current source hashes and original archive hashes. Only the documented config file differs from the historical source maps; all other referenced source bytes must still match. The verifier fails on any further drift.

`verify_current_legacy.py` runs each unchanged generator in a separate process, using the separately pinned current source map for this new execution. The generators still enforce their original Python/runtime and source checks. Every non-provenance output is compared to the original fixture, not merely a subset or a new expected count:

- 185 real FastAPI/Starlette/Pydantic query vectors
- 12 standard-library throttle scenarios and 9 client-address vectors

All outputs matched on 2026-10-14 with Python 3.12.14 and the five pinned query packages. These are query/AST contracts, not full legacy endpoint, production deployment, authentication or database proofs. CI re-executes them from `backend/requirements-dev.lock`. Existing Node contract assertions consume the unchanged original vectors and verify current-source plus archive provenance. The historical generators remain available and will still refuse the sanitized checkout if invoked as an old-snapshot proof.

Run:

```sh
python backend-node/tests/reference/verify_current_legacy.py --check
node --test backend-node/tests/legacy-query.test.js backend-node/tests/quote-rate-limit.test.js backend-node/tests/current-legacy-reference.test.js
```

## Read-only system inventory

The system runner previously asserted a fixed 62-table report, although later migrations legitimately added tables. Replacing that number with another number would not prove coverage.

The current fingerprint instead cross-checks all base tables from `information_schema` against `pg_catalog`, captures every table's rows and column metadata and all schema constraints, and hashes the complete inventory together with that content. It explicitly requires identity, tenant, grants, sessions, registration, audit, rate-limit, commerce, support, document and native CMS tables. Counts are derived from the sorted qualified names. Missing tables, duplicate names, foreign schemas, partial row/column coverage and corrupted evidence fail. Fully included future migration tables are supported without concealing them.

The live proof still compares the entire before/after fingerprint around all system reads, including outage/recovery. No rate-limit table, account data or constraint is excluded. This changes only test evidence and workflow acceptance, not runtime guards or endpoint behavior.

On 2026-10-14 the native Strapi/PostgreSQL 17 proof passed all 23 checks with 75 discovered tables and all application, cluster and private-fixture cleanup checks passing. The number is an observed result, not a replacement fixed acceptance threshold.

## Current route and browser collection inventories

`scripts/check_legacy_route_inventory.py` derives the complete normalized METHOD/path inventory from both implementations. The refreshed JSON retains every one of the 50 legacy declarations and their previous presence classification. It adds the 26 already implemented Node declarations omitted by the older manifest: the current Node inventory has 61 routes. The 17 absent legacy routes remain explicitly absent. Declaration presence is not behavioral parity or production completeness.

General Playwright discovery is compared with the actual declared specification files and configured projects. Missing files, missing project coverage, duplicate case identities and accidental inclusion of a dedicated KTPB harness fail. New account cases or individually split company journeys no longer require changing a global magic test count.

The PTMM workflow test separately preserves the exact historical archive and every prior workflow byte except the explicitly reviewed current-source query/throttle invocation above. Its existing timing, cleanup and complete artifact assertions remain. It does not reapprove the historical workflow/source pins checked by the amendment gates.

The backend unit command uses one file worker. Explicit in-test concurrency/race cases and original timeout thresholds remain unchanged. The complete check passed 745/745 tests with zero skips on 2026-10-14; earlier parallel cloud runs hit existing shell-fixture deadlines under resource contention.

## Separate current validation successor

A current validation result must record its own exact commit, workflow/run/job IDs, command/configuration, discovered case identities, terminal results and artifact digests. It must not copy an old approval status, claim user design approval, or represent a newer browser run as historical evidence. Current source builds, semantic contract checks and real browser execution are machine-verifiable; visual acceptance and risk acceptance are separate decisions.

The current repair leaves both the full aggregate and immutable historical gates enabled. Independent account/session PostgreSQL checks include shared rate-limit concurrency and a separate authenticated TLS SMTP sink. The SMTP runner creates and removes its own ephemeral certificate, keeps certificate verification enabled and uses a dedicated disposable database. New real-engine media scanning has a separate CI proof; execution status must come from its eventual exact-commit run.

Historical evidence is not complete: `docs/investor-visual-2026-10-12/browser-test-result.log` is referenced by the historical review closure but is absent from the exact `588dc98e7f0ded7a31b8fdee21c724f8889dfbb7` Git tree. This is not a local materialization omission. No substitute log or old approval hash is fabricated. The repaired catalog proof fixture now loads its current editorial dependencies and correctly reaches the existing source-pin refusals instead of failing during module resolution.

Until an explicit disposition is recorded, missing historical evidence and changed immutable source pins remain visible failures. A future successor can supply fresh exact-commit browser evidence and an honest scope statement, but cannot prove that the missing old run occurred. Likewise the dependency audit remains red; see [the exposure review](dependency-security-status-2026-10-14.md). No deployment-readiness or security-risk acceptance is asserted here.
