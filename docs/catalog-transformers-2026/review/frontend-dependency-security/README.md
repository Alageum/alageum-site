# Bounded frontend dependency security amendment

Baseline: PR42 head `47db11d6052e82455577f3d9190230d241c5b4c2`, tree `c02884c801b0599778dcd9d67d3aaf693619e905`.

Only dependency changes are sharp 0.35.4 to 0.35.5 (26 associated native binary/libvips entries) and source-map-js 1.2.1 to 1.2.2. Both fit the declared Next 16.3.8 / PostCSS ranges. Package.json, Next/React, backend dependencies, Page/Slate adapters, workflows, audit gates, application UI, source records and geometry are unchanged.

The new raw-byte verifier preserves the complete PR42 dependency closure and all historical clearances, reports and fixed maps. It admits only the exact new lock and seven explicit PR42 predecessor hashes after a real independent review. It calls no older verifier and performs no historical byte projection or authority caching. The test-only PR42 archive is never imported by release code; older fixtures retain their earlier snapshot priority and new tests exercise the live complete chain.

Before the amendment, clean npm ci, ESLint, the complete static Next production build and targeted Next image/source-map smoke tests passed. The unit suite correctly rejected the altered frozen lock (596/623 passed, 27 failed), which this bounded successor addresses. Full audit dropped from 7 to 5 high affected packages; all five remaining findings propagate from unpatched braces in the ESLint development chain. A diagnostic npm audit --omit=dev reported zero. The required full high-severity audit still fails; this amendment does not waive it or establish production readiness.

The installed prebuilt sharp binary reports librsvg 2.63.2. Next image optimization smoke tests covered WebP, AVIF, PNG and JPEG plus default SVG rejection; source-map tests covered PostCSS generation/consumption. Broad browser visual and hosted CI acceptance are separate from these local checks.

Primary advisories: [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
