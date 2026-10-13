import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { familyPresentationBindings } from '../lib/catalog/familyPresentation.js';
const require = createRequire(import.meta.url);
let loaded;
async function harness() {
  if (loaded) return loaded;
  const file = new URL('../components/catalog/FamilyProductVisual.js', import.meta.url);
  let source = (await readFile(file, 'utf8'))
    .replace("import { useState } from 'react';", "export const state = { selected: '', passedProducts: [] }; const useState = () => [state.selected, value => { state.selected = value; }];")
    .replace("import Link from 'next/link';", 'const Link = props => <a {...props}/>;')
    .replace("import Image from 'next/image';", 'const Image = props => <img {...props}/>;')
    .replace("import ProductVisual from './ProductVisual';", 'const ProductVisual = ({ product }) => { state.passedProducts.push(product); return <div data-guarded-product-id={product.id}/>; };')
    .replace("import ProductIcon from './ProductIcon';", 'const ProductIcon = ({ product }) => <span data-icon-product-id={product.id}/>;');
  for (const name of ['familyPresentation', 'presentation', 'grouping', 'sources']) source = source.replace(`'@/lib/catalog/${name}'`, JSON.stringify(new URL(`../lib/catalog/${name}.js`, import.meta.url).href));
  const { transform, loadBindings } = require('next/dist/build/swc');
  await loadBindings();
  const compiled = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  loaded = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return loaded;
}
async function render(product, selected = '', records = officialProducts) {
  const { default: FamilyProductVisual, state } = await harness();
  state.selected = selected;
  state.passedProducts = [];
  return { html: renderToStaticMarkup(FamilyProductVisual({ product, records })), passedProducts: state.passedProducts };
}

test('real family component starts without a child, passes only the selected original child to its visual guard, and resets', async () => {
  const family = productById('tr2026-family-tmg-standard');
  const before = JSON.stringify(family);
  const initial = await render(family);
  assert.match(initial.html, /Обзор семейства · запись не выбрана/);
  assert.doesNotMatch(initial.html, /data-selected-member=/);
  assert.deepEqual(initial.passedProducts, [family]);
  const child = productById('alageum-tmg-standard-16');
  const selected = await render(family, child.id);
  assert.match(selected.html, /data-selected-member="alageum-tmg-standard-16"/);
  assert.match(selected.html, /Номинальная мощность: 16 кВА/);
  assert.deepEqual(selected.passedProducts, [child]);
  assert.strictEqual(selected.passedProducts[0], child);
  assert.doesNotMatch((await render(family)).html, /data-selected-member=/);
  assert.doesNotMatch((await render(family, 'unrelated-id')).html, /data-selected-member=/);
  assert.equal(JSON.stringify(family), before);
});

test('real family component shows a technical document with factory context without changing its source image', async () => {
  const family = productById('tr2026-family-asia-two-winding-110-pbv');
  const rendered = await render(family);
  assert.match(rendered.html, /data-family-document-page="167"/);
  assert.match(rendered.html, /src="\/catalog-source\/transformers-2026\/page-167.webp"/);
  assert.match(rendered.html, /не фотография изделия/);
  assert.match(rendered.html, /source=transformers-2026&amp;page=166/);
  assert.equal(rendered.passedProducts.length, 0);
  assert.equal(family.image, '/catalog-source/transformers-2026/page-166.webp');
});

test('real family component does not give a changed API parent a canonical document preview or member selector', async () => {
  const family = productById('tr2026-family-asia-two-winding-110-pbv');
  const live = { ...family, source: 'api', sourceMediaPath: family.image, databaseId: familyPresentationBindings[family.id].database_id };
  assert.match((await render(live, '', [])).html, /data-family-document-page="167"/);
  for (const patch of [{ databaseId: 'untrusted' }, { name: 'edited source family' }, { sourcePages: [166, 177] }]) {
    const changed = { ...live, ...patch };
    const result = await render(changed);
    assert.doesNotMatch(result.html, /data-family-document-page=|Запись для просмотра/);
    assert.strictEqual(result.passedProducts[0], changed);
  }
});

test('old multi-construction families route each exact member independently', async () => {
  for (const id of ['cat-bktp-modular-v001', 'cat-bktp-modular-v002', 'cat-ptm-tded-v012', 'cat-ptm-tded-v013']) {
    const family = productById(productById(id).familyId);
    const result = await render(family, id);
    assert.strictEqual(result.passedProducts[0], productById(id));
    assert.match(result.html, new RegExp(`data-selected-member="${id}"`));
  }
});
