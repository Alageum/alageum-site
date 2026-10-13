# Additive transformer asset completion

This review activates exact source-backed display bindings for 29 records while retaining the original source transcription, identity records, geometry library, historical asset clearance, and historical explicit-choice clearance.

## Scope

- 25 additional default geometry/icon bindings: 13 copper-winding TMG rows and 12 newly admitted TMG(01), X1K1, and switchable 6/10 kV execution rows
- Four newly admitted TSL A/C rows at 630 and 1600 kVA: eight explicit open/enclosed display alternatives, no default asset
- Effective new-PDF coverage: 276 default geometries, 282 default icons, and 36 mixed records with 74 explicit selections across seven existing choice groups
- Historical base manifests remain at 251/257 defaults and 32 records/66 choices; runtime adds the separate generated supplement

The twenty newly admitted records have their own identities and exact source shapes. They do not inherit an asset by name, power, family, category, or legacy candidate identity.

## Evidence and limits

Pages 12/13 explicitly name the standard, X1K1 and (01) TMG drawings. Pages 46/47 explicitly name the switching execution. Pages 80/81 show distinct open TSL and enclosed TSLZ constructions; the enclosed preview preserves the source cutaway and does not determine a protection rating.

Copper applicability is a bounded inference from the publisher's subsection structure: the heading and table start on page 40, continue on page 41, are followed by complementary drawings on pages 42/43, and end before the new switching heading on page 44. The generic drawing captions do not explicitly say copper. The independent copper review and each activated copper binding retain that distinction.

All previews are representative exteriors. They establish no exact CAD, dimensions, internal winding-material depiction, rib count, clearances, accessories, or equality between individual executions. The page-42 fuse and transport rollers are order options; the page-43 fuse is optional and certain instruments are limited to KShP execution. The runtime reason displays these limitations.

No X3K2 construction gap or X4K3 caption conflict is cleared. The two NTMI read aliases retain their existing canonical-record visuals: giving legacy records new-PDF geometry would require a separate dual-source/legacy-API shape review, which is outside this supplement.

## Authority

`clearance.json` binds all 29 record shapes, deterministic import UUIDs, source hashes, specific drawing pages, labels, captions, and dispositions. `independent-review.json` pins both the records and dependencies. `copper-independent-review.json` independently pins all thirteen copper rows, source-page pixels, and existing geometry previews.

The original clearances remain unchanged. A bounded integration amendment records exact old-to-new hashes for the runtime integration helpers and reviewed UI dependency. `scripts/catalog/transformer-reviewed-dependencies.mjs` accepts only these explicitly reviewed replacements; geometry, shape, raw source, and other files cannot use this amendment path. Any later byte change, missing amendment, mismatched old hash, or changed dependency review closes the gate.

The runtime enforces exact static/API source identity and record shape. API rows require the original UUID and raw media field. Unknown or inherited identities, malformed objects, changed units, changed configurations, and altered provenance receive no authority from this supplement.

## Reproduction

From the repository root:

```sh
node scripts/approve-transformer-assets.mjs docs/catalog-transformers-2026/review/assets-clearance.json --check
node scripts/approve-transformer-execution-choices.mjs docs/catalog-transformers-2026/review/execution-choice-clearance.json --check
node scripts/approve-transformer-asset-completion.mjs docs/catalog-transformers-2026/review/asset-completion/clearance.json --check
node --test frontend/tests/transformer-asset-completion.test.mjs frontend/tests/transformer-execution-choices.test.mjs frontend/tests/transformer-import.test.mjs frontend/tests/catalog-identity-completion.test.mjs frontend/tests/equipment-transformer2026-assets.test.mjs
```

Source raster bytes and the geometry library are reused unchanged. No original PDF, new renderer, live catalog mutation, deployment, or default selection for mixed rows is introduced.
