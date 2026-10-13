import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineOfficialProducts as officialProducts, demoProducts, importedProducts, webOfficialProducts } from '../lib/catalog/data.js';
import { groupProducts, getFamilyForProduct, equipmentTypeFor, equipmentTypes, catalogTaxonomy, categorySpecRows, facetValues, getCatalogSpecSummary } from '../lib/catalog/grouping.js';
import { filterCatalogGroups, filterProducts, getCatalogFacetOptions, getProductFacetOptions, normalizeSelection, parseComparison, sortProducts } from '../lib/catalog/query.js';
import { equipmentModelTypes } from '../lib/catalog/models/types.js';

const groups = groupProducts(officialProducts);
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

test('public catalog keeps all 238 original rows and type navigation never collapses models', () => {
  const visible = filterProducts(officialProducts, {});
  assert.equal(visible.length, 238);
  assert.deepEqual(visible.map((record) => record.id), officialProducts.map((record) => record.id));
  for (const record of visible) assert.strictEqual(record, officialProducts.find((source) => source.id === record.id));
  const oil = filterProducts(officialProducts, { category: 'transformers', equipmentType: 'oil-transformer' });
  assert.equal(oil.length, 9);
  for (const id of ['tmg-400', 'tmg-630', 'tmg-1000', 'tmg-2500']) assert.ok(oil.some((record) => record.id === id));
  const pktp = filterProducts(officialProducts, { category: 'substations', equipmentType: 'substation', q: 'ПКТП' });
  assert.ok(pktp.some((record) => record.id === 'cat-pktp'));
  assert.ok(pktp.some((record) => record.id === 'pktp-400'));
  assert.ok(pktp.some((record) => record.id === 'pktp-1000'));
  assert.ok(visible.every((record) => !record.isCatalogGroup));
});

test('seven category hierarchies expose 15 semantic navigation types and cover each raw record exactly once', () => {
  assert.equal(catalogTaxonomy.length, 7);
  assert.equal(equipmentTypes.length, 15);
  assert.equal(new Set(equipmentTypes.map((type) => type.id)).size, 15);
  for (const type of equipmentTypes) assert.ok(equipmentModelTypes[type.id] || ['reactor', 'transformer-accessory'].includes(type.id), type.id);
  const encountered = [];
  for (const category of catalogTaxonomy) {
    for (const type of category.subcategories) {
      assert.ok(type.categories.includes(category.id));
      encountered.push(...filterProducts(officialProducts, { category: category.id, equipmentType: type.id }).map((record) => record.id));
    }
  }
  assert.equal(encountered.length, 238);
  assert.equal(new Set(encountered).size, 238);
  assert.equal(filterProducts(officialProducts, { equipmentType: 'unknown' }).length, 0);
});

test('raw-row facets include type and source-backed current without changing result identities', () => {
  assert.deepEqual(getProductFacetOptions(officialProducts, 'equipmentType', { category: 'transformers' }), ['dry-transformer', 'instrument-transformer', 'oil-transformer']);
  assert.deepEqual(getProductFacetOptions(officialProducts, 'power', { category: 'transformers', equipmentType: 'oil-transformer', q: 'ТМГ-400' }), ['400']);
  const current = getProductFacetOptions(officialProducts, 'current', { category: 'switchgear' });
  assert.ok(current.includes('630 А'));
  for (const record of filterProducts(officialProducts, { category: 'switchgear', current: '630 А' })) assert.strictEqual(record, officialProducts.find((source) => source.id === record.id));
  assert.ok(filterProducts(officialProducts, { category: 'cabinets', voltage: '380/220 В' }).length);
  assert.deepEqual(filterProducts(officialProducts, { q: 'ТМГ-400', power: '400' }).map((record) => record.id), ['tmg-400']);
  assert.equal(filterProducts(officialProducts, { q: 'ТМГ-400', power: '2500' }).length, 0);
  assert.ok(filterProducts(officialProducts, { current: '630 А' }).length);
  assert.deepEqual(filterProducts(demoProducts, { voltage: '10 / 0,4 кВ' }), []);
});

test('placeholder-only source values never become unit-bearing filters or summary values', () => {
  const original = officialProducts.find((record) => record.id === 'cat-ya5000-rusm5000');
  const before = JSON.stringify(original);
  const current = getProductFacetOptions(officialProducts, 'current');
  assert.ok(!current.some((value) => /^[\s\-\u2010-\u2015\u2212]+\s*[кК]?[аА]$/.test(value)));
  const summary = getCatalogSpecSummary(original).find((row) => row.key === 'current');
  assert.ok(!/[—−]\s*А/.test(summary.value));
  assert.equal(JSON.stringify(original), before);
  const fixture = deepFreeze({ id: 'placeholder', category: 'switchgear', voltage: '—', voltageUnit: 'кВ', technicalSpecs: [
    { label: 'Номинальный ток', value: '—; −; -; 630', unit: 'А', page: 1 },
  ] });
  assert.deepEqual(facetValues(fixture, 'current'), ['630 А']);
  assert.deepEqual(facetValues(fixture, 'voltage'), []);
  assert.equal(fixture.technicalSpecs[0].value, '—; −; -; 630');
});

