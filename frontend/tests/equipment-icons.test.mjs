import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { baselineOfficialProducts as officialProducts, importedProducts } from '../lib/catalog/data.js';
import { getEquipmentIcon, equipmentIconAudit, equipmentIconVariantAudit, iconConfidenceLabel } from '../lib/catalog/models/iconMap.js';
import { equipmentIconTypes, sourceIconShapes, resolveIconType } from '../lib/catalog/models/iconTypes.js';
import { renderEquipmentIcon } from './helpers/render-equipment-icon.mjs';

const get = id => getEquipmentIcon(importedProducts.find(product => product.id === id));
const protectionSuccessors = {
  'cat-ptm-tded': 'source69-paired-protection-examples-icon',
  'cat-ptm-tded-v012': 'source69-ptm-u1-example',
  'cat-ptm-tded-v013': 'source69-tde9-u3-example',
};

test('all 238 separate official records have a non-placeholder vector icon', async () => {
  assert.equal(officialProducts.length, 238);
  assert.deepEqual(Object.keys(equipmentIconAudit).sort(), importedProducts.filter(product => product.recordKind === 'family').map(product => product.id).sort());
  const before = JSON.stringify(officialProducts);
  const used = new Set();
  for (const product of officialProducts) {
    const icon = getEquipmentIcon(product);
    if (Object.hasOwn(protectionSuccessors, product.id)) {
      assert.equal(icon.type, protectionSuccessors[product.id], product.id);
      assert.equal(resolveIconType(icon.type), icon.type, product.id);
    } else assert.ok(Object.hasOwn(equipmentIconTypes, icon.type), `${product.id}: ${icon.type}`);
    assert.notEqual(icon.type, 'equipment', `${product.id}: no generic missing-image cube`);
    assert.match(icon.confidence, /^(source-based|typical)$/);
    assert.ok(icon.reason.length > 20);
    const svg = await renderEquipmentIcon(icon.type, 56, iconConfidenceLabel(icon));
    assert.match(svg, /<svg/);
    assert.match(svg, /<path/);
    assert.doesNotMatch(svg, /<img|<image|NaN|undefined/);
    assert.match(svg, /role="img"/);
    used.add(icon.type);
  }
  assert.ok(used.size < officialProducts.length / 3, `Icons must be shared by construction (${used.size} types)`);
  assert.equal(JSON.stringify(officialProducts), before);
});

test('all source-based icons retain source-page/image evidence; approximate icons disclose uncertainty', () => {
  for (const product of officialProducts) {
    const icon = getEquipmentIcon(product);
    if (icon.confidence === 'source-based') {
      assert.equal(product.sourceKind, 'supplied-pdf');
      assert.ok(icon.sourcePages.length, product.id);
      assert.ok(icon.sourceImage, product.id);
    } else assert.match(iconConfidenceLabel(icon), /Условная.*не подтверждён/);
    for (const page of icon.sourcePages) assert.ok(existsSync(new URL(`../public/catalog-source/page-${String(page).padStart(3,'0')}.webp`, import.meta.url)), `${product.id}/${page}`);
    if (icon.sourceImage) assert.ok(existsSync(new URL(`../public${icon.sourceImage}`, import.meta.url)), `${product.id}: ${icon.sourceImage}`);
  }
  for (const [id, icon] of Object.entries({ ...equipmentIconAudit, ...equipmentIconVariantAudit })) {
    assert.ok(importedProducts.some(product => product.id === id), `Orphan map entry ${id}`);
    assert.ok(Object.hasOwn(equipmentIconTypes, icon.type), `${id}: ${icon.type}`);
  }
});

test('mixed families and text-only records remain visibly qualified', () => {
  for (const id of ['cat-vru','cat-shsn-04','cat-yauo','cat-rusm-5100-5400','cat-shueng','cat-bdrm-v010','cat-bdrm-v011']) assert.equal(get(id).confidence, 'typical', id);
  assert.notEqual(get('cat-bktp-modular-v001').type, get('cat-bktp-modular-v002').type);
  assert.notEqual(get('cat-kik').type, get('cat-skip').type);
  assert.notEqual(get('cat-ktpn-25-3150').type, get('cat-2ktpn-25-3150').type);
  assert.notEqual(get('cat-ukzv-v001').type, get('cat-ukzv-v002').type);
  assert.equal(getEquipmentIcon({id:'cat-ktpn-25-3150'}).confidence, 'typical');
  assert.equal(resolveIconType('__proto__'), 'equipment');
  assert.equal(resolveIconType('toString'), 'equipment');
});

test('every SVG type renders visible, bounded artwork at listing size', async () => {
  for (const type of Object.keys(equipmentIconTypes)) {
    const svg = (await renderEquipmentIcon(type, 128)).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
    let ink = 0, edge = 0;
    for (let y=0; y<info.height; y++) for (let x=0; x<info.width; x++) {
      if (data[(y*info.width+x)*info.channels+3] > 50) { ink++; if (x<1 || y<1 || x>=info.width-1 || y>=info.height-1) edge++; }
    }
    assert.ok(ink > 250, `${type}: empty/unreadable icon (${ink} pixels)`);
    assert.equal(edge, 0, `${type}: artwork touches/crosses viewBox edge`);
  }
  for (const [type, shape] of Object.entries(sourceIconShapes)) {
    assert.ok(shape.name && shape.paths.length, type);
    assert.ok(shape.paths.every(path => typeof path === 'string' && path.length >= 8), type);
    for (const path of shape.paths) assert.doesNotMatch(path, /--|NaN|undefined|Infinity/, `${type}: invalid SVG path ${path}`);
  }
});

test('listing icons never fall back to tiny source images or initialize WebGL', () => {
  const source = readFileSync(new URL('../components/catalog/ProductIcon.js', import.meta.url), 'utf8');
  const iconSource = source;
  assert.match(iconSource, /<EquipmentIcon/);
  assert.match(iconSource, /product-icon-approximation/);
  assert.doesNotMatch(iconSource, /<Image|<img|<canvas|EquipmentModel/);
  const detail = readFileSync(new URL('../components/catalog/ProductDetails.js', import.meta.url), 'utf8');
  assert.match(detail, /<ProductIcon product=\{product\} size=\{28\}/);
});
