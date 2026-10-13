# Catalog identity completion · 6 October 2026

This batch preserves all 823 original runtime record bodies and appends exactly 20 explicit execution records. The result is 843 records; no new family cards are created. All 585 original transformer source shapes and all 238 legacy records stay byte-equivalent. Source inventory SHA-256 remains `c3948d7152a6130aa4672b9f6d3d5a8f08144b5965df7bebabca067ba5bc8438`; source PDF SHA-256 remains `8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e`.

## Data mapping

Two NTMI staging identifiers resolve to existing reference IDs for read navigation only. Ten differing source descriptions appear as panels on existing reference pages, and the two NTMI references gain their own source-evidence panels. The panels are not product cards and do not merge scalar specifications. All 32 formerly held rows are represented. Their 58 printed configurations are preserved as 40 configurations on admitted records and 18 in source panels. No Cartesian expansion or new order-ready SKU is asserted.

| Source record ID | Representation | Runtime or canonical reference ID | Legacy related reference |
| --- | --- | --- | --- |
| `alageum-2026-ntmi-10` | alias | `ntmi-10` | `ntmi-10` |
| `alageum-2026-ntmi-6` | alias | `ntmi-6` | `ntmi-6` |
| `alageum-2026-thermal-cabinet` | source-comparison | `cat-shtz` | `cat-shtz` |
| `alageum-2026-tmeg-250` | source-comparison | `tmeg-250` | `tmeg-250` |
| `alageum-2026-tsl-a-1600` | execution | `alageum-2026-tsl-a-1600` | `tsl-1600` |
| `alageum-2026-tsl-a-630` | execution | `alageum-2026-tsl-a-630` | `tsl-630` |
| `alageum-2026-tsl-c-1600` | execution | `alageum-2026-tsl-c-1600` | `tsl-1600` |
| `alageum-2026-tsl-c-630` | execution | `alageum-2026-tsl-c-630` | `tsl-630` |
| `alageum-tmg-01-1000` | execution | `alageum-tmg-01-1000` | `tmg-1000` |
| `alageum-tmg-01-2500` | execution | `alageum-tmg-01-2500` | `tmg-2500` |
| `alageum-tmg-01-400` | execution | `alageum-tmg-01-400` | `tmg-400` |
| `alageum-tmg-01-630` | execution | `alageum-tmg-01-630` | `tmg-630` |
| `alageum-tmg-copper-1000` | execution | `alageum-tmg-copper-1000` | `tmg-1000` |
| `alageum-tmg-copper-2500` | execution | `alageum-tmg-copper-2500` | `tmg-2500` |
| `alageum-tmg-copper-400` | execution | `alageum-tmg-copper-400` | `tmg-400` |
| `alageum-tmg-copper-630` | execution | `alageum-tmg-copper-630` | `tmg-630` |
| `alageum-tmg-standard-1000` | source-comparison | `tmg-1000` | `tmg-1000` |
| `alageum-tmg-standard-2500` | source-comparison | `tmg-2500` | `tmg-2500` |
| `alageum-tmg-standard-400` | source-comparison | `tmg-400` | `tmg-400` |
| `alageum-tmg-standard-630` | source-comparison | `tmg-630` | `tmg-630` |
| `alageum-tmg-switch-6-10-1000` | execution | `alageum-tmg-switch-6-10-1000` | `tmg-1000` |
| `alageum-tmg-switch-6-10-2500` | execution | `alageum-tmg-switch-6-10-2500` | `tmg-2500` |
| `alageum-tmg-switch-6-10-400` | execution | `alageum-tmg-switch-6-10-400` | `tmg-400` |
| `alageum-tmg-switch-6-10-630` | execution | `alageum-tmg-switch-6-10-630` | `tmg-630` |
| `alageum-tmg-x1k1-1000` | execution | `alageum-tmg-x1k1-1000` | `tmg-1000` |
| `alageum-tmg-x1k1-2500` | execution | `alageum-tmg-x1k1-2500` | `tmg-2500` |
| `alageum-tmg-x1k1-400` | execution | `alageum-tmg-x1k1-400` | `tmg-400` |
| `alageum-tmg-x1k1-630` | execution | `alageum-tmg-x1k1-630` | `tmg-630` |
| `alageum-tmgf-1600` | source-comparison | `tmgf-1600` | `tmgf-1600` |
| `alageum-tmgf-630` | source-comparison | `tmgf-630` | `tmgf-630` |
| `alageum-tmgs-pole-160` | source-comparison | `tmgs-160` | `tmgs-160` |
| `alageum-tmgs-pole-63` | source-comparison | `tmgs-63` | `tmgs-63` |

