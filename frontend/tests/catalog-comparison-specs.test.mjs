import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts, categoryName, specRows, valueOrDash, specUnit } from '../lib/catalog/data.js';
import { comparisonSpecValue } from '../lib/catalog/comparison.js';
import { normalizeApiProduct, liveHref } from '../lib/catalog/apiData.js';
import { catalogPrice } from '../lib/catalog/admin.js';
import { parseComparison } from '../lib/catalog/query.js';
import { displayProductName, displayExecution } from '../lib/catalog/presentation.js';
import { catalogSpecValueText } from '../lib/catalog/ptmmDimensionQualification.js';
import { catalogSpecValueComponent } from './helpers/render-catalog-spec-value.mjs';

const affectedIds = [25, 40, 63].map(power => `alageum-2026-tmg-20kv-copper-${power}`);
const windingValue = 'медные · трехфазные, двухобмоточные';
// Exercise API row normalization, not a production database or a substitute importer.
const liveProducts = officialProducts.map(product => normalizeApiProduct({
  public_key: product.id, comparable: true,
  specs: { technicalSpecs: product.technicalSpecs },
}));

test('comparison keeps distinct original values in source order and deduplicates only identical values', () => {
  const row = { label: 'Обмотки', unit: '' };
  const specs = [
    { ...row, value: 'медные', page: 51 },
    { label: 'Обмотки', unit: 'другие', value: 'other unit' },
    { label: 'Другой параметр', unit: '', value: 'other label' },
    { ...row, value: 'трехфазные, двухобмоточные', page: 51 },
    { ...row, value: 'медные', page: 52 },
    { ...row, value: ' медные' },
    { ...row, value: 'Медные' },
  ];
  const original = structuredClone(specs);
  assert.equal(comparisonSpecValue(specs, row), `${windingValue} ·  медные · Медные`);
  assert.equal(comparisonSpecValue(specs.toReversed(), row), 'Медные ·  медные · медные · трехфазные, двухобмоточные');
  assert.deepEqual(specs, original);
});

test('static unit/empty formatting and live heading-unit/empty formatting stay unchanged', () => {
  const row = { label: 'Ток', unit: 'А' };
  for (const value of [undefined, null, '', 0, '0', '6', ' 6 ']) {
    const specs = [{ ...row, value }];
    assert.equal(comparisonSpecValue(specs, row, valueOrDash), valueOrDash(value, row.unit));
    assert.equal(comparisonSpecValue(specs, row), String(value ?? '—'));
  }
  for (const specs of [undefined, [], [{ label: 'Ток', unit: 'кА', value: '1' }]]) {
    assert.equal(comparisonSpecValue(specs, row, valueOrDash), '—');
    assert.equal(comparisonSpecValue(specs, row), '—');
  }
  const specs = [6, 10, 6].map(value => ({ ...row, value }));
  assert.equal(comparisonSpecValue(specs, row, valueOrDash), '6 А · 10 А');
  assert.equal(comparisonSpecValue(specs, row), '6 · 10');
  assert.equal(comparisonSpecValue([0, '0'].map(value => ({ ...row, value })), row), '0 · 0');
});

test('all 843 records change only the three reviewed winding cells in both comparison modes', () => {
  assert.equal(officialProducts.length, 843);
  assert.equal(officialProducts.reduce((sum, product) => sum + (product.technicalSpecs || []).length, 0), 11745);
  const expected = affectedIds.map(id => ({ id, label: 'Обмотки', unit: '', before: 'медные', after: windingValue }));
  for (const [mode, products, formatter] of [
    ['static', officialProducts, valueOrDash], ['live', liveProducts, undefined],
  ]) {
    const original = JSON.stringify(products);
    const rows = [...new Map(products.flatMap(product => (product.technicalSpecs || [])
      .map(row => [`${row.label}|${row.unit}`, row]))).values()];
    const changes = [];
    // Include absent values: any row can be introduced by another selected product.
    for (const product of products) for (const row of rows) {
      const specs = product.technicalSpecs || [];
      const first = mode === 'static'
        ? specs.find(spec => `${spec.label}|${spec.unit}` === `${row.label}|${row.unit}`)
        : specs.find(spec => spec.label === row.label && spec.unit === row.unit);
      const before = mode === 'static' ? valueOrDash(first?.value, row.unit) : String(first?.value ?? '—');
      const after = comparisonSpecValue(specs, row, formatter);
      if (before !== after) changes.push({ id: product.id, label: row.label, unit: row.unit, before, after });
    }
    assert.deepEqual(changes, expected, `${mode}: no other comparison value may change`);
    assert.equal(JSON.stringify(products), original, `${mode}: source records must not be mutated`);
  }
});

