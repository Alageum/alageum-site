import { protectionExampleRuntimeManifest } from '../lib/catalog/models/protectionExampleRuntime.js';
import { sourceAssetCompletionManifest } from '../lib/catalog/models/sourceAssetCompletion.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { getProductMedia, sameOrderedMedia, selectApiProductImage } from '../lib/catalog/media.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import manifest from '../lib/catalog/media-manifest.json' with { type: 'json' };
import { transformerRuntimeManifest as transformerRuntime } from '../lib/catalog/models/transformer2026Runtime.js';
import { legacyAssetCompletion } from '../lib/catalog/models/legacyAssetCompletion.js';
import { catalogSources, getCatalogSource, getSourcePageAsset, isSourcePage, sourcePageImage, sourcePageUrl } from '../lib/catalog/sources.js';

const require = createRequire(import.meta.url);
const variant = productById('cat-bktp-modular-v001');
const baselineMedia = product => product.image ? [{ path: product.image, kind: 'image', ...(Object.hasOwn(product, 'imageCaption') ? { alt: product.imageCaption } : {}) }] : [];
const live = (source, media = baselineMedia(source)) => normalizeApiProduct({
  id: protectionExampleRuntimeManifest.records[source.id]?.databaseId || sourceAssetCompletionManifest.records[source.id]?.database_id || transformerRuntime.geometry[source.id]?.database_id || transformerRuntime.icons[source.id]?.database_id || (source.id === legacyAssetCompletion.id ? legacyAssetCompletion.databaseId : null) || manifest.overrides[source.id]?.database_id || '2e39f767-a489-4e09-adee-8d4f7d782f93', public_key: source.id, slug: source.id,
  category_public_key: source.category, sku: source.sku, specs: source, provenance: source, media,
  translations: { ru: { name: source.name } },
});
const describe = product => getProductMedia(product, getEquipmentVisual(product));
const page38Label = 'Страница 38 исходного каталога; не фотография изделия';

// Render the real component's image, caption and provenance branches without a browser
// or WebGL. The leaf model/icon are stand-ins; their reviewed mapping is tested below.
let visualComponent;
async function renderVisual(product) {
  if (!visualComponent) {
    const file = new URL('../components/catalog/ProductVisual.js', import.meta.url);
    const source = (await readFile(file, 'utf8'))
      .replace("'react'", JSON.stringify(pathToFileURL(require.resolve('react')).href))
      .replace("'@/lib/catalog/models/transformerExecutionChoices'", JSON.stringify(new URL('../lib/catalog/models/transformerExecutionChoices.js', import.meta.url).href))
      .replace("import Image from 'next/image';", "const Image = props => <img {...props}/>;")
      .replace("import Link from 'next/link';", "const Link = props => <a {...props}/>;")
      .replace("import ProductIcon from './ProductIcon';", 'const ProductIcon = ({ product }) => <span data-product-icon={product.id}/>;')
      .replace("export { default as ProductIcon } from './ProductIcon';", '')
      .replace("import sourceContextAssetProof from '@/lib/catalog/source-context/sourceContextBuildProof';", 'const sourceContextAssetProof = null;')
      .replace("import CatalogSourceContext from './source-context/CatalogSourceContext';", 'const CatalogSourceContext = () => null;')
      .replace("import EquipmentModel from './EquipmentModel';", 'const EquipmentModel = ({ type }) => <section data-equipment-model={type}/>;')
      .replace("'@/lib/catalog/models/protectionExampleRuntime'", JSON.stringify(new URL('../lib/catalog/models/protectionExampleRuntime.js', import.meta.url).href))
      .replace("'@/lib/catalog/models/iconMap'", JSON.stringify(new URL('../lib/catalog/models/iconMap.js', import.meta.url).href))
      .replace("'@/lib/catalog/models/visualMap'", JSON.stringify(new URL('../lib/catalog/models/visualMap.js', import.meta.url).href))
      .replace("'@/lib/catalog/sources'", JSON.stringify(new URL('../lib/catalog/sources.js', import.meta.url).href))
      .replace("'@/lib/catalog/media'", JSON.stringify(new URL('../lib/catalog/media.js', import.meta.url).href));
    const { transform, loadBindings } = require('next/dist/build/swc');
    await loadBindings();
    const compiled = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
    const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
    visualComponent = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  }
  return renderToStaticMarkup(createElement(visualComponent, { product }));
}

