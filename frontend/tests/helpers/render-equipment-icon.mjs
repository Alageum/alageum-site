import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');

let component;
export async function renderEquipmentIcon(type, size = 64, title = type) {
  if (!component) {
    const file = new URL('../../components/catalog/EquipmentIcon.js', import.meta.url);
    const source = (await readFile(file, 'utf8')).replace(/(['"])@\/([^'"]+)\1/g, (_, quote, relative) => JSON.stringify(new URL(`../../${relative}.js`, import.meta.url).href));
    await loadBindings();
    const compiled = await transform(source, { filename: file.pathname, jsc: { parser: { syntax:'ecmascript', jsx:true }, transform: { react: { runtime:'automatic' } } }, module: { type:'es6' } });
    const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
    component = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
  }
  return renderToStaticMarkup(createElement(component, { type, size, title }));
}
