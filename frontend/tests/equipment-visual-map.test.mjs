import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { importedProducts, baselineOfficialProducts as officialProducts } from '../lib/catalog/data.js';
import { equipmentVisualAudit, getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { equipmentModelTypes } from '../lib/catalog/models/types.js';

const families = importedProducts.filter(p => p.recordKind === 'family');
const get = id => getEquipmentVisual(importedProducts.find(p => p.id === id));
const tally = records => records.reduce((counts, product) => {
  const key = getEquipmentVisual(product).confidence;
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});

test('all 65 imported families are audited against existing source pages', () => {
  assert.equal(families.length, 65);
  assert.deepEqual(Object.keys(equipmentVisualAudit).sort(), families.map(p => p.id).sort());
  assert.equal(families.filter(p => p.image).length, 59);
  for (const family of families) {
    const visual = getEquipmentVisual(family);
    assert.equal(visual.sourceFamilyId, family.id);
    assert.ok(visual.reason.length > 20);
    for (const page of visual.sourcePages) {
      assert.ok(family.sourcePages.includes(page));
      assert.ok(existsSync(new URL(`../public/catalog-source/page-${String(page).padStart(3, '0')}.webp`, import.meta.url)));
    }
    if (visual.fallbackImage) assert.ok(existsSync(new URL(`../public${visual.fallbackImage}`, import.meta.url)));
    if (visual.type) assert.ok(Object.hasOwn(equipmentModelTypes, visual.type));
  }
});

test('all 238 official rows receive a grounded visual or an explicit uncertainty state', () => {
  assert.equal(officialProducts.length, 238);
  assert.deepEqual(tally(officialProducts), { generic: 14, 'source-only': 42, 'source-matched': 172, unverified: 10 });
  assert.deepEqual(tally(families), { 'source-matched': 56, 'source-only': 3, unverified: 6 });
  for (const product of officialProducts) {
    const visual = getEquipmentVisual(product);
    if (visual.confidence === 'source-matched') {
      assert.ok(visual.type && visual.fallbackImage && visual.sourcePages.length);
      assert.equal(product.sourceKind, 'supplied-pdf');
    }
    if (visual.confidence === 'source-only') { assert.equal(visual.type, null); assert.ok(visual.fallbackImage); }
    if (visual.confidence === 'generic') { assert.equal(visual.sourceFamilyId, null); assert.match(visual.reason, /не подтверждена/); }
  }
});

test('repeated constructions share visuals without collapsing product identities', () => {
  const initialIds = importedProducts.map(p => p.id);
  const initialJson = JSON.stringify(importedProducts);
  const wallVariants = importedProducts.filter(p => p.familyId === 'cat-ya5000-rusm5000');
  assert.equal(wallVariants.length, 25);
  assert.ok(wallVariants.every(p => getEquipmentVisual(p).type === 'wall-box'));
  assert.equal(get('cat-ktp-25-250').type, 'substation');
  assert.equal(get('cat-mtp-25-100').type, 'pole-substation');
  assert.notEqual(get('cat-ktpn-25-3150').type, get('cat-2ktpn-25-3150').type);
  assert.notEqual(get('cat-kik').type, get('cat-skip').type);
  assert.notEqual(get('cat-kru-k07-ktz').type, get('cat-krun07-ktz').type);
  assert.deepEqual(importedProducts.map(p => p.id), initialIds);
  assert.equal(JSON.stringify(importedProducts), initialJson);
});

test('mixed family drawings are not blindly inherited by a named variant', () => {
  assert.equal(get('cat-ptm-tded').type, null);
  assert.equal(get('cat-ptm-tded-v003').type, null);
  assert.equal(get('cat-ptm-tded-v012').type, 'source69-ptm-u1-example');
  assert.equal(get('cat-ptm-tded-v013').type, 'source69-tde9-u3-example');
  assert.deepEqual(get('cat-bktp-modular-v001').sourcePages, [38]);
  assert.equal(get('cat-bktp-modular-v001').fallbackImage, '/catalog-source/page-038.webp');
  assert.deepEqual(get('cat-bktp-modular-v002').sourcePages, [39]);
  assert.notEqual(get('cat-bktp-modular-v001').fallbackImage, get('cat-bktp-modular-v002').fallbackImage);
  assert.equal(get('cat-ktpb-k').type, 'outdoor-switchyard-substation');
  assert.equal(get('cat-ukzv').type, 'upper-input-protection');
  assert.equal(get('cat-ukzv-v001').type, 'upper-input-protection');
  assert.equal(get('cat-ukzv-v002').type, null);
  assert.equal(get('cat-ukzn-v001').type, 'outdoor-floor-cabinet');
  assert.equal(get('cat-bdrm-v001').type, 'wall-canopy-box');
  assert.equal(get('cat-bdrm-v010').type, null);
  assert.equal(get('cat-bdrm-v011').type, null);
});

test('unknown/API records never gain a confirmed construction from a similar identifier', () => {
  const unknown = getEquipmentVisual({ id: 'cat-ktpn-25-3150', category: 'substations' });
  assert.equal(unknown.confidence, 'unverified');
  assert.equal(unknown.sourceFamilyId, null);
  assert.equal(getEquipmentVisual({ id: '__proto__', familyId: '__proto__', sourceKind: 'supplied-pdf' }).confidence, 'unverified');
});
