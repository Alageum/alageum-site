import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { historicalReviewedBytes } from './helpers/historical-reviewed-bytes.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { sourceAssetCompletionManifest as manifest, getSourceAssetCompletion as get } from '../lib/catalog/models/sourceAssetCompletion.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { getEquipmentConstructionChoices } from '../lib/catalog/models/transformerExecutionChoices.js';
import { accessory2026TypeIds } from '../lib/catalog/models/accessory2026Types.js';
import { resolveModelType, equipmentModelName } from '../lib/catalog/models/types.js';
import { resolveIconType, equipmentIconName } from '../lib/catalog/models/iconTypes.js';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
import { renderEquipmentIcon } from './helpers/render-equipment-icon.mjs';
import { verifySourceAssetScope, verifySourceAssetPreservation } from '../../scripts/check-source-asset-completion.mjs';
import { verifySourceAssetDependencyAmendment, sourceAssetAmendmentFiles, digest, readBytes } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
import { measurementColumnBaselineCommit } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
const rows = officialProducts.filter(row => Object.hasOwn(manifest.records, row.id));
const api = record => normalizeApiProduct({ id: manifest.records[record.id].database_id, public_key: record.id, sku: null,
  category_public_key: record.category, translations: { ru: { name: record.name } }, specs: record, provenance: record,
  media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
});

test('historical thirteen-binding checkpoint and the current three-binding successor each preserve their exact scope', async () => {
  assert.deepEqual(verifySourceAssetScope(), { addedBindings: 13, accessories: 3, x4k3: 10, newProducts: 0 });
  const { historicalCheckpoint, forwardPreservation } = await verifySourceAssetPreservation();
  assert.deepEqual(historicalCheckpoint, { commit: measurementColumnBaselineCommit,
    productBodies: 843, unaffectedRecords: 830, legacyRecords: 238, choiceRecords: 36, choices: 74, oldModelTypes: 122, oldIconTypes: 132 });
  assert.deepEqual(forwardPreservation, { productBodies: 843, unaffectedRecords: 840, legacyRecords: 238, priorSourceAssetAdmissions: 13,
    choiceRecords: 36, choices: 74, sourceContextPreviews: 2, oldModelTypes: 125, oldIconTypes: 135,
    sourceGroundedDefault3D: 464, sourceBasedIcons: 465, explicitConstructionGaps: 243, constructionGapFamilies: 29 });
});

test('all thirteen exact canonical and API records resolve equally without family inheritance or construction choices', () => {
  for (const row of rows) {
    const before = JSON.stringify(row), entry = manifest.records[row.id];
    for (const value of [row, api(row)]) {
      assert.equal(getEquipmentVisual(value).type, entry.type); assert.equal(getEquipmentIcon(value).type, entry.type);
      assert.deepEqual(getEquipmentVisual(value).sourcePages, entry.sourcePages);
      assert.equal(getEquipmentVisual(value).fallbackImage, row.image);
      assert.equal(getEquipmentIcon(value).sourceImage, entry.sourceImage);
      assert.deepEqual(getEquipmentConstructionChoices(value), []);
    }
    assert.equal(JSON.stringify(row), before);
    const family = officialProducts.find(record => record.id === row.familyId);
    assert.equal(get(family, 'geometry'), null); assert.equal(get(family, 'icons'), null);
  }
  for (const row of officialProducts.filter(row => !Object.hasOwn(manifest.records, row.id))) assert.equal(get(row, 'geometry'), null, row.id);
});

