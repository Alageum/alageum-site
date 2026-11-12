import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, selectionCsv } from '../lib/catalog/query.js';
import { advancedFacetOptions, filterAdvancedProducts } from '../lib/catalog/advancedQuery.js';

const translations = new Map([
  ['Масляный трансформатор', 'Moyli transformator'],
  ['Сухой трансформатор', 'Quruq transformator'],
  ['Масляное', 'Moyli'],
  ['Сухое', 'Quruq'],
]);
const translate = value => translations.get(value) || value;
const records = [
  { id: 'oil', source: 'official', name: 'Масляный трансформатор', designation: 'ТМГ-630', sku: 'ТМГ-630', power: 630, voltage: '10', cooling: 'Масляное', manufacturer: 'one' },
  { id: 'dry', source: 'official', name: 'Сухой трансформатор', designation: 'ТСЛ-1000', sku: 'ТСЛ-1000', power: 1000, voltage: '10', cooling: 'Сухое', manufacturer: 'two' },
];

test('localized prose is searchable without mutating source records or filter values', () => {
  const original = structuredClone(records);
  assert.deepEqual(filterProducts(records, { q: 'moyli' }, '', translate).map(product => product.id), ['oil']);
  assert.deepEqual(filterAdvancedProducts(records, { q: 'quruq' }, '', translate).map(product => product.id), ['dry']);
  assert.deepEqual(advancedFacetOptions(records, { q: 'quruq' }, 'cooling', translate), [['Сухое', 1]]);
  assert.deepEqual(records, original);
});

test('localized prose cannot invent unit-qualified matches or replace exact designations', () => {
  const misleading = value => value === 'Сухой трансформатор' ? 'Quruq 630 kva transformator' : translate(value);
  assert.deepEqual(filterProducts(records, { q: '630 kva' }, '', misleading).map(product => product.id), ['oil']);
  assert.deepEqual(filterAdvancedProducts(records, { q: 'Moyli transformator', searchMode: 'exact' }, '', translate), []);
  assert.deepEqual(filterAdvancedProducts(records, { q: 'ТМГ-630', searchMode: 'exact' }, '', translate).map(product => product.id), ['oil']);
});

test('localized search and active facets must match the same original family member', () => {
  const group = { id: 'group', isCatalogGroup: true, members: records };
  assert.deepEqual(filterAdvancedProducts([group], { q: 'moyli', f_manufacturer: '["two"]' }, '', translate), []);
  assert.deepEqual(filterAdvancedProducts([group], { q: 'moyli', f_manufacturer: '["one"]' }, '', translate)[0].matchingMemberIds, ['oil']);
});


test('generated selection CSV translates labels and names without changing quantities or designations', () => {
  const csv = selectionCsv([{ id: 'oil', quantity: 3 }], records, value => value === 'Количество' ? 'Quantity' : translate(value));
  assert.ok(csv.includes('"Quantity"'));
  assert.ok(csv.includes('"Moyli transformator"'));
  assert.ok(csv.includes('"ТМГ-630"'));
  assert.ok(csv.endsWith(';"3"'));
});