test('global numeric-unit search finds power and current without conflating A with kVA', () => {
  for (const q of ['630 кВА', '630кВА']) {
    const result = filterProducts(officialProducts, { q });
    assert.ok(result.some((record) => record.id === 'tmg-630'), q);
    assert.ok(result.some((record) => record.id === 'tsl-630'), q);
    assert.ok(!result.some((record) => record.id === 'tmg-400'), q);
  }
  for (const q of ['630 А', '630А']) {
    const result = filterProducts(officialProducts, { q });
    assert.ok(result.some((record) => record.category === 'switchgear'), q);
    assert.ok(result.some((record) => record.id === 'kso-292'), q);
    assert.ok(!result.some((record) => record.category === 'transformers'), q);
  }
  assert.equal(filterProducts(officialProducts, { q: 'ТМГ-630 630 А' }).length, 0);
  assert.deepEqual(filterProducts(officialProducts, { q: 'ТМГ-630 630 кВА' }).map((record) => record.id), ['tmg-630']);
});

test('unit constraints ignore manufacturer substrings and preserve explicit mixed units without conversion', () => {
  const records = [
    { id: 'power', name: 'Power 630', sku: 'POWER-630', source: 'official', category: 'transformers', power: 630, manufacturer: 'АО «Завод»' },
    { id: 'current', name: 'Switch', sku: 'SWITCH', source: 'official', category: 'switchgear', technicalSpecs: [{ label: 'Номинальный ток', value: '630', unit: 'А' }] },
    { id: 'kiloamp', name: 'Other', sku: 'OTHER', source: 'official', category: 'switchgear', technicalSpecs: [{ label: 'Ток термической стойкости', value: '630', unit: 'кА' }] },
    { id: 'mixed', name: 'Mixed', sku: 'MIXED', source: 'official', category: 'substations', voltage: '6 кВ → 400 В', voltageUnit: '' },
  ];
  assert.deepEqual(filterProducts(records, { q: '630 А' }).map((record) => record.id), ['current']);
  assert.deepEqual(filterProducts(records, { q: '630 кА' }).map((record) => record.id), ['kiloamp']);
  assert.deepEqual(filterProducts(records, { q: '6 кВ' }).map((record) => record.id), ['mixed']);
  assert.deepEqual(filterProducts(records, { q: '400 В' }).map((record) => record.id), ['mixed']);
  assert.equal(filterProducts(records, { q: '6 В' }).length, 0);
  assert.equal(filterProducts(records, { q: '400 кВ' }).length, 0);
  assert.equal(filterProducts(records, { q: '6000 В' }).length, 0);
});

test('238 source records appear exactly once in 72 documented series groups', () => {
  assert.equal(officialProducts.length, 238);
  assert.equal(groups.length, 72);
  const members = groups.flatMap((group) => group.members);
  assert.equal(members.length, 238);
  assert.equal(new Set(members.map((member) => member.id)).size, 238);
  assert.deepEqual([...members].sort((a, b) => a.id.localeCompare(b.id)), [...officialProducts].sort((a, b) => a.id.localeCompare(b.id)));
  for (const member of members) assert.strictEqual(member, officialProducts.find((record) => record.id === member.id));
  assert.deepEqual(Object.fromEntries(['transformers', 'substations', 'switchgear', 'cabinets', 'protection'].map((category) => [category, groups.filter((group) => group.category === category).length])), {
    transformers: 6, substations: 21, switchgear: 22, cabinets: 17, protection: 6,
  });
});

test('grouping never mutates raw fields, specifications, notes, IDs, URLs or configurations', () => {
  const frozen = deepFreeze(structuredClone(officialProducts));
  const before = JSON.stringify(frozen);
  const result = groupProducts(frozen);
  for (const group of result) {
    assert.ok(frozen.some((record) => record.id === group.id));
    assert.equal(group.detailId, group.id);
    for (const member of group.members) assert.strictEqual(member, frozen.find((record) => record.id === member.id));
    if (group.familyProduct) {
      assert.strictEqual(group.configurations, group.familyProduct.configurations);
      assert.strictEqual(group.technicalSpecs, group.familyProduct.technicalSpecs);
    }
    getCatalogSpecSummary(group);
    getCatalogFacetOptions(result, 'current', { category: group.category });
  }
  assert.equal(JSON.stringify(frozen), before);
  assert.equal(result.reduce((count, group) => count + group.configurationCount, 0), 112);
});