test('edited canonical/API shapes, source pages, raw media and database UUIDs cannot acquire the new bindings', () => {
  for (const row of rows) for (const original of [row, api(row)]) {
    const reject = value => { assert.equal(get(value, 'geometry'), null, row.id); assert.equal(get(value, 'icons'), null, row.id); };
    for (const key of Object.keys(JSON.parse(transformerRecordShape(original)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key) ? [{ changed: key }]
        : key === 'sourceRow' ? { changed: true } : 'changed-reviewed-value';
      reject({ ...original, [key]: value });
    }
    for (const key of ['id', 'source', 'sourceId', 'sourceFileId', 'sourceSha256']) { const changed = { ...original }; delete changed[key]; reject(changed); }
    reject(Object.create(original)); reject({ ...original, source: 'unverified' });
    const cyclic = { ...original, configurations: [] }; cyclic.configurations.push(cyclic); reject(cyclic);
    if (original.source === 'api') {
      for (const databaseId of [null, '', '11111111-1111-5111-8111-111111111111', row.id, manifest.records[rows.find(other => other.id !== row.id).id].database_id]) reject({ ...original, databaseId });
      for (const key of ['databaseId', 'sourceMediaPath']) { const changed = { ...original }; delete changed[key]; reject(changed); }
      reject({ ...original, source: 'official' });
      assert.deepEqual(get({ ...original, image: '/display-only.webp' }, 'geometry'), get(original, 'geometry'));
    } else {
      reject({ ...original, databaseId: manifest.records[row.id].database_id });
      reject({ ...original, sourceMediaPath: row.image });
    }
  }
});

test('closed identity and type lookups reject siblings, arbitrary categories and prototype-property names', () => {
  const source = rows[0];
  for (const id of ['__proto__', 'constructor', 'toString', 'alageum-tmgi-x4k3-40', 'alageum-tmg-x3k2-63', 'alageum-tmgin-x4k3-630', 'unknown']) {
    assert.equal(get({ ...source, id }, 'geometry'), null);
  }
  for (const channel of ['', 'icon', 'model', '__proto__']) assert.equal(get(source, channel), null);
  for (const type of ['__proto__', 'constructor', 'accessories', 'tr26-accessory-unreviewed']) {
    assert.equal(resolveModelType(type), 'equipment'); assert.equal(resolveIconType(type), 'equipment');
  }
  assert.throws(() => { manifest.records[source.id].type = 'equipment'; }, TypeError);
  assert.throws(() => { manifest.records[source.id].sourcePages.push(89); }, TypeError);
});

test('registry hooks render all three accessory icons and dispose every geometry/material exactly once', async () => {
  for (const type of accessory2026TypeIds) {
    assert.equal(resolveModelType(type), type); assert.equal(resolveIconType(type), type);
    assert.equal(equipmentModelName(type), equipmentIconName(type));
    const svg = await renderEquipmentIcon(type, 128, true); assert.match(svg, /<path/); assert.ok(svg.includes(`data-equipment-type="${type}"`));
    const group = createEquipmentGeometry(type), resources = new Set(group.userData.materials);
    group.traverse(object => { if (object.geometry) resources.add(object.geometry); if (object.material) resources.add(object.material); });
    const disposed = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
    disposeEquipmentGeometry(group); assert.equal(group.children.length, 0); assert.equal(disposed.size, resources.size);
    assert.ok([...disposed.values()].every(count => count === 1));
  }
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
test('actual ProductVisual persistently displays X4K3 discrepancy with its correct drawing link and original source gallery', async () => {
  for (const row of rows) {
    const entry = manifest.records[row.id];
    for (const value of [row, api(row)]) {
      const html = await renderVisual(value);
      assert.ok(html.includes(`data-real-viewer-type="${entry.type}"`));
      assert.ok(html.includes(`<p>${entry.reason}</p>`), row.id);
      assert.ok(html.includes(`source=transformers-2026&amp;page=${entry.sourcePages[0]}`));
      assert.ok(html.includes(`src="${entry.rawSourceMedia}"`));
      assert.match(html, /Страница исходного каталога/);
      if (entry.captionDiscrepancy) { assert.match(html, /В таблице серия обозначена ТМГи/); assert.match(html, /в подписи чертежа — ТМГвэ/); }
    }
    const changed = { ...row, designation: 'Changed by CMS' };
    assert.doesNotMatch(await renderVisual(changed), /data-real-viewer-type=/);
  }
});

test('release amendment rejects pending status, absent hashes, source/shape expansion and later single-byte edits', () => {
  // Synthetic in-memory review exercises the verifier; it is never saved as approval.
  const files = new Map();
  const baseline = JSON.parse(readBytes('docs/catalog-transformers-2026/review/source-asset-completion/baseline-dependencies.json'));
  const required = [...sourceAssetAmendmentFiles, 'scripts/catalog/source-asset-reviewed-dependencies.mjs',
    'docs/catalog-transformers-2026/review/source-asset-completion/baseline-dependencies.json',
    'scripts/check-source-asset-completion.mjs', 'scripts/catalog/catalog-asset-snapshot.mjs',
    'docs/catalog-transformers-2026/review/source-asset-completion/baseline-outputs.json',
    'frontend/lib/catalog/models/sourceAssetCompletionManifest.json', 'frontend/lib/catalog/models/sourceAssetCompletion.js',
    ...['Types', 'Geometry', 'Icons'].map(name => `frontend/lib/catalog/models/accessory2026${name}.js`),
    ...['immutable-dependencies', 'accessory-source-decision', 'x4k3-source-decision', 'x4k3-presentation-scope'].map(name => `docs/catalog-transformers-2026/review/source-asset-completion/${name}.json`),
    ...Object.keys(JSON.parse(readBytes('docs/catalog-transformers-2026/review/source-asset-completion/immutable-dependencies.json')))];
  // This synthetic PR32 review uses its real historical bytes, never the
  // current successor's adapters as an invented old approval.
  for (const file of required) files.set(file, historicalReviewedBytes('1c705309c561130d34f79a367cd51c7ee864e59c', file));
  const reviewedFiles = Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)]));
  const amendments = Object.fromEntries(sourceAssetAmendmentFiles.map(file => [file, { baselineSha256: baseline[file], reviewedSha256: reviewedFiles[file] }]));
  const clearance = { format: 'alageum-source-asset-completion-clearance-v1', status: 'approved-bounded-source-assets',
    baselineCommit: 'a8f4f88845823105b242499bbe7b804368fcd0c8', baselineTree: 'd53245e72ec843f5a8c3d88b3730cba1b166356b',
    dependencies: { amendments, reviewedFiles }, reviewReport: 'synthetic-memory-only-review.json' };
  const report = { format: 'alageum-source-asset-completion-independent-review-v1', status: 'approved-bounded-source-assets',
    approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)), approvedBindingsSha256: reviewedFiles['frontend/lib/catalog/models/sourceAssetCompletionManifest.json'],
    unchangedCounts: { productBodies: 843, unaffectedRecords: 830, legacyRecords: 238, choiceRecords: 36, choices: 74 } };
  files.set(clearance.reviewReport, Buffer.from(JSON.stringify(report))); clearance.reviewReportSha256 = digest(files.get(clearance.reviewReport));
  const read = file => { assert.ok(files.has(file), `Missing fixture ${file}`); return files.get(file); };
  verifySourceAssetDependencyAmendment(clearance, read);
  for (const mutate of [
    value => { value.status = 'pending-independent-review'; }, value => { value.reviewReportSha256 = 'wrong'; },
    value => { delete value.dependencies.amendments[sourceAssetAmendmentFiles[0]]; },
    value => { value.dependencies.amendments[sourceAssetAmendmentFiles[0]].baselineSha256 = 'wrong'; },
    value => { value.dependencies.amendments[sourceAssetAmendmentFiles[0]].reviewedSha256 = 'wrong'; },
    value => { value.dependencies.amendments['frontend/lib/catalog/models/transformer2026Shape.js'] = { baselineSha256: 'x', reviewedSha256: 'y' }; },
    value => { delete value.dependencies.reviewedFiles['scripts/catalog/source-asset-reviewed-dependencies.mjs']; },
  ]) {
    const changed = structuredClone(clearance); mutate(changed);
    assert.throws(() => verifySourceAssetDependencyAmendment(changed, read));
    // Even a matching synthetic digest cannot broaden the hardcoded scope or invent old hashes.
    if (changed.status === clearance.status && changed.reviewReportSha256 === clearance.reviewReportSha256) {
      const original = files.get(clearance.reviewReport);
      files.set(clearance.reviewReport, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(changed.dependencies)) })));
      changed.reviewReportSha256 = digest(files.get(clearance.reviewReport));
      assert.throws(() => verifySourceAssetDependencyAmendment(changed, read)); files.set(clearance.reviewReport, original);
    }
  }
  for (const file of required) {
    const bytes = files.get(file); files.set(file, Buffer.concat([bytes, Buffer.from('\n')]));
    assert.throws(() => verifySourceAssetDependencyAmendment(clearance, read), undefined, file); files.set(file, bytes);
  }
});


