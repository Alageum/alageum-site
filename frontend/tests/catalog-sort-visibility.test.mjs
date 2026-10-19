import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const { parse } = require('next/dist/compiled/node-html-parser');
const file = new URL('../components/ui/DesignSelect.js', import.meta.url);
const source = (await readFile(file, 'utf8'))
  .replace("import {useTranslate} from '@/components/locale/LocaleProvider';", 'const useTranslate = () => text => text;');
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const compiled = await transform(source, { filename: file.pathname,
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
const code = compiled.code.replace(/(['"])(react(?:\/jsx-runtime)?)\1/g, (_, quote, name) => JSON.stringify(pathToFileURL(require.resolve(name)).href));
const DesignSelect = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
const html = renderToStaticMarkup(createElement('label', { className: 'sort-control' },
  createElement('span', {}, 'Сортировка'),
  createElement(DesignSelect, { 'aria-label': 'Сортировка', defaultValue: 'name' },
    createElement('option', { value: 'name' }, 'По наименованию'),
    createElement('option', { value: 'power-asc' }, 'Мощность: по возрастанию'))));
const dom = parse(html);
const css = await readFile(new URL('../app/catalog.css', import.meta.url), 'utf8');

// This evaluates actual selector matching and width conditions, not browser
// geometry. The hosted catalogue case exercises visibility, hit targets and sort.
function hiddenNodes(styles, width) {
  const hidden = new Set();
  postcss.parse(styles).walkRules(rule => {
    if (!rule.nodes.some(node => node.type === 'decl' && node.prop === 'display' && node.value === 'none')) return;
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type !== 'atrule' || parent.name !== 'media') continue;
      const match = /^\(max-width:\s*(\d+)px\)$/.exec(parent.params);
      assert.ok(match, `Explicitly evaluate the real media condition: ${parent.params}`);
      if (width > Number(match[1])) return;
    }
    for (const node of dom.querySelectorAll(rule.selector)) hidden.add(node);
  });
  return hidden;
}
const hidesSelect = nodes => [...nodes].some(node => node.tagName === 'SELECT' || node.querySelector('select'));

test('real DesignSelect render retains an accessible native sort control inside its wrapper', () => {
  assert.equal(dom.querySelectorAll('.sort-control > .design-select > select[aria-label="Сортировка"]').length, 1);
  assert.equal(dom.querySelectorAll('.sort-control > span:not(.design-select)').length, 1);
});

test('compact catalogue CSS hides only label text, reproducing and rejecting the former wrapper bug', () => {
  const oldCss = css.replace('.sort-control>span:not(.design-select)', '.sort-control>span');
  assert.notEqual(oldCss, css, 'The negative control must restore the original broad rule');
  const label = dom.querySelector('.sort-control > span:not(.design-select)');
  for (const width of [320, 393, 768, 1200, 1201, 1440]) {
    const currentHidden = hiddenNodes(css, width);
    assert.equal(hidesSelect(currentHidden), false, `Sorting remains available at ${width}px`);
    assert.equal(currentHidden.has(label), width <= 1200, `Original label visibility is preserved at ${width}px`);
    assert.equal(hidesSelect(hiddenNodes(oldCss, width)), width <= 1200, `Old rule reproduces the captured bug at ${width}px`);
  }
});
