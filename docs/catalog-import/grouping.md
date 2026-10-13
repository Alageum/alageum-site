# Catalog taxonomy and source-family navigation

Implemented 1 October 2026 in `frontend/lib/catalog/grouping.js` and `frontend/lib/catalog/query.js`.

## Current public-catalog contract

The latest user instruction supersedes the initial series-card proposal: the public catalog keeps **all 238 official records as separate product/model rows**. It must not replace them with 72 series cards, require a family chooser before opening a product, or change saved comparison/selection identities. Navigation follows category → equipment type → the original individual rows. The All products view supports search and filters without requiring a category first.

`filterProducts(officialProducts, params)` is the public listing path. With no filters it returns the original 238 objects. `equipmentTypes` defines 13 reusable subtype/visual names with their valid categories, and `catalogTaxonomy` provides the five category hierarchies through `subcategories`. Each source row belongs to exactly one category/type pair. An available visual type need not have a product in this source edition; consumers can hide empty subcategories instead of inventing one.

Global filters can use the union of power, voltage, current, cooling, installation and subtype; selecting a category provides the narrower category-specific dimensions below. `equipmentType` and `function` are also supported. `getProductFacetOptions(products,key,params)` computes options from the original rows while omitting only that facet's active filter. Search and all active filters must match the same original record. Official voltage/current facets include their existing source units. Demo rows retain their original exact-value filtering semantics and are not mixed into the official inventory.

## Optional source-family index reconciliation

The source ledger remains `manifest.json`, `products.json`, the reviewed extracted inventories, and the unchanged `frontend/lib/catalog/{official,imported,data}.js` modules. This change is a derived presentation layer, not a re-import or a new technical dataset.

The retained `groupProducts` utility is an optional internal source-family navigation/indexing helper, not the public listing or a reduction of its record count. All 238 official source records appear exactly once in this index:

| Category | Public product/model rows | Internal source-family groups |
| --- | ---: | ---: |
| Transformers | 13 | 6 |
| Complete substations | 80 | 21 |
| Switching and distribution | 23 | 22 |
| Cabinets, panels and control | 76 | 17 |
| Cathodic protection and measurement | 46 | 6 |
| Total | 238 | 72 |

The 72 internal groups comprise all 65 independently recorded PDF families, six documented website transformer series, and the website РЛНД reference. The 159 printed PDF designation records retain their family relationships and remain separate public product rows. The 112 canonical configuration/code-option records remain inside the family technical sections; no wildcard schema, source range, or Cartesian combination becomes an invented product. Imported variant objects contain inherited copies of some family configurations; these remain untouched in `members`, while the internal `configurationCount` counts the canonical family list once.

### Website-only grouping

Grouping requires the same category, exact documented series, and source page URL. Similar names alone are not enough.

| Series | Existing representative route ID | Preserved member IDs |
| --- | --- | --- |
| ТМГ | `tmg-400` | `tmg-400`, `tmg-630`, `tmg-1000`, `tmg-2500` |
| ТМГС | `tmgs-63` | `tmgs-63`, `tmgs-160` |
| ТМГФ | `tmgf-630` | `tmgf-630`, `tmgf-1600` |
| ТМЭГ | `tmeg-250` | `tmeg-250` |
| ТСЛ | `tsl-630` | `tsl-630`, `tsl-1600` |
| НТМИ | `ntmi-6` | `ntmi-6`, `ntmi-10` |
| РЛНД | `rlnd` | `rlnd` |

These series are established by the existing official-page records and their `series`/`sourceUrl` evidence, not guessed from designation prefixes. In particular, the source contains ТМГС and ТМЭГ; no separate ТМ or ТСЗ family is invented.

The overlapping website/PDF references were already merged upstream. `pktp-400` and `pktp-1000` resolve to the existing `cat-pktp` family through their explicit `familyId`. Their original IDs, exact names and power values, PDF provenance, and additional website provenance survive. `kso-366`, `kso-292`, and `kso-2-10` remain their own documented family routes. All 19 original website URLs and all imported detail identities survive.

## API contract

