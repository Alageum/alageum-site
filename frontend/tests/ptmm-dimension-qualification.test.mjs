import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as data from '../lib/catalog/data.js';
import * as presentation from '../lib/catalog/presentation.js';
import * as grouping from '../lib/catalog/grouping.js';
import * as sources from '../lib/catalog/sources.js';
import { normalizeApiProduct, liveHref } from '../lib/catalog/apiData.js';
import { getApiCatalogReadProduct } from '../lib/catalog/identityCompletion.js';
import { catalogPrice } from '../lib/catalog/admin.js';
import { comparisonSpecValue } from '../lib/catalog/comparison.js';
import { parseComparison, selectionCsv } from '../lib/catalog/query.js';
import { equipmentModelName } from '../lib/catalog/models/types.js';
import { getPtmmDimensionQualification, catalogSpecValueText } from '../lib/catalog/ptmmDimensionQualification.js';
import { catalogSpecValueComponent } from './helpers/render-catalog-spec-value.mjs';
import { importedProductId } from '../../scripts/catalog/measurement-column-asset-snapshot.mjs';

const require = createRequire(import.meta.url);
const affectedIds = ['cat-ptm-tded-v002', 'cat-ptm-tded-v005', 'cat-ptm-tded-v008'];
const dimensionRows = product => (product.technicalSpecs || []).filter(row => /Габаритные размеры/.test(row.label));
const dto = data.officialProducts.map(row => ({
  id: importedProductId(row.id), public_key: row.id, sku: row.sku, category_public_key: row.category,
  translations: { ru: { name: row.name } }, specs: row, provenance: row,
  media: row.image ? [{ path: row.image, kind: 'image', alt: row.imageCaption }] : [],
  comparable: true, price: '123.45', currency: 'KZT', price_mode: 'fixed', version: 7,
}));
const liveProducts = dto.map(normalizeApiProduct);
const unitCaveat = 'В исходной строке единица измерения не указана; обозначение „мм“ требует подтверждения.';
const CatalogSpecValue = await catalogSpecValueComponent();
const componentCache = new Map();

// Run actual card and comparison JSX. Substitute only routing, async hook state,
// selection actions and unrelated visuals; use the real qualification component.
async function render(name, products, ids, differencesOnly = false) {
  const relative = name === 'StaticProductDetails' ? 'ProductDetails' : name === 'StaticComparison' ? 'Comparison'
    : name === 'ImportedSpecifications' ? 'ImportedProductData' : 'LiveCatalog';
  if (!componentCache.has(name)) {
    const file = new URL(`../components/catalog/${relative}.js`, import.meta.url);
    const source = (await readFile(file, 'utf8')).replace(/^import .+;\r?$/gm, '');
    const { transform, loadBindings } = require('next/dist/build/swc');
    await loadBindings();
    const compiled = await transform(source, {
      filename: file.pathname,
      jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
      module: { type: 'commonjs' },
    });
    componentCache.set(name, compiled.code);
  }
  let ImportedSpecifications;
  if (name === 'StaticProductDetails') {
    const html = await render('ImportedSpecifications', products, ids);
    ImportedSpecifications = function RenderedImportedSpecifications() { return createElement('div', { dangerouslySetInnerHTML: { __html: html } }); };
  }
  const bindings = {
    ...data, ...presentation, ...grouping, ...sources, products, officialProducts: products,
    productById: id => products.find(product => product.id === id),
    comparisonSpecValue, catalogSpecValueText, CatalogSpecValue,
    ...(ImportedSpecifications ? { ImportedSpecifications } : {}),
    getApiCatalogReadProduct, parseComparison, catalogPrice, liveHref, equipmentModelName,
    Link: props => createElement('a', props),
    ProductIcon: () => null, CatalogNotice: () => null, FamilyProductVisual: () => null,
    CatalogConfigurations: () => null, CatalogSourceEvidence: () => null,
    useEffect: () => {}, useRouter: () => ({ push() {}, replace() {} }),
    useSearchParams: () => new URLSearchParams({ ids: ids.join(',') }),
    useState: initial => [initial?.status === 'loading' ? { status: 'ready', items: products, error: '' }
      : initial === false ? differencesOnly : initial, () => {}],
    useSelection: () => ({ add() {} }), useApiSelection: () => ({ add() {} }),
  };
  const Component = new Function('bindings', 'require', 'exports',
    `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${componentCache.get(name)}\nreturn ${name};`)(bindings, require, {});
  return renderToStaticMarkup(createElement(Component, { id: ids[0], product: products.find(product => product.id === ids[0]) }));
}

