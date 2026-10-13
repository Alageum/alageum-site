import * as THREE from 'three';
import { PTM_SOURCE_EXAMPLE_TYPE, protectionExampleTypes, resolveProtectionExampleType } from './protectionExampleTypes.js';

// Deliberately local primitives: no shared cabinet shell, fittings or palette.
// Front panel / circles are flat graphic marks, not inferred recesses or locks.
export function createProtectionExampleGeometry(type) {
  if (!resolveProtectionExampleType(type)) throw new RangeError(`Unknown protection example: ${String(type)}`);
  const definition = protectionExampleTypes[type], root = new THREE.Group();
  root.name = `offline-protection-example:${type}`;
  const materials = {
    body: new THREE.MeshStandardMaterial({ color: '#c9c9c9', roughness: 1, metalness: 0 }),
    panel: new THREE.MeshStandardMaterial({ color: '#d1d1d1', roughness: 1, metalness: 0 }),
    mark: new THREE.MeshStandardMaterial({ color: '#454545', roughness: 1, metalness: 0 }),
    outline: new THREE.MeshStandardMaterial({ color: '#555555', roughness: 1, metalness: 0 }),
  };
  const mesh = (name, geometry, position, material = 'body') => {
    const part = new THREE.Mesh(geometry, materials[material]);
    part.name = name; part.position.set(...position); root.add(part); return part;
  };
  const box = (name, dimensions, position) => mesh(name, new THREE.BoxGeometry(...dimensions), position);
  const panel = (width, height, centerY, z) => {
    mesh('flat-inset-front-panel', new THREE.PlaneGeometry(width, height), [0, centerY, z], 'panel');
    const x = width / 2, y = height / 2, stroke = .006;
    const outline = new THREE.Shape();
    outline.moveTo(-x, -y); outline.lineTo(x, -y); outline.lineTo(x, y); outline.lineTo(-x, y); outline.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-x + stroke, -y + stroke); hole.lineTo(-x + stroke, y - stroke);
    hole.lineTo(x - stroke, y - stroke); hole.lineTo(x - stroke, -y + stroke); hole.closePath();
    outline.holes.push(hole);
    mesh('front-panel-outline', new THREE.ShapeGeometry(outline), [0, centerY, z + .0001], 'outline');
  };
  if (type === PTM_SOURCE_EXAMPLE_TYPE) {
    box('closed-body', [2.4, 1.68, 1.44], [0, .98, 0]);
    box('neutral-overhanging-cap', [2.48, .14, 1.52], [0, 1.95, 0]);
    // The narrow cap gap is retained; short under-cap segments are omitted.
    panel(2.06, 1.48, .98, .7201);
    for (const y of [.35, 1.60]) {
      const mark = mesh('flat-round-front-mark', new THREE.RingGeometry(.071, .082, 48), [-.85, y, .7203], 'mark');
      mark.userData.functionalRole = 'unverified';
    }
    // A low two-support silhouette only. Full-depth blocks are a simplification
    // of the front outlines / broad side rectangle, not proven rail geometry.
    for (const x of [-1.02, 1.02]) box('simplified-low-support', [.34, .14, 1.28], [x, .07, 0]);
  } else {
    box('closed-body', [2.4, 2.03, 1.45], [0, 1.015, 0]);
    panel(1.88, 1.62, 1.015, .7251);
  }
  const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.8 / Math.max(size.x, size.y, size.z);
  root.scale.setScalar(scale); root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  root.userData = {
    type, runtimeEligible: false, dimensionAccurate: false, exactMeshReuseAllowed: false,
    units: definition.units, disclosure: definition.disclosure, sourcePages: [...definition.pages],
    sourcePageUrl: definition.sourcePageUrl, sourcePageImage: definition.sourcePageImage,
    omittedFeatures: [...definition.omittedFeatures], limits: [...definition.limits],
    materials: Object.values(materials),
  };
  return root;
}

export function disposeProtectionExampleGeometry(root) {
  const geometries = new Set(), materials = new Set(root.userData.materials || []);
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.clear(); root.userData.materials = [];
}
