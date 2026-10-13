# Genuine photography increment — 12 October 2026

## Scope and coverage

15 local WebP assets, converted from the public official source bytes. No AI imagery or unrelated stock imagery. Corporate assets total six enterprise profiles, three documented project subjects and four equipment-category contexts. The fourth project, Nur-Esil, has no verified exact image and is deliberately unmapped. Protection-category imagery also remains unmapped.

94 of the 843 bundled records and the same 94 unchanged records replayed through the supported Node/Strapi importer/API contract have a reviewed photographic context: 7 family summaries, 81 specific model rows and 6 reference entries.

| Photo | Records | Meaning |
| --- | ---: | --- |
| KTZ distribution-transformer yard | 44 | Manufacturer context; not an exact product variant |
| Cast-resin dry transformer | 30 | Equipment-type example; no power, loss class or execution claim |
| AEMZ conservator-equipped TM | 15 | TM series only; never assigned to hermetic TMG |
| Asia Trafo AODCTN-167000 for Nura | 4 | Series example; individual winding/configuration not established |
| AEMZ KSO2-10 gallery | 1 | KSO2-10 series only; not KSO-292, KSO-366 or KERNEU |

The other 749 catalog records retain existing technical/CMS visuals or honest icons. This is a bounded first increment, not a claim that every SKU now has its own photo.

## Source and usage evidence

The machine-readable source credit, original URL, checked date, dimensions, source SHA-256 and optimized-byte SHA-256 are in:

- `frontend/lib/public/photography-manifest.json`
- `frontend/lib/catalog/photography-manifest.json`

Alageum enterprise pages supply plant imagery and establish company identity. AEMZ is identified as an Alageum enterprise at https://alageum.com/ru/predpriyatiya/too-aemz; its own manufacturer catalog supplies TM and KSO2-10 gallery photos. The KSO URL retains a misleading old CMS slug, but its current heading and gallery alt identify KSO2-10. The TM source page combines TM/TMG in its title; the pictured conservator permits only a TM-context mapping.

Project captions are specific to what is actually shown. Nura shows its manufactured 167 MVA transformer, not a finished substation panorama. Petropavlovsk shows the official project inspection, not a fabricated completed facility. Yassy shows the substation building, verified by the Turkestan government project page and Asia Trafo's project imagery. Historical photographs are not presented as current plant-condition evidence.

No reusable publication license was found. Public availability is not a license grant. These assets are prepared in a local review candidate; the website owner should confirm reuse rights before production publication. No third-party contact, account creation, publication or deployment was performed.

## Display and identity safety

Real photos have alt text, intrinsic dimensions, responsive Next Image sizes, visible short labels, explanatory captions and source links. Cover cropping is used for contextual scenes; individual products use contain. Only the photograph component has new CSS. The engineering data, comparison rules, filters, CMS schema, original source illustrations, 3D visual and family selector are preserved.

The static photo bindings are an explicit reviewed record allow-list, each with its complete canonical record digest and importer UUID. Runtime matching never guesses from a category, prefix or name. API rows require the exact UUID, source media and canonical source/specification shape plus a photography-only raw variant-specification digest; changes to these bound fields revoke the bundled photo rather than override owner-selected CMS media. Unknown, demo, malformed and inherited-property inputs fail closed.

Changing any binding requires a fresh editorial review of photo identity and source context. Do not mechanically regenerate the allow-list against future catalog changes. Historical catalog proof approvals must remain immutable; changed current component dependencies require an independently reviewed successor in the final integrated candidate.

## Verification

Run the focused tests from `frontend`:

`node --test tests/photography.test.mjs tests/catalog-family-render.test.mjs tests/catalog-media.test.mjs`

Run browser checks against a private production runtime, default port 3117:

`CHROMIUM_PATH=/usr/bin/chromium npx playwright test --config=playwright.photography.config.mjs`

For memory-constrained build hosts, `CIRCLE_NODE_TOTAL=2 NODE_OPTIONS=--max-old-space-size=700 npm run build` bounds Next's static worker count without changing application configuration.

Verified final increment: 26/26 focused unit tests, 14/14 Playwright cases across desktop 1440 and Pixel 7, ESLint, production build (894 static routes), and `git diff --check`. Browser cases cover image decoding and captions/source links, search/comparison/local selection, family-selector reset, absent-photo fallback, exact live Node API contract match and revocation after CMS-media or raw variant-specification edits, TM/KSO series attribution, plus PR45 before captures. Screenshot evidence is retained with the local deliverable. The full inherited proof suite is not claimed green: catalog component edits intentionally invalidate historical closure checks until a separately reviewed integration successor is created.

The live-contract regression reads the real backend-node catalog source and field lists, then runs the normal frontend API normalization. No database, importer, schema or UUID change is needed for 94-record compatibility. The legacy Python importer is not the current supported Node contract; its older 238-record catalog omits additional transformer provenance. Editorial description or image-alt changes do not revoke a photo; identity, source/specification values, selected media path and raw variant specifications do.
