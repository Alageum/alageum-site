# Navigation and shared construction visuals — validation, 2026-10-01

## User-facing result

- All 238 official records remain independent catalog rows with original IDs, URLs, source data, comparison identities and selection identities
- “Все товары (238)” supports global search/filtering without selecting a category
- Five broad categories retain 13 transformer, 80 substation, 23 switchgear, 76 cabinet and 46 protection records
- Non-empty navigation subtypes narrow the same original records; no family-card replacement or forced variant selector
- Category-specific summary/filter fields preserve source units; current/power search distinguishes `630 А`, `630 кА` and `630 кВА`
- Source-matched construction symbols are assigned from a reviewed map, independently of navigation subtype heuristics
- 123 records reuse 20 source-matched construction forms; 91 use unchanged source images; 14 older web references have explicitly typical illustrations; 10 records lack a verified construction image
- The reusable library has 26 forms, including generic and navigation-only forms. It does not create geometry per SKU
- Actual procedural 3D can be opened on applicable detail pages; Three.js loads only after activation, with no table-row canvas, autoplay, remote model/CDN request or continuous rendering loop
- Rotation/zoom/reset, keyboard controls, pointer/touch controls, cleanup and unavailable-WebGL fallback are implemented. Source illustrations and all source warnings remain available

## Passed checks

- `npm run check`: ESLint, 84 unit tests and optimized production build
- `npm run build:preview`: static export, including all 238 official detail routes
- `node scripts/audit-catalog-preview.mjs`: 277 HTML pages, all 238 media/provenance sections, all 104 source-page images, all per-record source-page links, 296 unique local route/asset paths; zero errors
- `npm run test:e2e:catalog -- --list`: 40 desktop/mobile cases compile and are discovered, including global search/navigation, filters, reload/back-forward, exact variant selection and no-WebGL fallback
- `git diff --check`: no whitespace errors
- The original `data.js`, `official.js`, `imported.js`, product inventories, source-page images and source crops are unchanged

## Verification limits

Browser interaction was not executed in this environment. The available Chromium test runtime is restricted by the sandbox (`socket() failed: Operation not permitted` in the existing run); cloud-browser localhost navigation returned `ERR_BLOCKED_BY_CLIENT`. No restrictions were bypassed. Mouse/touch rendering, live focus handling and responsive layout still need browser verification on the authorized published preview.

Construction matching concerns outer family form only. No exact dimensions, internal wiring, engineering clearances, engineering CAD, current certification or orderable SKU status is asserted. Mixed/uncertain cases deliberately retain the source image. Examples: БДРМ scheme-only references, УКЗВ cable versus overhead input, and combined БКТП/2БКТП drawings.

No GitHub push, external publication, audience change, backend change or real business transaction is part of this local implementation. Publishing is a separate step to the existing private preview.
