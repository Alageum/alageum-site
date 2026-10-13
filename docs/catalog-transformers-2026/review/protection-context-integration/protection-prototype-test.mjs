import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { productById } from '../lib/catalog/data.js';
import { equipmentModelTypes } from '../lib/catalog/models/types.js';
import { equipmentIconTypes, resolveIconType } from '../lib/catalog/models/iconTypes.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';
import { PTM_SOURCE_EXAMPLE_TYPE as PTM, TDE_SOURCE_EXAMPLE_TYPE as TDE, PAIRED_PROTECTION_EXAMPLE_ICON_TYPE as PAIR, protectionExampleTypes, protectionExampleSourceContexts, protectionExampleFamilyIconContext, resolveProtectionExampleType } from '../lib/catalog/models/protectionExampleTypes.js';
import { createProtectionExampleGeometry, disposeProtectionExampleGeometry } from '../lib/catalog/models/protectionExampleGeometry.js';
import { protectionExampleIconDefinitions, renderProtectionExampleIcon } from '../lib/catalog/models/protectionExampleIcons.js';

const types = [PTM, TDE];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const select = (root, name) => { const found = []; root.traverse(object => { if (object.name === name) found.push(object); }); return found; };
const create = type => { const model = createProtectionExampleGeometry(type); model.updateMatrixWorld(true); return model; };

test('two offline archetypes accept only type IDs and remain absent from runtime registries', () => {
  assert.deepEqual(Object.keys(protectionExampleTypes), types);
  assert.deepEqual(protectionExampleSourceContexts.map(context => context.recordId), ['cat-ptm-tded-v012', 'cat-ptm-tded-v013']);
  for (const type of types) {
    assert.equal(resolveProtectionExampleType(type), type);
    assert.equal(protectionExampleTypes[type].runtimeEligible, false);
    assert.equal(Object.hasOwn(equipmentModelTypes, type), false);
    assert.equal(Object.hasOwn(equipmentIconTypes, type), false);
    assert.equal(resolveIconType(type), 'equipment');
  }
  for (const unsupported of [null, undefined, {}, '__proto__', 'protection-cabinet', 'indoor-protection-enclosure', ...protectionExampleSourceContexts.map(context => context.recordId)]) {
    assert.equal(resolveProtectionExampleType(unsupported), null);
    assert.equal(renderProtectionExampleIcon(unsupported), null);
    assert.throws(() => createProtectionExampleGeometry(unsupported), RangeError);
  }
});

test('all eleven table rows, family and two existing exemplar runtime states remain unchanged', () => {
  const family = productById('cat-ptm-tded');
  assert.equal(getEquipmentVisual(family).type, null);
  assert.equal(getEquipmentIcon(family).type, 'paired-protection-enclosures');
  for (let i = 1; i <= 13; i++) {
    const product = productById(`cat-ptm-tded-v${String(i).padStart(3, '0')}`);
    const tde = [3, 6, 9, 11, 13].includes(i);
    const oldType = tde ? 'indoor-protection-enclosure' : 'protection-cabinet';
    const visual = getEquipmentVisual(product), icon = getEquipmentIcon(product);
    assert.equal(icon.type, oldType);
    assert.equal(icon.confidence, i <= 11 ? 'typical' : 'source-based');
    assert.equal(visual.type, i <= 11 ? null : oldType);
    assert.equal(visual.confidence, i <= 11 ? 'source-only' : 'source-matched');
    assert.ok(!types.includes(icon.type)); assert.ok(!types.includes(visual.type));
  }
});

test('paired family candidate is icon-only composition of the two corrected front symbols', () => {
  assert.equal(protectionExampleFamilyIconContext.recordId, 'cat-ptm-tded');
  assert.equal(protectionExampleFamilyIconContext.iconOnly, true);
  assert.equal(protectionExampleFamilyIconContext.geometryType, null);
  assert.equal(protectionExampleFamilyIconContext.runtimeEligible, false);
  assert.equal(Object.hasOwn(protectionExampleTypes, PAIR), false);
  assert.equal(resolveProtectionExampleType(PAIR), null);
  assert.throws(() => createProtectionExampleGeometry(PAIR), RangeError);
  assert.equal(Object.hasOwn(equipmentIconTypes, PAIR), false);
  assert.equal(resolveIconType(PAIR), 'equipment');
  const icon = protectionExampleIconDefinitions[PAIR];
  assert.equal(icon.runtimeEligible, false); assert.equal(icon.iconOnly, true);
  assert.deepEqual(icon.components, [PTM, TDE]);
  assert.deepEqual(icon.layers.map(item => item.d), [PTM, TDE].flatMap(type => protectionExampleIconDefinitions[type].layers.map(item => item.d)));
  assert.match(icon.disclosure, /двух отдельно подписанных примеров/);
  assert.match(icon.disclosure, /не общий корпус семейства/);
});

