import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { officialProducts, baselineOfficialProducts, transformerProducts, identityCompletionProducts, productById } from '../lib/catalog/data.js';
import { catalogIdentityCompletion, catalogReadAliases, getCatalogSourceComparisons, getCatalogRelatedReferences, getAdditionalCatalogVariantIds, resolveCatalogReadId } from '../lib/catalog/identityCompletion.js';
import { catalogSourceComparisons } from '../lib/catalog/identityCompletionData.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { sourcePageUrl } from '../lib/catalog/sources.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { transformerRuntimeManifest } from '../lib/catalog/models/transformer2026Runtime.js';
import { objectDigest, readInventories, normalizeSpec } from '../../scripts/catalog/transformer-adapter.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { readCatalog } = require('../../backend-node/src/domain/catalog-source.js');
const metadata = catalogIdentityCompletion;
const byId = new Map(officialProducts.map(record => [record.id, record]));
const inventories = readInventories(path.join(root, 'docs/catalog-transformers-2026/review'));
const sourceRows = new Map(inventories.flatMap(section => section.inventory.models).map(row => [row.id, row]));
const apiProduct = record => normalizeApiProduct({ id: metadata.guards[record.id].databaseId, public_key: record.id,
  sku: record.sku, category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
  specs: record, provenance: record, media: record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption }] : [],
});

test('exact843 runtime IDs preserve all original823 records and all585 transformer source shapes', () => {
  const original = [...baselineOfficialProducts, ...transformerProducts];
  assert.equal(original.length, 823); assert.equal(officialProducts.length, 843);
  assert.deepEqual(officialProducts.slice(0, 823), original);
  assert.equal(objectDigest(original), metadata.baselineRecordsSha256);
  assert.deepEqual(readCatalog(), officialProducts);
  assert.equal(metadata.counts.newFamilyCards, 0);
  assert.equal(metadata.inventorySha256, 'c3948d7152a6130aa4672b9f6d3d5a8f08144b5965df7bebabca067ba5bc8438');
  assert.equal(metadata.sourceSha256, '8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e');
});

test('twenty explicit executions retain printed labels, only printed configurations and null SKUs', () => {
  assert.equal(identityCompletionProducts.length, 20);
  assert.equal(identityCompletionProducts.filter(row => row.sourceFamilyId.startsWith('tmg-')).length, 16);
  assert.equal(identityCompletionProducts.filter(row => row.sourceFamilyId.startsWith('tsl-loss-')).length, 4);
  for (const row of identityCompletionProducts) {
    const input = sourceRows.get(row.id);
    assert.equal(row.execution, input.execution); assert.equal(row.designation, input.designation);
    assert.ok(row.name.includes(input.execution));
    assert.equal(row.sku, null); assert.equal(row.isOrderableSku, false);
    assert.equal(row.manufacturer, null); assert.deepEqual(row.manufacturers, []);
    assert.ok(byId.has(row.familyId)); assert.ok(getAdditionalCatalogVariantIds(row.familyId).includes(row.id));
    assert.deepEqual(row.rawSourceSpecs, input.rawSourceSpecs || input.rawSpecs || input.technicalSpecs);
    const expected = inventories.flatMap(section => section.inventory.configurations).filter(config => config.modelId === row.id);
    assert.deepEqual(row.configurations.map(config => config.id), expected.map(config => config.id));
    assert.ok(row.configurations.every(config => config.isOrderableSku === false));
    assert.equal(getCatalogRelatedReferences(row).length, 1);
    assert.equal(getCatalogSourceComparisons(row).length, 0);
  }
  assert.equal(identityCompletionProducts.reduce((sum, row) => sum + row.configurations.length, 0), 40);
});

test('two exact read aliases preserve canonical legacy IDs and do not create products', () => {
  assert.deepEqual(catalogReadAliases, { 'alageum-2026-ntmi-10': 'ntmi-10', 'alageum-2026-ntmi-6': 'ntmi-6' });
  for (const [alias, canonical] of Object.entries(catalogReadAliases)) {
    assert.equal(productById(alias), byId.get(canonical)); assert.equal(resolveCatalogReadId(alias), canonical);
    assert.equal(byId.has(alias), false); assert.equal(productById(canonical).id, canonical);
  }
  for (const id of ['__proto__', 'constructor', 'toString', 'alageum-2026-ntmi-6-x', 'ALAGEUM-2026-NTMI-6']) {
    assert.equal(resolveCatalogReadId(id), id); assert.equal(productById(id), undefined);
  }
  for (const id of [null, undefined, {}, [], 6]) assert.equal(resolveCatalogReadId(id), null);
});

