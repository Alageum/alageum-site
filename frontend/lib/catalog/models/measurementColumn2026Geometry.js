import * as THREE from 'three';
import { measurementColumn2026Types, resolveMeasurementColumn2026Type, MEASUREMENT_COLUMN_2026_DISCLOSURE } from './measurementColumn2026Types.js';

// Native closed meshes interpreting only the printed exterior on pages 99/100.
// Coordinates are arbitrary scene units, not catalogue dimensions. Printed plan:
// x increases right; z increases down. No real-world front/direction is asserted.
const palette = { tank: 0xc5cecd, edge: 0x7d8c91, insulator: 0xc1bbae, metal: 0x66777d, indicator: 0x33484f };
function primitives(root, materials) {
  const mesh = (name, geometry, at, color = 'tank', parent = root) => {
    const item = new THREE.Mesh(geometry, materials[color]);
    item.name = name; item.position.set(...at); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  };
  const box = (name, size, at, color, parent) => mesh(name, new THREE.BoxGeometry(...size), at, color, parent);
  const cylinder = (name, radius, height, at, color, parent, segments = 32) => mesh(name, new THREE.CylinderGeometry(radius, radius, height, segments), at, color, parent);
  const lathe = (name, profile, at, color, parent) => mesh(name, new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48), at, color, parent);
  return { mesh, box, cylinder, lathe };
}

function buildTank(p) {
  // Extrusion along the long x axis: upper short-axis walls are vertical, lower
  // ones slope inward. The long elevation remains rectangular, as drawn.
  const section = new THREE.Shape();
  section.moveTo(-.245, .018); section.lineTo(.245, .018);
  section.lineTo(.40, .455); section.lineTo(.40, .92);
  section.lineTo(-.40, .92); section.lineTo(-.40, .455); section.closePath();
  const tank = p.mesh('opaque-tank-with-short-axis-taper', new THREE.ExtrudeGeometry(section, { depth: 1.24, bevelEnabled: false }), [-.62, 0, 0]);
  tank.rotation.y = Math.PI / 2;
  p.box('low-flat-base', [1.30, .018, .55], [0, .009, 0], 'edge');
  p.box('rectangular-cover', [1.42, .033, 1.0], [0, .932, 0], 'edge');
  p.box('cover-upper-face', [1.39, .012, .97], [0, .9545, 0], 'tank');
  // The nameplate is visible on the short elevation. Blank opaque rectangle;
  // no ratings, text or reverse-face fittings inferred.
  p.box('blank-visible-nameplate', [.012, .245, .40], [-.627, .59, 0], 'edge');
}

function buildColumn(p) {
  p.cylinder('column-lower-collar', .275, .14, [0, 1.015, 0], 'tank');
  p.cylinder('column-lower-flange', .295, .025, [0, 1.084, 0], 'edge');
  p.cylinder('column-upper-flange', .302, .026, [0, 1.175, 0], 'edge');
  p.cylinder('column-flange-neck', .13, .092, [0, 1.13, 0], 'insulator');
  // One continuous capped lathe, including core and all five curved major
  // sheds. It has no intermediate terminal/contact under the upper chamber.
  const profile = [[0, 1.181], [.127, 1.181], [.127, 1.34]];
  for (let index = 0; index < 5; index++) {
    const y = 1.34 + index * .207;
    profile.push([.224, y], [.263, y + .012], [.282, y + .027], [.282, y + .052], [.265, y + .067], [.228, y + .081], [.182, y + .100], [.149, y + .121], [.131, y + .148], [.127, y + .173], [.127, y + .207]);
  }
  profile.push([.127, 2.39], [0, 2.39]);
  p.lathe('continuous-five-shed-column', profile, [0, 0, 0], 'insulator');
  p.cylinder('upper-chamber-bottom-rim', .282, .037, [0, 2.385, 0], 'edge');
  p.cylinder('opaque-upper-cylindrical-chamber', .279, .35, [0, 2.569, 0], 'tank');
  p.cylinder('upper-chamber-top-rim', .287, .037, [0, 2.75, 0], 'edge');
  // Top contact and plug are separate assemblies. Contact has only one stud.
  p.cylinder('top-contact-foot', .065, .027, [0, 2.781, 0], 'metal');
  p.cylinder('top-central-contact', .026, .155, [0, 2.869, 0], 'metal');
  p.cylinder('top-contact-collar', .037, .030, [0, 2.824, 0], 'metal');
  p.cylinder('offset-top-plug-seat', .051, .018, [.178, 2.786, 0], 'edge');
  p.cylinder('offset-top-plug', .041, .060, [.178, 2.816, 0], 'metal');
  // Opaque level-indicator cue on the source-visible side; no liquid level.
  const surround = new THREE.Shape();
  surround.moveTo(-.052, -.098); surround.lineTo(-.052, .098);
  surround.absarc(0, .098, .052, Math.PI, 0, true); surround.lineTo(.052, -.098);
  surround.absarc(0, -.098, .052, 0, -Math.PI, true); surround.closePath();
  const indicator = p.mesh('visible-side-level-indicator-surround', new THREE.ExtrudeGeometry(surround, { depth: .018, bevelEnabled: false, curveSegments: 12 }), [-.296, 2.57, 0], 'metal');
  indicator.rotation.y = Math.PI / 2;
  p.box('opaque-level-indicator-inset', [.008, .215, .037], [-.300, 2.57, 0], 'indicator');
}