test('generated overrides correspond only to actual reviewed mismatches and exact imported media', () => {
  const mismatches = officialProducts.filter(product => {
    const reviewed = getEquipmentVisual(product).fallbackImage;
    return reviewed && reviewed !== product.image;
  });
  assert.deepEqual(Object.keys(manifest.overrides).sort(), mismatches.map(product => product.id).sort());
  for (const product of mismatches) {
    assert.deepEqual(manifest.overrides[product.id].imported, baselineMedia(product));
    assert.equal(manifest.overrides[product.id].reviewed[0].path, getEquipmentVisual(product).fallbackImage);
  }
  assert.deepEqual(manifest.assets['/catalog-products/cat-bktp-modular.webp'].source_pages, [39]);
});

test('untouched API records match all released static image choices and preserve reviewed construction mappings', () => {
  const frozen = JSON.stringify(officialProducts);
  for (const source of officialProducts) {
    const product = live(source);
    assert.equal(describe(product).image, describe(source).image, source.id);
    assert.deepEqual(getEquipmentVisual(product), getEquipmentVisual(source), source.id);
    assert.deepEqual(getEquipmentIcon(product), getEquipmentIcon(source), source.id);
  }
  assert.equal(JSON.stringify(officialProducts), frozen);
});

test('ordered semantic equality ignores JSONB key order and preserves alt presence, null and empty states', () => {
  const [image] = baselineMedia(variant);
  const reordered = { alt: image.alt, kind: image.kind, path: image.path };
  assert.equal(sameOrderedMedia([image], [reordered]), true);
  assert.equal(selectApiProductImage(variant.id, [reordered], manifest.overrides[variant.id].database_id).path, '/catalog-source/page-038.webp');
  for (const altered of [
    { path: image.path, kind: image.kind },
    { ...image, alt: null }, { ...image, alt: '' }, { ...image, alt: 'Другая подпись' },
  ]) {
    assert.equal(sameOrderedMedia([image], [altered]), false);
    assert.deepEqual(selectApiProductImage(variant.id, [altered], manifest.overrides[variant.id].database_id), altered);
  }
  assert.equal(sameOrderedMedia([{ path: 'a', kind: 'image' }, { path: 'b', kind: 'image' }], [{ path: 'b', kind: 'image' }, { path: 'a', kind: 'image' }]), false);
});

test('only the exact original singleton receives the reviewed scan; edits and array order stay authoritative', () => {
  const original = baselineMedia(variant);
  assert.equal(live(variant).image, '/catalog-source/page-038.webp');
  assert.equal(live(variant, []).image, null);
  assert.equal(live(variant, original.concat(original)).image, original[0].path);
  const selected = { path: '/catalog-products/cat-bktp-concrete.webp', kind: 'image', alt: 'Выбранное изображение' };
  assert.equal(live(variant, [selected, ...original]).image, selected.path);
  assert.equal(live(variant, [...original, selected]).image, original[0].path);
  assert.equal(selectApiProductImage('unknown', original).path, original[0].path);
  assert.equal(selectApiProductImage('__proto__', original).path, original[0].path);
  assert.deepEqual(original, baselineMedia(variant));
});

test('a new v1 row borrowing the imported public key never acquires its reviewed display default', () => {
  const media = baselineMedia(variant);
  for (const id of [undefined, '2e39f767-a489-4e09-adee-8d4f7d782f93']) {
    assert.equal(selectApiProductImage(variant.id, media, id).path, media[0].path);
    assert.equal(normalizeApiProduct({ id, public_key: variant.id, media }).image, media[0].path);
  }
  assert.equal(selectApiProductImage(variant.id, media, manifest.overrides[variant.id].database_id).path, '/catalog-source/page-038.webp');
});

