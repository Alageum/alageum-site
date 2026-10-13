"use strict";
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../../data/catalog-media-manifest.json");
const registry = require("../../data/catalog-sources.json");
const allowlist = new Set(require("../../data/public-assets.json"));
const { sourceDigest, digest, sameMediaEntry, sameMedia } = require("./catalog-media-evidence");
const { AppError } = require("./errors");
const mirrorRoot = path.resolve(__dirname, "../../data/catalog-media");
function getCatalogSource(value) {
  if (typeof value === "string") return Object.hasOwn(registry.sources, value) ? registry.sources[value] : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const identities = [["sourceId", "id"], ["sourceFileId", "source_file_id"], ["sourceSha256", "source_sha256"], ["sourceUrl", "source_url"]]
    .filter(([field]) => value[field] !== undefined && value[field] !== null && value[field] !== "");
  return identities.length ? Object.values(registry.sources).find(source => identities.every(([field, key]) => value[field] === source[key])) || null : null;
}
function registeredAsset(assetPath) {
  const asset = Object.hasOwn(registry.assets, assetPath) ? registry.assets[assetPath] : null;
  const source = asset && registry.sources[asset.source_id];
  return source ? { id: digest(assetPath), path: assetPath, kind: "image", ...asset,
    source_file_id: source.source_file_id, source_file_sha256: source.source_sha256, mime: "image/webp" } : null;
}
function evidence(row) {
  let source;
  try { source = typeof row.source_data === "string" ? JSON.parse(row.source_data) : row.source_data; }
  catch { return null; }
  const record = Object.hasOwn(manifest.records, row.public_key) ? manifest.records[row.public_key] : null;
  const identity = getCatalogSource(source);
  // Only the unchanged imported source object binds a row to a reviewed association.
  // Neither editable provenance nor a matching public key/page number grants authority.
  return record && source && sourceDigest(source) === record.source_sha256 &&
    record.source_id === (identity?.id || null) && record.source_file_sha256 === (identity?.source_sha256 || null) ? record : null;
}
function options(row) {
  const record = evidence(row);
  const stored = typeof row.media === "string" ? JSON.parse(row.media) : row.media || [];
  return {
    product_id: row.transport_id, public_key: row.public_key, version: row.version,
    source_id: record?.source_id || null, source_file_sha256: record?.source_file_sha256 || null,
    source_pages: record?.source_pages || [], imported: record?.imported || [], reviewed: record?.reviewed || [],
    entries: (record?.entry_ids || []).map(id => manifest.assets[id]),
    baseline_override: Boolean(record && !sameMedia(record.imported, record.reviewed) && sameMedia(stored, record.imported)),
  };
}
function invalid(index, message) {
  throw new AppError("validation_error", "Invalid native catalog media", 422, [{ loc: ["media", index], msg: message }]);
}
function validateNativeMedia(row, next) {
  const record = evidence(row);
  const eligible = new Set((record?.entry_ids || []).map(id => manifest.assets[id].path));
  const before = typeof row.media === "string" ? JSON.parse(row.media) : row.media || [];
  const remaining = [...before];
  const counts = new Map();
  next.forEach((item, index) => {
    const key = `${item.kind}:${item.path}`;
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    const oldCount = before.filter(old => old.path === item.path && old.kind === item.kind).length;
    if (count > Math.max(1, oldCount)) invalid(index, "Duplicate media cannot be added");
    if (item.kind === "image" && eligible.has(item.path)) return;
    const existing = remaining.findIndex(old => sameMediaEntry(old, item));
    if (existing < 0) invalid(index, "Only this record's reviewed assets may be added or edited; existing legacy attachments are read-only");
    remaining.splice(existing, 1);
  });
}
function readAsset(entry, root = mirrorRoot) {
  const expected = entry && typeof entry.path === "string" && registeredAsset(entry.path);
  if (!expected || !allowlist.has(entry.path) || sourceDigest(entry) !== sourceDigest(expected))
    throw new Error("Invalid catalog media package entry");
  const filename = path.join(root, `${entry.id}.webp`);
  if (!fs.lstatSync(filename).isFile()) throw new Error("Catalog media package must contain regular files");
  const bytes = fs.readFileSync(filename);
  if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256 ||
      bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP")
    throw new Error("Catalog media package integrity failure");
  return bytes;
}
function preview(row, id) {
  const record = evidence(row);
  if (!/^[a-f0-9]{64}$/.test(id || "") || !record?.entry_ids.includes(id))
    throw new AppError("media_not_found", "Reviewed media not found", 404);
  try { return { bytes: readAsset(manifest.assets[id]), mime: manifest.assets[id].mime }; }
  catch { throw new AppError("media_not_found", "Reviewed media unavailable", 404); }
}
function verifySourceRegistry() {
  if (registry.format !== "alageum-catalog-sources-v1" || !Object.hasOwn(registry.sources, registry.default_source_id))
    throw new Error("Unknown catalog source registry");
  for (const [id, source] of Object.entries(registry.sources)) {
    if (source.id !== id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
        !/^[a-f0-9]{64}$/.test(source.source_sha256) || !Number.isInteger(source.page_count) || source.page_count < 1 ||
        !/^\/catalog-source\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?$/.test(source.page_path_prefix))
      throw new Error("Invalid registered catalog source");
    const pages = Object.entries(registry.assets).filter(([, asset]) => asset.source_id === id && asset.representation === "source-scan");
    if (pages.length !== source.page_count) throw new Error("Incomplete source page registry");
    for (let page = 1; page <= source.page_count; page++) {
      const asset = registry.assets[`${source.page_path_prefix}page-${String(page).padStart(3, "0")}.webp`];
      if (!asset || asset.source_id !== id || asset.representation !== "source-scan" || sourceDigest(asset.source_pages) !== sourceDigest([page]))
        throw new Error("Invalid registered source page");
    }
  }
  for (const [assetPath, asset] of Object.entries(registry.assets)) {
    const source = registry.sources[asset.source_id];
    if (!source || !/^\/(?:catalog-products\/[a-z0-9-]+|catalog-source\/(?:[a-z0-9-]+\/)?page-\d{3})\.webp$/.test(assetPath) ||
        !["crop", "source-scan"].includes(asset.representation) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.bytes) || asset.bytes < 12 ||
        !Array.isArray(asset.source_pages) || !asset.source_pages.length || new Set(asset.source_pages).size !== asset.source_pages.length ||
        !asset.source_pages.every(page => Number.isInteger(page) && page >= 1 && page <= source.page_count))
      throw new Error("Invalid registered catalog asset");
  }
  return registry;
}
function verifyPackage() {
  verifySourceRegistry();
  if (manifest.format !== "alageum-catalog-media-v2" || manifest.source_registry_sha256 !== sourceDigest(registry))
    throw new Error("Unknown or stale catalog media package");
  const entries = Object.values(manifest.assets);
  const actual = fs.readdirSync(mirrorRoot).sort();
  const expected = entries.map(entry => `${entry.id}.webp`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unexpected catalog media package files");
  const sources = Object.fromEntries(Object.values(registry.sources).map(source => [source.id, { records: 0, assets: 0, bytes: 0 }]));
  let bytes = 0;
  for (const [id, entry] of Object.entries(manifest.assets)) {
    if (id !== entry.id) throw new Error("Invalid media entry identity");
    bytes += readAsset(entry).length;
    sources[entry.source_id].assets++;
    sources[entry.source_id].bytes += entry.bytes;
  }
  const records = require("./catalog-source").readCatalog();
  if (records.length !== Object.keys(manifest.records).length) throw new Error("Unexpected media association count");
  for (const source of records) {
    const record = evidence({ public_key: source.id, source_data: source });
    if (!record || sourceDigest(record.source_pages) !== sourceDigest(source.sourcePages || [])) throw new Error("Stale media association");
    const identity = getCatalogSource(source);
    if (identity) sources[identity.id].records++;
    if (record.entry_ids.length !== record.reviewed.length || record.entry_ids.some((id, index) => {
      const entry = manifest.assets[id];
      return !entry || entry.path !== record.reviewed[index].path || record.reviewed[index].kind !== "image" ||
        entry.source_id !== record.source_id || !entry.source_pages.every(page => record.source_pages.includes(page));
    })) throw new Error("Invalid associated media evidence");
    for (const item of record.imported) {
      const entry = registeredAsset(item.path);
      if (!entry || entry.source_id !== record.source_id || !entry.source_pages.every(page => record.source_pages.includes(page)))
        throw new Error("Invalid imported media evidence");
    }
  }
  for (const source of Object.values(registry.sources)) {
    if (sources[source.id].assets !== source.package_assets || sources[source.id].bytes !== source.package_bytes)
      throw new Error("Incomplete source media package");
  }
  if (sourceDigest(sources) !== sourceDigest(manifest.sources)) throw new Error("Stale source package summary");
  return { records: records.length, assets: entries.length, bytes, sources };
}
module.exports = { options, validateNativeMedia, preview, readAsset, verifyPackage, evidence, getCatalogSource, registeredAsset, verifySourceRegistry };
