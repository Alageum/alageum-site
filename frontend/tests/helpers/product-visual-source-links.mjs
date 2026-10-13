import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { normalizeApiProduct } from '../../lib/catalog/apiData.js';
import { productById } from '../../lib/catalog/data.js';
import { getEquipmentVisual } from '../../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../../lib/catalog/models/iconMap.js';
import { getProtectionExampleEvidence } from '../../lib/catalog/models/protectionExampleRuntime.js';
import { getEquipmentConstructionChoices, getEquipmentConstructionChoice } from '../../lib/catalog/models/transformerExecutionChoices.js';
import { getProductMedia } from '../../lib/catalog/media.js';
import { sourcePageUrl } from '../../lib/catalog/sources.js';
import { ptmmPublicDtos, malformedPtmmDto } from '../../e2e/helpers/ptmm-qualification-fixtures.mjs';

assert.equal(process.env.NODE_ENV, 'production');
const require = createRequire(import.meta.url);
// App Router Link normally receives this alias from Next's compiler. Use its
// installed SSR implementation for this Node-only render; no browser or router
// network is started. Link and its URL formatter are the real production code.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react-server-dom-webpack/client') return {
      url: pathToFileURL(require.resolve('next/dist/compiled/react-server-dom-webpack/client.edge')).href,
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
const { createElement, useState } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Link = require('next/dist/client/app-dir/link.js').default;
hooks.deregister();

// A bare <a> test double misses this failure. Establish that the installed Link
// has the exact production failure mode seen in the retained browser trace.
assert.throws(() => renderToStaticMarkup(createElement(Link, { href: null }, 'source')), /Cannot destructure property 'auth'/);

const file = new URL('../../components/catalog/ProductVisual.js', import.meta.url);
const source = (await readFile(file, 'utf8'))
  .replace(/^import .+;\r?$/gm, '')
  .replace(/^export \{ default as ProductIcon \} from '.+';\r?$/gm, '');
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const compiled = await transform(source, {
  filename: file.pathname,
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
  module: { type: 'commonjs' },
});
const bindings = {
  useState, Link, getEquipmentVisual, getEquipmentIcon, getProtectionExampleEvidence,
  getEquipmentConstructionChoices, getEquipmentConstructionChoice, getProductMedia, sourcePageUrl,
  Image: props => createElement('img', props), ProductIcon: () => null, EquipmentModel: () => null,
  CatalogSourceContext: () => null, sourceContextAssetProof: null,
};
const ProductVisual = new Function('bindings', 'require', 'exports',
  `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${compiled.code}\nreturn ProductVisual;`)(bindings, require, {});
const render = product => renderToStaticMarkup(createElement(ProductVisual, { product }));
const provenance = html => {
  const start = html.indexOf('<div class="visual-provenance">');
  assert.notEqual(start, -1);
  return html.slice(start);
};
const counts = { valid: 0, changed: 0, restored: 0 };
for (const dto of ptmmPublicDtos()) {
  const canonical = [productById(dto.public_key), normalizeApiProduct(dto)];
  for (const product of canonical) {
    const before = JSON.stringify(product), original = render(product);
    assert.match(provenance(original), /<a href="\/catalog\/source\?page=69">стр\. 69<\/a>/);
    assert.match(original, /src="\/catalog-products\/cat-ptm-tded.webp"/);
    counts.valid++;
    // Cover both provenance branches: the selected reviewed image, another
    // owner-selected image, and no image. Keep each selected media choice.
    for (const media of [undefined, [{ kind: 'image', path: '/brand/owner-selection.png' }], []]) {
      const changedDto = malformedPtmmDto(dto, 'source');
      if (media !== undefined) changedDto.media = media;
      const changed = product.source === 'api' ? normalizeApiProduct(changedDto)
        : { ...product, sourceUrl: changedDto.provenance.sourceUrl, ...(media === undefined ? {} : { image: media[0]?.path || null }) };
      const changedBefore = JSON.stringify(changed), html = render(changed), evidence = provenance(html);
      assert.equal(sourcePageUrl(changed, 69), null);
      assert.doesNotMatch(evidence, /<a\b/);
      assert.match(evidence, /<span>стр\. 69<\/span>/);
      assert.doesNotMatch(html, /href="(?:null|undefined|#)"/);
      if (product.source === 'api') {
        assert.deepEqual(changed.sourcePages, []);
        if (media?.length) assert.match(html, /src="\/brand\/owner-selection.png"/);
        else if (media) assert.doesNotMatch(html, /<img\b/);
      }
      assert.equal(JSON.stringify(changed), changedBefore);
      counts.changed++;
    }
    assert.equal(render(product), original);
    assert.equal(JSON.stringify(product), before);
    counts.restored++;
  }
}
process.stdout.write(JSON.stringify(counts));