test('absent/null alt use honest selected-asset fallback while explicit empty and edited alt survive', () => {
  for (const path of ['/catalog-source/page-038.webp', '/catalog-products/cat-bktp-modular.webp']) {
    const fallback = describe(live(variant, [{ path, kind: 'image' }])).caption;
    for (const item of [{ path, kind: 'image' }, { path, kind: 'image', alt: null }]) {
      assert.equal(describe(live(variant, [item])).alt, fallback);
    }
    for (const alt of ['', 'Подробное описание выбранного изображения']) {
      const media = describe(live(variant, [{ path, kind: 'image', alt }]));
      assert.equal(media.alt, alt);
      assert.equal(media.caption, fallback);
      assert.ok(!media.caption.includes(alt) || alt === '');
    }
  }
  assert.equal(describe(live(variant)).alt, page38Label);
  assert.equal(describe(variant).alt, page38Label);
  assert.equal(describe({ ...variant, imageCaption: '' }).alt, '');
});

test('unsupported media and malformed local paths never introduce an image fallback', () => {
  for (const media of [null, {}, [null], [{ kind: 'document', path: '/catalog-source/page-038.webp' }], [{ kind: 'image', path: 'https://example.com/a.webp' }], [{ kind: 'image', path: '/catalog-products/../brand/transformer.png' }]]) {
    assert.equal(selectApiProductImage(variant.id, media), null);
  }
});

test('rendered reviewed scan is correctly labeled and custom crop evidence stays on page39', async () => {
  const reviewed = await renderVisual(live(variant));
  assert.match(reviewed, /src="\/catalog-source\/page-038.webp"/);
  assert.ok(reviewed.includes(page38Label));
  assert.match(reviewed, /href="\/catalog\/source\?page=38"/);
  const edited = await renderVisual(live(variant, [{ ...baselineMedia(variant)[0], alt: 'Текст для экранного диктора' }]));
  assert.match(edited, /src="\/catalog-products\/cat-bktp-modular.webp" alt="Текст для экранного диктора"/);
  assert.equal(edited.split('Текст для экранного диктора').length - 1, 1);
  assert.match(edited, /не фотография конкретного исполнения/);
  assert.match(edited, /href="\/catalog\/source\?page=39"/);
  // The construction retains p38 provenance while independently selected media cites p39.
  const sourceDetail = edited.match(/<details[\s\S]*<\/details>/)[0];
  assert.doesNotMatch(sourceDetail, /page=38|странице 38|Страница 38/);
  assert.match(edited, /data-equipment-model="single-modular-building"/);
});

test('rendered explicit empty alt and empty media remain empty, including static fallback behavior', async () => {
  const emptyAlt = await renderVisual(live(variant, [{ path: '/catalog-source/page-038.webp', kind: 'image', alt: '' }]));
  assert.match(emptyAlt, /src="\/catalog-source\/page-038.webp" alt=""/);
  assert.ok(emptyAlt.includes(page38Label));
  const emptyMedia = await renderVisual(live(variant, []));
  assert.doesNotMatch(emptyMedia, /<img|<details|page=39/);
  assert.match(emptyMedia, /data-equipment-model="single-modular-building"/);
  assert.match(emptyMedia, /href="\/catalog\/source\?page=38"/);
  const staticDefault = await renderVisual(variant);
  assert.match(staticDefault, /src="\/catalog-source\/page-038.webp"/);
  assert.ok(staticDefault.includes(page38Label));
});

test('a mapped construction keeps its reviewed model when selected source media is removed or edited', async () => {
  const source = productById('cat-ktp-25-250');
  const empty = await renderVisual(live(source, []));
  assert.match(empty, /data-equipment-model="substation"/);
  assert.doesNotMatch(empty, /<img|<details/);
  const selected = await renderVisual(live(source, [{ path: '/catalog-source/page-038.webp', kind: 'image', alt: 'Скан для сравнения' }]));
  assert.match(selected, /data-equipment-model="substation"/);
  assert.match(selected, /src="\/catalog-source\/page-038.webp" alt="Скан для сравнения"/);
  assert.ok(selected.includes(page38Label));
});

