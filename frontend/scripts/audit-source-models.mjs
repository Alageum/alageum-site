// Local WebGL visual audit. No network or catalogue data writes.
// node scripts/audit-source-models.mjs /tmp/catalog-model-qa
// CHROMIUM_EXECUTABLE may select an installed Chromium; otherwise Playwright's default.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || '/tmp/catalog-model-qa');
await mkdir(output, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><title>Source construction geometry audit</title>
<style>body{margin:20px;background:#eee;font:14px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.tile{background:white;padding:10px}img{display:block;width:100%}h2{font-size:13px;margin:8px 0}p{font-size:11px;color:#555}</style>
<h1>Illustrative source constructions · not CAD</h1><main></main>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '/lib/catalog/models/geometry.js';
import { sourceConstructionDefinitions } from '/lib/catalog/models/sourceConstructions.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(460,340);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xf5f5f0);
scene.add(new THREE.HemisphereLight(0xffffff,0x747e88,2.2));
const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(4,7,5);scene.add(key);
const fill=new THREE.DirectionalLight(0xd9e8ee,1.1);fill.position.set(-4,3,-3);scene.add(fill);
const camera=new THREE.PerspectiveCamera(36,460/340,.1,50);
window.results=[];
for(const [type,definition] of Object.entries(sourceConstructionDefinitions)) {
 const model=createEquipmentGeometry(type);scene.add(model);
 const center=new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
 camera.position.set(4.3,center.y+2.2,6.4);camera.lookAt(0,center.y,0);
 renderer.render(scene,camera);
 const raster=renderer.domElement.toDataURL('image/png');
 const tile=document.createElement('section');tile.className='tile';
 const heading=document.createElement('h2');heading.textContent=type;tile.append(heading);
 const image=document.createElement('img');image.src=raster;tile.append(image);
 const caption=document.createElement('p');caption.textContent='Source pages '+definition.sourcePages.join(', ')+' · '+definition.recordIds.length+' independent records';tile.append(caption);
 document.querySelector('main').append(tile);
 window.results.push({type,raster,triangles:renderer.info.render.triangles,meshCount:model.children.filter(x=>x.isMesh).length});
 scene.remove(model);disposeEquipmentGeometry(model);
}
renderer.dispose();window.auditReady=true;
</script>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}/`) || !(pathname.startsWith('/lib/catalog/models/') || pathname.startsWith('/node_modules/three/build/'))) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.auditReady, undefined, { timeout: 60000 });
  assert.deepEqual(errors, []);
  const results = await page.evaluate(() => window.results);
  assert.equal(results.length, 33);
  for (const result of results) {
    const raster = Buffer.from(result.raster.split(',')[1], 'base64');
    await writeFile(path.join(output, `${result.type}.png`), raster);
    const { data, info } = await sharp(raster).raw().toBuffer({ resolveWithObject: true });
    let ink = 0, edge = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.abs(data[i] - 245) + Math.abs(data[i + 1] - 245) + Math.abs(data[i + 2] - 240) > 36) {
        ink++; if (x < 2 || y < 2 || x >= info.width - 2 || y >= info.height - 2) edge++;
      }
    }
    assert.ok(ink > 1200, `${result.type}: nearly blank rendering (${ink} pixels)`);
    assert.equal(edge, 0, `${result.type}: clipped rendering`);
    delete result.raster; result.visiblePixels = ink; result.edgePixels = edge;
  }
  await page.screenshot({ path: path.join(output, 'all-models.png'), fullPage: true });
  for (let first = 0; first < results.length; first += 9) {
    await page.evaluate(({ first }) => document.querySelectorAll('.tile').forEach((tile, i) => { tile.style.display = i >= first && i < first + 9 ? '' : 'none'; }), { first });
    await page.screenshot({ path: path.join(output, `models-${first + 1}-${Math.min(first + 9, results.length)}.png`), fullPage: true });
  }
  await writeFile(path.join(output, 'render-report.json'), `${JSON.stringify({ renderer: 'Chromium WebGL / software ANGLE', results, errors }, null, 2)}\n`);
  console.log(`Rendered ${results.length} source constructions, no clipped/blank frames or page errors. Output: ${output}`);
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