test('source authority, omissions, and no-CAD limits travel with both prototypes', () => {
  const source = readFileSync(new URL('../public/catalog-source/page-069.webp', import.meta.url));
  for (const type of types) {
    const definition = protectionExampleTypes[type], model = create(type);
    assert.equal(createHash('sha256').update(source).digest('hex'), definition.sourceSha256);
    assert.equal(definition.sourcePageUrl, '/catalog/source?page=69');
    assert.equal(definition.sourcePageImage, '/catalog-source/page-069.webp');
    assert.match(model.userData.disclosure, /Мелкие элементы бокового вида/);
    assert.match(model.userData.disclosure, /Размеры, материалы и комплектация исполнения не утверждаются/);
    assert.match(model.userData.disclosure, /Не CAD/);
    assert.equal(model.userData.runtimeEligible, false);
    assert.equal(model.userData.dimensionAccurate, false);
    assert.equal(model.userData.exactMeshReuseAllowed, false);
    assert.equal(model.userData.units, 'arbitrary-scene-units');
    assert.equal(model.userData.omittedFeatures.length, 3);
    assert.deepEqual(model.userData.sourcePages, [69]);
    disposeProtectionExampleGeometry(model);
  }
});

test('finite opaque neutral native geometry fits normalization and closed-body bounds', () => {
  for (const type of types) {
    const model = create(type), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    near(Math.max(size.x, size.y, size.z), 2.8); near(bounds.min.y, 0); near(center.x, 0); near(center.z, 0);
    let triangles = 0;
    model.traverse(object => {
      if (!object.geometry) return;
      const position = object.geometry.getAttribute('position');
      assert.ok([...position.array, ...object.matrixWorld.elements].every(Number.isFinite));
      const material = object.material;
      near(material.color.r, material.color.g); near(material.color.g, material.color.b);
      assert.equal(material.transparent, false); assert.equal(material.opacity, 1);
      if (object.isMesh) {
        assert.ok(material.isMeshStandardMaterial); assert.equal(material.metalness, 0); assert.equal(material.map, null);
        triangles += (object.geometry.index?.count || position.count) / 3;
      }
    });
    assert.ok(triangles >= 14 && triangles < 300);
    const body = select(model, 'closed-body')[0], ray = new THREE.Raycaster();
    for (const [origin, direction] of [[[0, 1, 3], [0, 0, -1]], [[0, 1, -3], [0, 0, 1]], [[3, 1, 0], [-1, 0, 0]], [[-3, 1, 0], [1, 0, 0]], [[0, 4, 0], [0, -1, 0]], [[0, -1, 0], [0, 1, 0]]]) {
      ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
      assert.ok(ray.intersectObject(body, false).length, `open schematic body: ${type}`);
    }
    disposeProtectionExampleGeometry(model);
  }
});

test('PTM has two flat circular marks, a clear cap gap and broad low support silhouette only', () => {
  const model = create(PTM), marks = select(model, 'flat-round-front-mark'), supports = select(model, 'simplified-low-support');
  assert.equal(marks.length, 2); assert.equal(supports.length, 2);
  for (const mark of marks) {
    assert.equal(mark.geometry.type, 'RingGeometry');
    assert.equal(mark.userData.functionalRole, 'unverified');
    near(mark.position.x, marks[0].position.x);
    assert.ok(mark.geometry.parameters.innerRadius > 0);
    const b = new THREE.Box3().setFromObject(mark); near(b.max.z, b.min.z);
  }
  const body = new THREE.Box3().setFromObject(select(model, 'closed-body')[0]);
  const cap = new THREE.Box3().setFromObject(select(model, 'neutral-overhanging-cap')[0]);
  assert.ok(cap.min.y > body.max.y && cap.min.x < body.min.x && cap.max.x > body.max.x);
  assert.ok(cap.min.z < body.min.z && cap.max.z > body.max.z);
  for (const support of supports) {
    const b = new THREE.Box3().setFromObject(support), size = b.getSize(new THREE.Vector3());
    near(b.min.y, 0); near(b.max.y, body.min.y);
    assert.ok(size.y < size.x && size.x < size.z && size.z > (body.max.z - body.min.z) * .8);
  }
  const parts = model.children.map(object => object.name);
  assert.deepEqual(parts.sort(), ['closed-body', 'flat-inset-front-panel', 'flat-round-front-mark', 'flat-round-front-mark', 'front-panel-outline', 'neutral-overhanging-cap', 'simplified-low-support', 'simplified-low-support'].sort());
  disposeProtectionExampleGeometry(model);
});

