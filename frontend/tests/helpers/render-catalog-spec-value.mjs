import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { getPtmmDimensionQualification } from '../../lib/catalog/ptmmDimensionQualification.js';

const require = createRequire(import.meta.url);
let component;
export async function catalogSpecValueComponent() {
  if (component) return component;
  const file = new URL('../../components/catalog/CatalogSpecValue.js', import.meta.url);
  const source = (await readFile(file, 'utf8')).replace(/^import .+;\r?$/gm, '');
  const { transform, loadBindings } = require('next/dist/build/swc');
  await loadBindings();
  const compiled = await transform(source, {
    filename: file.pathname,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  });
  component = new Function('Link', 'getPtmmDimensionQualification', 'require', 'exports',
    `${compiled.code}\nreturn CatalogSpecValue;`)(props => createElement('a', props), getPtmmDimensionQualification, require, {});
  return component;
}
