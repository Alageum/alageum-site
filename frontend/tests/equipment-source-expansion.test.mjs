import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { baselineOfficialProducts as officialProducts, productById } from '../lib/catalog/data.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { equipmentModelTypes } from '../lib/catalog/models/types.js';
import { sourceConstructionDefinitions, sourceRecordVisuals } from '../lib/catalog/models/sourceConstructions.js';
import { sourceGeometryTypes } from '../lib/catalog/models/sourceGeometry.js';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
import baseline from './fixtures/old-catalog-model-baseline.json' with { type: 'json' };
const get = id => getEquipmentVisual(productById(id));
const keys = object => Object.keys(object).sort();
const protectionSuccessors = {
  'cat-ptm-tded': { oldType: null, oldIcon: 'paired-protection-enclosures', type: null, icon: 'source69-paired-protection-examples-icon' },
  'cat-ptm-tded-v012': { oldType: 'protection-cabinet', oldIcon: 'protection-cabinet', type: 'source69-ptm-u1-example', icon: 'source69-ptm-u1-example' },
  'cat-ptm-tded-v013': { oldType: null, oldIcon: 'indoor-protection-enclosure', type: 'source69-tde9-u3-example', icon: 'source69-tde9-u3-example' },
};

test('33 reviewed constructions register 47 exact records, plus one guarded existing-geometry reuse', () => {
  assert.equal(sourceGeometryTypes.length, 33);
  assert.deepEqual([...sourceGeometryTypes].sort(), keys(sourceConstructionDefinitions));
  const ids = Object.values(sourceConstructionDefinitions).flatMap(entry => entry.recordIds);
  assert.equal(ids.length, 47); assert.equal(new Set(ids).size, 47);
  assert.deepEqual(keys(sourceRecordVisuals), [...ids, 'cat-ukzv'].sort());
  assert.equal(Object.hasOwn(equipmentModelTypes, 'paired-protection-enclosures'), false);
  for (const [type, entry] of Object.entries(sourceConstructionDefinitions)) {
    assert.equal(entry.reviewed, '2026-10-05');
    assert.ok(entry.evidence.length > 40);
    assert.ok(existsSync(new URL(`../public${entry.reference}`, import.meta.url)));
    for (const page of entry.sourcePages) assert.ok(existsSync(new URL(`../public/catalog-source/page-${String(page).padStart(3, '0')}.webp`, import.meta.url)));
    for (const id of entry.recordIds) {
      const product = productById(id), visual = getEquipmentVisual(product);
      assert.ok(product, id);
      if (id === 'cat-ptm-tded-v013') {
        assert.equal(type, 'indoor-protection-enclosure');
        assert.equal(visual.type, 'source69-tde9-u3-example');
      } else assert.equal(visual.type, type, id);
      assert.equal(visual.confidence, 'source-matched', id);
      assert.equal(sourceRecordVisuals[id].inherit, false, id);
      assert.ok(visual.sourcePages.every(page => product.sourcePages.includes(page)), id);
      assert.match(visual.reason, /не CAD/i);
      assert.ok(existsSync(new URL(`../public${visual.fallbackImage}`, import.meta.url)));
    }
  }
});

test('coverage gain is48 original plus one independently corroborated SHR11, with238 stable IDs', () => {
  assert.equal(officialProducts.length, 238);
  assert.deepEqual(officialProducts.map(product => product.id), baseline.records.map(record => record.id));
  const gained = [], unresolved = [];
  const frozen = JSON.stringify(officialProducts);
  for (const old of baseline.records) {
    const product = productById(old.id), visual = getEquipmentVisual(product), icon = getEquipmentIcon(product);
    const successor = protectionSuccessors[old.id];
    if (successor) {
      assert.equal(old.type, successor.oldType, old.id);
      assert.equal(old.iconType, successor.oldIcon, old.id);
      assert.equal(visual.type, successor.type, old.id);
    }
    assert.equal(icon.type, successor ? successor.icon : old.iconType, old.id); assert.equal(icon.confidence, old.id === 'cat-pr-shr11-v002' ? 'source-based' : old.iconConfidence, old.id);
    if (old.type === null && visual.type) gained.push(old.id);
    else { assert.equal(visual.type, successor ? successor.type : old.type, old.id); assert.equal(visual.confidence, old.confidence, old.id); }
    if (visual.type === null) unresolved.push(old.id);
  }
  assert.deepEqual(gained.sort(), [...keys(sourceRecordVisuals), 'cat-pr-shr11-v002'].sort());
  assert.equal(gained.length, 49); assert.equal(unresolved.length, 52);
  assert.equal(unresolved.filter(id => get(id).confidence === 'source-only').length, 42);
  assert.equal(unresolved.filter(id => get(id).confidence === 'unverified').length, 10);
  assert.equal(JSON.stringify(officialProducts), frozen);
});

