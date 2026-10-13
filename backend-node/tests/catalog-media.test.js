"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readCatalog } = require("../src/domain/catalog-source");
const { options, validateNativeMedia, preview, readAsset, verifyPackage, registeredAsset, getCatalogSource } = require("../src/domain/catalog-media");
const { sameMedia, sourceDigest } = require("../src/domain/catalog-media-evidence");
const validation = require("../src/domain/catalog-validation");
const manifest = require("../data/catalog-media-manifest.json");
const publicManifest = require("../../frontend/lib/catalog/media-manifest.json");
const { importedProductId } = require("../src/domain/catalog-identity");
const records = readCatalog();
const imported = source => source.image ? [{ path: source.image, kind: "image", alt: source.imageCaption || "" }] : [];
const row = source => ({ public_key: source.id, source_data: source, media: imported(source), version: 1, transport_id: "fixture" });
const exception = records.find(record => record.id === "cat-bktp-modular-v001");

test("all released native media associations are derived from unchanged records/maps and exact canonical bytes", () => {
  execFileSync(process.execPath, [path.resolve(__dirname, "../../scripts/generate-catalog-media.mjs"), "--check"], { stdio: "pipe" });
  const result = verifyPackage();
  assert.equal(result.records, records.length);
  assert.equal(result.assets, 248);
  assert.equal(result.bytes, 21968700);
  assert.deepEqual(result.sources.substations, { records: 224, assets: 61, bytes: 1539242 });
  assert.deepEqual(result.sources["transformers-2026"], { records: records.filter(record => record.sourceId === "transformers-2026").length, assets: 187, bytes: 20429458 });
  let empty = 0;
  for (const source of records) {
    const result = options(row(source));
    assert.deepEqual(result.imported, imported(source));
    assert.deepEqual(result.source_pages, source.sourcePages || []);
    if (!result.reviewed.length) empty++;
    assert.equal(result.entries.length, result.reviewed.length);
    for (const entry of result.entries) {
      assert.equal(entry.path, result.reviewed[0].path);
      assert.ok(!entry.path.startsWith("/brand/"));
      assert.ok(entry.source_pages.every(page => source.sourcePages.includes(page)));
      assert.equal(preview(row(source), entry.id).bytes.length, entry.bytes);
    }
  }
  assert.equal(empty, 24);
});
test("reviewed page38 overrides the imported page39 evidence without making the crop editable", () => {
  const value = row(exception), choices = options(value);
  assert.equal(publicManifest.overrides[exception.id].database_id, importedProductId(exception.id));
  assert.equal(choices.imported[0].path, "/catalog-products/cat-bktp-modular.webp");
  assert.equal(choices.reviewed[0].path, "/catalog-source/page-038.webp");
  assert.equal(choices.entries[0].representation, "source-scan");
  assert.deepEqual(choices.entries[0].source_pages, [38]);
  assert.equal(choices.baseline_override, true);
  const reordered = [{ alt: value.media[0].alt, kind: "image", path: value.media[0].path }];
  assert.equal(options({ ...value, media: reordered }).baseline_override, true);
  validateNativeMedia(value, reordered);
  assert.throws(() => validateNativeMedia(value, [{ ...value.media[0], alt: "Edited" }]), error => error.status === 422);
  validateNativeMedia(value, choices.reviewed);
  validateNativeMedia(value, []);
  assert.equal(options({ ...value, media: [] }).baseline_override, false);
});
test("alt presence is distinct while JSONB object order does not affect immutable evidence", () => {
  const base = { path: "/catalog-products/cat-ktp-25-250.webp", kind: "image" };
  const values = [base, { ...base, alt: null }, { ...base, alt: "" }, { ...base, alt: "Description" }];
  for (let i = 0; i < values.length; i++) for (let j = 0; j < values.length; j++)
    assert.equal(sameMedia([values[i]], [values[j]]), i === j);
  assert.equal(sourceDigest({ z: [1, { b: 2, a: null }], a: false }), sourceDigest({ a: false, z: [1, { a: null, b: 2 }] }));
});
test("authoring rejects unrelated/brand/source-page choices, duplicates, and mutable evidence spoofing", () => {
  const value = row(records.find(source => source.image && source.id !== exception.id));
  const other = Object.values(manifest.assets).find(entry => entry.path !== value.media[0].path);
  for (const media of [
    [{ path: other.path, kind: "image" }], [{ path: "/brand/transformer.png", kind: "image" }],
    [{ path: "/catalog-source/page-001.webp", kind: "image" }], [value.media[0], value.media[0]],
  ]) assert.throws(() => validateNativeMedia(value, media), error => error.code === "validation_error");
  const fake = { ...value, source_data: {}, media: [], provenance: value.source_data, specs: value.source_data };
  assert.deepEqual(options(fake).entries, []);
  assert.throws(() => validateNativeMedia(fake, value.media));
  assert.deepEqual(options({ ...value, source_data: { ...value.source_data, name: "Changed source" } }).entries, []);
  for (const source of records.filter(source => !source.image)) assert.deepEqual(options(row(source)).entries, []);
});
test("valid existing legacy media survive omission, reordering and removal but not new edits", () => {
  const source = records.find(item => !item.image);
  const a = { path: "/brand/transformer.png", kind: "image", alt: null }, b = { path: "/catalog-source/page-001.webp", kind: "image" };
  const value = { ...row(source), media: [a, b] };
  validateNativeMedia(value, [b, a]);
  validateNativeMedia(value, [a]);
  validateNativeMedia(value, []);
  assert.throws(() => validateNativeMedia(value, [{ ...a, alt: "" }]));
  assert.throws(() => validateNativeMedia(value, [b, b]));
  validateNativeMedia({ ...value, media: [a, a] }, [a, a]);
  assert.throws(() => validateNativeMedia({ ...value, media: [a, a] }, [a, a, a]));
});
test("generic v1 retains its global safe-asset contract and validates kinds, count, alt and unsafe paths", () => {
  const parse = media => validation.parse(validation.patch, { version: 1, media });
  assert.deepEqual(parse([{ path: "/brand/transformer.png", kind: "image" }]).media, [{ path: "/brand/transformer.png", kind: "image" }]);
  const valid = row(exception).media[0];
  for (const unsafe of ["https://example.com/x.webp", "//example.com/x.webp", "/catalog-products/../brand/transformer.png", "/catalog-products/%2e%2e/x.webp", "/catalog-products/cat-bktp-modular.webp?x=1", "/catalog-products/cat-bktp-modular.webp#x", "/catalog-products//cat-bktp-modular.webp", "/catalog-products/cat-bktp-modular.svg"])
    assert.throws(() => parse([{ ...valid, path: unsafe }]), error => error.status === 422);
  for (const bad of [[{ ...valid, kind: "document" }], [{ ...valid, mime: "image/webp" }], [{ ...valid, alt: "a".repeat(1001) }], Array.from({ length: 51 }, () => valid)])
    assert.throws(() => parse(bad), error => error.status === 422);
  for (const alt of [undefined, null, "", "a".repeat(1000)]) parse([{ path: valid.path, kind: "image", ...(alt !== undefined ? { alt } : {}) }]);
});
test("preview identifiers bind to this exact immutable product and never resolve paths supplied by clients", () => {
  const value = row(exception), allowed = options(value).entries[0];
  const other = Object.values(manifest.assets).find(entry => entry.id !== allowed.id);
  for (const id of [other.id, "../public-assets.json", "%2e%2e", allowed.path, "https://example.com/a", "x".repeat(500)])
    assert.throws(() => preview(value, id), error => error.status === 404);
  assert.throws(() => preview({ ...value, source_data: {} }, allowed.id), error => error.status === 404);
});
test("release previews fail closed for missing, corrupt, symlinked or MIME-mismatched bytes", () => {
  const entry = options(row(exception)).entries[0];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-integrity-"));
  const target = path.join(directory, `${entry.id}.webp`);
  try {
    assert.throws(() => readAsset(entry, directory));
    fs.writeFileSync(target, Buffer.alloc(entry.bytes));
    assert.throws(() => readAsset(entry, directory));
    fs.writeFileSync(target, readAsset(entry));
    assert.throws(() => readAsset({ ...entry, mime: "image/svg+xml" }, directory));
    fs.unlinkSync(target);
    fs.symlinkSync(path.resolve(__dirname, `../data/catalog-media/${entry.id}.webp`), target);
    assert.throws(() => readAsset(entry, directory));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("KTPS v007 source-hash-bound media corrects page19 to page20 and rejects stale evidence", () => {
  const source = records.find(record => record.id === "cat-ktps-100-1600-v007");
  const value = row(source), choices = options(value);
  assert.equal(choices.imported[0].path, "/catalog-products/cat-ktps-100-1600.webp");
  assert.equal(choices.reviewed[0].path, "/catalog-source/page-020.webp");
  assert.deepEqual(choices.entries[0].source_pages, [20]);
  assert.equal(choices.baseline_override, true);
  assert.equal(publicManifest.overrides[source.id].database_id, importedProductId(source.id));
  assert.deepEqual(options({ ...value, source_data: { ...source, name: "stale source" } }).entries, []);
  validateNativeMedia(value, choices.reviewed);
  assert.equal(preview(value, choices.entries[0].id).bytes.length, 86498);
});


test("source registry rejects conflicting PDF identities and never infers them from equal page numbers", () => {
  const registry = require("../data/catalog-sources.json");
  const source = registry.sources["transformers-2026"];
  const identity = { sourceId: source.id, sourceFileId: source.source_file_id, sourceSha256: source.source_sha256, sourceUrl: source.source_url };
  assert.equal(getCatalogSource(identity).id, source.id);
  for (const conflict of [{ sourceId: "substations" }, { sourceFileId: "unknown" }, { sourceSha256: "0".repeat(64) }, { sourceUrl: registry.sources.substations.source_url }])
    assert.equal(getCatalogSource({ ...identity, ...conflict }), null);
  assert.equal(getCatalogSource({ sourcePages: [38] }), null);
  assert.equal(getCatalogSource("__proto__"), null);
  const newPage = registeredAsset("/catalog-source/transformers-2026/page-038.webp");
  const oldPage = registeredAsset("/catalog-source/page-038.webp");
  assert.notEqual(newPage.id, oldPage.id);
  assert.notEqual(newPage.source_file_sha256, oldPage.source_file_sha256);
});

test("all 187 staged transformer scans have exact source-bound bytes and can serve activated row associations", () => {
  const registry = require("../data/catalog-sources.json");
  const identity = registry.sources["transformers-2026"];
  const source = { id: "fixture-transformer-media", sourceId: identity.id, sourceFileId: identity.source_file_id,
    sourceSha256: identity.source_sha256, sourceUrl: identity.source_url, sourcePages: [1], image: "", imageSourcePage: 1 };
  try {
    for (let page = 1; page <= identity.page_count; page++) {
      source.image = `${identity.page_path_prefix}page-${String(page).padStart(3, "0")}.webp`;
      source.sourcePages = [page];
      source.imageSourcePage = page;
      const entry = registeredAsset(source.image);
      manifest.records[source.id] = { source_id: identity.id, source_file_sha256: identity.source_sha256,
        source_sha256: sourceDigest(source), source_pages: [page], imported: imported(source), reviewed: imported(source), entry_ids: [entry.id] };
      const value = row(source), choices = options(value);
      assert.equal(choices.source_id, identity.id);
      assert.equal(choices.source_file_sha256, identity.source_sha256);
      assert.deepEqual(choices.entries, [entry]);
      validateNativeMedia(value, choices.reviewed);
      assert.equal(preview(value, entry.id).bytes.length, entry.bytes);
      validation.parse(validation.patch, { version: 1, media: choices.reviewed });
      assert.deepEqual(options({ ...value, source_data: { ...source, sourceSha256: "0".repeat(64) } }).entries, []);
      assert.throws(() => validateNativeMedia({ ...value, media: [] }, [{ path: "/catalog-source/page-038.webp", kind: "image" }]), error => error.status === 422);
    }
  } finally { delete manifest.records[source.id]; }
  assert.equal(readCatalog().some(record => record.id === source.id), false);
});

test("exact asset metadata prevents registered-path, page and PDF identity substitution", () => {
  const entry = registeredAsset("/catalog-source/transformers-2026/page-187.webp");
  for (const change of [
    { source_id: "substations" }, { source_file_sha256: "0".repeat(64) }, { source_file_id: "other" },
    { source_pages: [104] }, { representation: "crop" }, { bytes: entry.bytes + 1 }, { sha256: "0".repeat(64) },
    { path: "/catalog-source/transformers-2026/page-188.webp" },
  ]) assert.throws(() => readAsset({ ...entry, ...change }), /Invalid catalog media package entry/);
  for (const invalid of ["/catalog-source/transformers-2026/page-000.webp", "/catalog-source/transformers-2026/page-188.webp", "/catalog-source/page-105.webp", "/catalog-source/unknown/page-001.webp", "/catalog-source/transformers-2026/../page-038.webp"])
    assert.equal(registeredAsset(invalid), null);
  const oldRow = row(exception);
  assert.throws(() => preview(oldRow, entry.id), error => error.status === 404);
  assert.throws(() => validateNativeMedia(oldRow, [{ path: entry.path, kind: "image" }]), error => error.status === 422);
});
