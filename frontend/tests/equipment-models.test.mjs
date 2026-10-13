import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { equipmentModelTypes, equipmentModelName, resolveModelType, MODEL_DISCLOSURE } from '../lib/catalog/models/types.js';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '../lib/catalog/models/geometry.js';

const navigationTypes = ['oil-transformer', 'dry-transformer', 'instrument-transformer', 'substation', 'modular-substation', 'pole-substation', 'switchgear', 'disconnector', 'distribution-cabinet', 'control-cabinet', 'compensation-cabinet', 'protection-cabinet', 'metering-box'];

const requiredTypes = Object.keys(equipmentModelTypes).filter(type => type !== 'equipment');

test('the library provides one stable shared visual per equipment type', () => {
  assert.equal(navigationTypes.length, 13);
  assert.equal(requiredTypes.length, 59);
  for (const type of requiredTypes) {
    assert.equal(resolveModelType(type), type);
    assert.ok(equipmentModelName(type).length > 5);
  }
  assert.equal(resolveModelType('unknown-sku-1000'), 'equipment');
  assert.equal(resolveModelType('__proto__'), 'equipment');
  assert.equal(resolveModelType(undefined), 'equipment');
  assert.equal(MODEL_DISCLOSURE, 'Иллюстративная 3D-модель типа; не CAD и не чертёж конкретного исполнения');
  for (const { reference } of Object.values(equipmentModelTypes)) if (reference) assert.ok(existsSync(new URL(`../public${reference}`, import.meta.url)));
});

test('each type has distinct actual 3D mesh geometry and fits a common camera', () => {
  const signatures = new Set();
  for (const type of requiredTypes) {
    const model = createEquipmentGeometry(type);
    assert.equal(model.userData.type, type);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
    assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - 2.8) < .000001);
    assert.ok(Math.abs(bounds.min.y) < .000001);
    let triangles = 0;
    let meshes = 0;
    const signature = [];
    model.traverse((object) => {
      if (!object.isMesh) return;
      meshes += 1;
      triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
      const positions = object.geometry.attributes.position.array;
      assert.ok([...positions].every(Number.isFinite));
      signature.push([object.geometry.type, object.geometry.parameters, object.position.toArray()]);
    });
    assert.ok(meshes > 3 && meshes < 180, `${type}: ${meshes} meshes`);
    assert.ok(triangles > 36 && triangles < 30000, `${type}: ${triangles} triangles`);
    assert.ok(!signatures.has(JSON.stringify(signature)), `${type} must have a distinguishable silhouette`);
    signatures.add(JSON.stringify(signature));
    disposeEquipmentGeometry(model);
  }
});

test('disposing a model releases all GPU geometry and palette materials once', () => {
  for (const type of requiredTypes) {
    const model = createEquipmentGeometry(type);
    const resources = new Set(model.userData.materials);
    model.traverse(object => { if (object.geometry) resources.add(object.geometry); });
    let disposed = 0;
    for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
    disposeEquipmentGeometry(model);
    assert.equal(disposed, resources.size, type);
    assert.equal(model.children.length, 0);
  }
});

test('preview and icons have no eager WebGL dependency; renderer has an explicit lifecycle', () => {
  const component = readFileSync(new URL('../components/catalog/EquipmentModel.js', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('../components/catalog/EquipmentIcon.js', import.meta.url), 'utf8');
  const viewer = readFileSync(new URL('../components/catalog/models/createEquipmentViewer.js', import.meta.url), 'utf8');
  assert.match(component, /if \(!active\) return/);
  assert.match(component, /import\('\.\/models\/createEquipmentViewer'\)/);
  assert.doesNotMatch(icon, /from ['"]three|<canvas/);
  assert.doesNotMatch(component, /from ['"]three/);
  for (const hook of ['resizeObserver?.disconnect()', 'controls?.dispose()', 'renderer?.dispose()', 'renderer?.forceContextLoss()', 'cancelAnimationFrame(frame)']) assert.ok(viewer.includes(hook));
  assert.match(viewer, /controls\.autoRotate = false/);
  assert.match(viewer, /controls\.enableDamping = false/);
  assert.match(viewer, /webglcontextlost/);
  assert.match(viewer, /ArrowLeft/);
  assert.match(component, /session\?\.dispose\(\)/);
});
