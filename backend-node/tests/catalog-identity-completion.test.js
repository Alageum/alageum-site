"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { readCatalog } = require("../src/domain/catalog-source");
const { readIdentityCompletion } = require("../src/domain/catalog-completion-source");
const { sourceDigest, digest } = require("../src/domain/catalog-media-evidence");
const { resolveCatalogReadId, importedProductId } = require("../src/domain/catalog-identity");
const { createCatalog, PRODUCT, CATEGORY } = require("../src/domain/catalog");
const v = require("../src/domain/catalog-validation");
const manifest = require("../data/catalog-identity-completion/manifest.json");
const release = require("../data/catalog-release.json");
const records = readCatalog(), baseline = records.slice(0, 823), admissions = records.slice(823);

test("append-only source loader binds843 identities to original823 and validates every new execution", () => {
  assert.equal(records.length, 843); assert.equal(admissions.length, 20);
  assert.equal(sourceDigest(baseline), manifest.baselineRecordsSha256);
  assert.equal(sourceDigest(admissions), manifest.recordsSha256);
  for (const row of admissions) {
    const value = v.parse(v.create, { public_key: row.id, slug: row.id, category_id: importedProductId('test-category'),
      sku: row.sku, translations: { ru: { name: row.name, description: row.description } },
      specs: row, provenance: { sourceId: row.sourceId, sourceFileId: row.sourceFileId, sourceSha256: row.sourceSha256, sourceUrl: row.sourceUrl, sourcePages: row.sourcePages },
      media: [{ path: row.image, kind: 'image', alt: row.imageCaption }],
    });
    assert.equal(value.sku, null); assert.equal(value.price, null); assert.equal(value.price_mode, 'on_request');
    assert.equal(value.specs.execution, row.execution);
  }
});

test("completion loader rejects stale baseline, changed manifest, corrupt chunks, unsafe paths and unreviewed identities", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-identity-completion-'));
  try {
    fs.cpSync(path.join(__dirname, '../data/catalog-identity-completion'), directory, { recursive: true });
    const bytes = value => Buffer.from(JSON.stringify(value));
    const writeManifest = value => { const content = bytes(value); fs.writeFileSync(path.join(directory, 'manifest.json'), content); return { ...release, sources: { ...release.sources, identityCompletion: { ...release.sources.identityCompletion, manifestSha256: digest(content) } } }; };
    assert.deepEqual(readIdentityCompletion(directory, baseline, release), records);
    assert.throws(() => readIdentityCompletion(directory, [{ ...baseline[0], power: 1 }, ...baseline.slice(1)], release), /review binding/);
    fs.appendFileSync(path.join(directory, 'manifest.json'), ' ');
    assert.throws(() => readIdentityCompletion(directory, baseline, release), /manifest checksum/);
    let trial = structuredClone(manifest);
    trial.recordChunks[0].path = '../catalog-import/products.json';
    assert.throws(() => readIdentityCompletion(directory, baseline, writeManifest(trial)), /Unsafe/);
    trial = structuredClone(manifest); let currentRelease = writeManifest(trial);
    fs.appendFileSync(path.join(directory, trial.recordChunks[0].path), ' ');
    assert.throws(() => readIdentityCompletion(directory, baseline, currentRelease), /checksum/);
    // Even valid regenerated chunk hashes cannot admit an unknown identity or overwrite a baseline ID.
    for (const id of ['unknown-execution', baseline[0].id]) {
      trial = structuredClone(manifest);
      const changed = structuredClone(admissions); changed[0].id = id;
      const content = bytes(changed); fs.writeFileSync(path.join(directory, 'records-999.json'), content);
      trial.recordChunks = [{ path: 'records-999.json', recordCount: changed.length, bytes: content.length, sha256: digest(content) }];
      trial.recordsSha256 = sourceDigest(changed); currentRelease = writeManifest(trial);
      currentRelease.sources.identityCompletion.recordsSha256 = trial.recordsSha256;
      assert.throws(() => readIdentityCompletion(directory, baseline, currentRelease), /identity conflict/);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("NTMI aliases affect exact read keys only; deterministic database and historical IDs never canonicalize", () => {
  for (const [alias, canonical] of Object.entries(manifest.aliases)) {
    assert.equal(resolveCatalogReadId(alias), canonical);
    assert.notEqual(importedProductId(alias), importedProductId(canonical));
    assert.equal(records.filter(row => row.id === canonical).length, 1);
    assert.equal(records.some(row => row.id === alias), false);
  }
  for (const id of ['__proto__', 'constructor', 'toString', 'alageum-2026-ntmi-6-x', 'ALAGEUM-2026-NTMI-6']) assert.equal(resolveCatalogReadId(id), id);
  for (const id of [null, {}, [], undefined]) assert.equal(resolveCatalogReadId(id), null);
});

test("public alias reads are read-only, enforce canonical UUID and preserve category/product visibility", async () => {
  const category = { transport_id: importedProductId('test-category'), public_key: 'transformers', is_published: true };
  let row = { transport_id: importedProductId('ntmi-6'), public_key: 'ntmi-6', category_id: category.transport_id, status: 'published', specs: { power: null }, provenance: {}, translations: { ru: { name: 'НТМИ-6' } } };
  const calls = [];
  const db = table => ({ where(query) { calls.push({ table, query }); return { first: async () => table === PRODUCT ? (query.public_key === row.public_key || query.transport_id === row.transport_id || query.slug === row.slug ? structuredClone(row) : undefined) : table === CATEGORY && query.transport_id === category.transport_id ? structuredClone(category) : undefined }; } });
  const catalog = createCatalog({ db, authorizer: { manager: async () => ({}) } });
  const get = async id => { const ctx = { params: { id } }; await catalog.get(ctx); return ctx.body; };
  const original = JSON.stringify(row);
  assert.deepEqual(await get('alageum-2026-ntmi-6'), await get('ntmi-6'));
  assert.equal(JSON.stringify(row), original);
  for (const status of ['hidden', 'draft']) { row.status = status; await assert.rejects(get('alageum-2026-ntmi-6'), error => error.status === 404); }
  row.status = 'published'; category.is_published = false;
  await assert.rejects(get('alageum-2026-ntmi-6'), error => error.status === 404); category.is_published = true;
  row.transport_id = importedProductId('another-product'); row.slug = 'ntmi-6'; calls.length = 0;
  await assert.rejects(get('alageum-2026-ntmi-6'), error => error.status === 404);
  assert.equal(calls.filter(call => Object.hasOwn(call.query, 'slug')).length, 0, 'Alias must not fall back to another mutable slug');
  row = { ...row, public_key: 'other', slug: 'ntmi-6' };
  await assert.rejects(get('alageum-2026-ntmi-6'), error => error.status === 404);
  for (const id of ['__proto__', 'constructor', 'alageum-2026-ntmi-6-x']) await assert.rejects(get(id), error => error.status === 404);
  await assert.rejects(catalog.get({ params: { id: 'alageum-2026-ntmi-6' } }, true), error => error.status === 422);
});