const require = createRequire(import.meta.url);
async function renderComparison(mode, products, ids, differencesOnly = false) {
  const relative = mode === 'static' ? 'Comparison.js' : 'LiveCatalog.js';
  const filename = new URL(`../components/catalog/${relative}`, import.meta.url);
  const source = (await readFile(filename, 'utf8')).replace(/^import .+;\r?$/gm, '');
  const { transform, loadBindings } = require('next/dist/build/swc');
  await loadBindings();
  const compiled = await transform(source, {
    filename: filename.pathname,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  // Keep the component's full comparison JSX and real formatting/selection helpers.
  // Substitute only routing, async state, selection actions and unrelated visuals.
  const bindings = {
    products, categoryName, specRows, valueOrDash, specUnit, comparisonSpecValue, catalogSpecValueText,
    CatalogSpecValue: await catalogSpecValueComponent(),
    parseComparison, displayProductName, displayExecution, liveHref, catalogPrice,
    Link: props => createElement('a', props),
    ProductIcon: () => null, CatalogNotice: () => null,
    useState: initial => [initial?.status === 'loading'
      ? { status: 'ready', items: products, error: '' }
      : initial === false ? differencesOnly : initial, () => {}],
    useEffect: () => {},
    useSearchParams: () => new URLSearchParams({ ids: ids.join(',') }),
    useRouter: () => ({ push() {}, replace() {} }),
    useSelection: () => ({ add() {} }),
    useApiSelection: () => ({ add() {} }),
  };
  const componentName = mode === 'static' ? 'StaticComparison' : 'LiveComparison';
  const component = new Function('bindings', 'require', 'exports',
    `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${compiled.code}\nreturn ${componentName};`)(bindings, require, {});
  return renderToStaticMarkup(createElement(component));
}

test('actual static and live comparison components render every original winding value', async () => {
  for (const [mode, products] of [['static', officialProducts], ['live', liveProducts]]) {
    const html = await renderComparison(mode, products, affectedIds);
    assert.equal((html.match(/<td class="catalog-spec-text">медные · трехфазные, двухобмоточные<\/td>/g) || []).length, 3, mode);
    assert.match(html, /<th[^>]*>Обмотки<\/th>/);
  }
});

test('static differences-only mode compares the complete value, and both modes keep units in their existing place', async () => {
  const first = officialProducts.find(product => product.id === affectedIds[0]);
  const second = officialProducts.find(product => product.id === affectedIds[1]);
  const products = [first, {
    ...second, comparable: true,
    technicalSpecs: second.technicalSpecs.filter(row => row.label !== 'Обмотки' || row.value === 'медные'),
  }].map(product => ({ ...product, comparable: true }));
  const html = await renderComparison('static', products, products.map(product => product.id), true);
  assert.match(html, /<tr class="has-difference"><th[^>]*>Обмотки<\/th><td[^>]*>медные · трехфазные, двухобмоточные<\/td><td[^>]*>медные<\/td><\/tr>/);
  assert.match(html, /<td[^>]*>25 кВА<\/td>/);
  const liveHtml = await renderComparison('live', products, products.map(product => product.id));
  assert.match(liveHtml, /<th[^>]*>Номинальная мощность, кВА<\/th><td[^>]*>25<\/td>/);
});
