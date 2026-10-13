import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { productById, baselineOfficialProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getReviewedLegacyCompletion, legacyAssetCompletion } from '../lib/catalog/models/legacyAssetCompletion.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
const record = productById('cat-pr-shr11-v002');
const api = normalizeApiProduct({ id: legacyAssetCompletion.databaseId, public_key: record.id,
  sku: record.sku, category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
  specs: record, provenance: record, media: [{ path: record.image, kind: 'image', alt: record.imageCaption }] });

test('SHR11 supplemental source review remains bound to the independent artifact', () => {
  const bytes = readFileSync(new URL(`../../${legacyAssetCompletion.review}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), legacyAssetCompletion.reviewSha256);
});

test('exact SHR11 static/API records reuse the reviewed panel without changing other record applicability', () => {
  const before = JSON.stringify(baselineOfficialProducts);
  for (const product of [record, api]) {
    assert.equal(getEquipmentVisual(product).type, 'open-distribution-panel');
    assert.equal(getEquipmentIcon(product).confidence, 'source-based');
    assert.equal(getEquipmentVisual(product).viewMode, 'illustrative-cutaway');
    assert.match(getEquipmentVisual(product).reason, /не CAD/);
    assert.equal(getEquipmentVisual(product).sourceUrl, legacyAssetCompletion.primarySourceUrl);
  }
  for (const product of baselineOfficialProducts.filter(product => product.id !== record.id)) {
    assert.equal(getReviewedLegacyCompletion(product, 'geometry'), null, product.id);
    assert.equal(getReviewedLegacyCompletion(product, 'icons'), null, product.id);
  }
  assert.equal(JSON.stringify(baselineOfficialProducts), before);
});

test('SHR11 supplemental authority closes on changed identity, source, specs, raw media and API UUID', () => {
  for (const original of [record, api]) for (const patch of [{ id: 'cat-pr-shr11-v001' }, { id: '__proto__' },
    { name: 'ПР-11' }, { category: 'transformers' }, { sourceUrl: 'https://example.com' }, { source: 'demo' },
    { power: 1 }, { voltage: '999' }, { sourcePages: [65] }, { familyId: 'other' }, { recordKind: 'family' },
    { technicalSpecs: [] }, { sourceFileId: 'other' }, { sourceMediaPath: '/other.webp' }, { databaseId: 'other' }]) {
    for (const channel of ['geometry', 'icons']) assert.equal(getReviewedLegacyCompletion({ ...original, ...patch }, channel), null);
  }
  const cycle = { ...record }; cycle.sourceRow = cycle;
  for (const bad of [null, [], Object.create(record), { ...record, databaseId: undefined }, { ...api, databaseId: undefined }, cycle]) {
    assert.equal(getReviewedLegacyCompletion(bad, 'geometry'), null);
  }
  assert.equal(getReviewedLegacyCompletion(record, 'unknown'), null);
  assert.equal(getEquipmentVisual(productById('cat-pr-shr11-v001')).type, null);
  assert.equal(getEquipmentVisual(productById('cat-pr-shr11-v003')).type, null);
});
