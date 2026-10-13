import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import parseValue from 'next/dist/compiled/postcss-value-parser/index.js';
import manifest from '../lib/catalog/source-context/sourceContextManifest.json' with { type: 'json' };

const sheet = postcss.parse(readFileSync(new URL('../components/catalog/source-context/CatalogSourceContext.module.css', import.meta.url), 'utf8'));
const globalSheet = postcss.parse(readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8'));
function declaration(css, selector, name) {
  let value;
  css.walkRules(rule => { if (rule.selector === selector) rule.walkDecls(name, declaration => { value = declaration.value; }); });
  assert.ok(value, `${selector}/${name}`); return value;
}
// Evaluate the actual CSS min/max/calc lengths, not browser layout. The hosted
// full-bound, pointer and scroll checks remain required and unchanged.
function length(value, viewport, rem) {
  function evaluate(nodes) {
    let total = 0, sign = 1;
    for (const node of nodes.filter(node => node.type !== 'space')) {
      if (node.type === 'word' && ['+', '-'].includes(node.value)) { sign = node.value === '-' ? -1 : 1; continue; }
      let amount;
      if (node.type === 'function') {
        if (node.value === 'calc') amount = evaluate(node.nodes);
        else {
          assert.ok(['min', 'max'].includes(node.value));
          const args = [[]]; for (const child of node.nodes) { if (child.type === 'div' && child.value === ',') args.push([]); else args.at(-1).push(child); }
          amount = Math[node.value](...args.map(evaluate));
        }
      } else {
        assert.equal(node.type, 'word');
        const match = /^([\d.]+)(px|rem|svh)$/.exec(node.value); assert.ok(match, node.value);
        amount = Number(match[1]) * ({ px: 1, rem, svh: viewport / 100 })[match[2]];
      }
      total += sign * amount; sign = 1;
    }
    return total;
  }
  return evaluate(parseValue(value).nodes);
}
const maxHeight = declaration(sheet, '.image', 'max-height');
const scrollPadding = declaration(globalSheet, 'html', 'scroll-padding-top');
const linkPadding = declaration(sheet, '.imageLink', 'padding');

test('actual source preview cap fixes the captured desktop edge without dropping source content', () => {
  const right = manifest.figures['shnn-page35-right-general-view'];
  const viewport = 720, rem = 16, width = 481, padding = length(linkPadding, viewport, rem) * 2;
  const oldLinkHeight = Math.min(width * right.height / right.width, 39 * rem) + padding;
  const scrollTop = length(scrollPadding, viewport, rem);
  assert.ok((viewport + scrollTop + oldLinkHeight) / 2 > viewport + 1, 'Reproduce the old centered-link miss');
  const cap = length(maxHeight, viewport, rem); assert.equal(cap, 576);
  const linkHeight = Math.min(width * right.height / right.width, cap) + padding;
  assert.equal(linkHeight, 600); assert.equal((viewport + scrollTop + linkHeight) / 2, 708);
  assert.equal(declaration(sheet, '.image', 'object-fit'), 'contain');
  assert.equal(declaration(sheet, '.image', 'height'), 'auto'); assert.equal(declaration(sheet, '.image', 'width'), '100%');
});

test('all source images fit centered scroll space across short/tall viewports, widths and text sizes', () => {
  for (const viewport of [240, 320, 360, 600, 720, 760, 839, 1024]) for (const rem of [12, 16, 20]) for (const width of [160, 228, 320, 481, 960]) {
    const top = length(scrollPadding, viewport, rem), padding = length(linkPadding, viewport, rem) * 2;
    const cap = length(maxHeight, viewport, rem); assert.ok(cap > 0 && cap <= 39 * rem);
    for (const figure of Object.values(manifest.figures)) {
      const height = Math.min(width * figure.height / figure.width, cap) + padding;
      const y = top + (viewport - top - height) / 2;
      assert.ok(y >= top && y + height <= viewport, `${figure.key} ${viewport}/${rem}/${width}`);
      assert.ok(viewport - (y + height) >= .75 * rem - 1e-8, 'Keep clearance below the image link');
    }
  }
});
