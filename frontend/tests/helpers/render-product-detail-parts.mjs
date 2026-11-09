import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createElement } from 'react';

export function renderLocaleElement({ as = 'span', children, ...props }) {
  return createElement(as, props, children);
}

const require = createRequire(import.meta.url);

async function compile(fileName) {
  const file = new URL(`../../components/catalog/${fileName}.js`, import.meta.url);
  const source = (await readFile(file, 'utf8')).replace(/^import .+;\r?$/gm, '');
  const { transform, loadBindings } = require('next/dist/build/swc');
  await loadBindings();
  return (await transform(source, {
    filename: file.pathname,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })).code;
}

let compiled;

export async function renderProductDetailParts(bindings) {
  compiled ??= Promise.all([compile('ProductOverview'), compile('ProductSpecificationRows')]);
  const [overview, specifications] = await compiled;
  const evaluate = (code, result) => new Function('bindings', 'require', 'exports',
    `const { ${Object.keys(bindings).join(', ')} } = bindings;\n${code}\nreturn ${result};`)(bindings, require, {});
  return {
    ...evaluate(overview, '{ ProductOverview, productCatalogHref }'),
    ProductSpecificationRows: evaluate(specifications, 'ProductSpecificationRows'),
  };
}
