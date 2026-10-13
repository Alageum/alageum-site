import { ktpbLegacyContextIds } from '../../scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { protectionExampleRuntimeManifest as bindings, getProtectionExampleEvidence, getProtectionExampleAsset } from '../lib/catalog/models/protectionExampleRuntime.js';
import { protectionExampleTypes } from '../lib/catalog/models/protectionExampleTypes.js';
import { protectionExampleIconDefinitions } from '../lib/catalog/models/protectionExampleIcons.js';
import { resolveModelType, equipmentModelName } from '../lib/catalog/models/types.js';
import { resolveIconType, equipmentIconName } from '../lib/catalog/models/iconTypes.js';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../lib/catalog/models/transformerExecutionChoices.js';
import { sourceContextManifest, createSourceContextAssetVerifier } from '../lib/catalog/source-context/sourceContexts.js';
import { renderEquipmentIcon } from './helpers/render-equipment-icon.mjs';
import { importedProductId } from '../../scripts/catalog/measurement-column-asset-snapshot.mjs';
import { verifyProtectionContextPreservation } from '../../scripts/check-protection-context-integration.mjs';
const api = row => normalizeApiProduct({ id: importedProductId(row.id), public_key: row.id, sku: row.sku,
  category_public_key: row.category, translations: { ru: { name: row.name } }, specs: row, provenance: row,
  media: row.image ? [{ path: row.image, kind: 'image', alt: row.imageCaption }] : [],
});
const rows = Object.keys(bindings.records).map(productById);
const proof = await createSourceContextAssetVerifier(asset => fs.readFileSync(new URL(`../public${asset}`, import.meta.url))).verify();

test('843 bodies, all old geometry/SVG outputs and unchanged coverage survive the exact three binding refinements and 24 contexts', async () => {
  const counts = await verifyProtectionContextPreservation();
  assert.equal(counts.sourceGroundedDefault3D, 464); assert.equal(counts.sourceBasedIcons, 465);
  assert.equal(counts.sourceContextRecords, 24); assert.equal(counts.explicitConstructionGaps, 243);
});

