import { transformerRuntimeManifest } from '../lib/catalog/models/transformer2026Runtime.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { officialProducts, transformerProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { transformer2026AssetEvidence } from '../lib/catalog/models/transformer2026Bindings.js';
import { transformer2026Types } from '../lib/catalog/models/transformer2026Types.js';
import { createTransformer2026Geometry, disposeTransformer2026Geometry } from '../lib/catalog/models/transformer2026Geometry.js';
import { renderTransformer2026Icon } from '../lib/catalog/models/transformer2026Icons.js';
import { getEquipmentConstructionChoices as choices, getEquipmentConstructionChoice as select, transformerExecutionChoicesManifest as manifest } from '../lib/catalog/models/transformerExecutionChoices.js';
import { buildTransformerExecutionChoices } from '../../scripts/approve-transformer-execution-choices.mjs';
import { assertReviewedTransformerDependency } from '../../scripts/catalog/transformer-reviewed-dependencies.mjs';

const root = new URL('../../', import.meta.url);
const read = relative => JSON.parse(fs.readFileSync(new URL(relative, root), 'utf8'));
const clearance = read('docs/catalog-transformers-2026/review/execution-choice-clearance.json');
const historicalManifest = read('frontend/lib/catalog/models/transformerExecutionChoicesManifest.json');
const held = read('docs/catalog-transformers-2026/staging/identity-manifest.json').held;
const mixed = transformerProducts.filter(record => Object.hasOwn(manifest.records, record.id));
const api = record => normalizeApiProduct({
  id: manifest.records[record.id].database_id, public_key: record.id, sku: null,
  category_public_key: record.category, translations: { ru: { name: record.name } },
  specs: record, provenance: record,
  media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
});

test('separate clearance reproduces exactly 32 admitted mixed records and 66 explicit choices', () => {
  assert.deepEqual(buildTransformerExecutionChoices(clearance), historicalManifest);
  for (const [id, record] of Object.entries(historicalManifest.records)) assert.deepEqual(manifest.records[id], record);
  assert.equal(manifest.selectionMode, 'explicit-only');
  assert.equal(mixed.length, 32);
  assert.equal(Object.keys(manifest.choices).length, 7);
  assert.equal(mixed.flatMap(choices).length, 66);
  const proposals = transformer2026AssetEvidence.records.filter(row => row.status === 'execution-choice-required');
  assert.deepEqual(mixed.map(row => row.id).sort(), proposals.map(row => row.sourceRecordId).sort());
  for (const record of mixed) {
    const proposed = proposals.find(row => row.sourceRecordId === record.id);
    assert.deepEqual(choices(record).map(choice => choice.id), proposed.choices.map(choice => choice.groupId));
    assert.equal(held.some(row => row.id === record.id), false);
    assert.equal(select(record), null);
    assert.equal(select(record, ''), null);
  }
});

test('every valid selection returns its exact reviewed geometry, icon and original source provenance', () => {
  for (const record of mixed) {
    const original = structuredClone(record);
    const before = { visual: getEquipmentVisual(record), icon: getEquipmentIcon(record) };
    for (const choice of choices(record)) {
      assert.deepEqual(select(record, choice.id), choice);
      assert.equal(choice.sourceRecordId, record.id);
      assert.equal(choice.sourceFamilyId, record.sourceFamilyId);
      for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl']) assert.equal(choice[key], record[key]);
      assert.ok(choice.sourcePages.every(page => record.sourcePages.includes(page)));
      assert.equal(choice.fallbackImage, `/catalog-source/transformers-2026/page-${String(choice.sourcePages[0]).padStart(3, '0')}.webp`);
      assert.ok(Object.hasOwn(transformer2026Types, choice.geometryType));
      assert.equal(choice.geometryType, choice.iconType);
      assert.equal(choice.dimensionAccurate, false);
      assert.equal(choice.exactMeshReuseAllowed, false);
      assert.match(choice.disclosure, /не CAD/);
      assert.ok(choice.label && choice.sourceCaption && choice.reason);
      assert.deepEqual(select(api(record), choice.id), choice);
    }
    assert.deepEqual(record, original, 'Display selection leaves source rows and their configurations unchanged');
    assert.deepEqual({ visual: getEquipmentVisual(record), icon: getEquipmentIcon(record) }, before);
    assert.equal(before.visual.type, null); assert.equal(before.icon.type, null);
  }
});