test('family-selected large previews retain the visible X4K3 discrepancy and reset without a default binding', async () => {
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
    const family = officialProducts.find(record => record.id === row.familyId), entry = manifest.records[row.id];
    state.selected = row.id;
    const selected = renderToStaticMarkup(createElement(Family, { product: family, records: officialProducts }));
    assert.ok(selected.includes(`data-selected-member="${row.id}"`));
    assert.ok(selected.includes(`<p>${entry.reason}</p>`));
    assert.ok(selected.includes(`data-real-viewer-type="${entry.type}"`));
    state.selected = '';
    assert.doesNotMatch(renderToStaticMarkup(createElement(Family, { product: family, records: officialProducts })), /data-real-viewer-type=|data-selected-member=/);
  }
  const comparison = fs.readFileSync(new URL('../components/catalog/Comparison.js', import.meta.url), 'utf8');
  assert.match(comparison, /<ProductIcon product=\{product\} size=\{52\}/);
  assert.doesNotMatch(comparison, /EquipmentModel|ProductVisual/);
  for (const row of rows.filter(row => row.id.includes('x4k3'))) {
    const svg = await renderEquipmentIcon(getEquipmentIcon(row).type, 52, getEquipmentIcon(row).reason);
    assert.match(svg, /<title>Представительная внешняя компоновка Х4К3/);
    assert.match(svg, /В таблице серия обозначена ТМГи/);
  }
});