function buildCoverBushings(root, p) {
  const positions = [
    ['upper-left', -.38, -.31], ['mid-left', -.52, 0],
    ['lower-left-outer', -.52, .31], ['lower-left-inner', -.38, .31], ['mid-right', .47, 0],
  ];
  for (const [printedPlanPosition, x, z] of positions) {
    const group = new THREE.Group(); group.name = 'neutral-cover-bushing';
    group.position.set(x, .9605, z); group.userData = { printedPlanPosition, electricalRole: 'unverified' }; root.add(group);
    p.lathe('stepped-cover-bushing-body', [[0, 0], [.063, 0], [.063, .026], [.052, .032], [.058, .050], [.058, .065], [.042, .078], [.042, .117], [.034, .124], [0, .124]], [0, 0, 0], 'insulator', group);
    p.cylinder('cover-bushing-contact', .018, .065, [0, .152, 0], 'metal', group, 20);
    p.cylinder('cover-bushing-contact-collar', .027, .016, [0, .123, 0], 'metal', group, 20);
  }
}

function buildLiftingEars(p) {
  for (const [x, z] of [[-.59, -.39], [.59, .39]]) {
    const profile = new THREE.Shape();
    profile.moveTo(-.09, 0); profile.lineTo(.09, 0); profile.lineTo(.09, .165);
    profile.lineTo(.05, .205); profile.lineTo(-.05, .205); profile.lineTo(-.09, .165); profile.closePath();
    const hole = new THREE.Path(); hole.absarc(0, .111, .043, 0, Math.PI * 2, true); profile.holes.push(hole);
    const ear = p.mesh('visible-lifting-ear', new THREE.ExtrudeGeometry(profile, { depth: .022, bevelEnabled: false, curveSegments: 20 }), [x, .9605, z], 'edge');
    ear.rotation.y = -Math.PI / 4;
  }
}

export function createMeasurementColumn2026Geometry(type) {
  const resolved = resolveMeasurementColumn2026Type(type);
  if (!resolved) throw new RangeError(`No candidate measurement-column exterior: ${String(type)}`);
  const definition = measurementColumn2026Types[resolved], group = new THREE.Group();
  group.name = `measurement-column2026-source-context:${resolved}`;
  const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: .73, metalness: name === 'metal' ? .35 : .1 })]));
  const p = primitives(group, materials);
  buildTank(p); buildColumn(p); buildCoverBushings(group, p); buildLiftingEars(p);
  // Existing viewer contract: longest side 2.8, base at y=0, centred in x/z.
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.8 / Math.max(size.x, size.y, size.z);
  group.scale.setScalar(scale); group.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  group.userData = { type: resolved, units: definition.units, dimensionAccurate: false, exactMeshReuseAllowed: false, runtimeEligible: false, reviewStatus: definition.reviewStatus, disclosure: MEASUREMENT_COLUMN_2026_DISCLOSURE, sourcePages: [...definition.pages], limits: [...definition.limits], materials: Object.values(materials) };
  return group;
}

export function disposeMeasurementColumn2026Geometry(group) {
  const geometries = new Set(), materials = new Set(group.userData.materials || []);
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear(); group.userData.materials = [];
}