test('exact static and API shapes reject every changed identity, source, spec, configuration and raw media field', () => {
  for (const record of mixed) for (const original of [record, api(record)]) {
    const id = choices(original)[0].id;
    const reject = mutation => {
      assert.deepEqual(choices(mutation), [], `${record.id}: ${JSON.stringify(mutation.sourceRow)}`);
      assert.equal(select(mutation, id), null);
    };
    for (const key of Object.keys(JSON.parse(transformerRecordShape(original)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key)
        ? [{ changed: key }] : key === 'sourceRow' ? { changed: true } : 'changed-reviewed-value';
      reject({ ...original, [key]: value });
    }
    reject({ ...original, technicalSpecs: original.technicalSpecs.map((spec, index) => index ? spec : { ...spec, unit: 'changed-unit' }) });
    reject({ ...original, technicalSpecs: original.technicalSpecs.map((spec, index) => index ? spec : { ...spec, page: 1 }) });
    reject({ ...original, sourceRow: { ...original.sourceRow, designation: 'changed' } });
    reject({ ...original, source: 'unverified' });
    reject({ ...original, source: null });
    const configurationMutation = structuredClone(original);
    configurationMutation.configurations.push({ id: 'unreviewed-choice' });
    reject(configurationMutation);
    if (original.source === 'api') {
      for (const databaseId of [null, '', '11111111-1111-5111-8111-111111111111', record.id]) reject({ ...original, databaseId });
      reject({ ...original, source: 'official', databaseId: 'wrong' });
      const missingUuid = { ...original }; delete missingUuid.databaseId; reject(missingUuid);
      const missingMedia = { ...original }; delete missingMedia.sourceMediaPath; reject(missingMedia);
      // Existing trusted display overrides preserve the separately bound raw source media.
      assert.deepEqual(choices({ ...original, image: '/display-only-override.webp' }), choices(original));
    }
  }
});

test('family parents, identity holds, unknown/prototype IDs and malformed records never acquire choices', () => {
  for (const record of officialProducts.filter(row => !Object.hasOwn(manifest.records, row.id))) {
    assert.deepEqual(choices(record), []);
    for (const id of Object.keys(manifest.choices)) assert.equal(select(record, id), null);
  }
  assert.equal(held.length, 32);
  for (const record of held) assert.deepEqual(choices({ ...mixed[0], id: record.id }), []);
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'unknown-row', '', null, 4, {}]) {
    assert.deepEqual(choices({ ...mixed[0], id }), []);
    assert.equal(select(mixed[0], id), null);
  }
  const cyclic = { ...mixed[0], configurations: [] }; cyclic.configurations.push(cyclic);
  for (const value of [null, undefined, 'alageum-2026-ts-10', [], Object.create(mixed[0]), { ...mixed[0], technicalSpecs: {} }, cyclic]) {
    assert.deepEqual(choices(value), []);
  }
});

test('construction choices cannot cross product groups or broaden source caption scope', () => {
  const byId = id => mixed.find(record => record.id === id);
  for (const record of mixed) for (const id of Object.keys(manifest.choices)) {
    assert.equal(Boolean(select(record, id)), manifest.records[record.id].choiceIds.includes(id));
  }
  for (const power of [160, 250]) assert.equal(select(byId(`alageum-2026-tsn-${power}`), 'dry-tsnz-mesh'), null);
  for (const power of [400, 630]) {
    assert.equal(choices(byId(`alageum-2026-tsn-${power}`)).length, 3);
    assert.deepEqual(select(byId(`alageum-2026-tsn-${power}`), 'dry-tsnz-mesh').sourcePages, [93]);
  }
  const cutaway = select(byId('alageum-2026-tsl-c-25'), 'dry-tslz-enclosed-6-10');
  assert.equal(cutaway.viewMode, 'illustrative-cutaway');
  assert.match(cutaway.reason, /разрез/);
  assert.match(cutaway.reason, /не определяет степень защиты/);
  assert.notEqual(cutaway.geometryType, manifest.choices['dry-tsnz-mesh'].geometryType);
});

