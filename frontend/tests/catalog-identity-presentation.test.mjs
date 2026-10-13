import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts, identityCompletionProducts, productById } from '../lib/catalog/data.js';
import { getApiCatalogReadProduct, getCatalogSourceComparisons, catalogIdentityCompletion } from '../lib/catalog/identityCompletion.js';
import { catalogFamilyMembers, catalogConfigurationLabel, catalogConfigurationEvidence } from '../lib/catalog/presentation.js';
import { categorySpecRows, equipmentTypeFor, getCatalogSpecSummary } from '../lib/catalog/grouping.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { legacyAssetCompletion } from '../lib/catalog/models/legacyAssetCompletion.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
const require = createRequire(import.meta.url);
const compiled = new Map();
async function component(name) {
  if (compiled.has(name)) return compiled.get(name);
  const file = new URL(`../components/catalog/${name}.js`, import.meta.url);
  let source = (await readFile(file, 'utf8')).replace("'react'", JSON.stringify(pathToFileURL(require.resolve('react')).href)).replace("import Link from 'next/link';", 'const Link = props => <a {...props}/>;');
  if (source.includes("'./CatalogConfigurations'")) source = source.replace("'./CatalogConfigurations'", JSON.stringify(await component('CatalogConfigurations')));
  if (source.includes("'./CatalogSourcePreview'")) source = source.replace("'./CatalogSourcePreview'", JSON.stringify(await component('CatalogSourcePreview')));
  source = source.replace("import Image from 'next/image';", 'const Image = props => <img {...props}/>;')
    .replace("import EquipmentModel from './EquipmentModel';", 'const EquipmentModel = props => <section data-equipment-model={props.type} data-preview-icon={props.previewIconType}/>;')
    .replace("import styles from './CatalogSourcePreview.module.css';", 'const styles = {};');
  source = source.replace("'@/lib/catalog/models/legacyAssetCompletion'", JSON.stringify(new URL('../lib/catalog/models/legacyAssetCompletion.js', import.meta.url).href));
  for (const moduleName of ['identityCompletion', 'presentation', 'sources', 'familySourceReferences', 'ntmiSourcePreview']) source = source.replace(`'@/lib/catalog/${moduleName}'`, JSON.stringify(new URL(`../lib/catalog/${moduleName}.js`, import.meta.url).href));
  const { transform, loadBindings } = require('next/dist/build/swc');
  await loadBindings();
  const output = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = output.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  compiled.set(name, url);
  return url;
}
async function render(name, product, records = officialProducts) {
  const { default: Component } = await import(await component(name));
  return renderToStaticMarkup(createElement(Component, { product, records }));
}

test('twenty admitted executions join only their explicit original family without rewriting variantIds', () => {
  const before = JSON.stringify(officialProducts);
  for (const execution of identityCompletionProducts) {
    const family = productById(execution.familyId);
    assert.ok(!family.variantIds.includes(execution.id));
    const members = catalogFamilyMembers(family, officialProducts);
    assert.equal(members.filter(member => member.id === execution.id).length, 1);
    assert.strictEqual(members.find(member => member.id === execution.id), execution);
    assert.ok(!catalogFamilyMembers({ ...family, sourceSha256: 'changed' }, officialProducts).length);
  }
  assert.equal(JSON.stringify(officialProducts), before);
});

test('source-backed dry navigation covers TS, TSI and Nomex without promoting their visual authority', () => {
  const families = new Set(['ts-low-voltage', 'tsi-tools', 'tsn-nomex']);
  const records = officialProducts.filter(product => product.sourceId === 'transformers-2026' && families.has(product.sourceFamilyId));
  assert.ok(records.length > 15);
  const before = records.map(product => [getEquipmentVisual(product), getEquipmentIcon(product)]);
  for (const product of records) assert.equal(equipmentTypeFor(product), 'dry-transformer', product.id);
  assert.deepEqual(records.map(product => [getEquipmentVisual(product), getEquipmentIcon(product)]), before);
  assert.equal(getEquipmentVisual(productById('alageum-2026-ts-10')).type, null);
});

