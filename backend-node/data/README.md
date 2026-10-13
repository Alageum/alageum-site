# Reviewed public catalog fixture

This runtime-only snapshot copies `docs/catalog-import/products.json`, its declared
`products/*.json` chunks and `database-overlay.json` from the repository's reviewed
public catalog. `public-assets.json` is the corresponding published-asset allowlist.
It contains no private proposal, commercial terms, credentials or customer data.

The Node importer verifies chunk SHA-256/counts and overlay identity/order before
inserting. All 238 records preserve the existing UUIDv5 namespace and public keys.
Re-import is insert-only and must not overwrite administrator edits or hides.

Re-copy and review these source files together when changing the catalog; do not
modify this fixture independently or download unreviewed source material at startup.
The frontend continues to serve its existing catalog assets. No Python runtime is
needed to read or import this snapshot.
