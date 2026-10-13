# Catalog import verification — 1 October 2026

## Passed on final application code

- ESLint
- 56/56 Node unit tests, including page coverage, exact input identity, category integrity, parent/model links, absence of fabricated wildcard cards, deduplication, source warnings, exact variant voltage units, consumed-power handling, mixed-page source links, pagination and existing inquiry/workspace behavior
- Normal Next.js production build: 286 generated/static route outputs; original dynamic backend routes preserved
- Static public preview build: 277 HTML files, including 247 product/detail routes (238 reference cards plus nine isolated demo fixtures)
- Final static HTML/link/asset audit: all 224 imported card HTML files contain their source specifications; specific ЯТП 12 V / 24 V summary values are present in HTML; 596 unique links checked, no broken local links or missing rendered images
- 104 source-page image files and 59 extracted family illustration files present
- Python syntax checks for both reproducibility scripts; git whitespace check
- Independent visual/model/source-page review with corrections applied

## Browser limitation

The Playwright catalog suite is configured and 34 desktop/mobile cases are discoverable, including four new flows for imported records, page-source navigation and voltage comparison. These interactive cases were not executed in this import task. The previously verified Chromium/runtime restriction remains a separate browser-verification limitation. Static generation and source-image review do not substitute for interactive visual/browser QA; the private-preview publisher should check the deployed site if its authenticated browser is available.

## Source limitation

Two RMU AE diagram labels on source page 30 are damaged and cannot be reliably read even at 700 dpi. They remain explicitly unresolved, with the original complete page visible. The entire product-family inventory and every readable model/table entry have been reconciled, but no exhaustive orderable-SKU claim is made. Printed inconsistencies are displayed in family notes.

## Preview behavior

The static export removes the API-only query hook from the disposable product-detail copy, allowing reference-card specifications to be emitted into initial HTML. Normal application source remains backend-aware. Catalog filtering, comparison, the page-source chooser and local demo interactions require JavaScript. Existing login/API-only routes are intentionally absent from the static public export, as before.

No GitHub publication was attempted. Deployment belongs to the existing private preview owner.
