import test from 'node:test';
import assert from 'node:assert/strict';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getCatalogSourceComparisons } from '../lib/catalog/identityCompletion.js';
import { getNtmiSourcePreview as preview, ntmiSourcePreviewManifest as manifest } from '../lib/catalog/ntmiSourcePreview.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../lib/catalog/models/transformerExecutionChoices.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { verifyNtmiSourcePreviewScope, verifyNtmiSourcePreviewFiles, verifyNtmiSourcePreviewClearance, readJson, ntmiPreviewClearancePath } from '../../scripts/check-ntmi-source-previews.mjs';

const originals = Object.keys(manifest.records).map(productById);
const api = record => normalizeApiProduct({
  id: manifest.records[record.id].databaseId, public_key: record.id, sku: record.sku,
  category_public_key: record.category, translations: { ru: { name: record.name, description: record.description } },
  specs: record, provenance: record, media: record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption }] : [],
});

test('exactly two canonical static/API records receive a separate page96 preview without changing records or defaults', () => {
  const before = JSON.stringify(officialProducts);
  assert.deepEqual(officialProducts.filter(preview).map(record => record.id).sort(), ['ntmi-10', 'ntmi-6']);
  for (const record of originals) {
    const defaults = [getEquipmentVisual(record), getEquipmentIcon(record), getEquipmentConstructionChoices(record)];
    const result = preview(record);
    assert.deepEqual(preview(api(record)), result);
    assert.equal(result.canonicalId, record.id);
    assert.equal(result.panelId, `alageum-2026-${record.id}`);
    assert.equal(result.geometryType, 'tr26-instrument-three-triangle');
    assert.equal(result.iconType, result.geometryType);
    assert.equal(result.sourceHref, '/catalog/source?source=transformers-2026&page=96');
    assert.equal(result.sourceImage, '/catalog-source/transformers-2026/page-096.webp');
    assert.deepEqual(result.sourcePages, [96]);
    assert.equal(result.dimensionAccurate, false); assert.equal(result.exactMeshReuseAllowed, false);
    assert.match(result.caption, /НТМИ-6-10.*18\.03\.2026.*96/);
    assert.match(result.disclosure, /не CAD, не размеры/);
    assert.equal(record.power, null); assert.equal(getCatalogSourceComparisons(record)[0].power, null);
    assert.equal(getEquipmentVisual(record).type, 'instrument-transformer');
    assert.deepEqual([getEquipmentVisual(record), getEquipmentIcon(record), getEquipmentConstructionChoices(record)], defaults);
  }
  assert.equal(JSON.stringify(officialProducts), before);
  assert.equal(officialProducts.flatMap(getEquipmentConstructionChoices).length, 74);
  assert.equal(officialProducts.filter(record => getEquipmentConstructionChoices(record).length).length, 36);
});

test('all canonical source/spec/media shape mutations close the static and API preview gate', () => {
  for (const record of originals) for (const source of [record, api(record)]) {
    for (const key of Object.keys(JSON.parse(transformerRecordShape(source)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key)
        ? [{ changed: key }] : key === 'sourceRow' ? { changed: true } : 'unreviewed';
      assert.equal(preview({ ...source, [key]: value }), null, `${record.id}/${source.source}/${key}`);
    }
    for (const patch of [{ source: 'demo' }, { id: `alageum-2026-${record.id}` }, { databaseId: 'reused-uuid' },
      { sourceId: manifest.source.sourceId, sourceFileId: manifest.source.sourceFileId, sourceSha256: manifest.source.sourceSha256 }]) {
      assert.equal(preview({ ...source, ...patch }), null);
    }
    if (source.source === 'api') {
      for (const key of ['databaseId', 'sourceMediaPath']) { const missing = { ...source }; delete missing[key]; assert.equal(preview(missing), null); }
      assert.deepEqual(preview({ ...source, image: '/display-only-override.webp' }), preview(source));
    }
  }
});

test('source panels, inherited records, unknown identities and malformed inputs cannot impersonate a canonical record', () => {
  const record = originals[0], cyclic = { ...record }; cyclic.sourceRow = cyclic;
  for (const value of [null, undefined, [], 'ntmi-6', {}, Object.create(record), cyclic,
    ...getCatalogSourceComparisons(record), { ...record, technicalSpecs: {} },
    ...['__proto__', 'constructor', 'toString', 'ntmi-6-x', 'NTMI-6'].map(id => ({ ...record, id }))]) {
    assert.equal(preview(value), null);
  }
  assert.throws(() => { preview(record).sourcePages.push(97); }, TypeError);
  assert.throws(() => { manifest.records['ntmi-6'].panelId = 'alageum-2026-ntmi-10'; }, TypeError);
});

test('source mapping reproduction rejects wrong UUID, panel, source, type, page, dimensions and scope', () => {
  assert.deepEqual(verifyNtmiSourcePreviewScope(), { sourcePreviews: 2, newProducts: 0, newDefaultBindings: 0, newConstructionChoices: 0 });
  for (const mutate of [
    value => { value.records['ntmi-6'].databaseId = value.records['ntmi-10'].databaseId; },
    value => { value.records['ntmi-6'].panelId = value.records['ntmi-10'].panelId; },
    value => { value.records['ntmi-6'].recordShapeSha256 = 'changed'; },
    value => { value.records['ntmi-6'].panelSha256 = 'changed'; },
    value => { value.records['ntmi-6-x'] = value.records['ntmi-6']; },
    value => { value.source.sourceId = 'legacy'; },
    value => { value.source.sourceFileId = 'other'; },
    value => { value.source.sourceSha256 = 'other'; },
    value => { value.source.sourceUrl = 'https://example.com'; },
    value => { value.preview.geometryType = 'tr26-instrument-two-round'; },
    value => { value.preview.iconType = 'instrument-transformer'; },
    value => { value.preview.sourceImage = '/catalog-source/transformers-2026/page-097.webp'; },
    value => { value.preview.dimensionAccurate = true; },
    value => { value.preview.exactMeshReuseAllowed = true; },
    value => { value.preview.disclosure = 'Exact CAD'; },
  ]) { const changed = structuredClone(manifest); mutate(changed); assert.throws(() => verifyNtmiSourcePreviewScope(changed)); }
});

test('exact unchanged asset dependencies and new preview files match the independently reviewed clearance', () => {
  const clearance = readJson(ntmiPreviewClearancePath);
  assert.deepEqual(verifyNtmiSourcePreviewFiles(clearance), verifyNtmiSourcePreviewScope());
  assert.deepEqual(verifyNtmiSourcePreviewClearance(clearance), clearance.counts);
  for (const mutate of [
    value => { value.dependencies.preview['frontend/lib/catalog/ntmiSourcePreview.js'] = 'changed'; },
    value => { delete value.dependencies.preview['frontend/lib/catalog/sources-manifest.json']; },
    value => { value.dependencies.unchanged['frontend/lib/catalog/models/transformer2026Types.js'] = 'changed'; },
    value => { value.status = 'candidate'; },
    value => { value.reviewReportSha256 = 'changed'; },
  ]) { const changed = structuredClone(clearance); mutate(changed); assert.throws(() => verifyNtmiSourcePreviewClearance(changed)); }
});
