import test from 'node:test';
import assert from 'node:assert/strict';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { familyPresentationBindings } from '../lib/catalog/familyPresentation.js';
import { catalogIdentityCompletion, getCatalogSourceComparisons } from '../lib/catalog/identityCompletion.js';
import { getCatalogFamilySourceReferences, sourcePanelAnchor } from '../lib/catalog/familySourceReferences.js';
import { catalogFamilyMembers } from '../lib/catalog/presentation.js';
import { getCatalogSpecSummary } from '../lib/catalog/grouping.js';

const expected = {
  'tr2026-family-tmg-standard': ['tmg-400', 'tmg-630', 'tmg-1000', 'tmg-2500'],
  'tr2026-family-tmgs-pole': ['tmgs-63', 'tmgs-160'],
  'tr2026-family-tmgf': ['tmgf-630', 'tmgf-1600'],
  'tr2026-family-tmeg': ['tmeg-250'],
  'tr2026-family-dry-accessories': ['cat-shtz'],
};
const api = record => normalizeApiProduct({
  id: familyPresentationBindings[record.id]?.database_id || catalogIdentityCompletion.guards[record.id]?.databaseId,
  public_key: record.id, slug: record.id, sku: record.sku, category_public_key: record.category,
  specs: record, provenance: record, translations: { ru: { name: record.name, description: record.description } },
  media: record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption }] : [],
});

test('five exact families expose ten separately scoped source references without creating members or combining summaries', () => {
  const before = JSON.stringify(officialProducts);
  const total = officialProducts.flatMap(record => getCatalogFamilySourceReferences(record, officialProducts));
  assert.equal(total.length, 10);
  assert.deepEqual([...new Set(total.map(reference => reference.familyId))].sort(), Object.keys(expected).sort());
  for (const [id, targetIds] of Object.entries(expected)) {
    const family = productById(id);
    const members = catalogFamilyMembers(family, officialProducts);
    const summary = getCatalogSpecSummary(family, officialProducts);
    const references = getCatalogFamilySourceReferences(family, officialProducts);
    assert.deepEqual(references.map(reference => reference.canonicalId), targetIds);
    for (const reference of references) {
      const target = productById(reference.canonicalId);
      const panel = getCatalogSourceComparisons(target).find(panel => panel.id === reference.panelId);
      assert.ok(panel);
      assert.equal(panel.sourceFamilyId, family.sourceFamilyId);
      assert.ok(panel.sourcePages.every(page => family.sourcePages.includes(page)));
      assert.equal(reference.anchorId, sourcePanelAnchor(panel.id));
      assert.equal(reference.href, `/catalog/${target.id}#source-panel-${panel.id}`);
      assert.ok(!members.some(member => member.id === target.id));
    }
    assert.deepEqual(catalogFamilyMembers(family, officialProducts), members);
    assert.deepEqual(getCatalogSpecSummary(family, officialProducts), summary);
  }
  assert.equal(JSON.stringify(officialProducts), before);
  assert.equal(officialProducts.length, 843);
});

test('static references reject changed families and changed canonical records or absent targets', () => {
  for (const [id, targetIds] of Object.entries(expected)) {
    const family = productById(id);
    for (const patch of [{ name: 'edited' }, { sourceSha256: 'changed' }, { sourceFamilyId: 'ntmi' }, { sourcePages: [] }, { variantIds: [] }]) {
      assert.deepEqual(getCatalogFamilySourceReferences({ ...family, ...patch }, officialProducts), []);
    }
    for (const targetId of targetIds) {
      const missing = officialProducts.filter(record => record.id !== targetId);
      assert.ok(!getCatalogFamilySourceReferences(family, missing).some(reference => reference.canonicalId === targetId));
      const changed = officialProducts.map(record => record.id === targetId ? { ...record, name: 'changed reference' } : record);
      assert.ok(!getCatalogFamilySourceReferences(family, changed).some(reference => reference.canonicalId === targetId));
    }
  }
  for (const id of ['ntmi-6', 'ntmi-10', 'alageum-2026-ntmi-6']) assert.deepEqual(getCatalogFamilySourceReferences(productById(id), officialProducts), []);
});

test('API source references use only current published records and require both original family and target UUIDs', () => {
  for (const [id, targetIds] of Object.entries(expected)) {
    const family = api(productById(id));
    const targets = targetIds.map(targetId => api(productById(targetId)));
    const references = getCatalogFamilySourceReferences(family, [family, ...targets]);
    assert.equal(references.length, targetIds.length);
    for (const reference of references) assert.equal(reference.href, `/catalog/${reference.canonicalId}?source=api#source-panel-${reference.panelId}`);
    assert.deepEqual(getCatalogFamilySourceReferences(family, officialProducts), []);
    assert.deepEqual(getCatalogFamilySourceReferences(family, [family]), []);
    assert.deepEqual(getCatalogFamilySourceReferences({ ...family, databaseId: 'new-family-uuid' }, targets), []);
    assert.deepEqual(getCatalogFamilySourceReferences(family, targets.map(target => ({ ...target, databaseId: 'reused-target-uuid' }))), []);
    assert.deepEqual(getCatalogFamilySourceReferences(family, targets.map(target => ({ ...target, technicalSpecs: [{ label: 'Changed specification', value: 'not reviewed', unit: '' }] }))), []);
    assert.deepEqual(getCatalogFamilySourceReferences(family, targets.map(target => ({ ...target, sourceMediaPath: '/catalog-source/page-001.webp' }))), []);
  }
});
