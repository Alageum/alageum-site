# Current local-content contract — 2026-10-27

This is a new bounded contract, **not a historical approval or recovery of the original PDF**. The original `frontend/tests/local-content-migration.test.mjs` is archived unchanged at `history/local-content-migration.test.mjs`, SHA-256 `d477969f31db9e2a19f3669da63d3f91f9fd1c3cab31fd348a86de6f3e8acad7`. Its original completeness assertion requires a file deliberately omitted from Git; it remains unsatisfied. The archived text retains original relative imports as provenance, not as a runnable test from this new directory. Restore it to its original location in an isolated complete historical checkout to replay that older contract. No skip or historical hash/approval was fabricated.

## Basis and current scope

- `README_HANDOFF.md` records explicit exclusion of the 844084378-byte original from Git; its earlier description of broken links is historical.
- `docs/release-2026-10-23/frontend-validation.md` records the subsequent removal of the broken download and retention of the 187-page local viewer.
- `docs/catalog-transformers-2026/review/source-manifest.json` states `original_pdf_publication_planned=false`.
- Current `localResourceHref` maps the original Drive identity to the local viewer, not the absent raw file.

The current verifier requires all three actually published PDFs (group catalogue, Asia Trafo references, reconstructed substations edition), valid PDF headers, exact sizes/SHA-256 retained in `handoff/GIT_FILE_MANIFEST.json`, and their established local routes. It verifies every one of 187 transformer scans against the existing source manifest's size/SHA-256, page identity and exact local route. The 187 source-scan entries, sorted by path and serialized with JSON.stringify, are independently pinned to SHA-256 `079e45eac433e1e2a95960ed64fe4164024bea0328f50c791ce2cea05f62ebcc`; the full retained raw manifest SHA-256 is `23d30c3d87a43abe24c9843453b3e0c69e32af3f7674629e4d9a8b7b6ae06f9c`. These pins bind restored evidence, not a new historical approval; coordinated asset+manifest tampering is rejected. Source ID/hash/size/page count must match the historical source identity. Rendering tests retain the real localization/resource wrappers and require the honest separate-original notice, correct page, and absence of raw original or replacement-download links in RU/KK/EN. Negative tests delete or tamper assets, alter identity/routes, and reintroduce broken downloads; each must fail. These tests establish current application behavior, not renewed historical approval or independent publisher authorization.

## Original PDF remains unavailable / NOT_VERIFIED

The original is not packaged in this checkout. Its acquisition and any future hosting require an approved operator transfer; no original bytes are verified by this current viewer contract.

Expected historical SHA-256: `8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e`; expected 187 pages. Neither original bytes, original hash nor original page count has been reverified. The old `document-migration.json` verified flag is historical only. Do not reconstruct an original from scans, place a substitute at its filename, or claim this verifier covers the original.

If an operator later receives the actual original by an approved large-file route, keep it outside public assets initially; verify exact byte size, SHA-256 and 187 PDF pages. Separately resolve hosting/publication authority. This change does not authorize downloading, publishing or hosting the giant original.

Run from `frontend`:

```
node scripts/verify-local-content-contract.mjs
node --test tests/local-content-migration.test.mjs tests/local-content-contract.test.mjs tests/catalog-source-download.test.mjs
```
