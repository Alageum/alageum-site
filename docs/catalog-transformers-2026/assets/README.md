# Transformer construction assets, independently reviewed

## Scope and provenance

Source: the supplied 187-page ALAGEUM technical transformer catalogue dated 2026-03-18, SHA256 `8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e`. Source scans remain unchanged at `frontend/public/catalog-source/transformers-2026/page-NNN.webp`.

The complete 87-page set referenced by the three evidence-group registries was visually inspected. Source overview sheets were supplemented with full-resolution checks of the terminal layouts, enclosure/cutaway distinctions and high-voltage assemblies. Every registered group retains its source pages, closed row allowlist, observations, exclusions and original reuse restrictions.

This is an isolated reusable asset library and a **review-only per-record proposal**. The proposal API never grants runtime eligibility. The separate integration adapter owns hash/source/record-shape guards and a reviewer-approved per-record allowlist. These library files do not activate product data or approve a production binding.

## Final independent outcome

The exact record/channel clearance approves **251 geometry bindings and 257 icon bindings**. All three ZOM/ZNOM 3D bindings remain withheld. Original execution, caption, duplicate and source-evidence holds remain in force.

The independent reviewer checked actual static and normalized API results, 5,222 mutation denials, unknown/prototype-ID rejection and all 238 old visual/icon mappings after allowlist integration. See [record/channel clearance](../review/assets-clearance.json), [independent review](../review/assets-independent-review.json) and [runtime verification](../review/assets-runtime-verification.json). These reports were produced separately from the implementation.

## Counts

- 540 source rows, each accounted for in `coverage.json`
- 87 source evidence groups: 78 have a geometry proposal; 84 have an SVG proposal
- 62 named geometry presets assembled by five shared builders and reusable tank, bushing, radiator, conservator, base, enclosure and ventilation primitives
- 67 registered vector definitions, including five icon-only accessory silhouettes
- 343 rows have one or more proposed evidence groups; 197 have no linked construction evidence
- 333 rows have at least one possible geometry choice before the identity/execution holds are applied

Default review results, mutually exclusive:

| Status | Rows | Meaning |
| --- | ---: | --- |
| topology-proposal | 251 | One source-linked construction proposed for review |
| execution-choice-required | 32 | Multiple open/enclosed or enclosure alternatives; no default |
| execution-binding-unverified | 19 | Caption/execution association needs confirmation |
| old-identity-hold | 32 | Existing-record candidate; no duplicate or identity overwrite |
| icon-only-proposal | 6 | Three accessories plus three ZOM/ZNOM rows with unresolved secondary-contact classification |
| source-evidence-needed | 200 | 197 unbound rows plus three unpictured open TSI rows |

These are counts of registered presets and proposal coverage, not claims that the source proves 62 distinct exact meshes, 78 product constructions or 333 dimensionally identical variants. Small/large or winding-specific entries can deliberately share primitives and icons. No CAD evidence is present. The primary-column geometry preview remains in the library, but its three ZOM/ZNOM record bindings are withheld until the secondary symbols can be classified.

## Deliberate boundaries

All numerical geometry parameters are arbitrary scene proportions. Real source dimensions, unidentified units, power, voltage and winding materials do not parameterize the mesh. Colors are illustrative. Counts of cooling fins, porcelain sheds and small fittings are simplified. Optional transport rollers on the small corrugated drawings are omitted rather than assumed to be fitted to every row.

Only exterior parts or explicitly source-visible cutaway parts are drawn. Closed tanks remain opaque. No coil/core apparatus is added to closed tanks. The lower cutaway on page 81 is explicitly identified as a cutaway; it is not conflated with the closed mesh enclosure on page 93. The small schematic oil-tank cutaways on pages 69/71 are not promoted to real exterior openings.

The source recheck preserves important distinctions:

- Pole bracket versus an invented pole or overhead installation
- TМЗ panel radiators with horizontal end terminals versus TМГ top terminals
- Opposite-end TМГФ terminal flanges versus parallel top rows
- Top hood versus side terminal box
- TМТО three-row and modern single-row terminal arrangements
- Round, rectangular and single-column measurement equipment
- NТМИ three-bushing triangular plan and six secondary terminals; the polygonal mounting-hole diagram does not fabricate a polygonal tank or extra baseplate
- Three visible АОМЖ input columns on page 110, without inferring their count from its single-phase name
- End-facing cooling fans on opposite longitudinal ends; page 115 preserves the opposite housing without inventing its fan count, page 123 retains inward-facing housings in the central cooling gap, and page 156 preserves one-versus-two visible levels
- Smooth high-voltage columns where the source shows smooth columns, without borrowing corrugated porcelain from another drawing

An alternative in a mixed row can be previewed only by explicitly selecting its source group. Unknown source IDs do not inherit any type. At runtime, source-evidence, identity, mixed-execution and uncertain-binding holds return null for both channels; explicit mixed alternatives are review-only and cannot activate a default. These cases use an explicit unavailable label and a source-document fallback token, never a category cube. The six independently approved icon-only rows retain their qualified icons while geometry remains null. Selecting a group cannot bypass duplicate, uncertain-binding or missing-evidence holds.

## Precise evidence gaps