test('dedicated model and icon guards admit only exact static/API rows and survive ordinary JSON serialization', () => {
  for (const row of officialProducts) for (const value of [row, api(row)]) {
    const before = JSON.stringify(value), entry = getProtectionExampleEvidence(value);
    assert.equal(!!entry, Object.hasOwn(bindings.records, row.id), row.id);
    assert.deepEqual(getProtectionExampleEvidence(JSON.parse(before)), entry);
    if (entry) {
      assert.equal(getEquipmentIcon(value).type, entry.type);
      assert.equal(getEquipmentVisual(value).type, entry.geometryType);
      assert.deepEqual(getEquipmentConstructionChoices(value), []);
    }
    assert.equal(JSON.stringify(value), before);
  }
  for (const row of rows) for (const original of [row, api(row)]) {
    const reject = value => {
      assert.equal(getProtectionExampleEvidence(value), null, row.id);
      assert.equal(getProtectionExampleAsset(value, 'icons'), null);
      assert.equal(getProtectionExampleAsset(value, 'geometry'), null);
      if (value && Object.hasOwn(bindings.records, value.id)) {
        assert.equal(getEquipmentVisual(value).type, null);
        assert.notEqual(getEquipmentVisual(value).confidence, 'source-matched');
        assert.notEqual(getEquipmentIcon(value).confidence, 'source-based');
      }
    };
    for (const key of Object.keys(JSON.parse(transformerRecordShape(original)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key) ? [{ changed: key }]
        : key === 'sourceRow' ? { changed: true } : 'changed-reviewed-value';
      reject({ ...original, [key]: value });
    }
    for (const key of ['id', 'source', 'sourceKind', 'sourceUrl', 'recordType', 'recordKind']) { const value = { ...original }; delete value[key]; reject(value); }
    reject(Object.create(original)); reject({ ...original, source: 'unverified' });
    for (const id of ['__proto__', 'constructor', 'toString', 'unknown']) reject({ ...original, id });
    const variantsKey = original.source === 'api' ? 'sourceVariantSpecs' : 'variantSpecs';
    if (original.source === 'api') reject({ ...original, variantSpecs: [{ label: 'Климатическое исполнение', value: 'УХЛ4', unit: '', page: 69 }] });
    if (original[variantsKey]) {
      for (const changed of [[], null, ...['label', 'value', 'unit', 'page'].map(key => original[variantsKey].map((row, index) => index === 1 ? { ...row, [key]: key === 'page' ? 68 : 'changed' } : row))]) {
        reject({ ...original, [variantsKey]: changed });
        reject(api({ ...row, variantSpecs: changed }));
      }
      reject({ ...original, [variantsKey]: original[variantsKey].map(row => row.label === 'Климатическое исполнение' ? { ...row, value: 'УХЛ4' } : row) });
      const missing = { ...original }; delete missing[variantsKey]; reject(missing);
    }
    const cyclic = { ...original, notes: [] }; cyclic.notes.push(cyclic); reject(cyclic);
    reject({ ...original, notes: new Array(2) });
    const accessor = { ...original }; Object.defineProperty(accessor, 'name', { get() { throw new Error('Must not execute'); } }); reject(accessor);
    if (original.source === 'api') {
      reject({ ...original, databaseId: rows.find(other => other.id !== row.id).id });
      for (const key of ['databaseId', 'sourceMediaPath']) { const value = { ...original }; delete value[key]; reject(value); }
      reject({ ...original, source: 'official' });
      assert.deepEqual(getProtectionExampleEvidence({ ...original, image: '/display-only.webp' }), getProtectionExampleEvidence(original));
    } else { reject({ ...original, databaseId: importedProductId(row.id) }); reject({ ...original, sourceMediaPath: row.image }); }
  }
  for (const channel of ['', 'icon', 'model', '__proto__']) assert.equal(getProtectionExampleAsset(rows[0], channel), null);
  assert.throws(() => { bindings.records[rows[0].id].sourcePages.push(101); }, TypeError);
});

test('optional inherited properties and serializer hooks never run during protection authority checks', () => {
  let identityCalls = 0;
  const accessorIdentity = { ...rows[0], get id() { identityCalls++; return rows[0].id; } };
  assert.equal(getEquipmentVisual(accessorIdentity).type, null); assert.equal(getEquipmentIcon(accessorIdentity).confidence, 'typical');
  assert.equal(identityCalls, 0);
  const coerciveIdentity = { ...rows[0], id: { get toString() { identityCalls++; return () => rows[0].id; } } };
  assert.equal(getEquipmentVisual(coerciveIdentity).type, null); assert.equal(getEquipmentIcon(coerciveIdentity).confidence, 'typical');
  assert.equal(identityCalls, 0);
  let cyclicPrototype; cyclicPrototype = new Proxy({}, { getPrototypeOf() { return cyclicPrototype; } });
  assert.equal(getEquipmentVisual(cyclicPrototype).type, null); assert.equal(getEquipmentIcon(cyclicPrototype).confidence, 'typical');
  for (const target of [Object.prototype, Array.prototype]) {
    let calls = 0;
    Object.defineProperty(target, 'toJSON', { configurable: true, get() { calls++; throw new Error('Must not run'); } });
    try { assert.equal(getProtectionExampleEvidence(rows[0]), null); assert.equal(calls, 0); }
    finally { delete target.toJSON; }
  }
  let calls = 0;
  Object.defineProperty(Object.prototype, 'sourceId', { configurable: true, get() { calls++; throw new Error('Must not run'); } });
  try { assert.equal(getProtectionExampleEvidence(rows[0]).id, rows[0].id); assert.equal(calls, 0); }
  finally { delete Object.prototype.sourceId; }
});

test('real shared geometry dispatch disposes every resource once and real SVG retains the reviewed paths/transforms at UI sizes', async () => {
  for (const [type, definition] of Object.entries(protectionExampleIconDefinitions)) {
    assert.equal(resolveIconType(type), type); assert.equal(equipmentIconName(type), definition.name);
    for (const size of [28, 32, 40, 48, 52, 56, 64, 96, 148]) {
      const svg = await renderEquipmentIcon(type, size, true);
      assert.match(svg, /stroke-width="1.4"/);
      assert.deepEqual([...svg.matchAll(/<path data-feature="([^"]+)" d="([^"]+)"(?: transform="([^"]+)")?/g)].map(match => ({ feature: match[1], d: match[2], ...(match[3] ? { transform: match[3] } : {}) })), definition.layers);
    }
  }
  for (const [type, definition] of Object.entries(protectionExampleTypes)) {
    assert.equal(resolveModelType(type), type); assert.equal(equipmentModelName(type), definition.name);
    const group = createEquipmentGeometry(type), resources = new Set(group.userData.materials), disposed = new Map();
    group.traverse(node => { if (node.geometry) resources.add(node.geometry); if (node.material) resources.add(node.material); });
    for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
    disposeEquipmentGeometry(group); disposeEquipmentGeometry(group);
    assert.equal(group.children.length, 0); assert.equal(disposed.size, resources.size); assert.ok([...disposed.values()].every(count => count === 1));
  }
  assert.equal(resolveModelType('source69-paired-protection-examples-icon'), 'equipment');
});

const require = createRequire(import.meta.url), compiled = new Map();
async function component(name) {
  if (compiled.has(name)) return compiled.get(name);
  const file = new URL(`../components/catalog/${name}.js`, import.meta.url);
  let source = fs.readFileSync(file, 'utf8')
    .replace("import Image from 'next/image';", 'const Image = props => <img {...props}/>;')
    .replace("import Link from 'next/link';", 'const Link = props => <a {...props}/>;')
    .replace("import ProductIcon from './ProductIcon';", 'const ProductIcon = () => <span/>;')
    .replace("export { default as ProductIcon } from './ProductIcon';", '')
    .replace("import EquipmentModel from './EquipmentModel';", 'const EquipmentModel = ({type, previewIconType}) => <div data-real-viewer-type={type} data-preview-type={previewIconType}/>;')
    .replace("import sourceContextAssetProof from '@/lib/catalog/source-context/sourceContextBuildProof';", `const sourceContextAssetProof = ${JSON.stringify(JSON.parse(JSON.stringify(proof)))};`)
    .replace("import styles from './CatalogSourceContext.module.css';", 'const styles = new Proxy({}, { get: (_, name) => name });');
  if (name === 'FamilyProductVisual') source = source.replace("import { useState } from 'react';", "export const state = { selected: '' }; const useState = () => [state.selected, value => { state.selected = value; }];");
  for (const [relative, child] of [["'./ProductVisual'", 'ProductVisual'], ["'./source-context/CatalogSourceContext'", 'source-context/CatalogSourceContext']]) {
    if (source.includes(relative)) source = source.replace(relative, JSON.stringify(await component(child)));
  }
  source = source.replace("'../../../lib/catalog/source-context/sourceContexts.js'", JSON.stringify(new URL('../lib/catalog/source-context/sourceContexts.js', import.meta.url).href))
    .replace("'./SourceContextImage.js'", JSON.stringify(new URL('../components/catalog/source-context/SourceContextImage.js', import.meta.url).href))
    .replace(/(['"])@\/([^'"]+)\1/g, (_, quote, relative) => JSON.stringify(new URL(`../${relative}.js`, import.meta.url).href));
  const { transform, loadBindings } = require('next/dist/build/swc'); await loadBindings();
  const result = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = result.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href)).replaceAll("from 'react'", `from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`; compiled.set(name, url); return url;
}
const render = async product => renderToStaticMarkup(createElement((await import(await component('ProductVisual'))).default, { product }));

test('actual ProductVisual keeps each model omission and both full-source links visible outside collapsed controls', async () => {
  for (const row of rows) for (const value of [row, api(row)]) {
    const html = await render(value), entry = bindings.records[row.id];
    assert.ok(html.includes(entry.reason)); assert.ok(html.includes('href="/catalog/source?page=69"'));
    assert.ok(html.includes('href="/catalog-source/page-069.webp"'));
    assert.doesNotMatch(html, /data-source-context-for=|Конструкция для просмотра/);
    if (entry.geometryType) {
      assert.ok(html.includes(`data-real-viewer-type="${entry.type}"`)); assert.ok(html.indexOf(entry.reason) < html.indexOf('<details'));
    } else assert.doesNotMatch(html, /data-real-viewer-type=/);
  }
});

test('actual ProductVisual passes all24 original static/API products to persistent source-only context siblings', async () => {
  for (const id of ktpbLegacyContextIds) for (const value of [productById(id), api(productById(id))]) {
    const html = await render(value), entry = sourceContextManifest.records[id];
    assert.equal((html.match(/data-source-context-for=/g) || []).length, 1);
    assert.ok(html.includes(`data-source-context-for="${id}"`)); assert.doesNotMatch(html, /data-real-viewer-type=|Конструкция для просмотра/);
    assert.ok(html.indexOf('data-source-context-for=') > html.indexOf('visual-provenance'));
    for (const key of sourceContextManifest.contexts[entry.contextKey].figureKeys) {
      const figure = sourceContextManifest.figures[key]; assert.ok(html.includes(figure.caption)); assert.ok(html.includes(`src="${figure.cropPath}"`));
      if (figure.exemplarId) assert.ok(html.includes(`/catalog/${figure.exemplarId}${value.source === 'api' ? '?source=api' : ''}`));
    }
    assert.doesNotMatch(await render({ ...value, name: 'changed source record' }), /data-source-context-for=/);
  }
});

test('actual family switching renders exactly the selected eligible record, preserves API links and resets without authority leakage', async () => {
  const { default: Family, state } = await import(await component('FamilyProductVisual'));
  for (const mode of ['static', 'api']) for (const familyId of ['cat-shnn', 'cat-ptm-tded']) {
    const records = mode === 'api' ? officialProducts.map(api) : officialProducts, family = records.find(row => row.id === familyId);
    const draw = () => renderToStaticMarkup(createElement(Family, { product: family, records }));
    const eligible = Object.keys(sourceContextManifest.records).filter(id => id.startsWith(`${familyId}-`));
    for (const id of ['', eligible[0], eligible.at(-1), eligible[0], familyId === 'cat-ptm-tded' ? 'cat-ptm-tded-v002' : '', '']) {
      state.selected = id; const html = draw();
      assert.equal((html.match(/data-source-context-for=/g) || []).length, eligible.includes(id) ? 1 : 0);
      if (eligible.includes(id)) { assert.ok(html.includes(`data-source-context-for="${id}"`)); assert.ok(html.includes(`data-selected-member="${id}"`)); }
      if (id || familyId !== 'cat-shnn') assert.doesNotMatch(html, /data-real-viewer-type=/);
    }
    for (const id of familyId === 'cat-ptm-tded' ? ['cat-ptm-tded-v012', 'cat-ptm-tded-v013'] : []) {
      state.selected = id; const html = draw(); assert.ok(html.includes(bindings.records[id].reason)); assert.doesNotMatch(html, /data-source-context-for=/);
    }
  }
});