test('KTPS v007 uses the reviewed page20 scan only for its exact untouched imported row', async () => {
  const source = productById('cat-ktps-100-1600-v007');
  const original = baselineMedia(source);
  assert.equal(live(source).image, '/catalog-source/page-020.webp');
  assert.deepEqual(describe(live(source)).sourcePages, [20]);
  assert.equal(selectApiProductImage(source.id, original, 'new-record-uuid').path, original[0].path);
  assert.equal(live(source, []).image, null);
  assert.equal(live(source, [{ ...original[0], alt: 'Edited source selection' }]).image, original[0].path);
  const html = await renderVisual(live(source));
  assert.match(html, /data-equipment-model="raised-outdoor-substation"/);
  assert.match(html, /src="\/catalog-source\/page-020.webp"/);
  assert.match(html, /href="\/catalog\/source\?page=20"/);
  assert.doesNotMatch(html, /page=19|Страница 19/);
});


test('source-aware media resolves exact registered scans without crossing PDF page namespaces', () => {
  for (const [sourceId, lastPage] of [['substations', 104], ['transformers-2026', 187]]) {
    for (let page = 1; page <= lastPage; page++) {
      const path = sourcePageImage(sourceId, page);
      const asset = getSourcePageAsset(path);
      assert.equal(asset.sourceId, sourceId);
      assert.equal(asset.page, page);
      const media = getProductMedia({ source: 'api', image: path }, {});
      assert.equal(media.sourceId, sourceId);
      assert.equal(media.representation, 'source-scan');
      assert.deepEqual(media.sourcePages, [page]);
      assert.equal(media.caption, `Страница ${page} исходного каталога; не фотография изделия`);
      assert.equal(isSourcePage(sourceId, page), true);
    }
    for (const page of [0, -1, lastPage + 1, 1.5, '1', NaN]) {
      assert.equal(isSourcePage(sourceId, page), false);
      assert.equal(sourcePageImage(sourceId, page), null);
      assert.equal(sourcePageUrl(sourceId, page), null);
    }
  }
  assert.equal(sourcePageUrl('substations', 38), '/catalog/source?page=38');
  assert.equal(sourcePageUrl('transformers-2026', 38), '/catalog/source?source=transformers-2026&page=38');
  assert.equal(sourcePageUrl('transformers-2026', 187), '/catalog/source?source=transformers-2026&page=187');
  assert.notEqual(sourcePageImage('substations', 38), sourcePageImage('transformers-2026', 38));
});

test('unknown sources, guessed paths and conflicting provenance do not acquire source evidence', () => {
  const source = catalogSources['transformers-2026'];
  const identity = { sourceId: source.id, sourceFileId: source.source_file_id, sourceSha256: source.source_sha256, sourceUrl: source.source_url };
  assert.equal(getCatalogSource(identity).id, source.id);
  for (const conflict of [{ sourceId: 'substations' }, { sourceFileId: 'unknown' }, { sourceSha256: '0'.repeat(64) }, { sourceUrl: catalogSources.substations.source_url }])
    assert.equal(getCatalogSource({ ...identity, ...conflict }), null);
  for (const sourceId of ['unknown', '__proto__', 'constructor']) {
    assert.equal(getCatalogSource(sourceId), null);
    assert.equal(sourcePageUrl(sourceId, 1), null);
  }
  for (const path of ['/catalog-source/page-105.webp', '/catalog-source/transformers-2026/page-000.webp', '/catalog-source/transformers-2026/page-188.webp', '/catalog-source/unknown/page-001.webp', '/catalog-source/transformers-2026/../page-038.webp', '/catalog-products/unknown.webp']) {
    assert.equal(getSourcePageAsset(path), null);
    const media = getProductMedia({ source: 'api', image: path }, {});
    assert.equal(media.representation, null);
    assert.equal(media.sourceId, null);
    assert.deepEqual(media.sourcePages, []);
  }
});
