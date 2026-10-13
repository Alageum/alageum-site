# Shared equipment visuals

The catalog keeps its individual product/model rows. Every row may reuse one of
these **type-level** visuals. Ratings, model designations and SKUs never feed the
geometry or cause a new model to be created.

## React APIs

```jsx
import EquipmentIcon from '@/components/catalog/EquipmentIcon';
import EquipmentModel from '@/components/catalog/EquipmentModel';

// Lightweight SVG, suitable for a dense product table. Decorative by default.
<EquipmentIcon type="oil-transformer" size={40} />
// Optional accessible title when the illustration carries information by itself.
<EquipmentIcon type="switchgear" size={64} title="Распределительное устройство" />
// Use only in a detail view, not in each table row.
<EquipmentModel type="oil-transformer" />
```

Both components accept `className`. The icon also forwards other SVG attributes.
The model imports its CSS module, so no application-level style import is needed.
`equipmentModelTypes`, `equipmentModelName(type)`, `resolveModelType(type)` and
`MODEL_DISCLOSURE` are exported from `types.js` without importing Three.js.

## Stable type IDs

- `oil-transformer`: corrugated tank and bushings
- `dry-transformer`: three cast-resin coil columns in an open frame
- `instrument-transformer`: compact tank with three measuring-transformer bushings
- `substation`: enclosed tall switch section beside the transformer tank
- `modular-substation`: three-section enclosure with pitched roof
- `pole-substation`: pole, crossarm, insulators, tank and small low-voltage enclosure
- `switchgear`: deep, segmented switching cabinet
- `disconnector`: exposed insulators and switching blades on a steel base
- `distribution-cabinet`: tall electrical cabinet with meters
- `control-cabinet`: shorter cabinet with control panel and buttons
- `compensation-cabinet`: ventilated power cabinet
- `protection-cabinet`: broad outdoor protective cabinet with rain canopy
- `metering-box`: narrow post-mounted measuring point

Unknown IDs resolve to `equipment`, an intentionally generic fallback. This is
not a fourteenth catalog classification.

## Provenance and limits

Representative local source images were inspected before geometry was created.
`types.js` records their unchanged local paths where available. Types with no
local picture use a generic educational silhouette and have `reference: null`.
None is a 3D scan, photogrammetry, CAD export, dimensioned drawing or validated
representation of a particular execution. Do not use these visuals to infer
connections, electrical clearances, dimensions, internal layout or ratings.
Original catalog photographs/drawings must stay available in their source view.

The viewer always displays:

> Иллюстративная 3D-модель типа; не CAD и не чертёж конкретного исполнения

## Loading and interaction

- Before activation, only an SVG and the “Открыть 3D-модель” button exist
- The click lazily imports Three.js **0.186.1**, OrbitControls and local geometry
- No remote model, texture, CDN request or external telemetry is used
- Mouse/touch orbit and pinch zoom; buttons provide rotation, zoom and reset
- Keyboard focus enters the canvas after activation; arrows rotate, `+`/`-`
  zoom, `Home`/`0` reset; closing returns focus to the open button
- No automatic motion or damping; frames are requested only after input/resize
- Pixel ratio is capped at 1.75 and scene complexity stays bounded
- Closing, changing type, unmounting, context loss and failed creation dispose
  the renderer/context, materials, meshes, controls, listeners and resize observer
- Unavailable WebGL or a failed chunk presents a usable SVG fallback with retry
- The model’s disclosure remains visible in preview, active and fallback states

## Verification

`node --test tests/equipment-models.test.mjs` covers all stable IDs, source paths,
finite 3D meshes, distinct shape definitions, common fit bounds, triangle budget,
full geometry/material disposal and the component's lazy/lifecycle boundaries.
The modified files pass targeted ESLint. Browser-level validation must additionally
check activation/close/reopen, keyboard/pointer movement, mobile resize and a
WebGL-disabled fallback in the configured application test environment.

## Construction-aware product selection (required)

Navigation has 13 broad types. Detail media and 3D must use
`getEquipmentVisual(product)` from `visualMap.js`, not its navigation category.
Listing/card icons use the independent `getEquipmentIcon(product)` from `iconMap.js`.
The audit adds 13 construction-specific definitions to the original library:
wall-box, wall-control-box, plain-floor-cabinet, single-door-switchgear,
compact-substation, double-compact-substation, kiosk-substation,
outdoor-switchgear-shelter, wall-canopy-box, mining-skid-substation,
railway-frame-substation, upper-input-protection and outdoor-floor-cabinet.
The full library therefore contains 26 definitions plus `equipment` fallback.

The helper returns `{ type, sourceFamilyId, sourcePages, confidence,
fallbackImage, reason }`. Render its `type` only when present. For `source-only`,
render the unchanged `fallbackImage` rather than forcing a generic 3D model.
`generic` means the construction has not been confirmed; `unverified` means no
verified construction visual is available. Do not advertise either as an exact
product picture. Even `source-matched` describes only shared outer construction.

All 238 official product/model rows remain independent. The detail-media/3D audit
is unchanged: 123 rows share 20 matched construction forms; 91 retain original
source illustrations; 14 website references use typical models; 10 records have
no verified construction drawing. These figures do not describe icon coverage.
See `visual-audit.md` for all 65 family decisions, and `visual-audit.json` for all
238 record-level mappings. Explicit per-record exceptions protect mixed-family
cases (БДРМ scheme-only records, УКЗВ overhead/cable input and БКТП/2БКТП).

Run both focused suites after changes:

```sh
node --test tests/equipment-models.test.mjs tests/equipment-visual-map.test.mjs
```

## Complete 2D icon coverage · 2026-10-01

Every official row now has a readable inline SVG: **238/238**, using **62 shared
construction/type silhouettes**. No record uses a scanned thumbnail or the generic
missing-image cube in place of its icon. Catalog rows, product summaries, variant
cards, comparison and selection all share `ProductIcon`.

- `sourceIconShapesA.js` / `sourceIconShapesB.js`: 38 additional 64 × 64 path-based
  silhouettes for verified special constructions; existing 26 type icons are reused
- `sourceIconMapA.js` / `sourceIconMapB.js`: all 65 family reviews and 49 explicit
  variant exceptions with Russian explanations and source pages
- `iconTypes.js`: pure icon registry; 65 definitions including unused navigation
  types and the unknown/API fallback; no Three.js import
- `iconMap.js`: `getEquipmentIcon(product)` returns type, confidence, reason,
  source family, source pages and source image without changing the product

172 record icons are source-based family/construction silhouettes. 66 are visibly
marked **≈** as typical or uncertain for the specific execution: 14 web-only
references, 10 records without drawings, and 42 mixed/ambiguous family variants.
The label, accessible SVG title and catalog legend explain the distinction.
Neither confidence level asserts exact CAD geometry, dimension, internal circuit,
or the guaranteed appearance of a delivered unit.

Missing detail drawings show the same labelled type icon instead of an empty
placeholder. Existing source illustrations, source links and 3D availability remain
unchanged. Icon-only types must never be sent to the 3D resolver as though a model
were available.

Validation: `node --test tests/equipment-icons.test.mjs` renders all definitions
using the real React component and raster-checks visible non-clipped artwork.
`node scripts/audit-catalog-icons.mjs OUTPUT_DIR` produces per-record evidence JSON,
a reusable icon-library contact sheet and four source-to-icon sheets covering all
65 families. `audit-catalog-preview.mjs` verifies the expected SVG on every exported
product detail route as well as local links/assets.