test('other51 uncertain old rows plus the mixed PTM/TDE overview remain unmapped', () => {
  const uncertain = baseline.records.filter(record => record.type === null && record.iconConfidence === 'typical' && record.id !== 'cat-pr-shr11-v002');
  assert.equal(uncertain.length, 51);
  for (const record of uncertain) {
    assert.equal(get(record.id).type, null, record.id);
    assert.equal(get(record.id).confidence, record.confidence, record.id);
    assert.equal(Object.hasOwn(sourceRecordVisuals, record.id), false);
  }
  assert.equal(get('cat-ptm-tded').type, null);
  assert.equal(get('cat-ptm-tded-v012').type, 'source69-ptm-u1-example');
  assert.equal(get('cat-ptm-tded-v013').type, 'source69-tde9-u3-example');
  for (const id of ['cat-ukzv-v002', 'cat-ukzv-v004', 'cat-ukzv-v006', 'cat-ukzv-v007']) assert.equal(get(id).type, null, id);
  assert.match(get('cat-ukzv').reason, /Представитель смешанного семейства/);
  assert.match(get('cat-ukzv').reason, /не наследуется/);
});

test('historical source constructions ignore ratings/navigation except the exact protected successor, and never inherit to unreviewed variants', () => {
  for (const id of keys(sourceRecordVisuals)) {
    const product = productById(id);
    const changed = getEquipmentVisual({ ...product, category: 'transformers', rating: 999999, power: 42 });
    if (id === 'cat-ptm-tded-v013') {
      assert.equal(changed.type, null); assert.equal(changed.confidence, 'source-only');
      assert.equal(changed.fallbackImage, null); assert.deepEqual(changed.sourcePages, []);
    } else assert.deepEqual(changed, getEquipmentVisual(product));
    const unknown = { ...product, id: `${id}-unreviewed`, familyId: product.familyId || product.id, recordKind: 'variant' };
    assert.equal(getEquipmentVisual(unknown).type, null, id);
  }
  assert.equal(getEquipmentVisual({ id: 'cat-atp-2x25' }).confidence, 'unverified');
});

test('stale ATP frame prose and inherited KTPS p19 association are corrected without cross-variant leakage', () => {
  assert.equal(get('cat-atp-2x25').type, 'railway-modular-building');
  assert.match(get('cat-atp-2x25').reason, /закрытый корпус/);
  assert.doesNotMatch(get('cat-atp-2x25').reason, /сборка на общей раме/);
  assert.deepEqual(get('cat-ktps-100-1600-v007').sourcePages, [20]);
  assert.equal(get('cat-ktps-100-1600-v007').fallbackImage, '/catalog-source/page-020.webp');
  assert.equal(getEquipmentIcon(productById('cat-ktps-100-1600-v007')).sourceImage, '/catalog-source/page-020.webp');
  assert.equal(get('cat-ktps-100-1600').fallbackImage, '/catalog-products/cat-ktps-100-1600.webp');
  assert.equal(get('cat-bktp-modular-v001').fallbackImage, '/catalog-source/page-038.webp');
  assert.notEqual(get('cat-bktp-modular-v001').type, get('cat-bktp-modular-v002').type);
});

test('reviewed meshes preserve key exterior/open topology and contain finite bounded geometry', () => {
  for (const type of sourceGeometryTypes) {
    const model = createEquipmentGeometry(type), bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(...size.toArray()) - 2.8) < 1e-6, type);
    let triangles = 0, meshes = 0;
    model.traverse(object => {
      assert.ok(object.matrixWorld.elements.every(Number.isFinite), type);
      if (!object.isMesh) return;
      meshes++; triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
      assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite), type);
    });
    assert.ok(meshes >= 4 && meshes < 180, `${type}: ${meshes}`);
    assert.ok(triangles > 36 && triangles < 30000, `${type}: ${triangles}`);
    const parts = model.children.map(child => child.name);
    if (type === 'railway-modular-building') { assert.ok(parts.includes('closed-shell')); assert.ok(parts.includes('side-input')); assert.ok(!parts.includes('open-frame')); }
    if (type === 'open-vacuum-switchgear') assert.ok(parts.includes('visible-cutaway-apparatus'));
    if (type === 'open-drawout-switchgear') assert.ok(parts.includes('visible-drawout-trolley'));
    if (type === 'mine-switchgear-window') assert.ok(parts.includes('rounded-inspection-window'));
    if (type === 'long-service-container') { assert.ok(parts.includes('access-steps')); assert.ok(parts.includes('corrugated-exterior')); }
    disposeEquipmentGeometry(model);
  }
  const source = readFileSync(new URL('../lib/catalog/models/sourceGeometry.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /product\.|familyId|recordKind|category|sourceRecordVisuals/);
});
