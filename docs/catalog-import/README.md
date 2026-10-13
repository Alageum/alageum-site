# Supplied cabinet catalog import

Source: user-supplied “каталог для печати_ШКАФНЫЕ КОНСТРУКЦИИ_02.09.2024.pdf”, Google Drive file `1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr`.

- Edition: 2 September 2024; source acquired 30 September 2026
- 182,693,789 bytes, 104 A4 pages
- SHA-256: `5cc9f57bf3ed16be6f168c0fff25f02a444675146919bfd277b7e722e640cefc`
- No extractable text layer: pages were rendered, visually reviewed, and cross-checked with Russian OCR. OCR was an aid, not the published source of unreviewed claims

## Coverage and inventory

All 104 pages have an entry in `manifest.json`. Pages 6–98 are the product body. Pages 1–5 are cover, blank, corporate overview and contents; pages 99–100 contain historical certificate reproductions; pages 101–102 are notes, page 103 is blank, page 104 is the contact back cover.

All 62 product headings from the two contents pages are represented by 65 unique product families. Two-transformer variants and separately presented indoor/outdoor or high-/low-voltage families account for additional family records; the two ШУЭНГ headings are a single family. RMU AE continues from page 29 onto page 30 and is merged once.

The import contains 65 families, 159 printed model/designation references, and 112 power/size/function/index configurations. The latter remain inside family technical sections rather than becoming fabricated product cards. No cartesian expansion of power, voltage, current or climate options was performed. Generic schema parts and lists of installed third-party components were not marketed as standalone products.

238 non-demo catalog cards are available: 224 imported families/designation references plus 14 other baseline references. Five overlaps retain their original URLs (`pktp-400`, `pktp-1000`, `kso-366`, `kso-292`, `kso-2-10`), so earlier selections remain valid. All 19 prior URLs survive. Nine synthetic fixtures remain separate under `?source=demo`.

Five interface categories contain: 13 transformers, 80 substations, 23 switchgear records, 76 cabinet/control records, and 46 cathodic-protection/measurement records. Imported families alone are 21 substations, 21 switchgear families, 17 cabinet/control families and 6 protection/measurement families.

## Source limits

- Two small labels over the RMU AE dimensional drawings on page 30 contain damaged glyphs even when rendered at 700 dpi. Their exact designation text cannot be reliably transcribed. The family, its parameters, drawings, one-line diagrams and full source page are included. No codes were guessed. This is a known unresolved source-label limitation, so the result must not be described as a certified exhaustive SKU list
- Printed typographical and numerical inconsistencies are retained and identified in family notes, with source-page links. Examples include К-8М's printed “690 кВ”, thermal-duration values, contradictory dimensions, and malformed ТДЕД labels
- Source ranges do not establish switching capability or exact combinations. Listed designations and templates are reference data, not confirmed orderable SKUs; `verifiedOrderableSkuCount` is zero
- No prices, stock, current certification, project suitability or manufacturer of an unconfirmed specific delivery are invented
- The catalog is a 2024 publication. Its certificate reproductions are historical, with no assertion of current validity

## UI and media

- All 104 original pages are available in the local source viewer at `/catalog/source?page=N`
- 59 family-level illustrations/drawings are cropped from the supplied PDF. Captions explicitly avoid claiming exact-model photographs. Families without source illustrations remain without an invented image
- Cards show page-linked technical values, source warnings, family/model relationships and complete configurations. Specific row voltages override family ranges; V and kV remain distinct
- Comparison includes detailed imported parameters, so row-level voltage/current differences are visible
- Search covers designation, series, category and configuration labels. Pagination is bounded for the enlarged catalog; family and model-reference filters are available
- Existing customer/manager DEMO remains local to the browser. Import does not connect real orders, document uploads, inventory or payment workflows

## Reproducibility

`extracted-*.json` are reviewed source-range inventories. `products.json` is a small, versioned index of the generated reference dataset, with `manifest.json` as its unchanged metadata and coverage ledger. Full original PDF is not committed; it remains available through the user-supplied Drive link. Compressed source-page images and crops are in `frontend/public/catalog-source` and `frontend/public/catalog-products`.

### Lossless chunk representation

- `products.json` has format `alageum-catalog-chunks-v1`. Read each JSON array named by `chunks[].path`, relative to this directory, and concatenate them in index order. Do not treat the index itself as a product array
- `products/part-001.json` through `products/part-025.json` contain all 224 imported records in their original order. Every index entry records its count, first/last IDs and SHA-256 of the chunk's exact UTF-8 bytes
- Matching ordinary JavaScript modules live in `frontend/lib/catalog/imported-data/`. `metadata.js` holds the unchanged metadata; `part-*.js` hold the matching record arrays
- `frontend/lib/catalog/imported.js` statically imports those modules and still exports exactly `importedProducts` and `catalogImport`. Callers require no changes, filesystem reads, network requests or asynchronous loading
- The generator greedily groups consecutive whole records, without regrouping by category, sorting keys, normalizing values or splitting a record. Every generated JSON or JavaScript file is at most 75,000 UTF-8 bytes, including comments and module wrappers. Oversized records or metadata cause a clear error before files are written
- The split changes only storage representation. IDs, nested specifications/configurations, source provenance, metadata and record/key order are identical to the frozen 1 October 2026 source. The 14 other web records remain unchanged, so the combined catalog still contains 238 records

`scripts/import-catalog.py` calls the shared `scripts/catalog_data.py` writer, so future reviewed PDF imports regenerate this same structure. To regenerate only the data representation without the PDF, image processing or downloads:

```
python3 scripts/catalog_data.py --products docs/catalog-import/products.json --metadata docs/catalog-import/manifest.json
python3 scripts/test_catalog_data.py
```

The helper also accepts a legacy full-array JSON input and an optional `--output-root` for isolated verification. It validates indexed chunk checksums/counts before regeneration. Generated numbered parts no longer needed by a later import are removed; unrelated files are preserved.

Frontend regression tests verify the index, one-to-one JSON/module correspondence, byte limits, boundary IDs, exported API, complete metadata and frozen canonical hashes. Canonical here means UTF-8 `JSON.stringify(value)` with original key order, not sorted keys:

- Imported records: `6aafae9da3727166b8a76e5b6fefb9a94132d56c0a4d2d603dd8357a4c8874a1`
- Metadata: `15f71e1e342ba8636a5517cf838bac82026947b7d180047281a5b6707207d89d`

These hashes were independently captured from the frozen pre-split module. A newly reviewed edition requires deliberately reviewing/updating the expectations. The Python tests separately verify byte-for-byte regeneration, UTF-8 accounting, order preservation, checksum/count validation and stale-part cleanup.

Run the catalog generator against the authorized source PDF and reviewed inventories with Python, PyMuPDF and Pillow. Static publication is a separate step owned by the existing private-preview deployment task. No GitHub push is part of this import.

Rebuild commands (no downloads or publication are performed):

```
python3 scripts/import-catalog.py --pdf /path/to/authorized/catalog.pdf
python3 scripts/render-catalog-pages.py --pdf /path/to/authorized/catalog.pdf
cd frontend
npm run check
npm run build:preview
```

The scripts require the exact reviewed source hash and stop on a different PDF. A new edition requires a new review rather than silently reusing old extracted values.
