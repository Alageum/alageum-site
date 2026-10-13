import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { accessory2026Types, accessory2026TypeIds, resolveAccessory2026Type } from '../lib/catalog/models/accessory2026Types.js';
import { createAccessory2026Geometry, disposeAccessory2026Geometry } from '../lib/catalog/models/accessory2026Geometry.js';
import { renderAccessory2026Icon } from '../lib/catalog/models/accessory2026Icons.js';
import { disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';

const select = (model, name) => { const found = []; model.traverse(object => { if (object.name === name) found.push(object); }); return found; };
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('page-85 source is hash-verified and only the three proposed exteriors resolve', () => {
  assert.equal(createHash('sha256').update(readFileSync(new URL('../public/catalog-source/transformers-2026/page-085.webp', import.meta.url))).digest('hex'), '330a52d933cf91f7a00769eeee856bcd3f989a26d6906af2d168039486b649c2');
  assert.deepEqual(accessory2026TypeIds, ['tr26-accessory-relay-tr100', 'tr26-accessory-probe-pt100', 'tr26-accessory-damper-ek290']);
  for (const type of accessory2026TypeIds) { assert.equal(resolveAccessory2026Type(type), type); assert.equal(accessory2026Types[type].runtimeEligible, false); assert.deepEqual(accessory2026Types[type].pages, [85]); }
  for (const type of [null, undefined, {}, '__proto__', 'toString', 'oil-transformer', 'pt100', 'alageum-2026-relay-tr100']) {
    assert.equal(resolveAccessory2026Type(type), null); assert.equal(renderAccessory2026Icon(type), null); assert.throws(() => createAccessory2026Geometry(type), RangeError);
  }
});

test('all geometries contain finite visible triangles, fit the existing camera and disclose limits', () => {
  for (const type of accessory2026TypeIds) {
    const model = createAccessory2026Geometry(type), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    close(Math.max(size.x, size.y, size.z), 2.8); close(bounds.min.y, 0);
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
    assert.equal(model.userData.dimensionAccurate, false); assert.equal(model.userData.exactMeshReuseAllowed, false); assert.equal(model.userData.runtimeEligible, false); assert.match(model.userData.disclosure, /не CAD/);
    let triangles = 0;
    model.traverse(object => {
      if (!object.isMesh) return;
      assert.ok(object.name); assert.ok(object.material.opacity === 1 && !object.material.transparent);
      const position = object.geometry.getAttribute('position'), normal = object.geometry.getAttribute('normal');
      assert.ok([...position.array].every(Number.isFinite)); assert.ok([...normal.array].every(Number.isFinite));
      assert.ok(object.matrixWorld.elements.every(Number.isFinite));
      triangles += (object.geometry.index?.count || position.count) / 3;
      assert.equal(object.material.map, null);
    });
    assert.ok(triangles > 50 && triangles < 16000, `${type}: ${triangles}`);
    disposeAccessory2026Geometry(model);
  }
});

test('TR-100 keeps source-visible face groups and recesses with no fabricated terminal count', () => {
  const model = createAccessory2026Geometry('tr26-accessory-relay-tr100');
  assert.equal(select(model, 'status-light').length, 5); assert.equal(select(model, 'channel-light').length, 4);
  assert.equal(select(model, 'lower-face-button').length, 3); assert.equal(select(model, 'right-face-button').length, 2);
  const panel = select(model, 'relay-face-panel')[0], display = select(model, 'blank-display')[0];
  assert.ok(display.position.z > panel.position.z);
  for (const feature of ['status-light', 'channel-light', 'lower-face-button', 'right-face-button']) for (const item of select(model, feature)) assert.ok(item.position.z > panel.position.z);
  assert.ok(select(model, 'upper-terminal-band-recess')[0].position.y > panel.position.y + .79 / 2);
  assert.ok(select(model, 'lower-terminal-band-recess')[0].position.y < panel.position.y - .79 / 2);
  assert.ok(select(model, 'upper-terminal-band-recess')[0].position.z < panel.position.z);
  model.traverse(object => assert.doesNotMatch(object.name, /terminal-contact|terminal-screw|din-clip|rear-port|digit/));
  disposeAccessory2026Geometry(model);
});

test('pictured PT100 is one probe continuously joined to cable, sleeve and three lead ends', () => {
  const model = createAccessory2026Geometry('tr26-accessory-probe-pt100');
  const probe = select(model, 'single-metal-probe'), collar = select(model, 'visible-probe-collar')[0], cable = select(model, 'continuous-coiled-cable')[0], sleeve = select(model, 'visible-end-sleeve')[0];
  assert.equal(probe.length, 1); assert.deepEqual(probe[0].userData.endpoints[1], collar.userData.endpoints[0]);
  assert.deepEqual(collar.userData.endpoints[1], cable.userData.endpoints[0]); assert.deepEqual(cable.userData.endpoints[1], sleeve.userData.endpoints[0]);
  // Verify the actual TubeGeometry curve ends as well as the descriptive metadata.
  assert.deepEqual(cable.geometry.parameters.path.getPoint(0).toArray(), collar.userData.endpoints[1]);
  assert.ok(cable.geometry.parameters.path.getPoint(1).distanceTo(new THREE.Vector3(...sleeve.userData.endpoints[0])) < 1e-8);
  const leads = select(model, 'visible-free-lead'), tips = select(model, 'visible-lead-tip'); assert.equal(leads.length, 3); assert.equal(tips.length, 3);
  for (let i = 0; i < leads.length; i++) {
    assert.deepEqual(leads[i].userData.endpoints[0], sleeve.userData.endpoints[1]); assert.deepEqual(leads[i].userData.endpoints[1], tips[i].userData.endpoints[0]);
  }
  assert.equal(cable.userData.coilArrangementIsIllustrative, true);
  model.traverse(object => assert.doesNotMatch(object.name, /flange|thread|connector|terminal-block/));
  disposeAccessory2026Geometry(model);
});

test('EK-290 has a real open near mounting hole and a depressed opaque seat, without guessed rear holes', () => {
  const model = createAccessory2026Geometry('tr26-accessory-damper-ek290');
  const flange = select(model, 'flange-with-one-visible-hole')[0], body = select(model, 'opaque-support-with-concave-seat')[0], seat = select(model, 'visible-inset-seat-surface')[0];
  assert.equal(flange.geometry.parameters.shapes.holes.length, 1);
  model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const hitAt = (x, z, target) => {
    const origin = model.localToWorld(new THREE.Vector3(x, 2, z)); ray.set(origin, down); return ray.intersectObject(target, false);
  };
  assert.equal(hitAt(0, 1.32, flange).length, 0, 'mounting hole must be genuinely open');
  assert.ok(hitAt(.24, 1.32, flange).length > 0, 'adjacent flange must be solid');
  const middle = hitAt(0, 0, seat)[0], end = hitAt(0, .85, seat)[0]; assert.ok(middle && end);
  assert.ok(end.point.y > middle.point.y + .1, 'upper seat must be concave');
  assert.ok(hitAt(.45, 0, body).length > 0, 'outer support remains opaque');
  assert.equal(model.children.length, 3); model.traverse(object => assert.doesNotMatch(object.name, /rear-hole|spring|rubber-layer|wheel|bolt/));
  disposeAccessory2026Geometry(model);
});

test('both dedicated and existing generic disposers free every resource exactly once per instance', () => {
  for (const dispose of [disposeAccessory2026Geometry, disposeEquipmentGeometry]) for (const type of accessory2026TypeIds) {
    const model = createAccessory2026Geometry(type), other = createAccessory2026Geometry(type), resources = new Set(model.userData.materials), otherResources = new Set(other.userData.materials);
    model.traverse(object => { if (object.geometry) resources.add(object.geometry); });
    other.traverse(object => { if (object.geometry) otherResources.add(object.geometry); });
    for (const resource of resources) assert.ok(!otherResources.has(resource));
    const counts = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
    dispose(model); assert.equal(counts.size, resources.size); assert.ok([...counts.values()].every(count => count === 1)); assert.equal(model.children.length, 0);
    assert.ok(other.children.length > 0); dispose(other);
  }
});

test('three distinct pure-vector icons rasterize at listing and detail sizes without clipping', async () => {
  const hashes = new Set();
  for (const type of accessory2026TypeIds) for (const size of [32, 64, 128]) {
    const svg = renderAccessory2026Icon(type, size, accessory2026Types[type].name);
    assert.doesNotMatch(svg, /<image|<img|NaN|undefined|Infinity/); assert.match(svg, /role="img"/);
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let ink = 0, edge = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[(y * size + x) * info.channels + 3] > 40) { ink++; if (!x || !y || x === size - 1 || y === size - 1) edge++; }
    assert.ok(ink > size * 2); assert.equal(edge, 0, `${type}/${size}: clipped`);
    if (size === 128) hashes.add(createHash('sha256').update(data).digest('hex'));
  }
  assert.equal(hashes.size, 3);
  assert.ok(renderAccessory2026Icon(accessory2026TypeIds[0], 64, '<script>"&').includes('&lt;script&gt;&quot;&amp;'));
  for (const size of [0, -1, Infinity, NaN, 2049]) assert.throws(() => renderAccessory2026Icon(accessory2026TypeIds[0], size), RangeError);
  assert.doesNotMatch(readFileSync(new URL('../lib/catalog/models/accessory2026Icons.js', import.meta.url), 'utf8'), /from ['"]three|<image/);
});