test('all 65 imported families and 159 printed variants keep exact relationships', () => {
  const families = importedProducts.filter((record) => record.recordKind === 'family');
  for (const family of families) {
    const group = getFamilyForProduct(family.id, groups);
    assert.equal(group.id, family.id);
    assert.equal(group.name, family.name);
    assert.equal(group.sku, family.sku);
    assert.deepEqual([...group.variantIds].sort(), [...family.variantIds].sort());
    for (const id of family.variantIds) assert.equal(getFamilyForProduct(id, officialProducts).id, family.id);
  }
  assert.equal(groups.reduce((count, group) => count + group.variants.filter((member) => member.recordKind === 'variant').length, 0), 159);
});

test('six transformer series and the disconnector remain distinct, with valid detail URLs', () => {
  assert.deepEqual(groups.filter((group) => group.category === 'transformers').map((group) => group.series), ['ТМГ', 'ТМГС', 'ТМГФ', 'ТМЭГ', 'ТСЛ', 'НТМИ']);
  const tmg = getFamilyForProduct('tmg-1000', groups);
  assert.equal(tmg.id, 'tmg-400');
  assert.equal(tmg.sku, 'ТМГ');
  assert.equal(tmg.name, 'Серия ТМГ');
  assert.equal(tmg.power, null);
  assert.deepEqual(tmg.memberIds, ['tmg-400', 'tmg-630', 'tmg-1000', 'tmg-2500']);
  assert.equal(getFamilyForProduct('rlnd', groups).equipmentType, 'disconnector');
  for (const record of webOfficialProducts) assert.ok(getFamilyForProduct(record.id, groups), record.id);
});

test('legacy ПКТП references resolve into the PDF family without losing additional web provenance', () => {
  for (const id of ['pktp-400', 'pktp-1000']) {
    const group = getFamilyForProduct(id, groups);
    assert.equal(group.id, 'cat-pktp');
    const member = group.members.find((record) => record.id === id);
    assert.equal(member.sourceKind, 'supplied-pdf');
    assert.ok(member.additionalSources.some((source) => source.url.endsWith('/pktp')));
  }
});

test('variant designation search returns one family and tolerates whitespace and dash typography', () => {
  for (const q of ['ТМГ-400', 'тмг — 400', ' ТМГ 400 ']) {
    const result = filterCatalogGroups(groups, { q });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'tmg-400');
    assert.deepEqual(result[0].matchingMemberIds, ['tmg-400']);
  }
  const record = officialProducts.find((record) => record.sku === 'УКЗВ-6(10)К-5-1У1');
  assert.ok(record);
  const result = filterCatalogGroups(groups, { q: record.sku.replaceAll('-', ' – ') });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, record.familyId);
  assert.ok(result[0].matchingMemberIds.includes(record.id));
  assert.deepEqual(filterProducts(groups, { q: 'ТМГ-400' }), filterCatalogGroups(groups, { q: 'ТМГ-400' }));
});

test('every imported designation is searchable without emitting duplicate family cards', () => {
  for (const record of officialProducts.filter((record) => record.recordKind === 'variant')) {
    const result = filterCatalogGroups(groups, { q: record.sku.replaceAll('-', ' – ') });
    assert.ok(result.some((group) => group.id === record.familyId && group.matchingMemberIds.includes(record.id)), record.sku);
    assert.equal(new Set(result.map((group) => group.id)).size, result.length, record.sku);
  }
});

test('query and all facets must match the same underlying member', () => {
  assert.equal(filterCatalogGroups(groups, { q: 'ТМГ-400', power: '2500' }).length, 0);
  const result = filterCatalogGroups(groups, { q: 'ТМГ', power: '630', cooling: 'Масляное' });
  assert.ok(result.some((group) => group.series === 'ТМГ'));
  assert.ok(result.find((group) => group.series === 'ТМГ').matchingMemberIds.every((id) => officialProducts.find((record) => record.id === id).power === 630));
  assert.equal(filterCatalogGroups(groups, { category: 'unknown' }).length, 0);
  assert.equal(filterCatalogGroups(groups, { recordKind: 'family' }).length, 65);
  for (const group of filterCatalogGroups(groups, { recordKind: 'variant' })) {
    assert.ok(group.matchingMemberIds.every((id) => officialProducts.find((record) => record.id === id).recordKind === 'variant'));
  }
});

