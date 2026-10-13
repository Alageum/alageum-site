import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../lib/catalog/models/transformerExecutionChoices.js';
import { transformerRecordShape, recordShapeDigest } from '../lib/catalog/models/transformer2026Shape.js';
import registry from '../lib/catalog/sources-manifest.json' with { type: 'json' };
import { sourceContextManifest as manifest, verifySourceContextManifest, createSourceContextAssetVerifier, getCatalogSourceContext as context } from '../lib/catalog/source-context/sourceContexts.js';
const readAsset = path => readFile(new URL(`../public${path}`, import.meta.url));
const verifier = createSourceContextAssetVerifier(readAsset);
const evidence = await verifier.verify();
const originals = Object.keys(manifest.records).filter(id => !id.startsWith('cat-ktpb-k')).map(productById);
const api = record => normalizeApiProduct({
  id: manifest.records[record.id].databaseId, public_key: record.id, sku: record.sku,
  category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
  specs: record, provenance: record, media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
});
const result = record => context(record, evidence);

test('original 24 static/API contexts persist alongside exact additions; all 843 bodies and bindings remain untouched', () => {
  assert.ok(evidence);
  const before = JSON.stringify(officialProducts);
  const bindings = officialProducts.map(p => [getEquipmentVisual(p), getEquipmentIcon(p), getEquipmentConstructionChoices(p)]);
  assert.equal(officialProducts.length, 843);
  assert.equal(new Set(officialProducts.map(p => p.id)).size, 843);
  assert.deepEqual(officialProducts.filter(result).map(p => p.id).sort(), Object.keys(manifest.records).sort());
  assert.equal(originals.length, 24);
  for (const record of originals) {
    assert.equal(recordShapeDigest(transformerRecordShape(record)), manifest.records[record.id].recordShapeSha256);
    const a = result(record), b = result(api(record));
    assert.equal(a.canonicalId, record.id);
    assert.deepEqual(b.figures.map(f => f.key), a.figures.map(f => f.key));
    assert.deepEqual({ ...b, figures: b.figures.map(f => ({ ...f, exemplarHref: f.exemplarHref?.replace('?source=api', '') || null })) }, a);
    assert.equal(getEquipmentVisual(record).type, null);
    assert.equal(getEquipmentVisual(record).confidence, 'source-only');
    assert.equal(getEquipmentIcon(record).confidence, 'typical');
    assert.deepEqual(getEquipmentConstructionChoices(record), []);
    assert.equal('geometryType' in a || 'confidence' in a || 'type' in a || 'execution' in a, false);
    if (record.id.startsWith('cat-shnn-')) {
      assert.equal(a.figures.length, 2);
      assert.ok(a.figures.every(f => f.exemplarId === null && f.exemplarHref === null));
      assert.equal(a.intro, 'На стр. 35 приведены два примера общего вида. Они не подписаны обозначениями строк; соответствие выбранному исполнению не подтверждено.');
    } else {
      assert.equal(a.figures.length, 1);
      assert.match(a.intro, /климатическое исполнение не уточнено/);
      assert.ok(productById(a.figures[0].exemplarId));
      assert.equal(record.execution, undefined);
    }
  }
  assert.equal(JSON.stringify(officialProducts), before);
  assert.deepEqual(officialProducts.map(p => [getEquipmentVisual(p), getEquipmentIcon(p), getEquipmentConstructionChoices(p)]), bindings);
  assert.equal(officialProducts.flatMap(getEquipmentConstructionChoices).length, 74);
  assert.equal(officialProducts.filter(p => getEquipmentConstructionChoices(p).length).length, 36);
});

