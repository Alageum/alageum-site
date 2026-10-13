import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as data from '../lib/catalog/data.js';
import * as presentation from '../lib/catalog/presentation.js';
import * as grouping from '../lib/catalog/grouping.js';
import * as sources from '../lib/catalog/sources.js';
import { normalizeApiProduct, isApiCatalog, liveHref } from '../lib/catalog/apiData.js';
import { catalogPrice } from '../lib/catalog/admin.js';
import { getApiCatalogReadProduct } from '../lib/catalog/identityCompletion.js';
import { getFamilyTechnicalDocument } from '../lib/catalog/familyPresentation.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices, getEquipmentConstructionChoice } from '../lib/catalog/models/transformerExecutionChoices.js';
import { getProtectionExampleEvidence } from '../lib/catalog/models/protectionExampleRuntime.js';
import { getNtmiSourcePreview } from '../lib/catalog/ntmiSourcePreview.js';
import { equipmentModelName } from '../lib/catalog/models/types.js';
import { getProductMedia } from '../lib/catalog/media.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { getCatalogSourceContext as context, sourceContextManifest as manifest, createSourceContextAssetVerifier } from '../lib/catalog/source-context/sourceContexts.js';
import SourceContextImage from '../components/catalog/source-context/SourceContextImage.js';
import { importedProductId } from '../../scripts/catalog/measurement-column-asset-snapshot.mjs';

const admitted = ['cat-ktpb-k', 'cat-ktpb-k-v002'];
const ids = ['cat-ktpb-k', 'cat-ktpb-k-v001', 'cat-ktpb-k-v002', 'cat-ktpb-k-v003'];
const records = ids.map(data.productById);
const toApi = row => normalizeApiProduct({ id: importedProductId(row.id), public_key: row.id, sku: row.sku,
  category_public_key: row.category, translations: { ru: { name: row.name, description: row.description } },
  specs: row, provenance: row, media: [{ path: row.image, kind: 'image', alt: row.imageCaption }], comparable: true, version: 1 });
const live = records.map(toApi);
const proof = await createSourceContextAssetVerifier(path => readFile(new URL(`../public${path}`, import.meta.url))).verify();
const figureKey = 'substations-p056-figure26-2ktpb-110-4n';
const page = '/catalog-source/page-056.webp';

test('only the exact family and 110 kV record gain page-56 context in static and normalized API data', () => {
  assert.ok(proof);
  assert.equal(Object.keys(manifest.records).length, 26);
  for (const rows of [records, live]) {
    assert.deepEqual(rows.filter(row => context(row, proof)).map(row => row.id), admitted);
    for (const row of rows.filter(row => admitted.includes(row.id))) {
      const found = context(row, JSON.parse(JSON.stringify(proof)));
      assert.equal(found.canonicalId, row.id);
      assert.equal(found.figures.length, 1);
      assert.equal(found.figures[0].key, figureKey);
      assert.equal(found.figures[0].exemplarHref, null);
      assert.equal(found.sourceHref, '/catalog/source?page=56');
      assert.match(found.intro, /35\/10\(6\).*расходится.*110 кВ/);
      assert.match(found.status, /соответствие.*не установлено/i);
      assert.equal('geometryType' in found || 'confidence' in found || 'execution' in found, false);
    }
  }
  assert.equal(Object.hasOwn(records[0], 'familyId'), false);
  assert.equal(live[0].familyId, null);
  assert.deepEqual(context(records[0], proof), context(live[0], proof));
  assert.deepEqual(context(records[2], proof), context(live[2], proof));
});

test('edited, empty, spoofed, inherited and unknown-source KTPB authority fails closed', () => {
  for (const row of [...records, ...live].filter(row => admitted.includes(row.id))) {
    for (const key of Object.keys(JSON.parse(transformerRecordShape(row)))) {
      const value = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key) ? ['unreviewed'] : 'unreviewed';
      assert.equal(context({ ...row, [key]: value }, proof), null, `${row.id}/${row.source}/${key}`);
    }
    for (const key of ['id', 'name', 'sku', 'category', 'source', 'recordKind', 'recordType', 'sourceUrl', 'sourceTitle', 'sourceKind', 'sourcePages', 'technicalSpecs', 'notes']) {
      const missing = { ...row }; delete missing[key];
      assert.equal(context(missing, proof), null, `missing ${row.id}/${key}`);
    }
    for (const patch of [{ technicalSpecs: [] }, { notes: [] }, { sourcePages: [] }, { source: 'demo' },
      { databaseId: 'spoof' }, { id: 'cat-ktpb-k-v004' }, { sourceId: 'unknown' }, { sourceId: 'transformers-2026' },
      { sourceFileId: 'unknown' }, { sourceSha256: 'unknown' }, { sourceUrl: 'https://example.invalid/source' },
      { recordKind: row.recordKind === 'family' ? 'variant' : 'family' }]) assert.equal(context({ ...row, ...patch }, proof), null);
    if (row.source === 'api') for (const key of ['databaseId', 'sourceMediaPath']) {
      const missing = { ...row }; delete missing[key]; assert.equal(context(missing, proof), null);
    }
    else assert.equal(context({ ...row, image: null }, proof), null);
    if (row.recordKind === 'variant') { const missing = { ...row }; delete missing.familyId; assert.equal(context(missing, proof), null); }
    assert.equal(context(Object.create(row), proof), null);
    let getterHits = 0;
    const getter = { ...row }; Object.defineProperty(getter, 'familyId', { get() { getterHits++; return row.familyId; } });
    assert.equal(context(getter, proof), null); assert.equal(getterHits, 0);
    assert.equal(context(row, null), null);
    assert.deepEqual(context({ ...row, description: 'unbound text' }, proof), context(row, proof));
  }
  for (const value of [null, undefined, {}, [], { id: admitted[0] }, { id: admitted[1] }]) assert.equal(context(value, proof), null);
  for (const id of ['cat-shnn-v001', 'cat-ptm-tded-v001']) {
    const missing = { ...data.productById(id) }; delete missing.familyId; assert.equal(context(missing, proof), null);
  }
});