test('the seven choices reuse existing meshes and icons alongside the separately reviewed default supplement', () => {
  for (const [file, hash] of Object.entries(manifest.reviewedLibraryHashes)) {
    assertReviewedTransformerDependency(file, hash, clearance);
  }
  for (const choice of Object.values(manifest.choices)) {
    const model = createTransformer2026Geometry(choice.geometryType);
    assert.equal(model.userData.type, choice.geometryType);
    assert.equal(model.userData.dimensionAccurate, false);
    let meshes = 0;
    model.traverse(object => { if (object.isMesh) { meshes++; assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite)); } });
    assert.ok(meshes > 5);
    assert.match(renderTransformer2026Icon(choice.iconType, 64, choice.label), /<path/);
    disposeTransformer2026Geometry(model);
    assert.equal(model.children.length, 0);
  }
  assert.equal(transformerProducts.filter(record => Object.hasOwn(transformerRuntimeManifest.geometry, record.id) && getEquipmentVisual(record).type).length, 260);
  assert.equal(transformerProducts.filter(record => Object.hasOwn(transformerRuntimeManifest.icons, record.id) && getEquipmentIcon(record).type).length, 266);
});

test('returned choices and authority manifest cannot be mutated or extended by callers', () => {
  const result = choices(mixed[0]);
  assert.throws(() => result.push({ id: 'unreviewed' }), TypeError);
  assert.throws(() => { result[0].geometryType = 'equipment'; }, TypeError);
  assert.throws(() => result[0].sourcePages.push(89), TypeError);
  assert.throws(() => manifest.records[mixed[0].id].choiceIds.push('dry-tsnz-mesh'), TypeError);
  assert.throws(() => { manifest.choices.constructor = result[0]; }, TypeError);
  assert.deepEqual(choices(mixed[0]), result);
});

test('approval generation rejects changed source, files, hashes, IDs, unsupported alternatives and duplicate admission', () => {
  for (const mutate of [
    value => { value.status = 'candidate'; },
    value => { value.sourceFileId = 'wrong'; },
    value => { value.sourceSha256 = 'wrong'; },
    value => { value.sourceRegistrySha256 = 'wrong'; },
    value => { value.reviewReportSha256 = 'wrong'; },
    value => { value.reviewedLibraryHashes['frontend/lib/catalog/models/transformer2026Geometry.js'] = 'wrong'; },
    value => { delete value.reviewedLibraryHashes['frontend/lib/catalog/models/transformer2026Geometry.js']; },
    value => { value.reviewedSourceImageHashes['/catalog-source/transformers-2026/page-080.webp'] = 'wrong'; },
    value => { value.records[0].sourceRecordId = held[0].id; },
    value => { value.records[0].sourceRecordId = '__proto__'; },
    value => { value.records[0].database_id = 'wrong'; },
    value => { value.records[0].record_shape_sha256 = 'wrong'; },
    value => { value.records[0].choices[0].geometryType = 'equipment'; },
    value => { value.records[0].choices[0].iconType = 'equipment'; },
    value => { value.records[0].choices[0].sourcePages = [89]; },
    value => { value.records[0].choices[0].viewMode = 'exact-cad'; },
    value => { value.records[0].choices[0].groupId = 'dry-tsnz-mesh'; },
    value => { value.records[0].choices[0].label = 'Unsupported source label'; },
    value => { value.records[0].choices[0].sourceCaption = 'Unsupported source caption'; },
    value => { value.records[0].choices[0].reason = 'Exact CAD dimensions'; },
    value => { value.records[0].choices.pop(); },
    value => { value.records.push(value.records[0]); },
  ]) {
    const changed = structuredClone(clearance); mutate(changed);
    assert.throws(() => buildTransformerExecutionChoices(changed));
  }
});
