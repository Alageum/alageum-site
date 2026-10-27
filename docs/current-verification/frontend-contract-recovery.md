# Current frontend contracts versus archived approvals

## Scope and evidence status

This is a recovery/design note, **not a release approval or replacement for any
historical review**. No historical clearance, report, expected hash, or archived source bytes are changed by these current technical contracts. Detailed run results are retained separately.

## Historical closures requiring genuine separation

The following are overlapping proof layers, not 65 independent implementation
bugs. Each verifier remains unchanged under `scripts/catalog/`:

| Layer / verifier prefix | Retained authority directory under `docs/catalog-transformers-2026/review/` | Concrete drift detected |
|---|---|---|
| `transformer`, `source-asset`, `measurement-column` | `asset-completion`, `source-asset-completion`, `measurement-column-completion` | Source UI consumers such as `CatalogSourceEvidence.js`, `CatalogSourcePreview.js`, `EquipmentModel.js`, `ProductVisual.js`; current normalized DTO |
| `protection-context` | `protection-context-integration` | Frozen package/build/consumer fields; source/UI successor dependencies; DTO whole-object digest |
| `visual-presentation`, `catalog-browser` | `catalog-visual-presentation`, `catalog-browser-assertions` | `frontend/e2e/catalog.spec.js`, frontend package/lock, source-consumer inputs |
| `ptmm-qualification`, `ptmm-browser-correction` | `ptmm-dimension-qualification`, `ptmm-browser-correction` | backend catalog, frontend catalog/source/rendering inputs, package/lock, workflow |
| `frontend-security`, `ktpb-source-context` | `frontend-dependency-security`, `ktpb-source-context` | immutable PR42/43 workflow pins and inherited source/UI inputs |
| `backend-security`, `combined-eds-auth` | `backend-dependency-security`, `combined-eds-auth/revisions/test-snapshot-parity` | PR44/45 workflow pins, backend package/lock, middleware, auth/catalog and inherited approval inputs |
| `joint-site` | `joint-site-integration` | exact candidate dependency map, workflow, missing original investor browser/unit logs |
| parity tests | the above inherited layers | propagate missing/changed closure; must retain final-read and mutation protections |

Closure manifests are explicit, not inferred from whichever test failed first:
`baseline-dependencies.json`, `fixed-dependencies.json`,
`immutable-dependencies.json`, `fixed-candidate-files.json`, and each verifier's
literal fixed maps. For example: source-asset immutable map has 159 pins;
PTMM qualification fixed map 41; browser correction fixed map 535; frontend
security baseline 554; KTPB baseline 570; backend security baseline 597;
combined baseline 616; joint baseline 696. These historical maps overlap and
include earlier revisions legitimately replaced by later reviews. Their raw
mismatch counts alone neither prove corruption nor confer current approval.

## Current bounded repairs

### Workflow contract

`frontend/tests/helpers/current-ci-migrations.mjs` permits only three exact,
once-only transformations of the verified archived workflow text:

1. System DTO/metric reference is re-executed from current source against the
   unchanged archived vector using `verify_current_legacy.py --reference system`.
2. Transformer browser job budget changes 25 to 45 minutes.
3. Its full-suite browser step changes 18 to 30 minutes.

The existing current workflow test still compares every other retained byte,
checks separate PTMM evidence and public deployment contracts, and hashes the
unchanged archive. Missing, duplicate, malformed or already-migrated inputs fail.
Changed commands, unbounded budgets and error suppression do not match the
current expected text. This does not make an archived workflow approval apply.

### DTO extension contract

`node scripts/catalog/current-client-dto-contract.mjs` is a separate executable
behavioral check, automatically covered by the new frontend unit test. Only the
separately named current wrapper dynamically imports and invokes it. Historical
entry points never invoke it; loading the old checker does not initialize it.

- Re-read the untouched PR33 client baseline and verify its existing hash.
- Re-read the untouched PTMM importer fixture and bind all 843 raw source rows to
  its independently retained source digest, including extension source facts.
- Check exact `current`/`function` scalar and `manufacturers` string-list semantics,
  and existing raw/sanitized variant-spec handling.
- Remove only these explicitly understood additions for comparison of prior
  fields. All remaining normalized fields and CSV/inquiry/quote/fingerprint
  consumers must match the unchanged historical per-record digests.
- Reject missing baseline/source, tampering, stale fixture, missing source rows,
  source reordering, fabricated extension source facts, altered normalization,
  missing additions and unknown extra normalized fields.

The report says `historicalApproval: false` and `releaseApproval: false`.
Passing this new contract documents compatible extension behavior. The three
current technical geometry tests now explicitly call separately named
`verifyCurrentProtectionContextPreservation`,
`verifyCurrentMeasurementColumnPreservation`, and
`verifyCurrentSourceAssetPreservation`. Their shared private preservation cores
project only the three independently verified additions. Every other geometry,
source and consumer assertion still executes. The results have distinct
`current-preservation-only` status and explicit false approval flags.

Historical exported functions, full integration/release functions and their CLI
branches retain the original default semantics and cannot enable the projection
by passing an option. Negative tests invoke all six historical entry points with
attempted opt-in arguments and require rejection. Existing checker files changed
to share the private cores; their historical file-hash mismatches remain visible
and are not re-attested. These are current technical passes, not historical
approval passes.

## Safe route to a complete successor

1. Recover complete authentic source/evidence for the relevant archived trees.
   Verify every byte against retained maps before running old acceptance/mutation
   tests in an isolated archived checkout. Missing bytes remain a blocker; no
   fallback to current files or synthesized historical reports.
2. Keep current functional, security, browser, source-integrity and DTO checks on
   the current candidate. Do not remove failing tests or make CI ignore failures.
3. Create a **new candidate** manifest with exact baseline and candidate trees,
   changed/unchanged closure, current verifier/test/source dependencies, genuine
   command/runtime outputs and mutation results. Candidate status is
   reproducible/not-approved, not accepted by any old authority.
4. Have an independent reviewer inspect that exact closure and actual results.
   Only a genuine new bounded review can authorize a forward proof adapter; it
   must reject missing/stale/mixed evidence, preserve final rereads and bind every
   changed dependency. Old reports and hash pins remain immutable.
5. Until that is complete, report separately: current behavioral passes,
   historical reproduction failures, missing artifacts, and pending approval.
   Do not present a green subset as full CI success.
