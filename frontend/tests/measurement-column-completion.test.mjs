import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { measurementColumn2026CompletionManifest as manifest, getMeasurementColumn2026Completion as get } from '../lib/catalog/models/measurementColumn2026Completion.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { getEquipmentConstructionChoices } from '../lib/catalog/models/transformerExecutionChoices.js';
import { measurementColumn2026Types, MEASUREMENT_COLUMN_2026_TYPE as type } from '../lib/catalog/models/measurementColumn2026Types.js';
import { measurementColumn2026IconDefinitions } from '../lib/catalog/models/measurementColumn2026Icons.js';
import { resolveModelType, equipmentModelName } from '../lib/catalog/models/types.js';
import { resolveIconType, equipmentIconName } from '../lib/catalog/models/iconTypes.js';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
import { getProductMedia } from '../lib/catalog/media.js';
import { renderEquipmentIcon } from './helpers/render-equipment-icon.mjs';
import { verifyMeasurementColumnScope, verifyMeasurementColumnPreservation } from '../../scripts/check-measurement-column-completion.mjs';
const rows = officialProducts.filter(row => Object.hasOwn(manifest.records, row.id));
const api = record => normalizeApiProduct({ id: manifest.records[record.id].database_id, public_key: record.id, sku: record.sku,
  category_public_key: record.category, translations: { ru: { name: record.name } }, specs: record, provenance: record,
  media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
});

test('only three exact source records refine icons and gain default geometry while all PR32 outputs are preserved', async () => {
  assert.deepEqual(verifyMeasurementColumnScope(), { addedDefaultBindings: 3, refinedIcons: 3, addedSourceBasedIcons: 0, newProducts: 0 });
  const preservation = await verifyMeasurementColumnPreservation();
  assert.equal(preservation.oldModelTypes, 125); assert.equal(preservation.oldIconTypes, 135);
  assert.equal(preservation.unaffectedRecords, 840); assert.equal(preservation.sourceGroundedDefault3D, 464);
});

test('source pages, electrical rows and API UUIDs stay separate while sharing only the accepted exterior', () => {
  assert.equal(rows.length, 3);
  const spec = (id, label) => rows.find(row => row.id === id).technicalSpecs.find(value => value.label === label);
  assert.deepEqual(rows.map(row => row.voltage), [null, null, null]);
  assert.deepEqual(rows.map(row => row.technicalSpecs.filter(value => /^ВН$|^НН/.test(value.label)).map(value => value.value)), [['27,5', '0,23'], ['27,5', '0,1', '0,127'], ['35/√3', '0,1/√3', '0,1/3']]);
  assert.equal(spec('alageum-2026-zom-1p25-35', 'Номинальная мощность').unit, 'кВ');
  assert.equal(spec('alageum-2026-zom-1p25-35', 'Масса не более полная').value, '20');
  assert.equal(spec('alageum-2026-zom-1p25-35', 'Масса не более масла').value, '80');
  assert.equal(new Set(Object.values(manifest.records).map(entry => entry.database_id)).size, 3);
  assert.equal(measurementColumn2026Types[type].runtimeEligible, false);
  for (const row of rows) for (const value of [row, api(row)]) {
    const entry = manifest.records[row.id], before = JSON.stringify(value);
    assert.equal(getEquipmentVisual(value).type, type); assert.equal(getEquipmentIcon(value).type, type);
    assert.deepEqual(getEquipmentVisual(value).sourcePages, entry.sourcePages);
    assert.equal(getEquipmentVisual(value).fallbackImage, row.image); assert.equal(getEquipmentIcon(value).sourceImage, row.image);
    assert.equal(getProductMedia(value, getEquipmentVisual(value)).image, row.image);
    assert.deepEqual(getEquipmentConstructionChoices(value), []); assert.equal(JSON.stringify(value), before);
  }
  for (const row of officialProducts.filter(row => !Object.hasOwn(manifest.records, row.id))) {
    assert.equal(get(row, 'geometry'), null, row.id); assert.equal(get(row, 'icons'), null, row.id);
  }
});

