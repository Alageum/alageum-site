"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { sourceDigest } = require("./catalog-media-evidence");
const { readIdentityCompletion } = require("./catalog-completion-source");
const { createHash } = require("node:crypto");
function readAdditionalCatalog(root, baseline) {
  const additional = JSON.parse(fs.readFileSync(path.join(root, "additional-sources.json")));
  const ids = new Set(baseline.map(r => r.id));
  const records = [...baseline];
  for (const entry of additional) {
    if (entry.path !== "../catalog-transformers-2026" || entry.sourceId !== "transformers-2026") throw new Error("Unknown additional catalog source");
    const directory = path.resolve(root, entry.path);
    const binding = JSON.parse(fs.readFileSync(path.join(directory, "review-binding.json")));
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")));
    const index = JSON.parse(fs.readFileSync(path.join(directory, "products.json")));
    if (!binding.activationAllowed || binding.clearance?.status !== "approved" || binding.inventorySha256 !== entry.inventorySha256 || binding.clearance.inventorySha256 !== entry.inventorySha256 || binding.clearance.sourceSha256 !== manifest.sourceSha256 || !manifest.active || index.format !== "alageum-catalog-chunks-v1") throw new Error("Unreviewed additional catalog source");
    const rows = [];
    for (const chunk of index.chunks) {
      if (!/^products\/part-\d{3}\.json$/.test(chunk.path)) throw new Error("Unsafe catalog path");
      const bytes = fs.readFileSync(path.join(directory, chunk.path));
      if (createHash("sha256").update(bytes).digest("hex") !== chunk.sha256 || bytes.length !== chunk.bytes) throw new Error("Catalog checksum mismatch");
      const part = JSON.parse(bytes);
      if (part.length !== chunk.recordCount) throw new Error("Catalog chunk count mismatch");
      rows.push(...part);
    }
    if (rows.length !== index.recordCount || rows.length !== entry.recordCount || rows.length !== manifest.recordCount) throw new Error("Catalog record count mismatch");
    if (sourceDigest(rows) !== binding.recordsSha256 || binding.recordsSha256 !== entry.recordsSha256 || entry.recordsSha256 !== manifest.recordsSha256) throw new Error("Catalog reviewed records hash mismatch");
    for (const row of rows) {
      if (ids.has(row.id) || row.sourceId !== entry.sourceId || row.sourceSha256 !== manifest.sourceSha256) throw new Error("Additional catalog identity conflict");
      ids.add(row.id); records.push(row);
    }
  }
  return records;
}
function readCatalog() {
  const root = path.resolve(__dirname, "../../data/catalog-import");
  const index = JSON.parse(fs.readFileSync(path.join(root, "products.json")));
  if (index.format !== "alageum-catalog-chunks-v1")
    throw new Error("Unknown catalog format");
  const records = [];
  for (const chunk of index.chunks) {
    if (path.isAbsolute(chunk.path) || chunk.path.split("/").includes(".."))
      throw new Error("Unsafe catalog path");
    const bytes = fs.readFileSync(path.join(root, chunk.path));
    if (createHash("sha256").update(bytes).digest("hex") !== chunk.sha256)
      throw new Error("Catalog checksum mismatch");
    const rows = JSON.parse(bytes);
    if (rows.length !== chunk.recordCount)
      throw new Error("Catalog chunk count mismatch");
    records.push(...rows);
  }
  if (records.length !== index.recordCount)
    throw new Error("Catalog record count mismatch");
  const overlay = JSON.parse(
    fs.readFileSync(path.join(root, "database-overlay.json")),
  );
  if (overlay.format !== "alageum-catalog-overlay-v1")
    throw new Error("Unknown catalog overlay");
  if (
    new Set(records.map((r) => r.id)).size !== records.length ||
    new Set(overlay.records.map((r) => r.id)).size !== overlay.records.length
  )
    throw new Error("Duplicate source keys");
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const r of overlay.records) byId.set(r.id, r);
  if (
    byId.size !== overlay.recordCount ||
    new Set(overlay.order).size !== overlay.order.length ||
    overlay.order.length !== byId.size ||
    overlay.order.some((id) => !byId.has(id))
  )
    throw new Error("Incomplete catalog overlay");
  const baseline = readAdditionalCatalog(root, overlay.order.map((id) => byId.get(id)));
  const release = JSON.parse(fs.readFileSync(path.resolve(root, "../catalog-release.json")));
  const result = readIdentityCompletion(path.resolve(root, "../catalog-identity-completion"), baseline, release);
  if (release.format !== "alageum-catalog-release-v1" || result.length !== release.recordCount || new Set(result.map(r => r.category)).size !== release.categoryCount) throw new Error("Catalog release count mismatch");
  return result;
}
module.exports = { readCatalog, readAdditionalCatalog };
