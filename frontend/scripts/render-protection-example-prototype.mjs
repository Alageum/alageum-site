// Standalone offline source/geometry inspection; no runtime registration.
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import sharp from 'sharp';
import { protectionExampleTypes, PTM_SOURCE_EXAMPLE_TYPE, PAIRED_PROTECTION_EXAMPLE_ICON_TYPE, protectionExampleFamilyIconContext } from '../lib/catalog/models/protectionExampleTypes.js';
import { createProtectionExampleGeometry, disposeProtectionExampleGeometry } from '../lib/catalog/models/protectionExampleGeometry.js';
import { protectionExampleIconDefinitions, renderProtectionExampleIcon } from '../lib/catalog/models/protectionExampleIcons.js';
import { rasterizeEquipment } from './helpers/rasterize-equipment.mjs';

const destination = resolve(process.argv[2] || 'tmp/protection-example-prototype');
await mkdir(destination, { recursive: true });
const source = fileURLToPath(new URL('../public/catalog-source/page-069.webp', import.meta.url));
await copyFile(source, `${destination}/page-069.webp`);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const views = [
  ['Front projection', [0, 0, 8]], ['Right side projection', [8, 0, 0]], ['Front oblique', [5, 3, 7]],
  ['Rear schematic closure', [0, 0, -8]], ['Opposite oblique', [-5, 3, -7]], ['Top oblique', [3, 7, 4]],
];
const width = 480, height = 380, titleHeight = 50, footerHeight = 164;
const report = { renderer: 'CPU z-buffer of actual prototype Three.js triangles; actual vector icon SVG', browserOrWebGLClaim: false, runtimeEligible: false, views: [], icons: [], sourceCrops: [] };
const html = [];
for (const [type, definition] of Object.entries(protectionExampleTypes)) {
  const isPtm = type === PTM_SOURCE_EXAMPLE_TYPE;
  const crop = isPtm ? { left: 295, top: 1030, width: 875, height: 430 } : { left: 295, top: 1455, width: 875, height: 415 };
  await sharp(source).extract(crop).png().toFile(`${destination}/${type}-source.png`);
  report.sourceCrops.push({ type, source: definition.sourcePageImage, ...crop, operation: 'crop only; no synthesis' });
  const model = createProtectionExampleGeometry(type);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  const composites = [], labels = [];
  for (const [index, [label, offset]] of views.entries()) {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 100);
    camera.position.set(offset[0], center.y + offset[1], offset[2]); camera.lookAt(center); camera.updateMatrixWorld(true);
    // Fit the transformed bounding-box corners with margin in every view.
    // This prevents diagonal/top views silently cropping the cap or supports.
    let halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      halfHeight = Math.max(halfHeight, Math.abs(point.y), Math.abs(point.x) * height / width);
    }
    halfHeight *= 1.23;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.left = -halfHeight * width / height; camera.right = -camera.left; camera.updateProjectionMatrix();
    const raster = rasterizeEquipment(model, camera, width * 2, height * 2);
    for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
      if (x >= 5 && y >= 5 && x < raster.width - 5 && y < raster.height - 5) continue;
      const i = (y * raster.width + x) * raster.channels;
      if (raster.data[i] !== 245 || raster.data[i + 1] !== 245 || raster.data[i + 2] !== 240) throw new Error(`Clipped model: ${type}/${label}`);
    }
    const filename = `${type}-view-${index + 1}.png`;
    const png = await sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: raster.channels } }).resize(width, height).png().toBuffer();
    await writeFile(`${destination}/${filename}`, png);
    const left = index % 3 * width, top = titleHeight + Math.floor(index / 3) * height;
    composites.push({ input: png, left, top });
    labels.push(`<g transform="translate(${left} ${top})"><rect width="${width}" height="${height}" fill="none" stroke="#d4d4d4"/><text x="15" y="25">${escape(label)}</text></g>`);
    report.views.push({ type, view: label, filename, unclippedMarginVerified: true });
  }
  const noteLines = [
    'Упрощённая иллюстрация примера из каталога. Не CAD.',
    'Мелкие элементы бокового вида и их пространственное расположение воспроизведены не полностью;',
    'см. исходный чертёж на стр. 69. Размеры, материалы и комплектация исполнения не утверждаются.',
    isPtm ? 'Опущены: малый боковой прямоугольник, короткие элементы под козырьком, точная конструкция опор.' : 'Опущены: два верхних круглых элемента бокового вида, боковой прямоугольник, нижний боковой выступ.',
    'CPU views only • neutral schematic shading • source: /catalog/source?page=69 • runtimeEligible: false',
  ];
  const sheetHeight = titleHeight + height * 2 + footerHeight;
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * 3}" height="${sheetHeight}"><g font-family="sans-serif" font-size="18" fill="#282828"><text x="18" y="31">${escape(definition.name)} · OFFLINE PROTOTYPE</text>${labels.join('')}${noteLines.map((line, index) => `<text x="18" y="${titleHeight + height * 2 + 28 + index * 27}" font-size="17">${escape(line)}</text>`).join('')}</g></svg>`;
  composites.push({ input: Buffer.from(overlay), left: 0, top: 0 });
  await sharp({ create: { width: width * 3, height: sheetHeight, channels: 3, background: '#fafafa' } }).composite(composites).png().toFile(`${destination}/${type}-geometry-sheet.png`);
  const svg = renderProtectionExampleIcon(type, 256, definition.name);
  await writeFile(`${destination}/${type}-icon.svg`, svg);
  await sharp(Buffer.from(svg)).flatten({ background: '#fff' }).png().toFile(`${destination}/${type}-icon.png`);
  report.icons.push({ type, svg: `${type}-icon.svg`, png: `${type}-icon.png` });
  html.push(`<section><h2>${escape(definition.name)}</h2><p>${escape(definition.disclosure)}</p><p>${escape(definition.simplification)}</p><p>Omitted: ${escape(definition.omittedFeatures.join('; '))}.</p><img class="source" src="${type}-source.png" alt="Unaltered crop of the labelled source projections"><img src="${type}-geometry-sheet.png" alt="Six CPU geometry views with explicit source limitations"><img class="icon" src="${type}-icon.svg" alt="Simplified front-only icon"></section>`);
  disposeProtectionExampleGeometry(model);
}
const sizes = [28, 32, 40, 48, 56, 64, 96, 148];
const familySvg = renderProtectionExampleIcon(PAIRED_PROTECTION_EXAMPLE_ICON_TYPE, 256, protectionExampleIconDefinitions[PAIRED_PROTECTION_EXAMPLE_ICON_TYPE].name);
await writeFile(`${destination}/${PAIRED_PROTECTION_EXAMPLE_ICON_TYPE}.svg`, familySvg);
await sharp(Buffer.from(familySvg)).flatten({ background: '#fff' }).png().toFile(`${destination}/${PAIRED_PROTECTION_EXAMPLE_ICON_TYPE}.png`);
report.icons.push({ type: PAIRED_PROTECTION_EXAMPLE_ICON_TYPE, svg: `${PAIRED_PROTECTION_EXAMPLE_ICON_TYPE}.svg`, png: `${PAIRED_PROTECTION_EXAMPLE_ICON_TYPE}.png`, iconOnly: true, futureConsumer: 'cat-ptm-tded' });
html.push(`<section><h2>Paired family icon only</h2><p>${escape(protectionExampleFamilyIconContext.disclosure)}</p><p>Future consumer: cat-ptm-tded only. No family model; no runtime binding. Composed exclusively from the two corrected front symbols.</p><img class="icon" src="${PAIRED_PROTECTION_EXAMPLE_ICON_TYPE}.svg" alt="Two separate source example front views"></section>`);
const iconSheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="735"><rect width="1280" height="735" fill="white"/>${Object.entries(protectionExampleIconDefinitions).map(([type, definition], row) => `<g transform="translate(0 ${row * 245})"><text x="15" y="25" font-family="sans-serif" font-size="17">${escape(definition.name)} · front projection only</text>${sizes.map((size, i) => `<g transform="translate(${i * 160} 32)"><text x="15" y="25" font-family="sans-serif" font-size="16">${size}px</text><g transform="translate(${(160 - size) / 2} 57)">${renderProtectionExampleIcon(type, size)}</g></g>`).join('')}</g>`).join('')}</svg>`;
await writeFile(`${destination}/icon-contact-sheet.svg`, iconSheet);
await sharp(Buffer.from(iconSheet)).png().toFile(`${destination}/icon-contact-sheet.png`);
await writeFile(`${destination}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><title>PTM / TDE isolated source examples</title><style>body{font:17px/1.5 system-ui;max-width:1440px;margin:30px auto;padding:0 20px;color:#222}img{max-width:100%;display:block;margin:20px 0}.source{max-width:875px}.icon{width:148px}section{margin:55px 0;border-top:1px solid #bbb}</style><h1>PTM / TDE source-example prototypes</h1><p>Offline only: two model archetypes and three icons, including one icon-only family comparison. None is runtime eligible. No records, default mappings or confidence counts changed.</p><p>The full source drawing remains authoritative: <a href="page-069.webp">original page 69</a>. Future application links: /catalog/source?page=69 and /catalog-source/page-069.webp.</p>${html.join('')}<h2>Listing sizes</h2><img src="icon-contact-sheet.png" alt="Three front-only icons at eight listing sizes"><p>CPU rendering only: no browser, GPU, WebGL, manufacturing or material equivalence claim.</p></html>`);
await writeFile(`${destination}/render-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ destination, geometryViews: report.views.length, icons: report.icons.length, browserOrWebGLClaim: false }));