test('every canonical shape field, provenance, raw-media and UUID guard fails closed without a family or type grant', () => {
  for (const row of rows) for (const original of [row, api(row)]) {
    const reject = value => {
      assert.equal(get(value, 'geometry'), null, row.id); assert.equal(get(value, 'icons'), null, row.id);
      assert.notEqual(getEquipmentVisual(value).type, type); assert.notEqual(getEquipmentIcon(value).type, type);
    };
    for (const key of Object.keys(JSON.parse(transformerRecordShape(original)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key) ? [{ changed: key }]
        : key === 'sourceRow' ? { changed: true } : 'changed-reviewed-value';
      reject({ ...original, [key]: value });
    }
    for (const key of ['id', 'source', 'sourceId', 'sourceFileId', 'sourceSha256']) { const value = { ...original }; delete value[key]; reject(value); }
    reject(Object.create(original)); reject({ ...original, source: 'unverified' });
    for (const id of ['__proto__', 'constructor', 'toString', 'unknown', row.familyId]) reject({ ...original, id });
    const cyclic = { ...original, configurations: [] }; cyclic.configurations.push(cyclic); reject(cyclic);
    if (original.source === 'api') {
      for (const databaseId of [null, '', '11111111-1111-5111-8111-111111111111', row.id, manifest.records[rows.find(other => other.id !== row.id).id].database_id]) reject({ ...original, databaseId });
      for (const key of ['databaseId', 'sourceMediaPath']) { const value = { ...original }; delete value[key]; reject(value); }
      reject({ ...original, source: 'official' });
      assert.deepEqual(get({ ...original, image: '/display-only.webp' }, 'geometry'), get(original, 'geometry'));
    } else {
      reject({ ...original, databaseId: manifest.records[row.id].database_id }); reject({ ...original, sourceMediaPath: row.image });
    }
  }
  for (const value of [null, [], '', 42, {}]) assert.equal(get(value, 'geometry'), null);
  for (const channel of ['', '__proto__', 'icon', 'model']) assert.equal(get(rows[0], channel), null);
  assert.throws(() => { manifest.records[rows[0].id].type = 'equipment'; }, TypeError);
  assert.throws(() => { manifest.records[rows[0].id].sourcePages.push(101); }, TypeError);
});

test('real EquipmentIcon preserves accepted layer order, solid occlusion, transform and stroke at each UI size', async () => {
  assert.equal(resolveModelType(type), type); assert.equal(resolveIconType(type), type);
  assert.equal(equipmentModelName(type), equipmentIconName(type));
  const layers = measurementColumn2026IconDefinitions[type].layers;
  for (const size of [28, 32, 40, 48, 52, 56, 64, 96, 148]) {
    const svg = await renderEquipmentIcon(type, size, true);
    assert.match(svg, /stroke-width="1.1"/); assert.match(svg, /transform="translate\(2 1\) scale\(\.94\)"/);
    assert.deepEqual([...svg.matchAll(/<path data-feature="([^"]+)" d="([^"]+)"(?: fill="([^"]+)")?/g)].map(match => ({ feature: match[1], d: match[2], solid: match[3] === 'var(--equipment-icon-surface, #fff)' })), layers);
    assert.equal([...svg.matchAll(/data-feature="cover-bushing-/g)].length, 5);
    assert.equal([...svg.matchAll(/data-feature="major-shed-/g)].length, 5);
  }
  for (const unknown of ['__proto__', 'constructor', 'measurement', ...rows.map(row => row.id)]) {
    assert.equal(resolveModelType(unknown), 'equipment'); assert.equal(resolveIconType(unknown), 'equipment');
  }
  const group = createEquipmentGeometry(type), resources = new Set(group.userData.materials);
  group.traverse(node => { if (node.geometry) resources.add(node.geometry); if (node.material) resources.add(node.material); });
  const disposed = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
  disposeEquipmentGeometry(group); disposeEquipmentGeometry(group);
  assert.equal(group.children.length, 0); assert.equal(disposed.size, resources.size); assert.ok([...disposed.values()].every(count => count === 1));
});
const require = createRequire(import.meta.url);
let productVisual, productVisualUrl;
async function renderVisual(product) {
  if (!productVisual) {
    const file = new URL('../components/catalog/ProductVisual.js', import.meta.url);
    let source = fs.readFileSync(file, 'utf8')
      .replace("import Image from 'next/image';", 'const Image = props => <img {...props}/>;')
      .replace("import Link from 'next/link';", 'const Link = props => <a {...props}/>;')
      .replace("import ProductIcon from './ProductIcon';", 'const ProductIcon = () => <span/>;')
      .replace("export { default as ProductIcon } from './ProductIcon';", '')
      .replace("import sourceContextAssetProof from '@/lib/catalog/source-context/sourceContextBuildProof';", 'const sourceContextAssetProof = null;')
      .replace("import CatalogSourceContext from './source-context/CatalogSourceContext';", 'const CatalogSourceContext = () => null;')
      .replace("import EquipmentModel from './EquipmentModel';", 'const EquipmentModel = ({type, previewIconType}) => <div data-real-viewer-type={type} data-preview-type={previewIconType}/>;')
      .replace(/(['"])@\/([^'"]+)\1/g, (_, quote, relative) => JSON.stringify(new URL(`../${relative}.js`, import.meta.url).href));
    const { transform, loadBindings } = require('next/dist/build/swc'); await loadBindings();
    const compiled = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
    const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href)).replaceAll("from 'react'", `from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}`);
    productVisualUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    productVisual = (await import(productVisualUrl)).default;
  }
  return renderToStaticMarkup(createElement(productVisual, { product }));
}

test('actual ProductVisual persistently displays each page-specific disclosure, omitted detail and source caveat beside the model', async () => {
  for (const row of rows) for (const value of [row, api(row)]) {
    const entry = manifest.records[row.id], html = await renderVisual(value);
    assert.ok(html.includes(`data-real-viewer-type="${type}"`)); assert.ok(html.includes(`data-preview-type="${type}"`));
    assert.ok(html.includes(`<p>${entry.reason}</p>`));
    for (const text of [entry.mainDisclosure, entry.simplificationNote, entry.sourceContextCaveat]) {
      assert.ok(html.includes(text)); assert.ok(html.indexOf(text) < html.indexOf('<details'), 'Limitations cannot be collapsed into the source gallery');
    }
    assert.ok(html.includes(`source=transformers-2026&amp;page=${entry.sourcePages[0]}`));
    assert.ok(html.includes(`src="${entry.rawSourceMedia}"`)); assert.match(html, /Страница исходного каталога/);
    assert.doesNotMatch(await renderVisual({ ...value, designation: 'Changed by CMS' }), /data-real-viewer-type=/);
  }
});

test('family-selected previews show each separate row and its persistent evidence, then reset without granting the family a model', async () => {
  await renderVisual(rows[0]);
  const file = new URL('../components/catalog/FamilyProductVisual.js', import.meta.url);
  const source = fs.readFileSync(file, 'utf8')
    .replace("import { useState } from 'react';", "export const state = { selected: '' }; const useState = () => [state.selected, value => { state.selected = value; }];")
    .replace("import Image from 'next/image';", 'const Image = props => <img {...props}/>;')
    .replace("import Link from 'next/link';", 'const Link = props => <a {...props}/>;')
    .replace("import ProductIcon from './ProductIcon';", 'const ProductIcon = () => <span/>;')
    .replace("'./ProductVisual'", JSON.stringify(productVisualUrl))
    .replace(/(['"])@\/([^'"]+)\1/g, (_, quote, relative) => JSON.stringify(new URL(`../${relative}.js`, import.meta.url).href));
  const { transform, loadBindings } = require('next/dist/build/swc'); await loadBindings();
  const compiled = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  const { default: Family, state } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  for (const row of rows) {
    const family = officialProducts.find(value => value.id === row.familyId), entry = manifest.records[row.id];
    state.selected = row.id;
    const selected = renderToStaticMarkup(createElement(Family, { product: family, records: officialProducts }));
    assert.ok(selected.includes(`data-selected-member="${row.id}"`)); assert.ok(selected.includes(`<p>${entry.reason}</p>`));
    assert.ok(selected.includes(`data-real-viewer-type="${type}"`));
    state.selected = '';
    assert.doesNotMatch(renderToStaticMarkup(createElement(Family, { product: family, records: officialProducts })), /data-real-viewer-type=|data-selected-member=/);
  }
});
