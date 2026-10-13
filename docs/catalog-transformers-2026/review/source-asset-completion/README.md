# Bounded accessory and X4K3 source assets

This additive batch binds three page-85 accessories and ten exact X4K3 records. It adds thirteen source-grounded 3D defaults, adds ten source-based icon bindings and refines the three existing accessory icons. It creates no products, family defaults, construction alternatives, orderable SKUs, prices or dimensions.

The [independent integration review](./independent-review.json) and [clearance](./clearance.json) bind the exact implementation. Source applicability is separately documented for the [three accessories](./accessory-source-decision.json), [ten X4K3 entries](./x4k3-source-decision.json) and their [presentation requirements](./x4k3-presentation-scope.json). These source decisions retain their original bytes and narrower meanings.

## Runtime boundary

- `sourceAssetCompletionManifest.json` is a thirteen-key allowlist with source identity, record-shape SHA, original API UUID, raw source media and qualified reason
- `sourceAssetCompletion.js` reuses the unchanged transformer shape/identity verifier, rejects edited or foreign records and never inherits a family or category binding
- Six small registry hooks add three accessory types without changing the historical transformer geometry/icon libraries, EquipmentModel or its lazy viewer
- The visible X4K3 explanation links the reviewed drawing on page 30 or 31; its original page-28 gallery stays intact
- All accessory detailed previews retain the independent review's pictured-execution, hidden-surface and non-dimensional limitations

## Historical approval preservation

The original source, asset, execution-choice, supplemental and NTMI approval documents are unchanged. Nine exact baseline-to-candidate pairs cover the six runtime hooks and three historical checker adapters. The additional verifier accepts only this closed set, verifies all current bytes and its own pin against the independent report, and then exposes the attested baseline hash to historical checks. It cannot amend source transcription, shape hashing, media, old geometry or old approval documents.

The independent comparison uses clean commit `a8f4f88845823105b242499bbe7b804368fcd0c8`, tree `d53245e72ec843f5a8c3d88b3730cba1b166356b`. All 843 bodies/media, 830 unaffected static/API bindings, 238 legacy identities, 122 prior geometry/name outputs, 132 prior SVG/name outputs, aliases, source panels and 36/74 construction choices are preserved. `baseline-outputs.json` is a reproducible comparison fixture, not approval authority by itself.

## Verification

From the repository root:

    node scripts/check-source-asset-completion.mjs
    node --test frontend/tests/source-asset-completion.test.mjs frontend/tests/accessory2026-prototype.test.mjs
    node scripts/generate-catalog-media.mjs --check
    node scripts/audit-catalog-completion.mjs --check

The seven accepted prototype tests and `frontend/scripts/render-accessory-prototype.mjs` are retained. The [proof map](./retained-proof-map.json) identifies two small contact sheets without duplicating the original PDF or full-resolution page. They establish source/topology review, not hosted WebGL success.

**Hosted browser/WebGL QA remains pending publication.** The existing catalogue Playwright harness discovers 120 desktop/mobile cases, with twenty cases added for this batch. Those cases exercise the actual three accessory meshes/icons through static and API cards, explicit activation, rotation, close/disposal, navigation, source links, edited-record/UUID/media rejection, no-WebGL fallback and both X4K3 sizes. No local Chromium result is claimed.
