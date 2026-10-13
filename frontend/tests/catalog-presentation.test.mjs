import { measurementColumn2026CompletionManifest } from '../lib/catalog/models/measurementColumn2026Completion.js';
import { sourceAssetCompletionManifest } from '../lib/catalog/models/sourceAssetCompletion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { officialProducts, transformerProducts } from '../lib/catalog/data.js';
import { getCatalogSpecSummary, compactCatalogSpecValue, facetValues, equipmentTypeFor, categorySpecRows, categoryDisplayRows } from '../lib/catalog/grouping.js';
import { catalogFamilyMembers, catalogMemberLabel, displayDescription, displayExecution, displayFamilyName, displayProductName, catalogEvidenceSpecs, formatEvidenceSpec, catalogSourceWarnings } from '../lib/catalog/presentation.js';
import { familyPresentationBindings, getFamilyPresentationEvidence, getFamilyTechnicalDocument } from '../lib/catalog/familyPresentation.js';
import { getAdditionalCatalogVariantIds } from '../lib/catalog/identityCompletion.js';
import { transformerRuntimeManifest } from '../lib/catalog/models/transformer2026Runtime.js';
import { selectionCsv } from '../lib/catalog/query.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';

const product = id => officialProducts.find(row => row.id === id);
const summary = (id, key) => getCatalogSpecSummary(product(id), officialProducts).find(row => row.key === key);

test('all 843 records retain their source bodies and independently approved assets through presentation', () => {
  assert.equal(officialProducts.length, 843);
  const before = JSON.stringify(officialProducts);
  const bindings = officialProducts.map(row => [row.id, getEquipmentVisual(row), getEquipmentIcon(row)]);
  for (const row of officialProducts) {
    displayProductName(row); displayFamilyName(row); displayDescription(row, officialProducts); displayExecution(row);
    catalogMemberLabel(row); catalogFamilyMembers(row, officialProducts); getCatalogSpecSummary(row, officialProducts);
  }
  assert.equal(JSON.stringify(officialProducts), before);
  assert.deepEqual(officialProducts.map(row => [row.id, getEquipmentVisual(row), getEquipmentIcon(row)]), bindings);
  assert.equal(transformerProducts.filter(row => getEquipmentVisual(row).type).length, transformerProducts.filter(row => Object.hasOwn(transformerRuntimeManifest.geometry, row.id) || Object.hasOwn(sourceAssetCompletionManifest.records, row.id) || Object.hasOwn(measurementColumn2026CompletionManifest.records, row.id)).length);
  assert.equal(transformerProducts.filter(row => getEquipmentIcon(row).type).length, transformerProducts.filter(row => Object.hasOwn(transformerRuntimeManifest.icons, row.id) || Object.hasOwn(sourceAssetCompletionManifest.records, row.id) || Object.hasOwn(measurementColumn2026CompletionManifest.records, row.id)).length);
});

test('450 empty descriptions and every new family gain display evidence without adding raw fields', () => {
  const empty = transformerProducts.filter(row => !row.description);
  assert.equal(empty.length, 450);
  assert.ok(empty.every(row => displayDescription(row, officialProducts).length > 80));
  const families = transformerProducts.filter(row => row.recordKind === 'family');
  assert.equal(families.length, 77);
  for (const family of families) {
    assert.ok(getCatalogSpecSummary(family, officialProducts).some(row => row.value !== '—'), family.id);
    assert.deepEqual(catalogFamilyMembers(family, officialProducts).map(row => row.id).sort(), [...family.variantIds, ...getAdditionalCatalogVariantIds(family.id)].sort());
    assert.equal(getEquipmentVisual(family).type, null, family.id);
  }
});

test('winding, accuracy class and unusual source units retain labels and exact values', () => {
  assert.match(summary('alageum-2026-znom35-config1', 'power').value, /Предельная мощность: 1,0 кВА/);
  assert.deepEqual(facetValues(product('alageum-2026-znom35-config1'), 'power'), []);
  assert.match(summary('alageum-2026-znom35-config1', 'power').value, /Мощность в классе0,5: 0,15 кВА/);
  assert.match(summary('alageum-2026-znom35-config1', 'voltage').value, /ВН: 27,5 кВ/);
  assert.match(summary('alageum-2026-znom35-config1', 'voltage').value, /НН основная: 0,1 кВ/);
  assert.match(summary('alageum-2026-ts-10', 'voltage').value, /ВН: 380 кВ/);
  assert.match(summary('alageum-2026-ts-10', 'voltage').value, /Класс напряжения: 0,66 кВ/);
  assert.ok(product('alageum-2026-ts-10').notes.some(note => note.includes('inconsistent')));
  assert.match(summary('alageum-2026-zom-1p25-35', 'power').value, /Номинальная мощность: 1,25 кВ/);
  assert.doesNotMatch(summary('alageum-2026-zom-1p25-35', 'power').value, /кВА/);
});

