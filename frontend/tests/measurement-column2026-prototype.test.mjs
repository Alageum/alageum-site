import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { MEASUREMENT_COLUMN_2026_TYPE as TYPE, measurementColumn2026Types, measurementColumn2026SourceContexts, resolveMeasurementColumn2026Type } from '../lib/catalog/models/measurementColumn2026Types.js';
import { createMeasurementColumn2026Geometry, disposeMeasurementColumn2026Geometry } from '../lib/catalog/models/measurementColumn2026Geometry.js';
import { measurementColumn2026IconDefinitions, renderMeasurementColumn2026Icon } from '../lib/catalog/models/measurementColumn2026Icons.js';
import { disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
const select = (model, name) => { const matches = []; model.traverse(object => { if (object.name === name) matches.push(object); }); return matches; };
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const create = () => createMeasurementColumn2026Geometry(TYPE);

test('one proposed type, three distinct evidence contexts and unchanged reviewed source/baseline modules', () => {
  assert.deepEqual(Object.keys(measurementColumn2026Types), [TYPE]);
  assert.equal(resolveMeasurementColumn2026Type(TYPE), TYPE);
  assert.deepEqual(measurementColumn2026SourceContexts.map(({ recordId, page }) => [recordId, page]), [
    ['alageum-2026-zom-1p25-35', 99], ['alageum-2026-znom35-config1', 100], ['alageum-2026-znom35-config2', 100],
  ]);
  assert.equal(measurementColumn2026Types[TYPE].runtimeEligible, false);
  assert.equal(measurementColumn2026Types[TYPE].dimensionAccurate, false);
  for (const type of [undefined, null, {}, '__proto__', 'tr26-instrument-column', ...measurementColumn2026SourceContexts.map(context => context.recordId)]) {
    assert.equal(resolveMeasurementColumn2026Type(type), null); assert.equal(renderMeasurementColumn2026Icon(type), null);
    assert.throws(() => createMeasurementColumn2026Geometry(type), RangeError);
  }
  const baseline = {
    '../public/catalog-source/transformers-2026/page-099.webp': '92c80ddbdcdf228d8c96256ee9d3cc4a7072302899476f9cda964ca7ef76865a',
    '../public/catalog-source/transformers-2026/page-100.webp': '10af5bac68e0c1982c9c83667585d6e66a5b40e935d217c19770ac84a46f4bc1',
    '../lib/catalog/models/transformer2026Types.js': '56ee5e7de958abeae364b565d8799430fc33b7fb25ca5f2cb665d17db020b9a8',
    '../lib/catalog/models/transformer2026Geometry.js': '32f91701425584f0bfa4e7b138525329fb6527588344fc5a574ed8dea7f0ef09',
    '../lib/catalog/models/transformer2026Icons.js': '9e49caab2b69cbb165c4a1b56f12a317d06cc910091cbae39c355bab63cca405',
    '../lib/catalog/models/transformer2026AssetEvidence.json': '6d54c9e8e83409384de5dce6233f306ceeb1bcdcdac384ef57f778251edb519d',
  };
  for (const [path, hash] of Object.entries(baseline)) assert.equal(createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex'), hash);
});

test('native finite opaque mesh fits the existing normalisation/disposal contract', () => {
  const model = create(), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  near(Math.max(size.x, size.y, size.z), 2.8); near(bounds.min.y, 0); near(center.x, 0); near(center.z, 0);
  assert.ok(size.x > 0 && size.z > 0);
  assert.equal(model.userData.units, 'arbitrary-scene-units'); assert.equal(model.userData.runtimeEligible, false);
  assert.equal(model.userData.dimensionAccurate, false); assert.equal(model.userData.exactMeshReuseAllowed, false);
  assert.deepEqual(model.userData.sourcePages, [99, 100]); assert.match(model.userData.disclosure, /Не CAD/);
  let triangles = 0;
  model.traverse(object => {
    assert.doesNotMatch(object.name, /lv|hv|cutaway|rail|wheel|internal|winding|hidden|rear-fitting/);
    if (!object.isMesh) return;
    assert.ok(object.material.isMeshStandardMaterial); assert.equal(object.material.transparent, false); assert.equal(object.material.opacity, 1); assert.equal(object.material.map, null);
    const position = object.geometry.getAttribute('position'), normal = object.geometry.getAttribute('normal');
    assert.ok([...position.array, ...normal.array, ...object.matrixWorld.elements].every(Number.isFinite));
    triangles += (object.geometry.index?.count || position.count) / 3;
  });
  assert.ok(triangles > 5000 && triangles < 20000, `triangle budget: ${triangles}`);
  disposeMeasurementColumn2026Geometry(model);
});

test('closed tank keeps the rectangular long elevation and tapered lower short-axis walls', () => {
  const model = create(), tank = select(model, 'opaque-tank-with-short-axis-taper')[0]; model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const hit = (origin, direction) => {
    ray.set(model.localToWorld(new THREE.Vector3(...origin)), new THREE.Vector3(...direction));
    const intersections = ray.intersectObject(tank, false); assert.ok(intersections.length);
    return model.worldToLocal(intersections[0].point);
  };
  const high = hit([0, .75, 2], [0, 0, -1]), low = hit([0, .09, 2], [0, 0, -1]);
  near(high.z, .4); assert.ok(low.z < high.z - .1 && low.z > .245);
  near(hit([2, .09, 0], [-1, 0, 0]).x, hit([2, .75, 0], [-1, 0, 0]).x);
  assert.equal(select(model, 'low-flat-base').length, 1); assert.ok(select(model, 'low-flat-base')[0].geometry.parameters.height < .03);
  // Actual outside rays hit both closures: no source cutaway has become a hole.
  for (const [origin, direction] of [[[0, 2, 0], [0, -1, 0]], [[0, -.5, 0], [0, 1, 0]], [[0, .7, -2], [0, 0, 1]]]) hit(origin, direction);
  disposeMeasurementColumn2026Geometry(model);
});

test('one continuous capped column has exactly five broad major shed levels and no intermediate contact', () => {
  const model = create(), columns = select(model, 'continuous-five-shed-column'); assert.equal(columns.length, 1);
  const geometry = columns[0].geometry; assert.ok(geometry.isBufferGeometry); assert.equal(geometry.type, 'LatheGeometry');
  // Count broad local peaks from actual vertex coordinates, not a declared count.
  const position = geometry.getAttribute('position'), broadLevels = [];
  for (let i = 0; i < position.count; i++) if (Math.hypot(position.getX(i), position.getZ(i)) > .281) broadLevels.push(position.getY(i));
  const levels = [...new Set(broadLevels.map(y => Number(y.toFixed(5))))].sort((a, b) => a - b);
  const separatedBands = levels.filter((y, index) => index === 0 || y - levels[index - 1] > .05);
  assert.equal(separatedBands.length, 5);
  const profile = geometry.parameters.points; assert.equal(profile[0].x, 0); assert.equal(profile.at(-1).x, 0);
  const ray = new THREE.Raycaster(); model.updateMatrixWorld(true);
  // A core is physically present between every shed and into both end joins.
  for (const y of [1.20, 1.52, 1.72, 1.93, 2.14, 2.35]) {
    ray.set(model.localToWorld(new THREE.Vector3(.8, y, 0)), new THREE.Vector3(-1, 0, 0));
    assert.ok(ray.intersectObject(columns[0], false).length, `discontinuous column at ${y}`);
  }
  assert.equal(select(model, 'terminal-contact').length, 0);
  disposeMeasurementColumn2026Geometry(model);
});

test('five neutral cover bushings have the source plan arrangement and five separate contacts', () => {
  const model = create(), bushings = select(model, 'neutral-cover-bushing'); assert.equal(bushings.length, 5);
  assert.equal(select(model, 'cover-bushing-contact').length, 5);
  const map = Object.fromEntries(bushings.map(part => [part.userData.printedPlanPosition, part]));
  const [upper, middle, outer, inner, right] = ['upper-left', 'mid-left', 'lower-left-outer', 'lower-left-inner', 'mid-right'].map(key => map[key]);
  assert.equal(bushings.filter(part => part.position.x < 0).length, 4); assert.equal(bushings.filter(part => part.position.x > 0).length, 1);
  near(upper.position.x, inner.position.x); near(middle.position.x, outer.position.x); near(outer.position.z, inner.position.z);
  assert.ok(outer.position.x < inner.position.x && upper.position.z < middle.position.z && middle.position.z < outer.position.z);
  near(middle.position.z, right.position.z);
  for (const bushing of bushings) {
    assert.equal(bushing.userData.electricalRole, 'unverified');
    assert.equal(select(bushing, 'cover-bushing-contact').length, 1); assert.equal(select(bushing, 'stepped-cover-bushing-body').length, 1);
    assert.ok(bushing.position.x ** 2 + bushing.position.z ** 2 > .302 ** 2);
  }
  for (let i = 0; i < bushings.length; i++) for (let j = i + 1; j < bushings.length; j++) assert.ok(bushings[i].position.distanceTo(bushings[j].position) > .126, 'bushing bodies must be distinct');
  disposeMeasurementColumn2026Geometry(model);
});

test('central upper contact and offset plug are distinct from cover contacts and lifting holes are real', () => {
  const model = create(), top = select(model, 'top-central-contact'), plug = select(model, 'offset-top-plug');
  assert.equal(top.length, 1); assert.equal(plug.length, 1); near(top[0].position.x, 0); near(top[0].position.z, 0);
  assert.ok(plug[0].geometry.parameters.radialSegments >= 32, 'source plug has a circular plan outline');
  assert.ok(plug[0].position.x > .12); near(plug[0].position.z, 0);
  assert.ok(top[0].position.y > plug[0].position.y); assert.ok(plug[0].position.y > select(model, 'opaque-upper-cylindrical-chamber')[0].position.y);
  assert.equal(select(model, 'visible-side-level-indicator-surround').length, 1);
  const ears = select(model, 'visible-lifting-ear'); assert.equal(ears.length, 2); model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const ear of ears) {
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(ear.matrixWorld);
    ray.set(ear.localToWorld(new THREE.Vector3(0, .111, .1)), direction);
    assert.equal(ray.intersectObject(ear, false).length, 0, 'ear centre must be an actual hole');
    ray.set(ear.localToWorld(new THREE.Vector3(.07, .111, .1)), direction);
    assert.ok(ray.intersectObject(ear, false).length, 'plate beside hole must exist');
  }
  disposeMeasurementColumn2026Geometry(model);
});

test('dedicated and existing generic disposers free all isolated resources exactly once per call', () => {
  for (const dispose of [disposeMeasurementColumn2026Geometry, disposeEquipmentGeometry]) {
    const model = create(), other = create(), resources = new Set(model.userData.materials), others = new Set(other.userData.materials);
    model.traverse(object => { if (object.geometry) resources.add(object.geometry); });
    other.traverse(object => { if (object.geometry) others.add(object.geometry); });
    for (const resource of resources) assert.ok(!others.has(resource));
    const counts = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
    dispose(model); assert.equal(counts.size, resources.size); assert.ok([...counts.values()].every(count => count === 1)); assert.equal(model.children.length, 0);
    assert.ok(other.children.length > 0); dispose(other);
    if (dispose === disposeMeasurementColumn2026Geometry) { dispose(model); assert.ok([...counts.values()].every(count => count === 1)); }
  }
});

test('pure vector icon carries five sheds and five cover positions, rasterizes without clipping at listing sizes', async () => {
  const layers = measurementColumn2026IconDefinitions[TYPE].layers;
  assert.equal(layers.filter(item => item.feature.startsWith('major-shed-')).length, 5);
  assert.equal(layers.filter(item => item.feature.startsWith('cover-bushing-')).length, 5);
  assert.equal(layers.filter(item => item.feature === 'central-top-contact').length, 1); assert.equal(layers.filter(item => item.feature === 'offset-plug').length, 1);
  for (const size of [28, 32, 40, 48, 56, 64, 96, 148]) {
    const svg = renderMeasurementColumn2026Icon(TYPE, size, 'ЗОМ / ЗНОМ');
    assert.match(svg, /role="img"/); assert.doesNotMatch(svg, /<image|<img|NaN|Infinity|undefined/);
    const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: '#fff' }).raw().toBuffer({ resolveWithObject: true });
    let ink = 0, edge = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[(y * size + x) * info.channels] < 220) { ink++; if (!x || !y || x === size - 1 || y === size - 1) edge++; }
    assert.ok(ink > size * 1.5); assert.equal(edge, 0, `clipped icon at ${size}px`);
  }
  assert.ok(renderMeasurementColumn2026Icon(TYPE, 64, '<script>"&').includes('&lt;script&gt;&quot;&amp;'));
  for (const size of [0, -1, NaN, Infinity, 2049]) assert.throws(() => renderMeasurementColumn2026Icon(TYPE, size), RangeError);
  for (const filename of ['measurementColumn2026Types.js', 'measurementColumn2026Icons.js']) assert.doesNotMatch(readFileSync(new URL(`../lib/catalog/models/${filename}`, import.meta.url), 'utf8'), /from ['"]three|import.*Geometry|<image/);
});
