// Derived evidence only. Edit reviewed records/maps, then regenerate this release mirror.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { getEquipmentVisual } from '../frontend/lib/catalog/models/visualMap.js';
const require = createRequire(import.meta.url);
const { readCatalog } = require('../backend-node/src/domain/catalog-source.js');
const { importedProductId } = require('../backend-node/src/domain/catalog-identity.js');
const { digest, sourceDigest, sameMedia } = require('../backend-node/src/domain/catalog-media-evidence.js');
const { getCatalogSource, registeredAsset, verifySourceRegistry } = require('../backend-node/src/domain/catalog-media.js');
const registry = verifySourceRegistry();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const mirror = path.join(root, 'backend-node/data/catalog-media');
const manifest = { format: 'alageum-catalog-media-v2', source_registry_sha256: sourceDigest(registry), sources: {}, records: {}, assets: {} };
const publicManifest = { format: 'alageum-catalog-media-public-v2', overrides: {}, assets: {} };
const files = new Map();
const media = record => record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption || '' }] : [];
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

// Reviewed extraction provenance is independent of the editable runtime records.
const sourceManifest = readJson('docs/catalog-transformers-2026/review/source-manifest.json');
const newSource = registry.sources['transformers-2026'];
assert.equal(sourceManifest.source_file_id, newSource.source_file_id);
assert.equal(sourceManifest.sha256, newSource.source_sha256);
assert.equal(sourceManifest.page_count, newSource.page_count);
const pageAssets = readJson('docs/catalog-transformers-2026/review/source-page-assets.json');
assert.equal(pageAssets.length, newSource.page_count);
assert.equal(new Set(pageAssets.map(entry => entry.path)).size, pageAssets.length);
for (const page of pageAssets) {
  assert.equal(page.sourceFileId, newSource.source_file_id);
  assert.deepEqual(registry.assets[page.path], { source_id: newSource.id, representation: page.representation,
    source_pages: [page.pdfPage], sha256: page.sha256, bytes: page.bytes });
}

