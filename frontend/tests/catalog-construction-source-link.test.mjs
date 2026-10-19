import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Children, createContext, createElement, useContext, useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { getCatalogRelatedReferences, getCatalogSourceComparisons } from '../lib/catalog/identityCompletion.js';
import { sourcePageUrl } from '../lib/catalog/sources.js';
import { getCatalogFamilySourceReferences, sourcePanelAnchor } from '../lib/catalog/familySourceReferences.js';
import { getReviewedLegacyCompletion, legacyAssetCompletion } from '../lib/catalog/models/legacyAssetCompletion.js';
import { displayExecution, displayProductName, displaySpecLabel } from '../lib/catalog/presentation.js';
import { localResourceHref } from '../lib/public/localResources.js';
import { localizedHref } from '../lib/i18n/routing.js';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();

// Use the existing SWC source-render pattern, but retain the real resource and
// locale wrappers: the general catalogue harness replaces them with bare anchors.
async function compile(relativePath, bindings) {
  const file = new URL(relativePath, import.meta.url);
  const source = (await readFile(file, 'utf8')).replace(/^import .+;\r?$/gm, '');
  const output = await transform(source, {
    filename: file.pathname,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  return new Function('bindings', 'require', 'exports',
    `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${output.code}\nreturn exports;`)(bindings, require, {});
}

const dictionaries = JSON.parse(await readFile(new URL('../lib/i18n/dictionaries.json', import.meta.url), 'utf8'));
const { translateText } = await compile('../lib/i18n/translate.js', { dictionaries });
const { LocaleProvider, useLocale } = await compile('../components/locale/LocaleProvider.js', { createContext, useContext, translateText });
const unusedControl = () => { throw new Error('Unexpected non-anchor control in source-link render'); };
const { default: LocaleElement } = await compile('../components/locale/LocaleElement.js', {
  Children, useLocale, translateText, localizedHref, localResourceHref,
  SelectionIndicator: unusedControl, DesignSelect: unusedControl,
});
const { default: LocalResourceAnchor } = await compile('../components/locale/LocalResourceAnchor.js', { E: LocaleElement });
const { default: CatalogSourceEvidence } = await compile('../components/catalog/CatalogSourceEvidence.js', {
  LocalResourceAnchor, useEffect,
  Link: props => createElement('a', props),
  getCatalogRelatedReferences, getCatalogSourceComparisons, sourcePageUrl,
  getCatalogFamilySourceReferences, sourcePanelAnchor, getReviewedLegacyCompletion,
  displayExecution, displayProductName, displaySpecLabel,
  CatalogConfigurations: unusedControl, CatalogSourcePreview: unusedControl,
});

function render(product, locale) {
  return renderToStaticMarkup(createElement(LocaleProvider, { locale },
    createElement(CatalogSourceEvidence, { product, records: officialProducts })));
}

test('reviewed SHR11 construction citation preserves its literal source through the real locale wrappers', () => {
  const href = 'https://alageum.com/ru/katalog/shkafy-upravleniya/shr11';
  assert.equal(legacyAssetCompletion.primarySourceUrl, href);
  const product = productById('cat-pr-shr11-v002');
  const api = { ...product, source: 'api', databaseId: legacyAssetCompletion.databaseId, sourceMediaPath: product.image };
  const before = JSON.stringify(officialProducts);

  for (const locale of ['ru', 'kk', 'en']) {
    // Establish the original failure mode using the actual production wrappers.
    const rewritten = renderToStaticMarkup(createElement(LocaleProvider, { locale },
      createElement(LocalResourceAnchor, { href }, 'source')));
    assert.equal(rewritten, `<a href="${localizedHref('/materials', locale)}">source</a>`);

    for (const row of [product, api]) {
      const original = JSON.stringify(row);
      const html = render(row, locale);
      const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || [];
      assert.deepEqual(anchors, [
        `<a class="site-text-link" href="${href}" target="_blank" rel="noopener noreferrer">Источник сопоставления ШР11 ↗</a>`,
      ], `${locale}: ${row.source}`);
      assert.match(html, /Официальный раздел производителя/);
      assert.doesNotMatch(html, /data-catalog-source-panel=|href="\/(?:kk\/|en\/)?materials/);
      assert.equal(JSON.stringify(row), original);
    }

    // The reviewed citation must never be assigned to the adjacent ПР or ПР-11.
    for (const row of [productById('cat-pr-shr11-v001'), productById('cat-pr-shr11-v003'),
      { ...api, databaseId: 'reused-uuid' }, { ...api, name: 'changed' }]) {
      assert.equal(render(row, locale), '');
    }
  }
  assert.equal(JSON.stringify(officialProducts), before);
});
