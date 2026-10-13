// Deterministic CPU projection of actual meshes, NOT a WebGL/browser verification.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import sharp from 'sharp';
import { transformer2026Types } from '../lib/catalog/models/transformer2026Types.js';
import { createTransformer2026Geometry, disposeTransformer2026Geometry } from '../lib/catalog/models/transformer2026Geometry.js';
import { transformer2026IconDefinitions, renderTransformer2026Icon } from '../lib/catalog/models/transformer2026Icons.js';
import { rasterizeEquipment } from './helpers/rasterize-equipment.mjs';
const output = path.resolve(process.argv[2] || '../docs/catalog-transformers-2026/assets/qa');
await mkdir(output, { recursive: true });
const results = [], tiles = [], icons = [];
const camera = new THREE.PerspectiveCamera(36, 460 / 340, .1, 50);
for (const [type, definition] of Object.entries(transformer2026Types)) {
  const model = createTransformer2026Geometry(type), center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()), views = [];
  for (const [view, position] of [['perspective', [4.3, center.y + 2.2, 6.4]], ['front', [0, center.y + .2, 7.4]], ['end', [7.4, center.y + .1, 0]], ['plan', [0, center.y + 8, .001]]]) {
    camera.position.set(...position); camera.lookAt(0, center.y, 0); camera.updateMatrixWorld();
    const raster = rasterizeEquipment(model, camera), png = await sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: raster.channels } }).png().toBuffer();
    await writeFile(path.join(output, `${type}-${view}.png`), png);
    let ink = 0, edge = 0;
    for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) { const i = (y * raster.width + x) * raster.channels; if (Math.abs(raster.data[i] - 245) + Math.abs(raster.data[i + 1] - 245) + Math.abs(raster.data[i + 2] - 240) > 36) { ink++; if (x < 2 || y < 2 || x >= raster.width - 2 || y >= raster.height - 2) edge++; } }
    assert.ok(ink > 700, `${type}/${view}: blank`); assert.equal(edge, 0, `${type}/${view}: clipped`); views.push({ view, visiblePixels: ink, edgePixels: edge });
    if (view === 'perspective') {
      const title = `<svg width="480" height="410"><rect width="480" height="410" fill="white"/><text x="10" y="22" font-family="sans-serif" font-size="13">${type}</text><text x="10" y="398" font-family="sans-serif" font-size="11">Pages ${definition.pages.join(', ')} | Illustrative topology, not CAD</text></svg>`;
      const icon = await sharp(Buffer.from(renderTransformer2026Icon(type, 56))).png().toBuffer();
      tiles.push(await sharp(Buffer.from(title)).composite([{ input: png, left: 10, top: 32 }, { input: icon, left: 407, top: 318 }]).png().toBuffer());
    }
  }
  results.push({ type, sourcePages: definition.pages, views }); disposeTransformer2026Geometry(model);
}
for (let first = 0; first < tiles.length; first += 9) {
  const selected = tiles.slice(first, first + 9);
  await sharp({ create: { width: 1460, height: Math.ceil(selected.length / 3) * 420, channels: 3, background: '#e8ebeb' } }).composite(selected.map((input, i) => ({ input, left: (i % 3) * 490, top: Math.floor(i / 3) * 420 }))).png().toFile(path.join(output, `models-${first + 1}-${first + selected.length}.png`));
}
for (const type of Object.keys(transformer2026IconDefinitions)) {
  const png = await sharp(Buffer.from(renderTransformer2026Icon(type, 128))).png().toBuffer();
  const svg = `<svg width="230" height="180"><rect width="230" height="180" fill="white"/><text x="8" y="169" font-family="sans-serif" font-size="9">${type}</text></svg>`;
  icons.push(await sharp(Buffer.from(svg)).composite([{ input: png, left: 51, top: 12 }]).png().toBuffer());
}
await sharp({ create: { width: 1200, height: Math.ceil(icons.length / 5) * 190, channels: 3, background: '#e8ebeb' } }).composite(icons.map((input, i) => ({ input, left: (i % 5) * 240, top: Math.floor(i / 5) * 190 }))).png().toFile(path.join(output, 'icons.png'));
await writeFile(path.join(output, 'render-report.json'), `${JSON.stringify({ renderer: 'CPU z-buffer rasterization of actual Three.js geometry', limitation: 'No WebGL, interactive controls, GPU shading or browser lifecycle validation. Source pages visually reviewed independently.', geometryCount: results.length, iconCount: icons.length, results }, null, 2)}\n`);
console.log(`Rendered ${results.length} topologies in four views and ${icons.length} icons: ${output}`);