test('ten source comparisons and twoNTMI evidence panels never union scalar specs or become cards', () => {
  assert.equal(catalogSourceComparisons.length, 12);
  assert.equal(catalogSourceComparisons.filter(panel => panel.representation === 'source-comparison').length, 10);
  assert.equal(catalogSourceComparisons.reduce((sum, panel) => sum + panel.configurations.length, 0), 18);
  for (const panel of catalogSourceComparisons) {
    const reference = byId.get(panel.canonicalId), source = sourceRows.get(panel.id);
    assert.ok(reference); assert.equal(byId.has(panel.id), false);
    assert.equal(getCatalogSourceComparisons(reference)[0], panel);
    assert.deepEqual(panel.rawSourceSpecs, source.rawSourceSpecs || source.rawSpecs || source.technicalSpecs);
    const family = inventories.flatMap(section => section.inventory.families).find(family => family.id === source.familyId);
    assert.deepEqual(panel.familySpecs, (family.technicalSpecs || []).map(normalizeSpec));
    assert.equal(panel.description, family.descriptionSource?.text || '');
    assert.equal(panel.comparison.legacySourceUrl, reference.sourceUrl);
    assert.equal(panel.sourceSha256, metadata.sourceSha256);
    assert.equal(panel.comparison.exactOrderableSkuProven, false);
    assert.match(sourcePageUrl(panel, panel.sourcePages[0]), /source=transformers-2026/);
  }
  const tmeg = catalogSourceComparisons.find(panel => panel.canonicalId === 'tmeg-250');
  assert.equal(tmeg.technicalSpecs.find(spec => spec.label === 'Номинальное напряжение').value, '6(6,3)');
  assert.ok(!tmeg.technicalSpecs.some(spec => /0[,.]4/.test(spec.value)));
  const cabinet = catalogSourceComparisons.find(panel => panel.canonicalId === 'cat-shtz');
  assert.deepEqual(cabinet.technicalSpecs.map(spec => spec.value), ['реле ТР-100 с датчиками']);
  assert.equal(cabinet.power, null); assert.ok(!JSON.stringify(cabinet.rawSourceSpecs).includes('IP34'));
  const tmg = catalogSourceComparisons.find(panel => panel.canonicalId === 'tmg-400');
  assert.deepEqual(tmg.comparison.comparedSpecs.filter(spec => spec.field === 'Lmm').map(spec => [spec.legacySourceValue, spec.newCatalogValue]), [['1294', '1309']]);
});

test('NTMI source units remainкВА/ВА/кА with normalized power null on both canonical records and panels', () => {
  for (const id of ['ntmi-6', 'ntmi-10']) {
    const record = byId.get(id), panel = getCatalogSourceComparisons(record)[0];
    assert.equal(record.power, null); assert.equal(panel.power, null);
    assert.equal(panel.technicalSpecs.find(spec => spec.label.startsWith('Максимальная')).unit, 'кВА');
    assert.ok(panel.comparison.conflicts.some(conflict => conflict.field === 'maximumPowerUnit' && conflict.legacySourceValue === 'ВА' && conflict.newCatalogValue === 'кВА'));
    assert.ok(panel.comparison.conflicts.some(conflict => conflict.field === 'ratedPowerHeader' && conflict.legacySourceValue === 'кА' && conflict.newCatalogValue === 'ВА'));
    assert.ok(panel.notes.some(note => note.includes('нормализованная мощность в кВА не определена')));
  }
});

test('source-panel and relation authority survives API roundtrip but closes on edited or fabricated records', () => {
  for (const id of Object.keys(metadata.guards)) {
    const record = byId.get(id), api = apiProduct(record);
    assert.deepEqual(getCatalogSourceComparisons(api), getCatalogSourceComparisons(record), id);
    assert.deepEqual(getCatalogRelatedReferences(api), getCatalogRelatedReferences(record), id);
    for (const patch of [{ id: '__proto__' }, { name: 'edited' }, { category: 'other' }, { sourceUrl: 'https://example.com' },
      { sourceFileId: 'other' }, { sourceSha256: 'other' }, { power: 1 }, { technicalSpecs: [{ label: 'changed', value: '1' }] },
      { databaseId: 'mutated' }, { sourceMediaPath: '/catalog-source/page-001.webp' }]) {
      assert.deepEqual(getCatalogSourceComparisons({ ...api, ...patch }), []);
      assert.deepEqual(getCatalogRelatedReferences({ ...api, ...patch }), []);
    }
    for (const bad of [Object.create(record), { id: record.id }, { ...record, source: 'demo' }, { ...record, databaseId: metadata.guards[id].databaseId }, { ...api, databaseId: undefined }]) {
      assert.deepEqual(getCatalogSourceComparisons(bad), []); assert.deepEqual(getCatalogRelatedReferences(bad), []);
    }
  }
  const cycle = { ...byId.get('ntmi-6') }; cycle.sourceRow = cycle;
  assert.deepEqual(getCatalogSourceComparisons(cycle), []);
  for (const value of [null, [], 'ntmi-6', Object.create(null)]) assert.deepEqual(getCatalogSourceComparisons(value), []);
});

test('new admissions receive only separately reviewed defaults; removed provenance always fails closed', () => {
  assert.equal(Object.keys(transformerRuntimeManifest.geometry).length, 276);
  assert.equal(Object.keys(transformerRuntimeManifest.icons).length, 282);
  assert.equal(transformerRuntimeManifest.knownRecordIds.length, 605);
  assert.equal(identityCompletionProducts.filter(record => getEquipmentVisual(record).type).length, 16);
  for (const record of identityCompletionProducts) {
    for (const candidate of [record, apiProduct(record)]) {
      assert.equal(getEquipmentVisual(candidate).type, transformerRuntimeManifest.geometry[record.id]?.type || null);
      assert.equal(getEquipmentIcon(candidate).type, transformerRuntimeManifest.icons[record.id]?.type || null);
    }
    const stripped = { ...record, sourceId: null, sourceFileId: null, sourceSha256: null };
    assert.equal(getEquipmentVisual(stripped).type, null); assert.equal(getEquipmentIcon(stripped).type, null);
  }
});

test('completion and original import generators reproduce exact committed inputs and outputs', () => {
  execFileSync(process.execPath, ['scripts/complete-catalog-identities.mjs', '--check'], { cwd: root, stdio: 'pipe' });
  execFileSync(process.execPath, ['scripts/import-transformers-2026.mjs', '--activate', '--clearance', 'docs/catalog-transformers-2026/review/data-clearance.json', '--check'], { cwd: root, stdio: 'pipe' });
  const parts = [...metadata.recordChunks, ...metadata.panelChunks];
  assert.ok(parts.every(part => part.bytes < 74000));
  for (const part of parts) assert.equal(fs.statSync(path.join(root, 'docs/catalog-transformers-2026/completion', part.path)).size, part.bytes);
});
