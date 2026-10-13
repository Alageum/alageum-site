// Offline inspection aid only: orthographic CPU triangle projection, not a viewer
// or a substitute for hosted WebGL QA. No browser, canvas or network is used.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import sharp from 'sharp';
import { MEASUREMENT_COLUMN_2026_TYPE, measurementColumn2026Types } from '../lib/catalog/models/measurementColumn2026Types.js';
import { createMeasurementColumn2026Geometry, disposeMeasurementColumn2026Geometry } from '../lib/catalog/models/measurementColumn2026Geometry.js';
import { renderMeasurementColumn2026Icon } from '../lib/catalog/models/measurementColumn2026Icons.js';

const prototypeTypes = [MEASUREMENT_COLUMN_2026_TYPE];
const destination = resolve(process.argv[2] || 'tmp/measurement-column-prototype');
await mkdir(destination, { recursive: true });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const views = [['Long elevation', [0, 1.4, 8]], ['Short elevation / visible indicator', [-8, 1.4, 0]], ['Plan / printed orientation', [0, 9.4, .00001]], ['Oblique', [4, 4.2, 6]], ['Opposite oblique', [-4, 4.2, -6]], ['Plan oblique / cover fittings', [-3, 8, 4]]];
const cellW = 480, cellH = 480;
const output = [];
const composites = [];

for (const [row, type] of prototypeTypes.entries()) {
  const model = createMeasurementColumn2026Geometry(type); model.updateMatrixWorld(true);
  for (const [column, [name, eye]] of views.entries()) {
    const halfHeight = 1.85, halfWidth = halfHeight * cellW / (cellH - 64);
    const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, .1, 100);
    if (column === 2) { camera.zoom = 1.9; camera.updateProjectionMatrix(); }
    camera.position.set(...eye); camera.lookAt(0, 1.4, 0); camera.updateMatrixWorld(true);
    const rasterW = cellW * 2, rasterH = cellH * 2, pixels = Buffer.alloc(rasterW * rasterH * 4), depths = new Float64Array(rasterW * rasterH).fill(Infinity);
    for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 246; pixels[i + 1] = 247; pixels[i + 2] = 245; pixels[i + 3] = 255; }
    model.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry, position = geometry.getAttribute('position'), count = geometry.index?.count || position.count;
      const matrix = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
      for (let i = 0; i < count; i += 3) {
        const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(i + j) : i + j).applyMatrix4(matrix));
        const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
        if (normal.z <= 1e-9) continue;
        normal.normalize();
        const shade = object.material.color.clone().multiplyScalar(.5 + .5 * Math.max(0, normal.dot(new THREE.Vector3(-.4, .7, 1).normalize())));
        shade.convertLinearToSRGB();
        const projected = vertices.map(v => v.applyMatrix4(camera.projectionMatrix)).map(v => [((v.x + 1) * cellW / 2), ((1 - v.y) * (cellH - 64) / 2 + 40), v.z]);
        // Per-pixel depth buffering avoids painter-sort artifacts on intersecting
        // screen-space triangles and allows inspection of the actual open hole.
        const [a, b, c] = projected.map(v => [v[0] * 2, v[1] * 2, v[2]]);
        const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        if (Math.abs(denominator) < 1e-10) continue;
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(rasterW - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(rasterH - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const wa = ((b[1] - c[1]) * (x + .5 - c[0]) + (c[0] - b[0]) * (y + .5 - c[1])) / denominator;
          const wb = ((c[1] - a[1]) * (x + .5 - c[0]) + (a[0] - c[0]) * (y + .5 - c[1])) / denominator, wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const z = wa * a[2] + wb * b[2] + wc * c[2], index = y * rasterW + x;
          if (z >= depths[index]) continue;
          depths[index] = z; pixels[index * 4] = Math.round(shade.r * 255); pixels[index * 4 + 1] = Math.round(shade.g * 255); pixels[index * 4 + 2] = Math.round(shade.b * 255);
        }
      }
    });
    output.push(`<g transform="translate(${(column % 3) * cellW} ${(row * 2 + Math.floor(column / 3)) * cellH})"><rect width="${cellW}" height="${cellH}" fill="none" stroke="#dce1dc"/><text x="15" y="23" font-family="sans-serif" font-size="14" fill="#24343a">${escape('ZOM / ZNOM')} · ${escape(name)}</text></g>`);
    const png = await sharp(pixels, { raw: { width: rasterW, height: rasterH, channels: 4 } }).resize(cellW, cellH).png().toBuffer();
    await writeFile(`${destination}/view-${column + 1}.png`, png);
    composites.push({ input: png, left: (column % 3) * cellW, top: (row * 2 + Math.floor(column / 3)) * cellH });
  }
  const icon = renderMeasurementColumn2026Icon(type, 256, measurementColumn2026Types[type].name);
  await writeFile(`${destination}/${type}.svg`, icon);
  await sharp(Buffer.from(icon)).flatten({ background: '#fff' }).png().toFile(`${destination}/${type}.png`);
  disposeMeasurementColumn2026Geometry(model);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW * 3}" height="${cellH * 2}" viewBox="0 0 ${cellW * 3} ${cellH * 2}">${output.join('')}</svg>`;
composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
await sharp({ create: { width: cellW * 3, height: cellH * 2, channels: 4, background: '#f6f7f5' } }).composite(composites).png().toFile(`${destination}/geometry-contact-sheet.png`);
const iconSizes = [28, 32, 40, 48, 56, 64, 96, 148];
const iconSheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="260"><rect width="1280" height="260" fill="white"/>${iconSizes.map((size, i) => `<g transform="translate(${i * 160} 0)"><text x="15" y="25" font-family="sans-serif" font-size="16">${size}px</text><g transform="translate(${(160-size)/2} 65)">${renderMeasurementColumn2026Icon(MEASUREMENT_COLUMN_2026_TYPE, size)}</g></g>`).join('')}</svg>`;
await writeFile(`${destination}/icon-contact-sheet.svg`, iconSheet);
await sharp(Buffer.from(iconSheet)).png().toFile(`${destination}/icon-contact-sheet.png`);
console.log(`Wrote static inspection sheets and one reusable SVG icon to ${destination}`);