// Validate all canonical page/crop bytes, not only the scans selected by current rows.
const canonicalBytes = new Map();
for (const [file, entry] of Object.entries(registry.assets)) {
  const source = path.join(root, 'frontend/public', file);
  assert.ok(fs.lstatSync(source).isFile(), `Canonical asset must be a regular file: ${file}`);
  const bytes = fs.readFileSync(source);
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.equal(bytes.length, entry.bytes, `Source asset byte count mismatch: ${file}`);
  assert.equal(digest(bytes), entry.sha256, `Source asset checksum mismatch: ${file}`);
  canonicalBytes.set(file, bytes);
}
function asset(file, pages, sourceId) {
  const entry = registeredAsset(file);
  assert.ok(entry, `Unregistered reviewed asset ${file}`);
  assert.equal(entry.source_id, sourceId, `Reviewed asset from another PDF: ${file}`);
  assert.deepEqual(entry.source_pages, [...new Set(pages)].sort((a, b) => a - b), `Reviewed asset has different page evidence: ${file}`);
  manifest.assets[entry.id] = entry;
  publicManifest.assets[file] = { source_id: entry.source_id, representation: entry.representation, source_pages: entry.source_pages };
  files.set(`${entry.id}.webp`, canonicalBytes.get(file));
  return entry.id;
}
const records = readCatalog();
assert.equal(new Set(records.map(record => record.id)).size, records.length, 'Duplicate media association keys');
const legacyRecords = records.filter(record => getCatalogSource(record)?.id !== newSource.id);
assert.equal(legacyRecords.length, registry.legacy_baseline.record_count);
assert.equal(sourceDigest(legacyRecords), registry.legacy_baseline.records_sha256, 'Existing source records changed during new-source activation');
for (const record of records) {
  const source = getCatalogSource(record);
  const sourcePages = record.sourcePages || [];
  assert.ok(Array.isArray(sourcePages) && sourcePages.every(page => source && Number.isInteger(page) && page >= 1 && page <= source.page_count), `Invalid source page: ${record.id}`);
  if (record.sourceId || record.sourceFileId || record.sourceSha256 || record.sourceKind === 'supplied-pdf')
    assert.ok(source, `Unknown or conflicting PDF identity: ${record.id}`);
  if (source?.id === newSource.id) {
    assert.equal(record.sourceFileId, source.source_file_id, `Missing source file identity: ${record.id}`);
    assert.equal(record.sourceSha256, source.source_sha256, `Missing source PDF hash: ${record.id}`);
  }
  const imported = media(record);
  const visual = getEquipmentVisual(record);
  const reviewedPath = record.image ? visual.fallbackImage || record.image : null;
  let entryIds = [];
  if (record.image) {
    assert.ok(source && sourcePages.includes(record.imageSourcePage), `Missing imported image evidence: ${record.id}`);
    asset(record.image, [record.imageSourcePage], source.id);
    const pages = reviewedPath === record.image ? [record.imageSourcePage] : visual.sourcePages;
    assert.ok(pages.every(page => sourcePages.includes(page)), `Reviewed image outside record evidence: ${record.id}`);
    entryIds = [asset(reviewedPath, pages, source.id)];
  }
  const reviewed = reviewedPath ? [{ path: reviewedPath, kind: 'image', alt: reviewedPath.startsWith('/catalog-source/') ? `Страница ${manifest.assets[entryIds[0]].source_pages.join(', ')} исходного каталога; не фотография изделия` : record.imageCaption || '' }] : [];
  manifest.records[record.id] = { source_id: source?.id || null, source_file_sha256: source?.source_sha256 || null,
    source_sha256: sourceDigest(record), source_pages: sourcePages, imported, reviewed, entry_ids: entryIds };
  if (!sameMedia(imported, reviewed)) publicManifest.overrides[record.id] = { database_id: importedProductId(record.id), imported, reviewed };
}
assert.equal(legacyRecords.filter(record => !manifest.records[record.id].reviewed.length).length, registry.legacy_baseline.empty_records);
// Package the complete new source now; associations only appear after reviewed rows activate.
for (const page of pageAssets) asset(page.path, [page.pdfPage], newSource.id);
for (const source of Object.values(registry.sources)) {
  const assets = Object.values(manifest.assets).filter(entry => entry.source_id === source.id);
  const sourceRecords = Object.values(manifest.records).filter(record => record.source_id === source.id);
  const bytes = assets.reduce((sum, entry) => sum + entry.bytes, 0);
  assert.equal(assets.length, source.package_assets, `Incomplete asset package: ${source.id}`);
  assert.equal(bytes, source.package_bytes, `Incorrect asset package bytes: ${source.id}`);
  manifest.sources[source.id] = { records: sourceRecords.length, assets: assets.length, bytes };
}
const publicAssets = [...new Set([...require('../backend-node/data/public-assets.json').filter(file => file.startsWith('/brand/')), ...Object.keys(registry.assets)])].sort();
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const outputs = new Map([
  ['backend-node/data/catalog-media-manifest.json', json(manifest)],
  ['backend-node/data/public-assets.json', json(publicAssets)],
  ['frontend/lib/catalog/media-manifest.json', json(publicManifest)],
  ['frontend/lib/catalog/sources-manifest.json', json(registry)],
  ...[...files].map(([name, bytes]) => [`backend-node/data/catalog-media/${name}`, bytes]),
]);
if (!check) fs.mkdirSync(mirror, { recursive: true });
for (const [relative, bytes] of outputs) {
  const target = path.join(root, relative);
  if (check) { assert.ok(fs.lstatSync(target).isFile()); assert.deepEqual(fs.readFileSync(target), bytes, `${relative} is stale; regenerate media evidence`); }
  else fs.writeFileSync(target, bytes);
}
assert.deepEqual(fs.readdirSync(mirror).sort(), [...files.keys()].sort(), 'Unexpected release mirror bytes');
console.log(`Catalog media ${check ? 'verified' : 'generated'}: ${records.length} associations, ${files.size} raster assets, ${[...files.values()].reduce((sum, bytes) => sum + bytes.length, 0)} bytes across ${Object.keys(registry.sources).length} sources`);
