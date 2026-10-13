# Page 85 accessory exterior prototype

Status: isolated proposal, inspected on 2026-10-06 before implementation. No runtime registration, product binding, clearance amendment, publication or source modification is included.

Base: `a8f4f88845823105b242499bbe7b804368fcd0c8` (tree `d53245e72ec843f5a8c3d88b3730cba1b166356b`). Scope is exactly the source-labelled TR-100 relay, pictured pt-100 probe/cable and EK-290 vibration support. The proposed vocabulary is reusable only as those bounded exterior illustrations.

## Source inspected

- Retained approved transformer catalogue PDF, physical/printed page 85. SHA-256: `8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e` (verified locally).
- Actual repository page image `public/catalog-source/transformers-2026/page-085.webp`, SHA-256: `330a52d933cf91f7a00769eeee856bcd3f989a26d6906af2d168039486b649c2`.
- Both the full page image and a fresh 3200px rendering of the original page were visually inspected. Text below describes actual visible pixels, supplemented only where explicitly marked by the page's prose.

## TR-100: `alageum-2026-relay-tr100`

The upper-left photo is explicitly captioned as the TR-100 digital temperature relay. It shows a pale stepped rectangular case, with an upper and lower recessed terminal band behind the projecting front fascia. The fascia has a red rectangular display with three digit positions, five vertically stacked status lights on the left, four channel lights beside the display, three round buttons beneath it and two vertically separated buttons to the right. The right case side is visible. The small terminal screws are partly occluded; their count, port depths and electrical assignment are not dependable exterior geometry evidence.

Prototype boundary: shallow stepped opaque case, fascia, two dark/green terminal recess bands, unlit red display face, the visible five/four light groups and five buttons. No terminal count, wiring diagram, ports, rear mounting, DIN clip, screw threads, product dimensions or working temperature is asserted. Back/underside are plain closures for an illustrative object, not source evidence. The front display will remain blank; source digits are not live telemetry.

## Pictured pt-100: `alageum-2026-sensor-pt100`

The upper-right caption names pt-100 resistance sensors. This particular photograph shows one slender metallic probe at the lower left of a loosely coiled metallic-looking cable. The probe is connected to the cable; the free cable end exits lower right through a dark sleeve and divides into three visible slender leads (two reddish, one light). Several loose turns are visible, but the photograph does not establish a measured cable length or canonical turn count. The probe has a small change in diameter near its cable end; there is no visible threaded head, connector block, flange or housing.

Prototype boundary: one narrow cylindrical probe with the visible collar, one connected continuous cable in an illustrative loose coil, the dark sleeve and the three visible free lead ends. Coil turns/spacing are a display arrangement, not a specification or required PT100 execution. No internal wires, hidden connectors, conductor function/polarity, dimensions, braid weave or universal PT100 form is claimed.

## EK-290: `alageum-2026-damper-ek290`

The lower-right photo is explicitly captioned as EK-290. A long dark rectangular mounting flange projects beyond a raised opaque rectangular support. One round hole is visible in the near flange. The long raised upper surface has a broad depressed/curved seat, with a distinct darker inset surface; it is not a flat cube, spring, rubber puck or transformer. The page prose says upper/lower parts surround a rubber layer and describes a steel A2 plate at the top. Those internal layers are not separately visible enough to model. The prose mentions mounting holes in general, but the photo verifies the position of only the near hole.

Prototype boundary: flange with exactly the single source-visible near hole, raised opaque support with a broad concave top and a dark inset seat surface. Seat curvature and object proportions are illustrative, not a recovered radius or mechanical dimensions. No far/underside holes, hidden fasteners, sectional rubber layer, spring or installed wheel is added. Plain hidden closures are a necessary exterior illustration convention, not verified construction.

## Integration and review limits

All three are source-context exterior proposals, not CAD, exact executions or new binding clearance. Use only a closed accessory type allowlist; unknown types must fail closed, with no transformer/category fallback. Keep icon primitives independent of Three.js. Future approved integration should use the existing lazy EquipmentModel/CatalogSourcePreview route and small registry hooks, with its own dependency-hash review. Existing transformer modules, record data, prices, API IDs and model/icon mappings stay byte-for-byte unchanged.

Verification will include finite bounded meshes, front feature placement, a real open mounting hole, continuous probe/cable endpoints, resource disposal and vector rasterization/clipping checks. CPU orthographic mesh renders are inspection aids; they do not establish WebGL/browser acceptance. Local Chromium is not retried because the previously established IPC restriction remains applicable.

## Completed prototype checks

- Seven focused prototype tests passed. They verify source hash, a closed three-type allowlist, finite bounded opaque geometry, front controls/recess placement, actual continuous cable endpoints, three free leads, an actual open near mounting hole by raycast, concave seat height by raycast, no invented rear hardware, per-instance resource ownership, and disposal by both the new and existing generic disposer.
- Each of the three distinct SVG icons rasterized without clipping at 32, 64 and 128px. SVG titles are escaped, unknown types return null and no bitmap or Three.js dependency enters the icon module.
- Full existing frontend unit suite plus the prototype tests passed: 450 tests, zero failures/skips.
- Static CPU mesh rendering uses a per-pixel depth buffer, not a browser or WebGL. The front, oblique and plain reverse views were visually inspected alongside the original page; the two-dimensional icon sheet was inspected separately. The source/display distinction and plain unverified hidden closures remain explicit.
- Focused and full frontend ESLint passed. No browser acceptance or live integration has been asserted. Integration requires independent source review, narrowly scoped registry hooks, dependency-hash amendments and hosted browser QA.

Reproduce from `frontend`: `node --test tests/accessory2026-prototype.test.mjs`; `node scripts/render-accessory-prototype.mjs <output-directory>`. The render helper writes the mesh contact sheet PNG and the vector/icon review files without using a browser. All resources are ordinary geometry/materials; there are no textures, timers, listeners or render targets to dispose.