test('all explicit electrical and cooling evidence is displayed without treating short-circuit percentages as voltage', () => {
  for (const row of transformerProducts) for (const key of ['power', 'voltage', 'cooling']) {
    const evidence = catalogEvidenceSpecs(row, key);
    const field = getCatalogSpecSummary(row, officialProducts).find(item => item.key === key);
    if (!field) continue;
    for (const spec of evidence) assert.ok(field.value.includes(formatEvidenceSpec(spec, { requireUnit: key !== 'cooling' })), `${row.id}: ${spec.label}`);
  }
  const fixture = { category: 'transformers', sourceId: 'transformers-2026', technicalSpecs: [
    { label: 'Номинальное напряжение ВН', value: '6', unit: '' },
    { label: 'Напряжение короткого замыкания', value: '6', unit: '%' },
    { label: 'Охлаждение', value: 'естественное', unit: '' },
  ] };
  const values = getCatalogSpecSummary(fixture);
  assert.equal(values.find(row => row.key === 'voltage').value, 'Номинальное напряжение ВН: 6 (единица не указана)');
  assert.equal(values.find(row => row.key === 'cooling').value, 'Охлаждение: естественное');
});

test('duplicate printed designations remain individually identifiable by explicit winding and row evidence', () => {
  const variants = transformerProducts.filter(row => row.recordKind === 'variant');
  assert.equal(new Set(variants.map(catalogMemberLabel)).size, variants.length);
  const tmpn = variants.filter(row => row.designation === 'ТМПН-160/3');
  assert.equal(tmpn.length, 3);
  for (const voltage of ['1250', '1900', '1902']) assert.ok(tmpn.some(row => catalogMemberLabel(row).includes(`${voltage} В`)));
});

test('display aliases remove internal execution phrases and never rewrite identity-bound source strings', () => {
  assert.equal(displayProductName(product('tr2026-family-zom')), 'Измерительные трансформаторы ЗОМ');
  assert.equal(displayProductName(product('tr2026-family-znom')), 'Измерительные трансформаторы ЗНОМ');
  for (const id of ['tr2026-family-zom','tr2026-family-znom','alageum-2026-znom35-config1']) assert.equal(equipmentTypeFor(product(id)), 'instrument-transformer');
  const ids = ['alageum-2026-om-2p0-drawing', 'alageum-2026-relay-tr100', 'alageum-2026-sensor-pt100', 'alageum-2026-damper-ek290', 'alageum-2026-nom-3-drawing', 'alageum-2026-zom-1p25-35', 'alageum-2026-znom35-config1', 'alageum-2026-znom35-config2', 'tr2026-family-asia-shunt-reactor-configurations'];
  for (const id of ids) assert.doesNotMatch(displayExecution(product(id)), /drawing|standard|optional|railway|nominal|generic/);
  assert.equal(product('tr2026-family-zom').name, 'ЗОМ — измерительный, railway');
});

test('API family selection uses only reciprocal published members, with no static fallback or authority upgrade', () => {
  const family = transformerProducts.find(row => row.recordKind === 'family' && row.variantIds.length > 1);
  const members = catalogFamilyMembers(family, officialProducts);
  const apiFamily = { ...family, source: 'api', databaseId: familyPresentationBindings[family.id].database_id, sourceMediaPath: family.image };
  assert.deepEqual(catalogFamilyMembers(apiFamily, officialProducts), []);
  const apiMembers = members.map(row => ({ ...row, source: 'api', databaseId: 'untrusted' }));
  assert.equal(catalogFamilyMembers(apiFamily, apiMembers).length, members.length);
  assert.ok(apiMembers.every(row => getEquipmentVisual(row).type === null && getEquipmentIcon(row).type === null));
  assert.deepEqual(catalogFamilyMembers(apiFamily, apiMembers.map(row => ({ ...row, familyId: 'unrelated' }))), []);
  assert.deepEqual(catalogFamilyMembers(apiFamily, apiMembers.map(row => ({ ...row, sourceSha256: 'mutated' }))), []);
});

