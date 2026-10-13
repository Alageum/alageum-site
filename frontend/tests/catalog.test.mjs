import assert from 'node:assert/strict';
import test from 'node:test';
import { demoProducts as products } from '../lib/catalog/data.js';
import { filterProducts, sortProducts, parseComparison, normalizeSelection, selectionCsv } from '../lib/catalog/query.js';

test('SKU search is case insensitive and trims whitespace', () => {
  assert.deepEqual(filterProducts(products, { q: '  DeMo-001 ' }).map((p) => p.id), ['demo-001']);
});
test('search requires all words and combines with facets', () => {
  const results = filterProducts(products, { q: 'сухой 1000', category: 'transformers', cooling: 'Сухое' });
  assert.deepEqual(results.map((p) => p.id), ['demo-004']);
});
test('facet options omit only their own active filter', () => {
  const results = filterProducts(products, { category: 'transformers', power: '630' }, 'power');
  assert.equal(results.length, 5);
});
test('unknown filter safely yields no results', () => {
  assert.equal(filterProducts(products, { category: 'unknown' }).length, 0);
});
test('power sorting retains unknown values at the bottom in both directions', () => {
  for (const mode of ['power-asc', 'power-desc']) {
    const sorted = sortProducts(products, mode);
    assert.equal(sorted.at(-1).power, null);
    assert.equal(sorted[0].power, mode === 'power-asc' ? 630 : 1600);
  }
  assert.equal(products[0].id, 'demo-001');
});
test('comparison rejects unknown ids, deduplicates and caps selection', () => {
  assert.deepEqual(parseComparison('unknown,demo-001,demo-001,demo-002,demo-003,demo-004,demo-005', products), ['demo-001', 'demo-002', 'demo-003', 'demo-004']);
});
test('selection rejects corrupt entries and clamps quantities', () => {
  assert.deepEqual(normalizeSelection([null, {}, { id: 'demo-001', quantity: 0 }, { id: 'demo-001', quantity: 3 }, { id: 'demo-002', quantity: 10000 }, { id: 'fake', quantity: 2 }, { id: 'demo-003', quantity: 'bad' }], products), [{ id: 'demo-001', quantity: 1 }, { id: 'demo-002', quantity: 999 }, { id: 'demo-003', quantity: 1 }]);
  assert.deepEqual(normalizeSelection({}, products), []);
});
test('CSV is UTF-8/BOM, escapes quotes, and explicitly labels demo content', () => {
  const csv = selectionCsv([{ id: 'demo-001', quantity: 2 }], [{ id: 'demo-001', sku: 'DEMO-001', name: 'Test "quoted"' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('ДЕМО — не заказ'));
  assert.ok(csv.includes('"Test ""quoted"""'));
  assert.ok(csv.endsWith(';"2"'));
});
