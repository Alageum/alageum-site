# Transformer source ingestion

The original source batch below remains unchanged. The separately reviewed [6 October identity completion](IDENTITY-COMPLETION.md) appends 20 explicit execution rows, adds two read-only NTMI aliases, and represents ten conflicting source rows on existing references. Current runtime total: **843 = 823 unchanged records + 20 admissions**, with no new family cards. Its own reproducible generator is `node scripts/complete-catalog-identities.mjs --check`; the original 585-record source clearance and its historical holds remain intact.

The default command prepares **review staging only**:

    node scripts/import-transformers-2026.mjs

It reads the checksummed `review/section-*` inventories. `--input` can point to the original extraction folders containing `inventory.json`, `page-ledger.json` and `asset-families.json`. Both routes preserve original row identities; their source-review digests bind to the exact reviewed representation. `--check` compares generated checksums without writing.

## Admission and meaning

- 78 source families, 540 model/variation rows, 407 bounded configurations
- 508 admitted rows + 77 family parents = 585 new runtime records when activated
- 32 unresolved old-identity candidates remain outside runtime cards and automatic identity merges
- The all-held NTMI family is excluded, avoiding a duplicate family card
- 349 configurations belong to admitted or standalone families; 58 stay with held identities in source evidence
- The existing 238 records and stable IDs remain unchanged
- All new `sku` values are null. A printed designation plus execution and source-row locator is not a verified order code
- Ranges, voltage/winding alternatives and climate options are never Cartesian-expanded
- Shunt reactor configurations remain a family with 15 explicit configurations, not 15 invented SKUs
- Reactors have their own category and `productKind`. Reactive power remains in its printed кВАр spec; normalized kVA power is null
- Unknown units become empty display units with `sourceUnit:null` and `unitStatus:not-stated`. Raw source specs and field metadata are preserved
- Model-specific common prose is never broadcast to adjacent executions. Manufacturer claims require source evidence; unknown remains null
- Warnings remain visible and source links use physical PDF page numbers

## Explicit activation gate

The review authority must approve the exact input digest with a JSON file:

    {
      "format": "alageum-transformer-review-clearance-v1",
      "status": "approved",
      "sourceSha256": "<PDF hash>",
      "inventorySha256": "<staged manifest inventorySha256>",
      "approvedBy": "<review authority>",
      "approvedAt": "<ISO timestamp>",
      "reviewReports": ["<review report paths>"]
    }

Then:

    node scripts/import-transformers-2026.mjs --activate --clearance <approved-file>
    node scripts/generate-catalog-media.mjs
    node scripts/generate-catalog-media.mjs --check

Activation writes identical bounded frontend JS/backend JSON chunks, the identity manifest, exact release totals, and a source/record-hash-bound runtime gate. The old PDF chunks and web overlay stay unchanged. Backend seeding is insert-only: existing editable CMS rows are never overwritten. Import staging does not seed a running database, publish, deploy or grant new permissions.

## Media and separate asset approval

All 187 new page scans are independently checksummed and packaged for frontend and native CMS preview. Media authority binds the original complete source record hash, its source-file identity and the exact eligible page image. Shared page numbers between PDFs cannot cross-bind.

New 3D/icon proposals require separate approval. Source-data activation alone keeps all new geometry types null and shows source scans/document symbols. It must not invoke the ID-only review asset resolver on mutable API rows. Any future approved mapping needs a reviewed allowlist plus exact source-file and reviewed-record-shape binding. Missing drawings, uncertain bindings and mixed executions stay unavailable unless separately justified.

## Checks

    node --test frontend/tests/transformer-import.test.mjs
    node --test backend-node/tests/transformer-source.test.js
    cd frontend && npm run check
    cd backend-node && npm run check

Old238 visual regression tests remain scoped to `baselineOfficialProducts`; transformer tests separately cover all admitted and held identities. Runtime roundtrip checks compare frontend and backend totals to exact generated release manifests.

### Original source integration validation

Source data was explicitly activated with `review/data-clearance.json` at input digest `c3948d7152a6130aa4672b9f6d3d5a8f08144b5965df7bebabca067ba5bc8438`. Runtime totals are 823 records: 238 unchanged legacy + 585 new. Package totals are 248 raster assets / 21,968,700 bytes, including all 187 transformer scans / 20,429,458 bytes. The original 844,084,378-byte PDF is not shipped.

Same-command production HTTP smoke returned 200 for `/catalog`, a new TMG model, the source-only reactor configuration family, physical source page 175 and its 133,032-byte WebP. This is HTTP evidence, not a rendered browser check. Local browser validation is unavailable: the supported cloud-browser attempt returned `ERR_BLOCKED_BY_CLIENT`. The source-browser CI job now runs the complete 68-case desktop/mobile catalog suite against a production build. Added checks cover decoded source images, cards/filter/search behavior, approved 3D interaction and close/reopen behavior, icon-only and source-document fallbacks, physical-page navigation/history, and reactor kVAr separation. Discovery, lint, YAML parsing and targeted contracts passed locally; browser execution is left to CI and is not claimed as a local pass. Success screenshots, pixel metrics, JSON results and logs are retained by the job.

### Separate runtime asset authority

`scripts/approve-transformer-assets.mjs <clearance.json>` accepts only exact independent geometry and icon lists. It checks the cleared source inventory, exact reviewed record-shape SHA-256 on each entry, source-image bytes, evidence registry, source registry and reviewed geometry/icon library hashes. `--check` verifies the emitted manifest without writing. Runtime mapping requires the exact source-file ID/SHA and public record-shape hash; API rows must additionally have their deterministic database UUID. Removing/changing provenance on a known transformer record stays source-only rather than falling back to a generic model. Empty allowlists keep every new mesh/icon disabled.

### Final independently approved state

`review/assets-clearance.json` approved exactly 251 geometry rows and 257 icon rows after source-pixel/topology review. Six rows are icon-only; no uncertain, mixed-execution, missing-drawing or old-identity hold gained a default model. The current runtime manifest has SHA-256 `015aec00fbd4ee411c581fbc1443a348cdfd1f85649607820c406a0b658f6434`.

Final post-activation validation passed frontend lint, 377 frontend unit tests, the default Turbopack production build, and backend aggregate checks with 562 tests. Both source/media reproducibility checks and the independent asset-approval check pass. The preview component receives its independently approved icon rather than deriving icon authority from a geometry type; its idle/loading/ready/close/error regression passes. API source/display media are separated so rejected illustration overrides cannot mislabel the original source page.

The precise summary is in `import-validation.json`; `import-changed-files.txt` scopes the integration snapshot. Source-data and asset approvals remain separate, and neither this importer nor its checks deploy or publish the application.