test('compact summaries disclose remaining separate values without deriving a range', () => {
  const row = { values: ['100 кВА', '200 кВА', '400 кВА', '800 кВА', '1600 кВА'], value: 'full' };
  assert.equal(compactCatalogSpecValue(row), '100 кВА · 200 кВА · 400 кВА · 800 кВА · ещё 1 значений в записях');
  assert.equal(row.values.length, 5);
});

test('family evidence retains member source warnings with the responsible record link', () => {
  const family = product('tr2026-family-ts-low-voltage');
  const warnings = catalogSourceWarnings(family, officialProducts);
  assert.ok(warnings.some(warning => warning.note.includes('inconsistent') && warning.productId === 'alageum-2026-ts-10'));
  for (const warning of warnings) assert.ok(product(warning.productId).notes.includes(warning.note));
});

test('twenty family document previews use their declared technical page and fail closed after API identity or shape edits', () => {
  const families = transformerProducts.filter(row => row.recordKind === 'family');
  assert.equal(Object.keys(familyPresentationBindings).length, 77);
  const previews = families.filter(row => getFamilyTechnicalDocument(row));
  assert.equal(previews.length, 20);
  for (const family of families) {
    const binding = getFamilyPresentationEvidence(family);
    assert.ok(binding, family.id);
    const live = { ...family, source: 'api', databaseId: binding.database_id, sourceMediaPath: family.image };
    assert.ok(getFamilyPresentationEvidence(live), family.id);
    assert.deepEqual(getFamilyTechnicalDocument(live), getFamilyTechnicalDocument(family));
    for (const patch of [{ databaseId: 'wrong' }, { sourceSha256: 'wrong' }, { sourceFamilyId: 'wrong' }, { name: 'edited' }, { sourcePages: [166] }, { variantIds: [] }, { technicalSpecs: [{ label: 'changed', value: '1', unit: 'кВ' }] }, { sourceMediaPath: '/catalog-source/transformers-2026/page-166.webp' }]) {
      const changed = { ...live, ...patch };
      if (Object.entries(patch).every(([key, value]) => JSON.stringify(live[key]) === JSON.stringify(value))) continue;
      assert.equal(getFamilyPresentationEvidence(changed), null, `${family.id}: ${JSON.stringify(patch)}`);
      assert.equal(getFamilyTechnicalDocument(changed), null, family.id);
      assert.deepEqual(catalogFamilyMembers(changed, []), []);
    }
  }
  for (const family of previews) {
    const document = getFamilyTechnicalDocument(family);
    assert.ok(document.page >= 167 && document.page <= 177);
    assert.ok(family.sourcePages.includes(document.page));
    assert.match(document.caption, /не фотография изделия/);
    assert.match(family.image, /page-166/);
    assert.equal(getEquipmentVisual(family).type, null);
  }
});

test('reactive power is shown with source units without adding a nominal-kVA reactor filter', () => {
  assert.ok(!categorySpecRows('reactors').some(row => row.key === 'power'));
  assert.deepEqual(categoryDisplayRows('reactors').map(row => row.key), ['power', 'voltage', 'subtype']);
  assert.equal(categoryDisplayRows('reactors')[0].unit, '');
  const reactors = transformerProducts.filter(row => row.category === 'reactors');
  assert.ok(reactors.length);
  for (const reactor of reactors) {
    const row = getCatalogSpecSummary(reactor, officialProducts).find(item => item.key === 'power');
    if (row.value !== '—') { assert.match(row.value, /кВАр/); assert.doesNotMatch(row.value, /кВА(?:\s|$| ·)/); }
  }
});

test('CSV keeps canonical source names while display aliases leave the export contract untouched', () => {
  const ids = ['tr2026-family-zom', 'tr2026-family-znom'];
  const csv = selectionCsv(ids.map(id => ({ id, quantity: 1 })), officialProducts);
  for (const id of ids) assert.ok(csv.includes(product(id).name));
  assert.ok(!csv.includes('Измерительные трансформаторы ЗНОМ'));
  assert.ok(csv.includes('Обозначение') && csv.includes('Наименование'));
});
