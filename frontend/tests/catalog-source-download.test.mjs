import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Children, createContext, createElement, useContext } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogImport, transformerImport, productById } from '../lib/catalog/data.js';
import { catalogSources, defaultCatalogSourceId, sourcePageUrl, sourcePageImage } from '../lib/catalog/sources.js';
import { localResourceHref } from '../lib/public/localResources.js';
import { localizedHref } from '../lib/i18n/routing.js';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();

async function compile(relativePath, bindings) {
  const file = new URL(relativePath, import.meta.url);
  const source = readFileSync(file, 'utf8').replace(/\bimport\s+[^;]+;/g, '');
  const output = await transform(source, {
    filename: file.pathname,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  return new Function('bindings', 'require', 'exports',
    `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${output.code}\nreturn exports;`)(bindings, require, {});
}

// Retain the production locale/resource wrappers so an unavailable PDF cannot
// become a working-looking link through translation or URL rewriting.
const dictionaries = JSON.parse(readFileSync(new URL('../lib/i18n/dictionaries.json', import.meta.url)));
const { translateText } = await compile('../lib/i18n/translate.js', { dictionaries });
const { LocaleProvider, useLocale } = await compile('../components/locale/LocaleProvider.js', {
  createContext, useContext, translateText,
});
const { default: LocaleElement } = await compile('../components/locale/LocaleElement.js', {
  Children, useLocale, translateText, localizedHref, localResourceHref,
  SelectionIndicator: () => { throw new Error('Unexpected checkbox in source viewer'); },
  DesignSelect: props => createElement('select', props),
});
let query;
const { default: CatalogSource } = await compile('../components/catalog/CatalogSource.js', {
  LocaleElement,
  Image: ({ unoptimized, priority, ...props }) => {
    void unoptimized; void priority;
    return createElement('img', props);
  },
  Link: props => createElement(LocaleElement, { as: 'a', ...props }),
  useSearchParams: () => query,
  useRouter: () => ({ push: () => {} }),
  catalogImport, transformerImport, productById,
  catalogSources, defaultCatalogSourceId, sourcePageUrl, sourcePageImage,
});

function render(sourceId, page, locale) {
  query = new URLSearchParams({ source: sourceId, page: String(page) });
  return renderToStaticMarkup(createElement(LocaleProvider, { locale }, createElement(CatalogSource)));
}

test('transformer viewer replaces the unbundled original PDF download with an honest notice in all three locales', () => {
  const notices = {
    ru: 'Оригинальный PDF передаётся отдельно. Все 187 страниц доступны в этом просмотрщике.',
    kk: 'Түпнұсқа PDF бөлек беріледі. Барлық 187 бетті осы қарау құралында көруге болады.',
    en: 'The original PDF is supplied separately. All 187 pages are available in this viewer.',
  };
  assert.equal(catalogSources['transformers-2026'].page_count, 187);
  for (const [locale, notice] of Object.entries(notices)) {
    const html = render('transformers-2026', 187, locale);
    assert.ok(html.includes(`data-source-document-notice="transformers-2026">${notice}</p>`), locale);
    assert.doesNotMatch(html, /transformers-2026-original\.pdf|download=/);
    assert.ok(html.includes('value="187" selected=""'), locale);
    assert.ok(html.includes('src="/catalog-source/transformers-2026/page-187.webp"'), locale);
  }
});

test('every transformer page remains available locally without an original PDF or an external fallback', () => {
  for (let page = 1; page <= 187; page++) {
    const image = sourcePageImage('transformers-2026', page);
    assert.ok(existsSync(new URL(`../public${image}`, import.meta.url)), `page ${page}`);
    assert.equal(sourcePageUrl('transformers-2026', page), `/catalog/source?source=transformers-2026&page=${page}`);
  }
});

test('substations retain their real local PDF download and never show the transformer notice', () => {
  assert.ok(existsSync(new URL('../public/documents/substations-local-edition.pdf', import.meta.url)));
  for (const locale of ['ru', 'kk', 'en']) {
    const html = render(defaultCatalogSourceId, 1, locale);
    assert.match(html, /href="\/documents\/substations-local-edition\.pdf" download=""/);
    assert.doesNotMatch(html, /data-source-document-notice|transformers-2026-original\.pdf/);
    assert.ok(html.includes('src="/catalog-source/page-001.webp"'));
  }
});