- `equipmentTypes` and `catalogTaxonomy` define reusable category/type navigation independently of source record identities. `equipmentTypeFor(record)` gives the navigation subtype; product visuals use the independent `getEquipmentVisual(record)` construction audit, it does not merge a product with other rows of that type.
- `filterProducts(officialProducts,params)` preserves separate original rows. `getProductFacetOptions(products,key,params)` works globally or within category/type filters. Existing raw voltage bookmarks also continue working alongside unit-labeled options.
- `groupProducts(records)` is an optional internal helper, independent of `data.js`. It returns derived source-series records with a valid original `id` and `detailId`, canonical family `name`/`sku`/`series`, `familyProduct`, `members`, `memberIds`, `variants`, `variantIds`, `variantCount`, `configurations`, `configurationCount`, `equipmentType`, and `isCatalogGroup`. Do not use its output as the public catalog listing.
- `members` and `variants` retain the original objects, including every technical row, note, source URL/page, original image reference and designation. Original arrays/objects are not mutated. `familyProduct` is the original imported family, or null for website-only groups.
- `getFamilyForProduct(id, recordsOrGroups)` resolves any original identity to its series, returning null for an unknown ID. Routes and saved selections still use original IDs; comparison and selection helpers continue to accept the raw records.
- `categorySpecRows(category)` defines the category's display/filter dimensions. `getCatalogSpecSummary(recordOrGroup)` returns `{key,label,value,unit,sourceRows}`. The display `value` already includes source units; `unit` is empty, so consumers must not append another default unit.
- `facetValues(recordOrGroup,key)` returns distinct string values. On a filtered group, only `matchingMemberIds` contribute facet options. `getCatalogFacetOptions(groups,key,params)` omits that facet's own constraint while retaining all other active constraints.
- `filterCatalogGroups(groups,params,omit)` returns each matching group once and includes `matchingMemberIds`. Search and all active facets must match the same underlying record. It does not infer that a voltage from one variant and a current from another form a valid configuration.
- `filterProducts` preserves the flat-array path for existing demo/raw callers; explicit optional grouped-array callers can still use grouped filtering. For raw rows, existing `recordKind=family` URLs return the 65 original PDF families and `recordKind=variant` returns all 159 original designation records. Only the optional grouped helper returns unique parent groups for those filters.
- `sortProducts` keeps its existing flat-record semantics. Group power ordering uses the lowest explicitly listed numeric kVA value and leaves groups with no such value last. It does not turn printed ranges into numeric bounds.

## Category-specific parameters

| Category | Summary and filter dimensions |
| --- | --- |
| Transformers | Power, voltage, cooling |
| Complete substations | Power, voltage, installation |
| Switching and distribution | Voltage, catalog current, installation |
| Cabinets and panels | Voltage, catalog current, equipment subtype |
| Protection and measurement | Voltage, catalog current, stated function/application |

Voltage retains its explicit V/kV unit, including mixed-unit source prose. Current uses source current rows with original A/kA units; breaking, short-circuit, thermal and electrodynamic ratings are not relabeled nominal operating current. Source labels/pages remain available in `sourceRows` and the original technical sections. Power facets for transformers/substations use existing power values or explicitly printed kVA rows; consumed power, controlled-motor power and cathodic station power are not relabeled transformer power. Explicit semicolon lists can become individual facet values; ranges and qualified text remain verbatim. No unit conversion is performed. Unknown values display as `—`.

Source errors are not corrected by aggregation. For example, the printed К-8М `690 кВ` row and its warning remain intact, while the category summary uses the independently recorded nominal voltage. The unresolved RMU AE labels retain their existing limitation.

Search normalizes case, Unicode dash typography and whitespace without changing source identities. In the public raw listing, searches such as `ТМГ-400`, `ТМГ — 400`, and `ТМГ 400` return the original `tmg-400` row directly. Printed variant designations and configuration labels remain searchable. The optional grouped helper can identify matching member IDs for source navigation, without replacing the raw listing.

## Reusable media types

`equipmentTypeFor` selects navigation subtypes using existing family/category/series evidence. It must not be used to assign product silhouettes; `getEquipmentVisual` in `lib/catalog/models/visualMap.js` uses the reviewed construction map for that purpose. It does not replace source illustrations or claim an exact-model 3D asset. Supported type IDs are `oil-transformer`, `dry-transformer`, `instrument-transformer`, `substation`, `modular-substation`, `pole-substation`, `switchgear`, `disconnector`, `distribution-cabinet`, `control-cabinet`, `compensation-cabinet`, `protection-cabinet`, and `metering-box`.

Documented examples include ТМГ → oil transformer, ТСЛ → dry transformer, НТМИ → instrument transformer, РЛНД → disconnector, МТП/столбовая КТП → pole substation, БКТП/КТПБ → modular substation, КСО/КРУ → switchgear, ШУЭНГ → control cabinet, УКЗВ/УКЗН → protection cabinet, and КИК/СКИП → metering box. A type can be supported without asserting that the current source inventory contains a family of that type.

## Verification

`tests/grouping.test.mjs` first verifies the active public contract: all 238 original object identities remain separate, all 13 supported type IDs correspond to shared assets, five category/type hierarchies partition all 238 records exactly once, global search/filters work without a category, and type filtering retains individual ТМГ and ПКТП rows. It also verifies source-backed raw-row facets and demo exact-value compatibility.

The optional internal-index checks cover complete 238-record reconciliation, 72-group and category totals, immutable input handling, all 65 explicit family relationships, all 159 designation relationships, all 19 old website identities, canonical configuration counts, valid representative routes, normalized designation search, member-aware filters/facets, V/kV separation, source warnings, representative equipment types, comparison/selection identity preservation, and orphan/API fallback.

Commands: `node --test tests/*.test.mjs` and `npx eslint lib/catalog/grouping.js lib/catalog/query.js tests/grouping.test.mjs`. This data-layer verification does not claim browser or deployment verification; those belong to the UI integration check.