- ТМГвэ Х3К2 rows: no matching execution caption in the drawing set; obtain a signed/labelled drawing or verified product view for that execution
- ТМГи Х4К3 rows: execution code matches but the drawing's series caption conflicts with the table; confirm the series/execution association
- Copper-winding TМГ rows: drawings follow the tables but generic captions do not independently identify the copper execution; confirmation remains required
- Open ТСИ 1.6/2.5/4.0: the nearby drawing is labelled for an unrelated enclosed ТСНЗ form; obtain the open ТСИ drawing
- Mixed ТСЛ/ТСЛЗ, ТС/ТСЗ and ТСН/ТСНЗ rows: choose an explicit execution and, for ТСНЗ, the correct mesh or roof-bushing enclosure; do not split slash-paired dimensions by assumption
- Asia Trafo rows without drawings: obtain a labelled general arrangement or photo tied to the exact model/execution. The editorial product photo and factory-building photo prove neither these individual constructions nor CAD accuracy
- ZOM/ZNOM pages 99/100: secondary symbols cannot reliably be separated into contacts and plugs. Three record-level 3D bindings are withheld; the qualified primary-column icon remains available
- Accessories: front/photo silhouettes only; enclosure internals, probe dimensions and mounting details are not inferred

## Files and integration contract

`frontend/lib/catalog/models/transformer2026Types.js`: reviewed names, source pages, arbitrary layout presets and limitations

`transformer2026PowerLayouts.js`: explicit source-page terminal groups, side-specific radiator units, fan ends and cooler-axis layouts; incompatible pages use separate presets

`transformer2026Geometry.js`: `createTransformer2026Geometry(type)` and `disposeTransformer2026Geometry(group)`; an unknown type throws rather than falling back to a generic transformer

`transformer2026Icons.js`: reusable `paths` definitions and `renderTransformer2026Icon(type, size, title)`; unknown types return null; no Three.js dependency

`transformer2026GroupMap.js`: exact source-group to construction allowlist and group-specific holds

`transformer2026AssetEvidence.json`: self-contained, hash-bound evidence registry plus all 540 row proposals

`transformer2026Bindings.js`: `getTransformer2026ReviewAsset(sourceRecordId, optionalGroupId)`; always returns `runtimeEligible:false`, no exact/dimensional claim, source-row-specific evidence, alternatives and reasons

`coverage.json`: standalone per-record coverage, holds and missing evidence

Source table approval and runtime activation remain separate from this library. The importer owns the guarded runtime files and approval manifest; they are not included in this asset-library delivery manifest. Do not simply spread these records into the old map. The old 238 identities and mappings are tested against `frontend/tests/fixtures/old-catalog-transformer-stability.json`; their 171 source-matched rows remain unchanged.

## Validation and previews

- Full frontend unit suite: 377 passed on the frozen library before final allowlist activation; the integration owner runs final aggregate release checks
- Focused new tests: 18 passed
- Existing 238-record visual/icon snapshot and all old source-expansion tests remain passing
- Focused ESLint passed
- Every registered mesh has finite positive bounds normalized to 2.8 scene units and resources dispose exactly once
- All 67 vector definitions rasterize visibly without crossing the 64-unit icon viewBox
- CPU rasterizer generated and checked 248 mesh images in front/perspective/end/plan views; no blank or edge-clipped previews
- Visual review of all seven model sheets and the icon sheet completed; source comparisons include critical terminal, enclosure and fan distinctions

The images in `qa/` are **CPU z-buffer projections of the actual Three.js meshes**, not browser screenshots. They do not verify WebGL context creation, GPU materials, pointer/keyboard controls or browser lifecycle behavior. The isolated library build did not activate runtime UI. Separate independently cleared integration subsequently activated exactly 251 geometry and 257 icon bindings. This proposal ledger still exposes runtimeEligible:false because it is a review API; the [all-823 runtime coverage ledger](../runtime-coverage/index.json) and approved runtime manifest are authoritative for active bindings.

Preview entry points:

- `qa/source-comparison-1.png`, `qa/source-comparison-2.png`, `qa/source-comparison-3.png`
- `qa/models-1-9.png` through `qa/models-55-62.png`
- `qa/icons.png`
- `qa/render-report.json`

Regenerate evidence with `node frontend/scripts/generate-transformer2026-asset-evidence.mjs <extracted-source-root>`. The default input is the durable reviewed section chunks under docs/catalog-transformers-2026/review, read with the same validated adapter as the data importer. Full section inventories are also supported. Semantic inventory/asset hashes and the complete inventory binding are stored with the generated output. New source IDs/groups or changed expected row counts intentionally require a review rather than broad fallback mapping.

Regenerate CPU previews from `frontend/` with `XDG_CACHE_HOME=/tmp/fontconfig node scripts/audit-transformer2026-assets-software.mjs ../docs/catalog-transformers-2026/assets/qa`. Run tests with `node --test tests/equipment-transformer2026-assets.test.mjs`.


## Independent review correction batch

The final library removes the initially over-broad construction assumptions. Repairs include large four-LV flat contact plates with source-correct relative heights; equal-height isolating rows; smooth bracket/side-box walls with cooling on the opposite wall and short ends; staggered flanged contacts; OM two-HV/four-LV and OMP side-wall contacts; three dry diagonal links; 9/6 and 3/4 dry busbars; side ventilation; heating-wall ribs; triangular seven-secondary NAMI; short-end conservator clearance; splayed 35-kV terminals; and nonintersecting seven-contact rows.

Power drawings use independent side counts, unit placement and broad-faced leaves stacked in depth. Page 126 is no longer forced into page 125’s four-contact layout. Pages 131/137, 133/139, 148 and 164 receive distinct presets where their radiator groups differ. The final icons preserve both terminal groups, smooth versus ribbed columns, fan-side/gap positions, and the visible accessory control/flange details.

Unclassified details stay explicit: no electrical role is inferred for additional visible roof insulators; unknown fan internals are represented only by a source-supported housing; the ZOM/ZNOM secondary-contact uncertainty holds its 3D record binding.