test('TDE is only closed body and flat inset outline: no inherited plinth, handle or fittings', () => {
  const model = create(TDE), body = select(model, 'closed-body')[0];
  assert.deepEqual(model.children.map(object => object.name).sort(), ['closed-body', 'flat-inset-front-panel', 'front-panel-outline'].sort());
  const total = new THREE.Box3().setFromObject(model), bodyBounds = new THREE.Box3().setFromObject(body);
  near(total.min.x, bodyBounds.min.x); near(total.max.x, bodyBounds.max.x); near(total.min.y, bodyBounds.min.y); near(total.max.y, bodyBounds.max.y);
  near(bodyBounds.min.y, 0);
  const panel = select(model, 'flat-inset-front-panel')[0], inset = new THREE.Box3().setFromObject(panel);
  assert.ok(inset.min.x > bodyBounds.min.x && inset.max.x < bodyBounds.max.x && inset.min.y > bodyBounds.min.y && inset.max.y < bodyBounds.max.y);
  near(inset.min.z, inset.max.z);
  disposeProtectionExampleGeometry(model);
});

test('resources are per-instance and all geometry/material resources dispose exactly once', () => {
  for (const type of types) for (const dispose of [disposeProtectionExampleGeometry, disposeEquipmentGeometry]) {
    const model = create(type), other = create(type), resources = new Set(model.userData.materials), otherResources = new Set(other.userData.materials);
    model.traverse(object => { if (object.geometry) resources.add(object.geometry); });
    other.traverse(object => { if (object.geometry) otherResources.add(object.geometry); });
    for (const resource of resources) assert.ok(!otherResources.has(resource));
    const counts = new Map();
    for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
    dispose(model); assert.equal(counts.size, resources.size); assert.ok([...counts.values()].every(count => count === 1));
    assert.equal(model.children.length, 0); assert.ok(other.children.length > 0);
    if (dispose === disposeProtectionExampleGeometry) { dispose(model); assert.ok([...counts.values()].every(count => count === 1)); }
    dispose(other);
  }
});

test('front-only icons preserve the two distinct silhouettes and remain readable/unclipped at listing sizes', async () => {
  assert.equal(protectionExampleIconDefinitions[PTM].layers.filter(item => item.feature.startsWith('round-mark-')).length, 2);
  assert.deepEqual(protectionExampleIconDefinitions[TDE].layers.map(item => item.feature), ['closed-body', 'inset-front-panel']);
  for (const type of [...types, PAIR]) for (const size of [28, 32, 40, 48, 56, 64, 96, 148]) {
    const svg = renderProtectionExampleIcon(type, size, protectionExampleIconDefinitions[type].name);
    assert.match(svg, /role="img"/); assert.match(svg, /Вид спереди; мелкие элементы бокового вида опущены/);
    assert.doesNotMatch(svg, /<image|<img|NaN|Infinity|undefined/);
    const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: '#fff' }).raw().toBuffer({ resolveWithObject: true });
    let ink = 0, edge = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[(y * size + x) * info.channels] < 220) {
      ink++; if (!x || !y || x === size - 1 || y === size - 1) edge++;
    }
    assert.ok(ink > size * 1.5); assert.equal(edge, 0, `${type} clipped at ${size}px`);
  }
  assert.match(renderProtectionExampleIcon(PTM, 64, '<script>"&'), /&lt;script&gt;&quot;&amp;/);
  for (const size of [0, -1, NaN, Infinity, 2049]) assert.throws(() => renderProtectionExampleIcon(PTM, size), RangeError);
  for (const file of ['protectionExampleTypes.js', 'protectionExampleIcons.js']) assert.doesNotMatch(readFileSync(new URL(`../lib/catalog/models/${file}`, import.meta.url), 'utf8'), /from ['"]three|import.*Geometry|<image/);
});
