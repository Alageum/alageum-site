// CPU z-buffer perspective projection of the actual Three.js meshes. This is NOT WebGL QA.
// Use where the environment cannot launch Chromium. No external requests or writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { rasterizeEquipment } from './helpers/rasterize-equipment.mjs';
import sharp from 'sharp';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
import { sourceConstructionDefinitions } from '../lib/catalog/models/sourceConstructions.js';

const output = path.resolve(process.argv[2] || '/tmp/catalog-model-software-qa');
await mkdir(output, { recursive: true });
const camera = new THREE.PerspectiveCamera(36, 460 / 340, .1, 50);
const results = [], tiles = [];
for (const [type, definition] of Object.entries(sourceConstructionDefinitions)) {
  const model = createEquipmentGeometry(type);
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  const views = [];
  for (const [view, position] of [['perspective', [4.3, center.y + 2.2, 6.4]], ['front', [0, center.y + .2, 7.4]]]) {
    camera.position.set(...position); camera.lookAt(0, center.y, 0); camera.updateMatrixWorld();
    const raster = rasterizeEquipment(model, camera);
    const png = await sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: raster.channels } }).png().toBuffer();
    await writeFile(path.join(output, `${type}-${view}.png`), png);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    let ink = 0, edge = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.abs(data[i] - 245) + Math.abs(data[i + 1] - 245) + Math.abs(data[i + 2] - 240) > 36) {
        ink++; if (x < 2 || y < 2 || x >= info.width - 2 || y >= info.height - 2) edge++;
      }
    }
    assert.ok(ink > 1200, `${type}/${view}: nearly blank (${ink})`);
    assert.equal(edge, 0, `${type}/${view}: clipped rendering`);
    views.push({ view, visiblePixels: ink, edgePixels: edge });
    if (view === 'perspective') {
      const title = `<svg width="480" height="420"><rect width="480" height="420" fill="white"/><text x="12" y="24" font-family="sans-serif" font-size="14">${type}</text><text x="12" y="404" font-family="sans-serif" font-size="12">Source pages ${definition.sourcePages.join(', ')} · Illustrative, not CAD</text></svg>`;
      tiles.push(await sharp(Buffer.from(title)).composite([{ input: png, left: 10, top: 38 }]).png().toBuffer());
    }
  }
  results.push({ type, views }); disposeEquipmentGeometry(model);
}
for (let first = 0; first < tiles.length; first += 9) {
  const selected = tiles.slice(first, first + 9);
  await sharp({ create: { width: 1460, height: Math.ceil(selected.length / 3) * 430, channels: 3, background: '#e9e9e9' } }).composite(selected.map((input, i) => ({ input, left: (i % 3) * 490, top: Math.floor(i / 3) * 430 }))).png().toFile(path.join(output, `models-${first + 1}-${first + selected.length}.png`));
}
await writeFile(path.join(output, 'render-report.json'), `${JSON.stringify({ renderer: 'CPU z-buffer rasterization of actual Three.js geometry', limitation: 'No WebGL, interactive controls, GPU shading or browser lifecycle validation', results }, null, 2)}\n`);
console.log(`Projected ${results.length} constructions in two views, no clipped/blank images. Output: ${output}`);