test('only the six reviewed PTM/TDE source values across 843 static and normalized API records are qualified', () => {
  for (const products of [data.officialProducts, liveProducts]) {
    assert.equal(products.length, 843);
    const changed = [];
    for (const product of products) for (const row of product.technicalSpecs || []) {
      const text = catalogSpecValueText(product, row, row.value);
      if (text !== row.value) {
        changed.push(product.id);
        assert.ok(affectedIds.includes(product.id));
        assert.match(text, /^(ПТМ|ТДЕ) в таблице источника:/);
        assert.ok(text.includes(row.value));
        assert.ok(text.includes(`Применимость этих размеров к ${product.name} не подтверждена.`));
        assert.ok(text.includes(unitCaveat));
        assert.equal(getPtmmDimensionQualification(product, row).sourceHref, '/catalog/source?page=68');
      }
    }
    assert.deepEqual(changed, affectedIds.flatMap(id => [id, id]));
  }
});

test('all three actual static and API cards show both warnings with page 68 links outside collapsed notes', async () => {
  for (const [name, products] of [['StaticProductDetails', data.officialProducts], ['LiveProductDetails', liveProducts]]) {
    for (const id of affectedIds) {
      const product = products.find(row => row.id === id);
      const html = (await render(name, products, [id])).replace(/<details\b[\s\S]*?<\/details>/g, '');
      assert.equal((html.match(/data-ptmm-dimension-context=/g) || []).length, 2, `${name}: ${id}`);
      for (const row of dimensionRows(product)) {
        const block = html.split('<div>').find(part => part.includes(`<dt class="catalog-spec-text">${row.label}</dt>`));
        assert.ok(block?.includes(row.value), `${name}: ${row.label}`);
        assert.ok(block.includes(`Применимость этих размеров к ${product.name} не подтверждена.`));
        assert.match(block, /href="\/catalog\/source\?page=68"/);
        assert.match(block, /мм/);
        assert.ok(block.includes(unitCaveat));
      }
      assert.match(html, /ПТМ в таблице источника:/);
      assert.match(html, /ТДЕ в таблице источника:/);
    }
  }
});

test('actual comparisons qualify each affected cell, and equal PTM/PTMM numbers remain distinct in differences-only mode', async () => {
  for (const [name, products] of [['StaticComparison', data.officialProducts], ['LiveComparison', liveProducts]]) {
    const html = await render(name, products, affectedIds);
    assert.equal((html.match(/data-ptmm-dimension-context=/g) || []).length, 6);
    assert.equal(html.split(unitCaveat).length - 1, 6);
    for (const id of affectedIds) assert.equal((html.match(new RegExp(`data-ptmm-dimension-context="${id}"`, 'g')) || []).length, 2);
    assert.equal((html.match(/href="\/catalog\/source\?page=68"/g) || []).length, 6);
    assert.match(html, /ПТМ в таблице источника: 950×600×410/);
    assert.match(html, /ТДЕ в таблице источника: 650×700×330/);
  }
  const html = await render('StaticComparison', data.officialProducts, ['cat-ptm-tded-v001', 'cat-ptm-tded-v002'], true);
  assert.match(html, /<tr class="has-difference"><th[^>]*>Габаритные размеры В×Ш×Г<\/th>/);
  assert.match(html, /<td class="catalog-spec-text">800×600×380 мм<\/td>/);
  assert.match(html, /ПТМ в таблице источника: 800×600×380 мм/);
});

test('PTM/TDE siblings, ambiguous TDED rows and all other record values keep their exact markup', async () => {
  for (const products of [data.officialProducts, liveProducts]) {
    for (const product of products.filter(row => !affectedIds.includes(row.id))) {
      for (const row of product.technicalSpecs || []) {
        assert.equal(renderToStaticMarkup(createElement(CatalogSpecValue, { product, row })), renderToStaticMarkup(row.value));
      }
    }
  }
  for (const [name, products] of [['StaticProductDetails', data.officialProducts], ['LiveProductDetails', liveProducts]]) {
    for (const id of ['cat-ptm-tded-v001', 'cat-ptm-tded-v003', 'cat-ptm-tded-v006', 'cat-ptm-tded-v009']) {
      assert.doesNotMatch(await render(name, products, [id]), /data-ptmm-dimension-context|Применимость этих размеров/);
    }
  }
});

