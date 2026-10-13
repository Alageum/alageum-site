import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { productById } from '../lib/catalog/data.js';
import { createSourceContextAssetVerifier, sourceContextManifest as manifest } from '../lib/catalog/source-context/sourceContexts.js';
const require = createRequire(import.meta.url);
const evidence = await createSourceContextAssetVerifier(path => readFile(new URL(`../public${path}`, import.meta.url))).verify();
let component;
export async function sourceContextComponent() {
  if (component) return component;
  const file = new URL('../components/catalog/source-context/CatalogSourceContext.js', import.meta.url);
  const source = (await readFile(file, 'utf8'))
    .replace("'../../../lib/catalog/source-context/sourceContexts.js'", JSON.stringify(new URL('../lib/catalog/source-context/sourceContexts.js', import.meta.url).href))
    .replace("'./SourceContextImage.js'", JSON.stringify(new URL('../components/catalog/source-context/SourceContextImage.js', import.meta.url).href))
    .replace("import styles from './CatalogSourceContext.module.css';", 'const styles = new Proxy({}, { get: (_, name) => name });');
  const { transform, loadBindings } = require('next/dist/build/swc');
  await loadBindings();
  const compiled = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  component = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  return component;
}
const render = async (product, assetEvidence = JSON.parse(JSON.stringify(evidence))) => renderToStaticMarkup((await sourceContextComponent())({ product, assetEvidence }));

test('real component renders exact source-context blocks without any execution control', async () => {
  for (const [id, entry] of Object.entries(manifest.records)) {
    const product = productById(id), before = JSON.stringify(product), html = await render(product);
    const expected = manifest.contexts[entry.contextKey];
    assert.match(html, new RegExp(`aria-labelledby="source-context-${id}"`));
    assert.match(html, new RegExp(`data-source-context-for="${id}"`));
    assert.equal((html.match(/<figure\b/g) || []).length, expected.figureKeys.length);
    assert.equal((html.match(/<figcaption\b/g) || []).length, expected.figureKeys.length);
    assert.ok(html.includes(expected.status));
    assert.doesNotMatch(html, /<select|<button|<details|<summary|<input|role="tab|aria-selected|source-matched|source-based|CAD|onClick/);
    for (const key of expected.figureKeys) {
      const figure = manifest.figures[key];
      assert.ok(html.includes(`data-source-figure="${key}"`));
      assert.ok(html.includes(`src="${figure.cropPath}"`));
      assert.ok(html.includes(figure.caption));
      assert.ok(html.includes(`href="${figure.sourceHref}"`));
      assert.ok(html.includes(`width="${figure.width}" height="${figure.height}"`));
      assert.ok(figure.sourceLegend.every(legend => html.includes(legend)));
      if (figure.exemplarId) assert.ok(html.includes(`href="/catalog/${figure.exemplarId}"`));
    }
    for (const anchor of html.matchAll(/<a\b[^>]*>/g)) assert.match(anchor[0], /target="_blank" rel="noopener noreferrer"/);
    assert.equal(JSON.stringify(product), before);
  }
});

test('component returns no block when evidence or record authority is missing and does not leak unbound text', async () => {
  const product = productById('cat-shnn-v001');
  assert.equal(await render(product, null), '');
  assert.equal(await render({ ...product, name: 'different row' }), '');
  assert.equal(await render(productById('cat-ptm-tded-v002')), '');
  const html = await render({ ...product, description: '<malicious-body>', variantSpecs: [{ label: 'unreviewed-description', value: 'default-U1' }] });
  assert.doesNotMatch(html, /malicious-body|unreviewed-description|default-U1/);
});

test('scoped CSS gives narrow cards a single column, keeps complete figures, and exposes keyboard focus', async () => {
  const css = await readFile(new URL('../components/catalog/source-context/CatalogSourceContext.module.css', import.meta.url), 'utf8');
  assert.match(css, /@container\s*\(max-width: 40rem\).*?grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(css, /@media\s*\(max-width: 42rem\).*?grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /\.link:focus-visible, \.imageLink:focus-visible/);
  assert.match(css, /forced-colors: active/);
  assert.doesNotMatch(css, /display:\s*none|visibility:\s*hidden|overflow:\s*hidden|object-fit:\s*cover/);
});


test('image request failure reports unavailable source and preserves the exact path without substitutions', async () => {
  const file = new URL('../components/catalog/source-context/SourceContextImage.js', import.meta.url);
  const source = (await readFile(file, 'utf8')).replace("import { createElement, useState } from 'react';", `import { createElement } from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)}; export const state = { failedPath: null }; const useState = () => [state.failedPath, value => { state.failedPath = value; }];`);
  const { default: Image, state } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const first = manifest.figures['shnn-page35-left-general-view'];
  const other = manifest.figures['shnn-page35-right-general-view'];
  const initial = Image({ figure: first });
  assert.equal(initial.type, 'img'); assert.equal(initial.props.src, first.cropPath);
  initial.props.onError();
  const failed = Image({ figure: first });
  assert.equal(failed.type, 'span'); assert.equal(failed.props.role, 'status');
  assert.match(failed.props.children, /Исходное изображение недоступно/);
  assert.equal(Image({ figure: other }).props.src, other.cropPath);
  assert.equal(state.failedPath, first.cropPath);
});