test('page 56 uses original complete published bytes with explicit orthographic and sideways captions', async () => {
  const figure = manifest.figures[figureKey], bytes = await readFile(new URL(`../public${page}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '4e6ea1db177c66bc84a8dc0031cfcee685fef53df029e28ec132cf1b681e0721');
  assert.equal(bytes.length, 114140);
  assert.equal(figure.cropPath, figure.sourceImage);
  assert.deepEqual(figure.cropBox, [0, 0, 1406, 1988]);
  assert.deepEqual([figure.width, figure.height], [1406, 1988]);
  assert.match(figure.caption, /Полная исходная страница 56.*боком: план, продольный вид А–А и поперечный вид Б/);
  assert.match(figure.imageAlt, /Полная страница 56/);
  assert.doesNotMatch(figure.imageAlt, /Фрагмент/);
  assert.equal(proof.assets.filter(asset => asset.path === page).length, 1);
});

const require = createRequire(import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'react-server-dom-webpack/client') return { url: pathToFileURL(require.resolve('next/dist/compiled/react-server-dom-webpack/client.edge')).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const Link = require('next/dist/client/app-dir/link.js').default;
hooks.deregister();
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const compiled = new Map();
async function component(relative, name, bindings) {
  if (!compiled.has(relative)) {
    const file = new URL(`../components/catalog/${relative}.js`, import.meta.url);
    const source = (await readFile(file, 'utf8')).replace(/^import .+;\r?$/gm, '').replace(/^export \{ default as ProductIcon \} from '.+';\r?$/gm, '');
    compiled.set(relative, (await transform(source, { filename: file.pathname,
      jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } })).code);
  }
  return new Function('bindings', 'require', 'exports', `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${compiled.get(relative)}\nreturn ${name};`)(bindings, require, {});
}
// Render actual static/API detail, family selection, visual and source components.
// Only asynchronous data/state and unrelated leaf visuals are substituted. This
// verifies server-rendered routing; browser layout/hydration remains untested here.
async function render(id, { api = false, selected = '', rows = api ? live : records, failed = false } = {}) {
  const bindings = { ...data, ...presentation, ...grouping, ...sources, useState, Link,
    Image: props => createElement('img', props), ProductIcon: () => null, EquipmentModel: () => null,
    getEquipmentVisual, getEquipmentIcon, getEquipmentConstructionChoices, getEquipmentConstructionChoice,
    getProtectionExampleEvidence, getProductMedia, getFamilyTechnicalDocument, equipmentModelName,
    normalizeApiProduct, getApiCatalogReadProduct, isApiCatalog, liveHref, catalogPrice,
    officialProducts: rows, productById: key => rows.find(row => row.id === key),
    useEffect: () => {}, useSearchParams: () => new URLSearchParams(api ? { source: 'api' } : {}),
    useSelection: () => ({ add() {} }), useApiSelection: () => ({ add() {} }),
    CatalogNotice: () => null, CatalogSourceEvidence: () => null, CatalogConfigurations: () => null,
    ImportedSpecifications: () => null, ImportedDocuments: () => null, CatalogSpecValue: ({ row }) => row.value,
    getCatalogSourceContext: context, sourceContextAssetProof: proof,
    styles: new Proxy({}, { get: (_, key) => key }), SourceContextImage,
  };
  if (failed) bindings.SourceContextImage = await component('source-context/SourceContextImage', 'SourceContextImage', { createElement, useState: () => [page, () => {}] });
  bindings.CatalogSourceContext = await component('source-context/CatalogSourceContext', 'CatalogSourceContext', bindings);
  bindings.ProductVisual = await component('ProductVisual', 'ProductVisual', bindings);
  bindings.FamilyProductVisual = await component('FamilyProductVisual', 'FamilyProductVisual', { ...bindings, useState: () => [selected, () => {}] });
  bindings.LiveProductDetails = await component('LiveCatalog', 'LiveProductDetails', { ...bindings, useState: initial => [initial?.status === 'loading' ? { status: 'ready', items: rows, error: '' } : initial, () => {}] });
  const Details = await component('ProductDetails', 'ProductDetails', bindings);
  return renderToStaticMarkup(createElement(Details, { id }));
}
const panel = html => html.match(/<section\b[^>]*data-source-context-for=[\s\S]*?<\/section>/)?.[0] || '';

test('actual static/API family overview, each selection, detail cards and repeated resets bind only the two exact contexts', async () => {
  for (const api of [false, true]) {
    const overview = await render(ids[0], { api });
    assert.match(panel(overview), /data-source-context-for="cat-ktpb-k"/);
    assert.match(overview, /Обзор семейства · запись не выбрана/);
    for (const id of [...ids.slice(1), ids[2], ids[1]]) {
      const selected = await render(ids[0], { api, selected: id });
      assert.match(selected, new RegExp(`data-selected-member="${id}"`));
      const detail = await render(id, { api });
      for (const html of [selected, detail]) {
        assert.equal(Boolean(panel(html)), id === ids[2]);
        assert.doesNotMatch(html, /href="(?:null|undefined|#)"/);
        if (id === ids[2]) {
          assert.match(panel(html), /data-source-context-for="cat-ktpb-k-v002"/);
          assert.match(panel(html), /src="\/catalog-source\/page-056.webp"/);
          assert.match(panel(html), /Наличие ступени 35 кВ этим чертежом не подтверждено/);
          assert.match(panel(html), /href="\/catalog\/source\?page=56"/);
        }
      }
    }
    assert.equal(await render(ids[0], { api }), overview);
    assert.equal(await render(ids[0], { api, selected: 'unrelated' }), overview);
    assert.equal(panel(await render(ids[2], { api, rows: [] })), '');
    const edited = (api ? live : records).map(row => ({ ...row, name: 'Edited source record' }));
    for (const id of admitted) assert.equal(panel(await render(id, { api, rows: edited })), '');
  }
});

test('unknown API source identities receive no KTPB panel or page-56 association', async () => {
  const changed = records.map(row => toApi({ ...row, sourceUrl: 'https://example.invalid/source' }));
  for (const row of changed) {
    assert.deepEqual(row.sourcePages, []);
    assert.equal(sources.sourcePageUrl(row, 56), null);
    const html = await render(row.id, { api: true, rows: changed });
    assert.equal(panel(html), '');
    assert.doesNotMatch(html, /href="(?:null|undefined|#)"|href="\/catalog\/source\?page=56"/);
  }
});

test('failed full-page image preserves source caption, contradiction, uncertainty and full-page access', async () => {
  for (const api of [false, true]) for (const id of admitted) {
    const html = panel(await render(id, { api, failed: true }));
    assert.match(html, /Исходное изображение недоступно/);
    assert.match(html, /Полная исходная страница 56/);
    assert.match(html, /расходится/);
    assert.match(html, /не установлено/);
    assert.match(html, /href="\/catalog\/source\?page=56"/);
    assert.doesNotMatch(html, /<img\b|Фрагмент исходного/);
  }
});

test('all 843 records retain default illustration, icon, construction-choice and open-gap counts', () => {
  const rows = data.officialProducts;
  const gaps = rows.filter(row => row.recordKind === 'variant' && !getEquipmentVisual(row).type && !getEquipmentConstructionChoices(row).length && !getNtmiSourcePreview(row));
  assert.equal(rows.length, 843);
  assert.equal(new Set(rows.map(row => row.id)).size, 843);
  assert.equal(rows.filter(row => getEquipmentVisual(row).type && getEquipmentVisual(row).confidence === 'source-matched').length, 464);
  assert.equal(rows.filter(row => getEquipmentIcon(row).confidence === 'source-based').length, 465);
  assert.equal(rows.filter(row => getEquipmentConstructionChoices(row).length).length, 36);
  assert.equal(rows.flatMap(getEquipmentConstructionChoices).length, 74);
  assert.equal(gaps.length, 243); assert.equal(new Set(gaps.map(row => row.familyId)).size, 29);
  for (const id of ids) {
    const row = data.productById(id), visual = getEquipmentVisual(row), icon = getEquipmentIcon(row);
    assert.deepEqual(visual.sourcePages, [55]); assert.deepEqual(icon.sourcePages, [55]);
    assert.equal(visual.type, ids.slice(0, 2).includes(id) ? 'outdoor-switchyard-substation' : null);
    assert.equal(icon.confidence, ids.slice(0, 2).includes(id) ? 'source-based' : 'typical');
    assert.deepEqual(getEquipmentConstructionChoices(row), []);
  }
});
