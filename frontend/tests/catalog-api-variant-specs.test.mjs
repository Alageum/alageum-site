import test from 'node:test';
import assert from 'node:assert/strict';
import { officialProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getCatalogSpecSummary, facetValues } from '../lib/catalog/grouping.js';
import { importedProductId } from '../../scripts/catalog/measurement-column-asset-snapshot.mjs';
import audit from '../../docs/catalog-transformers-2026/review/protection-context-integration/baseline-api-spec-audit.json' with { type: 'json' };
const dto = row => ({ id: importedProductId(row.id), public_key: row.id, sku: row.sku,
  category_public_key: row.category, translations: { ru: { name: row.name } }, specs: row, provenance: row,
  media: row.image ? [{ path: row.image, kind: 'image', alt: row.imageCaption }] : [],
});
const live = officialProducts.map(row => normalizeApiProduct(dto(row)));
const originalLive = live.map(row => { const prior = { ...row }; delete prior.variantSpecs; delete prior.sourceVariantSpecs; return prior; });

test('all843 imported API summaries and facets match source-specific static values, with exactly the23 independently audited current corrections', () => {
  const differences = [], facetDifferences = [];
  for (let index = 0; index < officialProducts.length; index++) {
    const source = officialProducts[index], row = live[index], prior = originalLive[index];
    const expected = getCatalogSpecSummary(source, officialProducts), actual = getCatalogSpecSummary(row, live), before = getCatalogSpecSummary(prior, originalLive);
    const displayed = rows => rows.map(({ key, label, value, unit, values }) => ({ key, label, value, unit, values }));
    assert.deepEqual(displayed(actual), displayed(expected), source.id);
    for (let i = 0; i < actual.length; i++) if (before[i].value !== actual[i].value) differences.push({ id: source.id, field: actual[i].key, static: actual[i].value, api: before[i].value });
    for (const field of ['power', 'voltage', 'current', 'function', 'cooling', 'installation', 'subtype']) {
      const expected = facetValues(source, field), actual = facetValues(row, field), before = facetValues(prior, field);
      assert.deepEqual(actual, expected, `${source.id}/${field}`);
      if (JSON.stringify(actual) !== JSON.stringify(before)) facetDifferences.push({ id: source.id, field, static: actual, api: before });
    }
    assert.equal(row.databaseId, importedProductId(source.id));
  }
  assert.equal(differences.length, 23); assert.deepEqual(differences, audit.summaryDiffs);
  assert.deepEqual(facetDifferences, audit.facetDiffs);
});

test('sanitized variant display rows retain all8707 existing facts while raw source facts remain distinct authority metadata', () => {
  let technicalCount = 0, variantCount = 0, variantProducts = 0;
  for (let i = 0; i < officialProducts.length; i++) {
    const source = officialProducts[i], row = live[i];
    technicalCount += row.technicalSpecs.length; variantCount += row.variantSpecs.length;
    if (row.variantSpecs.length) variantProducts++;
    assert.deepEqual(row.variantSpecs, (source.variantSpecs || []).map(spec => ({ label: String(spec.label || ''), value: String(spec.value ?? '—'), unit: String(spec.unit || ''), page: Number.isInteger(spec.page) ? spec.page : null })));
    assert.deepEqual(row.sourceVariantSpecs, source.variantSpecs);
    assert.notEqual(row.variantSpecs, row.sourceVariantSpecs);
    for (const variant of row.variantSpecs) assert.ok(row.technicalSpecs.some(spec => JSON.stringify(spec) === JSON.stringify(variant)), source.id);
  }
  assert.deepEqual({ technicalCount, variantCount, variantProducts }, { technicalCount: 11745, variantCount: 8707, variantProducts: 683 });
});

test('owner-provided changes and cleared variant fields remain live and do not recover static facts', () => {
  const source = officialProducts.find(row => row.id === 'cat-shnn-v004');
  const row = normalizeApiProduct({ ...dto(source), specs: { ...source, variantSpecs: [null, 'bad', { label: 'Номинальный ток', value: 1234, unit: 'А', page: 35, extra: 'raw provenance' }] } });
  assert.deepEqual(row.variantSpecs, [{ label: 'Номинальный ток', value: '1234', unit: 'А', page: 35 }]);
  assert.equal(row.sourceVariantSpecs[2].extra, 'raw provenance');
  for (const variantSpecs of [null, undefined, [], 'cleared']) {
    const row = normalizeApiProduct({ ...dto(source), specs: { ...source, variantSpecs } });
    assert.deepEqual(row.variantSpecs, []); assert.equal(row.sourceVariantSpecs, variantSpecs);
  }
});
