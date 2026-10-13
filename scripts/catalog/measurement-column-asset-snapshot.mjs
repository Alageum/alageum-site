// Review aid: compute deterministic observable outputs from an explicit checkout.
// Random Three.js UUIDs are omitted; vertex buffers, transforms and materials are retained.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'uuid').map(([key, item]) => [key, clean(item)])) : value;
export function importedProductId(key) {
  const bytes = createHash('sha1').update(Buffer.from('541788eefbf04d859d33e593b82f303c', 'hex')).update(`product:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function measurementColumnAssetSnapshot(checkout) {
  const load = file => import(pathToFileURL(path.join(checkout, 'frontend', file)).href);
  const [data, api, visuals, icons, types, iconTypes, transformers, transformerIcons, geometry, choices, panels, media] = await Promise.all([
    'lib/catalog/data.js', 'lib/catalog/apiData.js', 'lib/catalog/models/visualMap.js', 'lib/catalog/models/iconMap.js',
    'lib/catalog/models/types.js', 'lib/catalog/models/iconTypes.js', 'lib/catalog/models/transformer2026Types.js',
    'lib/catalog/models/transformer2026Icons.js', 'lib/catalog/models/geometry.js', 'lib/catalog/models/transformerExecutionChoices.js',
    'lib/catalog/identityCompletion.js', 'lib/catalog/media.js',
  ].map(load));
  // PR32's historical snapshot remains untouched. This successor also enumerates
  // its three accessory assets and the new vocabulary, independent of bindings.
  const accessoryTypes = await load('lib/catalog/models/accessory2026Types.js');
  const accessoryIcons = await load('lib/catalog/models/accessory2026Icons.js');
  const columnPath = path.join(checkout, 'frontend/lib/catalog/models/measurementColumn2026Types.js');
  const columnTypes = fs.existsSync(columnPath) ? await load('lib/catalog/models/measurementColumn2026Types.js') : { measurementColumn2026Types: {} };
  const previews = await load('lib/catalog/ntmiSourcePreview.js');
  const normalized = record => api.normalizeApiProduct({ id: importedProductId(record.id), public_key: record.id, sku: record.sku,
    category_public_key: record.category, translations: { ru: { name: record.name } }, specs: record, provenance: record,
    media: record.image ? [{ path: record.image, kind: 'image', alt: record.imageCaption }] : [],
  });
  const outputs = record => ({ visual: visuals.getEquipmentVisual(record), icon: icons.getEquipmentIcon(record),
    choices: choices.getEquipmentConstructionChoices(record), panels: panels.getCatalogSourceComparisons(record) });
  const products = Object.fromEntries(data.officialProducts.map(record => [record.id, {
    body: hash(record), static: hash(outputs(record)), api: hash(outputs(normalized(record))),
    staticMedia: hash(media.getProductMedia(record, visuals.getEquipmentVisual(record))),
    apiMedia: hash(media.getProductMedia(normalized(record), visuals.getEquipmentVisual(normalized(record)))),
    choices: hash(choices.getEquipmentConstructionChoices(record)), panels: hash(panels.getCatalogSourceComparisons(record)),
  }]));
  const modelIds = [...new Set([...Object.keys(types.equipmentModelTypes), ...Object.keys(transformers.transformer2026Types), ...Object.keys(accessoryTypes.accessory2026Types), ...Object.keys(columnTypes.measurementColumn2026Types)])];
  const modelOutputs = Object.fromEntries(modelIds.map(type => {
    const group = geometry.createEquipmentGeometry(type), nodes = [];
    group.traverse(node => nodes.push({ type: node.type, name: node.name, position: node.position.toArray(), quaternion: node.quaternion.toArray(),
      scale: node.scale.toArray(), visible: node.visible, castShadow: node.castShadow, receiveShadow: node.receiveShadow,
      userData: Object.fromEntries(Object.entries(node.userData).filter(([key]) => key !== 'materials')),
      geometry: node.geometry ? { type: node.geometry.type, index: node.geometry.index ? Array.from(node.geometry.index.array) : null,
        attributes: Object.fromEntries(Object.entries(node.geometry.attributes).map(([name, attr]) => [name, {itemSize: attr.itemSize, normalized: attr.normalized, array: Array.from(attr.array)}])),
        groups: node.geometry.groups, drawRange: node.geometry.drawRange } : null,
      material: node.material ? (Array.isArray(node.material) ? node.material : [node.material]).map(material => clean(material.toJSON())) : null,
    }));
    const output = { name: types.equipmentModelName(type), resolved: types.resolveModelType(type), geometry: hash(nodes) };
    geometry.disposeEquipmentGeometry(group); return [type, output];
  }));
  const require = createRequire(path.join(checkout, 'frontend/package.json'));
  const file = path.join(checkout, 'frontend/components/catalog/EquipmentIcon.js');
  let source = fs.readFileSync(file, 'utf8').replace(/(['"])@\/([^'"]+)\1/g, (_, quote, relative) => JSON.stringify(pathToFileURL(path.join(checkout, 'frontend', `${relative}.js`)).href));
  const { transform, loadBindings } = require('next/dist/build/swc'); await loadBindings();
  const compiled = await transform(source, { filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  const code = compiled.code.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
  const { default: EquipmentIcon } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const { createElement } = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const iconIds = [...new Set([...Object.keys(iconTypes.equipmentIconTypes), ...Object.keys(transformerIcons.transformer2026IconDefinitions), ...Object.keys(accessoryIcons.accessory2026IconDefinitions), ...Object.keys(columnTypes.measurementColumn2026Types)])];
  const iconOutputs = Object.fromEntries(iconIds.map(type => [type, { name: iconTypes.equipmentIconName(type), resolved: iconTypes.resolveIconType(type),
    svg: hash(renderToStaticMarkup(createElement(EquipmentIcon, { type, size: 64, title: true }))) }]));
  return { format: 'alageum-measurement-column-output-snapshot-v1',
    sourcePreviews: Object.fromEntries(data.officialProducts.map(record => [record.id, { static: hash(previews.getNtmiSourcePreview(record)), api: hash(previews.getNtmiSourcePreview(normalized(record))) }])), products, modelOutputs, iconOutputs, executionManifest: hash(choices.transformerExecutionChoicesManifest),
    legacyIds: data.baselineOfficialProducts.map(record => record.id), identities: hash(panels.catalogIdentityCompletion) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Supply checkout and output file');
  fs.writeFileSync(process.argv[3], `${JSON.stringify(await measurementColumnAssetSnapshot(path.resolve(process.argv[2])), null, 2)}\n`);
}