test('facet options omit their own filter and otherwise use only matching members', () => {
  assert.deepEqual(getCatalogFacetOptions(groups, 'power', { q: 'ТМГ-400', power: '2500' }), ['400']);
  assert.deepEqual(getCatalogFacetOptions(groups, 'power', { category: 'transformers', q: 'ТМГ-400' }), ['400']);
  assert.deepEqual(facetValues(getFamilyForProduct('cat-ktp-25-250', groups), 'power'), ['25', '40', '63', '100', '160', '250']);
  assert.ok(getCatalogFacetOptions(groups, 'voltage', { category: 'cabinets' }).includes('380/220 В'));
  assert.ok(getCatalogFacetOptions(groups, 'voltage', { category: 'substations' }).includes('6(10)/0,4 кВ'));
  assert.ok(filterCatalogGroups(groups, { category: 'cabinets', voltage: '380/220' }).length);
  assert.ok(filterCatalogGroups(groups, { category: 'cabinets', voltage: '380/220 В' }).length);
});

test('summary and filter rows are category-specific, unit-faithful and preserve unknowns', () => {
  assert.deepEqual(categorySpecRows('transformers').map((row) => row.key), ['power', 'voltage', 'cooling']);
  assert.deepEqual(categorySpecRows('switchgear').map((row) => row.key), ['voltage', 'current', 'installation']);
  assert.deepEqual(categorySpecRows('cabinets').map((row) => row.key), ['voltage', 'current', 'subtype']);
  assert.deepEqual(categorySpecRows('protection').map((row) => row.key), ['voltage', 'current', 'function']);
  const yatp = getCatalogSpecSummary(getFamilyForProduct('cat-yatp', groups));
  assert.match(yatp.find((row) => row.key === 'voltage').value, /220 → 12 В/);
  assert.doesNotMatch(yatp.find((row) => row.key === 'voltage').value, /кВ/);
  assert.equal(getCatalogSpecSummary(getFamilyForProduct('ntmi-6', groups)).find((row) => row.key === 'power').value, '—');
  assert.deepEqual(facetValues(getFamilyForProduct('cat-ptm-tded', groups), 'power'), []);
  const k8 = getFamilyForProduct('cat-k8m', groups);
  assert.ok(k8.members[0].technicalSpecs.some((row) => row.value === '690' && row.unit === 'кВ'));
  assert.ok(k8.notes.some((note) => note.includes('690')));
  assert.ok(getCatalogSpecSummary(k8).find((row) => row.key === 'current').sourceRows.every((row) => row.page && row.productId));
});

test('navigation equipment types use documented series context, including member variants', () => {
  const checks = {
    'tmg-400': 'oil-transformer', 'tsl-630': 'dry-transformer', 'ntmi-6': 'instrument-transformer',
    rlnd: 'disconnector', 'cat-ktp-25-250': 'pole-substation', 'cat-bktp-concrete': 'modular-substation',
    'cat-pktp': 'substation', 'kso-366': 'switchgear', 'cat-shnn': 'distribution-cabinet',
    'cat-shueng': 'control-cabinet', 'cat-ukzv': 'protection-cabinet', 'cat-kik': 'metering-box',
  };
  for (const [id, type] of Object.entries(checks)) {
    assert.equal(equipmentTypeFor(getFamilyForProduct(id, groups)), type, id);
    assert.equal(equipmentTypeFor(officialProducts.find((record) => record.id === id)), type, id);
  }
});

test('demo records remain individual fixtures; raw comparison/selection IDs are unchanged', () => {
  assert.equal(groupProducts(demoProducts).length, demoProducts.length);
  assert.deepEqual(filterProducts(demoProducts, { q: 'DeMo-001' }).map((record) => record.id), ['demo-001']);
  assert.deepEqual(parseComparison('tmg-400,tmg-630,pktp-400,pktp-1000', officialProducts), ['tmg-400', 'tmg-630', 'pktp-400', 'pktp-1000']);
  assert.deepEqual(normalizeSelection([{ id: 'tmg-630', quantity: 2 }, { id: 'pktp-1000', quantity: 1 }], officialProducts), [{ id: 'tmg-630', quantity: 2 }, { id: 'pktp-1000', quantity: 1 }]);
  for (const sort of ['power-asc', 'power-desc']) {
    assert.equal(sortProducts(demoProducts, sort).at(-1).power, null);
    const sorted = sortProducts(groups.filter((group) => group.category === 'transformers'), sort);
    assert.equal(sorted.at(-1).series, 'НТМИ');
  }
});

test('safe fallback keeps orphan, API and undocumented records separate', () => {
  const records = [{ id: 'one', name: 'One', familyId: 'missing', source: 'api' }, { id: 'two', name: 'Two', source: 'api' }];
  assert.deepEqual(groupProducts(records).map((group) => group.id), ['one', 'two']);
  assert.equal(getFamilyForProduct('missing', records), null);
  assert.deepEqual(groupProducts([]), []);
});
