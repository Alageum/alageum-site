"use strict";
const { v5: uuid5 } = require("uuid");
const NAMESPACE = "541788ee-fbf0-4d85-9d33-e593b82f303c";
const importedProductId = (key) => uuid5(`product:${key}`, NAMESPACE);
const aliases = require("../../data/catalog-identity-completion/manifest.json").aliases;
// Read-only URL resolution. UUID derivation and all persisted identities stay exact.
const resolveCatalogReadId = (key) => typeof key === "string" ? (Object.hasOwn(aliases, key) ? aliases[key] : key) : null;
module.exports = { NAMESPACE, importedProductId, resolveCatalogReadId };