test('every canonical source/identity/spec mutation fails closed for static and normalized API records', () => {
  for (const record of originals) for (const source of [record, api(record)]) {
    for (const key of Object.keys(JSON.parse(transformerRecordShape(source)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key) ? [{ changed: key }] : key === 'sourceRow' ? { changed: true } : 'unreviewed';
      assert.equal(result({ ...source, [key]: value }), null, `${record.id}/${source.source}/${key}`);
    }
    for (const patch of [{ source: 'demo' }, { databaseId: 'wrong-importer-uuid' }, { sourceUrl: 'https://example.com' }, { familyId: 'cat-other' }, { recordKind: 'family' }, { sourceId: 'transformers-2026' }, { sourceMediaPath: '/catalog-products/other.webp' }]) {
      assert.equal(result({ ...source, ...patch }), null, `${record.id}/${source.source}/${JSON.stringify(patch)}`);
    }
    if (source.source === 'api') {
      for (const key of ['databaseId', 'sourceMediaPath']) { const missing = { ...source }; delete missing[key]; assert.equal(result(missing), null); }
      assert.deepEqual(result({ ...source, image: '/display-only.webp' }), result(source));
    } else {
      assert.equal(result({ ...source, sourceMediaPath: source.image }), null);
      assert.equal(result({ ...source, databaseId: undefined }), null);
    }
    // Neither mutable description nor variantSpecs is used as source authority or displayed as fact.
    assert.deepEqual(result({ ...source, description: 'UNREVIEWED ASSERTION', variantSpecs: [{ label: 'UNREVIEWED', value: 'U1' }] }), result(source));
  }
});

test('inherited identities, accessors, malformed input, changed evidence and unknown future rows are rejected', () => {
  const record = originals[0], cyclic = { ...record }; cyclic.sourceRow = cyclic;
  let called = false;
  const getter = { ...record }; Object.defineProperty(getter, 'id', { get() { called = true; return record.id; } });
  const inheritedSpec = { ...record, technicalSpecs: [Object.create(record.technicalSpecs[0])] };
  for (const value of [null, undefined, false, [], 'id', {}, Object.create(record), cyclic, getter, inheritedSpec, { ...record, technicalSpecs: {} },
    ...['__proto__', 'constructor', 'toString', 'cat-shnn-v019', 'cat-ptm-tded-v014'].map(id => ({ ...record, id }))]) assert.equal(result(value), null);
  assert.equal(called, false);
  assert.equal(context(record), null);
  assert.deepEqual(context(record, JSON.parse(JSON.stringify(evidence))), result(record));
  assert.equal(context(record, { ...evidence, manifestSha256: 'changed' }), null);
  assert.equal(context(record, { ...evidence, assets: [] }), null);
  for (const id of ['cat-shnn', 'cat-ptm-tded', 'cat-ptm-tded-v002', 'cat-ptm-tded-v005', 'cat-ptm-tded-v006', 'cat-ptm-tded-v008', 'cat-ptm-tded-v009', 'cat-ptm-tded-v012', 'cat-ptm-tded-v013']) assert.equal(result(productById(id)), null, id);
  assert.throws(() => result(record).figures.push({}), TypeError);
});

test('manifest pins exact crop boxes, captions, sources and cross-example mapping', () => {
  assert.equal(verifySourceContextManifest(), true);
  for (const mutate of [
    m => { m.source.source_sha256 = 'other'; },
    m => { m.source.source_file_id = 'other'; },
    m => { m.records['cat-shnn-v001'].databaseId = 'other'; },
    m => { m.records['cat-shnn-v001'].contextKey = 'ptm'; },
    m => { m.contexts.shnn.figureKeys[0] = 'tde-page69-labelled-example'; },
    m => { m.figures['shnn-page35-left-general-view'].cropBox[0]++; },
    m => { m.figures['shnn-page35-right-general-view'].caption = 'Verified execution'; },
    m => { m.figures['ptm-page69-labelled-example'].cropSha256 = 'other'; },
    m => { m.assets['/catalog-source/page-069.webp'].sha256 = 'other'; },
    m => { m.records['cat-shnn-v019'] = m.records['cat-shnn-v001']; },
  ]) { const changed = structuredClone(manifest); mutate(changed); assert.equal(verifySourceContextManifest(changed), false); }
  const old = registry.assets['/catalog-source/page-035.webp'].sha256;
  try { registry.assets['/catalog-source/page-035.webp'].sha256 = 'wrong'; assert.equal(result(originals[0]), null); }
  finally { registry.assets['/catalog-source/page-035.webp'].sha256 = old; }
});

test('source byte gate rejects missing or same-size corrupted page, raw media and crop assets', async () => {
  const paths = [...new Set([...Object.keys(manifest.assets), ...Object.values(manifest.figures).map(f => f.cropPath)])];
  assert.equal(paths.length, 14);
  for (const target of paths) {
    for (const failure of ['missing', 'corrupt']) {
      const broken = createSourceContextAssetVerifier(async path => {
        if (path === target && failure === 'missing') throw new Error('missing');
        const bytes = await readAsset(path);
        if (path === target) bytes[0] ^= 1;
        return bytes;
      });
      assert.equal(await broken.verify(), null, `${target}/${failure}`);
    }
  }
});

test('verification is shared across 24 rows, has no fetches, and invalidation clears the cache and cancels pending results', async () => {
  let count = 0;
  const shared = createSourceContextAssetVerifier(path => { count++; assert.ok(path.startsWith('/catalog-')); assert.ok(!path.endsWith('.pdf')); return readAsset(path); });
  const tokens = await Promise.all(originals.map(() => shared.verify()));
  assert.ok(tokens.every(token => token === tokens[0]));
  assert.equal(count, 14);
  for (const record of originals) assert.ok(context(record, tokens[0]));
  shared.invalidate();
  assert.ok(context(originals[0], JSON.parse(JSON.stringify(tokens[0])))); // Build proof is serializable, not a revocable credential.
  assert.ok(await shared.verify()); assert.equal(count, 28);
  let release;
  const delayed = createSourceContextAssetVerifier(async path => { await new Promise(resolve => { release ??= []; release.push(resolve); }); return readAsset(path); });
  const pending = delayed.verify(); delayed.invalidate(); release.forEach(resolve => resolve());
  assert.equal(await pending, null);
});

test('expected API UUIDs reproduce the checked-in importer namespace for every allowed row', async () => {
  const importer = await readFile(new URL('../../backend/app/catalog/importer.py', import.meta.url), 'utf8');
  const namespace = importer.match(/NAMESPACE = uuid.UUID\("([a-f0-9-]+)"\)/)[1];
  for (const [id, record] of Object.entries(manifest.records)) {
    const bytes = createHash('sha1').update(Buffer.from(namespace.replaceAll('-', ''), 'hex')).update(`product:${id}`).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    assert.equal([hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-'), record.databaseId);
  }
});


test('optional scalar/source/nested authority never evaluates Object.prototype data or getters', () => {
  const product = originals[0], expected = result(product);
  for (const key of ['execution', 'sourceId', 'sourceFileId', 'sourceSha256', 'sourceRow', 'label', 'unit']) {
    let hits = 0;
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, get() { hits++; return undefined; } });
      const actual = result(product);
      // A polluted inherited setter/readonly slot may stop the unchanged helper
      // from constructing its temporary shape; safe omission is also valid.
      if (actual !== null) assert.deepEqual(actual, expected, key);
      // Exercise missing optional keys inside technicalSpecs even though the
      // resulting changed record itself correctly fails the canonical digest.
      assert.equal(result({ ...product, technicalSpecs: [{}] }), null);
      assert.equal(hits, 0, `${key} getter must never execute`);
    } finally { delete Object.prototype[key]; }
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, value: 'unreviewed inherited value' });
      const actual = result(product);
      // A polluted inherited setter/readonly slot may stop the unchanged helper
      // from constructing its temporary shape; safe omission is also valid.
      if (actual !== null) assert.deepEqual(actual, expected, key);
    } finally { delete Object.prototype[key]; }
  }
  const hiddenChange = { ...product };
  Object.defineProperty(hiddenChange, 'execution', { value: 'unreviewed', enumerable: false });
  assert.equal(result(hiddenChange), null, 'non-enumerable own authority must still be checked');
  for (const prototype of [Object.prototype, Array.prototype]) {
    let hits = 0;
    try {
      Object.defineProperty(prototype, 'toJSON', { configurable: true, get() { hits++; return undefined; } });
      assert.equal(result(product), null);
      assert.equal(hits, 0, 'inherited serializer getter must never execute');
    } finally { delete prototype.toJSON; }
  }
});


test('build verification also ignores inherited optional source identity accessors', async () => {
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256']) {
    let hits = 0;
    try {
      Object.defineProperty(Object.prototype, key, { configurable: true, get() { hits++; return undefined; } });
      const proof = await createSourceContextAssetVerifier(readAsset).verify();
      assert.deepEqual(proof, evidence);
      assert.equal(hits, 0, `${key} build-gate getter must never execute`);
    } finally { delete Object.prototype[key]; }
  }
});