test('fifteen source configuration tuples stay table rows with distinct labels and explicit reactive units', async () => {
  const family = productById('tr2026-family-asia-shunt-reactor-configurations');
  const before = JSON.stringify(family);
  assert.equal(catalogFamilyMembers(family, officialProducts).length, 0);
  assert.equal(family.configurations.length, 15);
  assert.equal(new Set(family.configurations.map(catalogConfigurationLabel)).size, 15);
  assert.ok(family.configurations.every((row, i) => catalogConfigurationLabel(row, i).includes(row.sourceRow.variant)));
  assert.equal(catalogConfigurationEvidence(family, 'power').length, 15);
  const summary = getCatalogSpecSummary(family, officialProducts);
  assert.match(summary.find(row => row.key === 'power').value, /По строкам таблицы: Номинальная мощность: 25000 кВАр/);
  assert.match(summary.find(row => row.key === 'voltage').value, /Класс напряжения: 500 кВ/);
  assert.ok(!categorySpecRows('reactors').some(row => row.key === 'power'));
  const html = await render('CatalogConfigurations', family);
  assert.equal((html.match(/class="catalog-configuration"/g) || []).length, 15);
  assert.match(html, /110 кВ; 25000 кВАр/);
  assert.match(html, /500 кВ; 180000 кВАр/);
  assert.doesNotMatch(html, /href="\/catalog\/alageum-suntiruusij/);
  assert.equal(JSON.stringify(family), before);
});

test('actual source panels retain old and new values in separate columns, unknown units and series scope', async () => {
  const product = productById('tmg-400');
  const before = JSON.stringify(product);
  const html = await render('CatalogSourceEvidence', product);
  assert.match(html, /data-catalog-source-panel="alageum-tmg-standard-400"/);
  const dimensions = html.match(/data-source-field="Lmm"[\s\S]*?<\/tr>/)?.[0];
  assert.ok(dimensions);
  assert.match(dimensions, /1294/);
  assert.match(dimensions, /1309/);
  assert.match(dimensions, /Единица в источнике не указана/);
  assert.match(html, /Общие сведения серии из печатного каталога/);
  assert.match(html, /Климатические диапазоны и опции не приписываются одному конкретному исполнению/);
  assert.match(html, /href="\/catalog\/alageum-tmg-copper-400"/);
  assert.doesNotMatch(html, /href="\/catalog\/alageum-tmg-standard-400"/);
  assert.doesNotMatch(html, /<button|Добавить в подборку/);
  assert.equal(JSON.stringify(product), before);
});

test('twelve source panels render only on their reviewed references and preserve NTMI unit conflicts', async () => {
  const reviewed = officialProducts.filter(product => getCatalogSourceComparisons(product).length);
  assert.equal(reviewed.length, 12);
  for (const product of reviewed) {
    const html = await render('CatalogSourceEvidence', product);
    assert.equal((html.match(/data-catalog-source-panel=/g) || []).length, 1, product.id);
    assert.equal(await render('CatalogSourceEvidence', { ...product, name: 'changed' }), '');
  }
  const ntmi = await render('CatalogSourceEvidence', productById('ntmi-6'));
  const maximum = ntmi.match(/data-source-field="maximumPowerValue"[\s\S]*?<\/tr>/)?.[0];
  assert.match(maximum, /630 ВА/);
  assert.match(maximum, /630 кВА/);
  assert.match(maximum, /Есть расхождение/);
  assert.match(ntmi, /кА \(заголовок сайта\)/);
  assert.match(ntmi, /единицы сохранены по каждому источнику/);
});

test('API read aliases require the original canonical UUID and never fall back on alias failure', () => {
  for (const [alias, canonical] of Object.entries(catalogIdentityCompletion.aliases)) {
    const product = productById(canonical);
    const trusted = { ...product, source: 'api', databaseId: catalogIdentityCompletion.guards[canonical].databaseId };
    const reused = { ...trusted, databaseId: 'different-uuid' };
    assert.strictEqual(getApiCatalogReadProduct(alias, [trusted]), trusted);
    assert.equal(getApiCatalogReadProduct(alias, [reused]), null);
    assert.equal(getApiCatalogReadProduct(alias, [{ ...reused, id: alias, slug: alias }]), null);
    assert.equal(getApiCatalogReadProduct(alias, []), null);
    assert.strictEqual(getApiCatalogReadProduct(canonical, [reused]), reused);
    assert.strictEqual(getApiCatalogReadProduct(trusted.databaseId, [trusted]), trusted);
    assert.equal(getApiCatalogReadProduct(alias, [product]), null);
    assert.equal(getApiCatalogReadProduct(alias, [Object.create(trusted)]), null);
    assert.equal(getApiCatalogReadProduct(alias, null), null);
  }
});

test('the product route preserves alias context and fresh comparison links use resolved product IDs', async () => {
  const route = await readFile(new URL('../app/(site)/catalog/[slug]/page.js', import.meta.url), 'utf8');
  assert.match(route, /ProductDetails id=\{slug\}/);
  assert.doesNotMatch(route, /id=\{resolveCatalogReadId/);
  const details = await readFile(new URL('../components/catalog/ProductDetails.js', import.meta.url), 'utf8');
  assert.match(details, /compare=\$\{product\.id\}/);
});

test('legacy family selectors retain all original reciprocal variants including the distinct PTM and TDE cabinets', () => {
  const families = officialProducts.filter(product => product.recordKind === 'family' && product.sourceId !== 'transformers-2026');
  assert.equal(families.length, 65);
  for (const family of families) assert.deepEqual(catalogFamilyMembers(family, officialProducts).map(product => product.id).sort(), [...(family.variantIds || [])].sort());
  assert.notEqual(getEquipmentVisual(productById('cat-ptm-tded-v012')).type, getEquipmentVisual(productById('cat-ptm-tded-v013')).type);
});

test('reviewed matching connection groups keep raw punctuation without a false disagreement badge', async () => {
  for (const id of ['tmg-1000', 'tmg-2500', 'tmgf-630', 'tmgf-1600', 'tmgs-160']) {
    const product = productById(id);
    assert.ok(product, id);
    const panel = getCatalogSourceComparisons(product)[0];
    const group = panel.comparison.comparedSpecs.find(row => row.field === 'group');
    assert.equal(group.comparison, 'match', id);
    const html = await render('CatalogSourceEvidence', product);
    const row = html.match(/data-source-field="group"[\s\S]*?<\/tr>/)?.[0];
    assert.ok(row, id);
    assert.doesNotMatch(row, /Есть расхождение|has-difference/, id);
  }
});

test('source-scope comparison uses a readable voltage label without changing its limited values', async () => {
  const html = await render('CatalogSourceEvidence', productById('tmeg-250'));
  const row = html.match(/data-source-field="nominalVoltageScope"[\s\S]*?<\/tr>/)?.[0];
  assert.match(row, />Указанные напряжения</);
  assert.match(row, /6\(6,3\) кВ/);
  assert.doesNotMatch(row, />nominalVoltageScope</);
});

test('SHR11 primary construction citation renders only for the exact static or original API record', async () => {
  const product = productById(legacyAssetCompletion.id);
  const approvedApi = { ...product, source: 'api', databaseId: legacyAssetCompletion.databaseId, sourceMediaPath: product.image };
  for (const row of [product, approvedApi]) {
    const html = await render('CatalogSourceEvidence', row);
    assert.match(html, /Источник сопоставления ШР11/);
    assert.ok(html.includes(`href="${legacyAssetCompletion.primarySourceUrl}"`));
    assert.doesNotMatch(html, /data-catalog-source-panel=/);
  }
  for (const row of [{ ...approvedApi, databaseId: 'reused-uuid' }, { ...approvedApi, name: 'changed' }, productById('cat-pr-shr11-v001'), productById('cat-pr-shr11-v003')]) {
    assert.equal(await render('CatalogSourceEvidence', row), '');
  }
});

test('family source references render separately and every link reaches a guarded canonical panel anchor', async () => {
  const family = productById('tr2026-family-tmg-standard');
  const html = await render('CatalogSourceEvidence', family);
  assert.equal((html.match(/data-source-reference=/g) || []).length, 4);
  assert.match(html, /не добавляют исполнения в семейство/);
  assert.doesNotMatch(html, /<select|<button|class="summary-specs"|class="variant-grid"/);
  const href = '/catalog/tmg-400#source-panel-alageum-tmg-standard-400';
  assert.ok(html.includes(`href="${href}"`));
  const target = await render('CatalogSourceEvidence', productById('tmg-400'));
  assert.match(target, /id="source-panel-alageum-tmg-standard-400"/);
  assert.equal(await render('CatalogSourceEvidence', { ...family, name: 'changed' }), '');
});

test('manual API configuration preserves exact designation and multiline value independently of unit and page evidence', async () => {
  const literal = '0007\nSecond literal source line';
  const product = { ...productById('alageum-tmg-standard-16'), source: 'api', configurations: [{
    designation: 'CMS fixture configuration', specifications: [{ label: 'CMS fixture code', value: literal, unit: 'мм', page: 32 }],
  }] };
  const html = await render('CatalogConfigurations', product);
  assert.match(html, /<span class="configuration-designation">CMS fixture configuration<\/span>/);
  assert.equal(html.match(/<dd class="catalog-spec-text">([\s\S]*?)<\/dd>/)?.[1], literal);
  assert.match(html, /<span>мм<\/span>/);
  assert.match(html, /href="\/catalog\/source\?source=transformers-2026&amp;page=32"/);
  assert.doesNotMatch(html.match(/<summary[\s\S]*?<\/summary>/)?.[0], /стр\./);
  for (const page of [undefined, null, 0, -1, 1.5, '32', 188]) {
    const invalid = { ...product, configurations: [{ designation: 'CMS fixture configuration', page, specifications: [{ label: 'Literal', value: literal, unit: 'мм', page }] }] };
    const rendered = await render('CatalogConfigurations', invalid);
    assert.doesNotMatch(rendered, /стр\.|page=/, String(page));
    assert.equal(rendered.match(/<dd class="catalog-spec-text">([\s\S]*?)<\/dd>/)?.[1], literal);
  }
});

test('NTMI previews render inside their exact source panels with the PDF edition, scan and gallery route', async () => {
  for (const id of ['ntmi-6', 'ntmi-10']) {
    const product = productById(id), html = await render('CatalogSourceEvidence', product);
    assert.match(html, new RegExp(`data-source-preview="alageum-2026-${id}"`));
    assert.match(html, /data-equipment-model="tr26-instrument-three-triangle"/);
    assert.match(html, /18\.03\.2026, стр\. 96/);
    assert.match(html, /не CAD, не размеры и не точная модель исполнения/);
    assert.match(html, /href="\/catalog\/source\?source=transformers-2026&amp;page=96"/);
    assert.match(html, /src="\/catalog-source\/transformers-2026\/page-096.webp"/);
    assert.doesNotMatch(html, /page-097|data-equipment-model="instrument-transformer"/);
    assert.equal(await render('CatalogSourceEvidence', { ...product, power: 1 }), '');
  }
  assert.doesNotMatch(await render('CatalogSourceEvidence', productById('tmg-400')), /data-source-preview/);
});