test('changed source facts, identities and API UUIDs cannot borrow the three reviewed qualifications', async () => {
  for (const products of [data.officialProducts, liveProducts]) for (const id of affectedIds) {
    const product = products.find(row => row.id === id), row = dimensionRows(product)[0];
    const changes = [
      { id: 'unrelated-ptmm' }, { name: `${product.name} amended` }, { source: 'demo' },
      { sourceUrl: 'https://example.com/unreviewed.pdf' }, { sourceSha256: 'changed' },
      { sourcePages: [68] }, { notes: [] }, { sourceRow: { page: 69 } },
      { technicalSpecs: product.technicalSpecs.map(spec => spec === row ? { ...spec, value: '111×222×333' } : spec) },
      { technicalSpecs: product.technicalSpecs.map(spec => spec === row ? { ...spec, unit: 'см' } : spec) },
      { technicalSpecs: product.technicalSpecs.map(spec => spec === row ? { ...spec, page: 69 } : spec) },
      { variantSpecs: [] },
      ...(product.source === 'api' ? [{ databaseId: importedProductId('cat-ptm-tded-v001') }, { sourceMediaPath: null }, { sourceVariantSpecs: [] }]
        : [{ databaseId: importedProductId(id) }, { image: null }]),
    ];
    for (const change of changes) {
      const edited = { ...product, ...change };
      assert.equal(getPtmmDimensionQualification(edited, row), null, `${id}: ${JSON.stringify(change)}`);
      assert.equal(catalogSpecValueText(edited, row, row.value), row.value);
    }
    const edited = { ...product, technicalSpecs: product.technicalSpecs.map(spec => spec === row ? { ...spec, value: '111×222×333' } : spec) };
    const html = await render(product.source === 'api' ? 'LiveProductDetails' : 'StaticProductDetails', [edited], [id]);
    assert.match(html, /111×222×333/);
    assert.doesNotMatch(html, /data-ptmm-dimension-context|Применимость этих размеров/);
  }
});

test('malformed records fail closed without evaluating getters or inherited authority', () => {
  const product = data.productById(affectedIds[0]), row = dimensionRows(product)[0];
  let calls = 0;
  const changed = structuredClone(product);
  Object.defineProperty(changed.technicalSpecs[0], 'value', { get() { calls++; return 'altered'; }, enumerable: true });
  const idGetter = { ...product };
  Object.defineProperty(idGetter, 'id', { get() { calls++; return product.id; }, enumerable: true });
  for (const candidate of [changed, idGetter, Object.create(product), { ...product, id: { toString() { calls++; return product.id; } } }]) {
    assert.equal(getPtmmDimensionQualification(candidate, row), null);
  }
  assert.equal(calls, 0);
});

test('qualification preserves every source record, API identity/price, CSV and actual quote snapshot', async () => {
  // Execute the unchanged pure snapshot function without loading the backend's
  // unrelated authentication/database dependencies into frontend-only CI.
  const quoteSource = await readFile(new URL('../../backend-node/src/domain/quotes.js', import.meta.url), 'utf8');
  const snapshotSource = quoteSource.match(/function snapshot\(product\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(snapshotSource);
  const snapshot = new Function(`${snapshotSource}; return snapshot;`)();
  const selection = data.officialProducts.map(product => ({ id: product.id, quantity: 2 }));
  const before = JSON.stringify({ records: data.officialProducts, dto, liveProducts, snapshots: dto.map(snapshot),
    staticCsv: selectionCsv(selection, data.officialProducts), apiCsv: selectionCsv(selection, liveProducts) });
  for (const products of [data.officialProducts, liveProducts]) for (const product of products) {
    for (const row of product.technicalSpecs || []) {
      catalogSpecValueText(product, row, comparisonSpecValue(product.technicalSpecs, row, data.valueOrDash));
      CatalogSpecValue({ product, row });
    }
  }
  const after = JSON.stringify({ records: data.officialProducts, dto, liveProducts, snapshots: dto.map(snapshot),
    staticCsv: selectionCsv(selection, data.officialProducts), apiCsv: selectionCsv(selection, liveProducts) });
  assert.equal(after, before);
});

test('page 68 source bytes remain those used by the visual dimension review', async () => {
  const bytes = await readFile(new URL('../public/catalog-source/page-068.webp', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '68538d5278821dcc15fe6064621c8271c0397e1c0fc18a60dfcfa885093a9c77');
});