## Database migration and historical identity

No schema migration or destructive data operation is required. The existing insert-only catalog importer reads the original 823 records followed by these 20 additions. Against an unchanged 823-record catalog it creates 20 records and skips 823. A repeated import creates zero records and skips 843. It preserves existing CMS edits, hidden status, versions, UUIDs, public keys, quote references and snapshots. New database UUIDs use the unchanged `product:<exact public key>` UUIDv5 namespace. Aliases do not participate in UUID derivation, seeding, writes, RFQ IDs or storage migration.

The public GET detail handler resolves only the two exact NTMI aliases and verifies that the canonical record still has its original deterministic UUID. It retains product/category visibility checks and cannot fall back from an alias to an unrelated mutable slug. Admin/write handlers keep their existing UUID requirements. Existing canonical URLs remain reachable. The Next.js detail route generates both alias URLs and presents the canonical product identity without rewriting browser storage.

The completion manifest records explicit family memberships for the twenty rows. Original parent `variantIds` and configuration arrays stay unchanged so their approved source shapes remain exact; navigation can use each new record's existing `familyId` or the completion helper's explicit membership list.

## Source and asset boundaries

NTMI maximum-power values retain the catalog's кВА and the website's ВА labels; the website's anomalous rated-power кА header is also visible. Canonical and source-panel normalized generic kVA power remains null. TSL A/C loss-class labels and the two printed ТСЛ/ТСЛЗ configurations remain distinct; raw loss units are not rewritten. The new ШТЗ source description contains only its p86 relay evidence and never acquires the old 220 V, dimensions, mass, У3 or IP34. ТМЭГ-250 retains the new source's narrow voltage statement without inheriting omitted voltages.

Panels and relationship links are allowed only for exact reviewed static/API record shapes; API data additionally needs the original database UUID and saved source media. Unknown identities, prototype-supplied records, malformed/cyclic values, and changed identities/specifications fail closed. No panel is treated as an execution-equivalence assertion.

Existing geometry/icon approval remains exactly 251/257. Only the deny-only `knownRecordIds` list gains the twenty new IDs so removed provenance cannot trigger generic fallback. No geometry code, channel binding, existing source hash or record-shape guard is altered. All twenty new records remain source-only until separate asset review. Media packaging contains 843 associations but the same 248 raster assets and 21,968,700 bytes.

## Reproduction and verification

Run from the repository root:

    node scripts/complete-catalog-identities.mjs --check
    node scripts/import-transformers-2026.mjs --activate --clearance docs/catalog-transformers-2026/review/data-clearance.json --check
    node scripts/approve-transformer-assets.mjs docs/catalog-transformers-2026/review/assets-clearance.json --check
    node scripts/generate-catalog-media.mjs --check
    node --test frontend/tests/catalog-identity-completion.test.mjs backend-node/tests/catalog-identity-completion.test.js

The original transformer import manifest continues to describe the unchanged 585-record base clearance, including its historical hold decisions. `completion/manifest.json` is the separately reviewed resolution map; `backend-node/data/catalog-release.json` supplies the current 843-record release count. The completion generator verifies the original source inventory and reviewed held-record hashes and emits bounded, checksummed frontend/backend shards.

The hosted catalog integration suite now includes a rollback-isolated 823→843 migration probe, repeat-import idempotence, preservation of edited/hidden references, and NTMI RFQ snapshot replay across alias reads and reseeding. Local focused API/source/identity tests exercise alias visibility and fail-closed behavior without claiming a PostgreSQL run. No PostgreSQL binaries are available in this executor; the real transactional tests await the existing hosted disposable PostgreSQL workflow. No release, deployment or CMS publication is part of this batch.
