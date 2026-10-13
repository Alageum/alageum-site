import * as THREE from 'three';
import { accessory2026Types, resolveAccessory2026Type, ACCESSORY_2026_DISCLOSURE } from './accessory2026Types.js';

// Only visible exterior cues from page 85. All lengths are arbitrary scene units.
// Plain closure surfaces make an opaque illustration, not a claim about hidden faces.
const palette = { body: 0xc8cdcb, face: 0xe9ece6, edge: 0x8d999b, dark: 0x1d3037, green: 0x205545, display: 0x762330, metal: 0xa4a6a0, red: 0xb66564, light: 0xd4d7ce, yellow: 0xb9a846, blue: 0x366d92 };
function primitives(root, materials) {
  const mesh = (name, geometry, at, color) => {
    const item = new THREE.Mesh(geometry, materials[color]);
    item.name = name; item.position.set(...at); item.castShadow = true; item.receiveShadow = true; root.add(item); return item;
  };
  const box = (name, size, at, color = 'body') => mesh(name, new THREE.BoxGeometry(...size), at, color);
  const rod = (name, from, to, radius, color = 'metal') => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
    const item = mesh(name, new THREE.CylinderGeometry(radius, radius, delta.length(), 16), a.clone().add(b).multiplyScalar(.5).toArray(), color);
    item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    item.userData.endpoints = [from, to]; return item;
  };
  const tube = (name, points, radius, color = 'metal', segments = 80) => {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
    const item = mesh(name, new THREE.TubeGeometry(curve, segments, radius, 8, false), [0, 0, 0], color);
    item.userData.endpoints = [points[0], points.at(-1)]; return item;
  };
  const disc = (name, x, y, z, r, color) => rod(name, [x, y, z], [x, y, z + .012], r, color);
  return { mesh, box, rod, tube, disc };
}

function relay(p) {
  // The two continuous recesses intentionally do not assert a connector count.
  p.box('relay-opaque-case', [2.05, 1.38, .46], [0, .78, -.02]);
  for (const [name, y] of [['upper', 1.36], ['lower', .2]]) {
    p.box(`${name}-terminal-band-recess`, [1.74, .18, .015], [0, y, .218], 'dark');
    p.box(`${name}-terminal-band-visible-green`, [1.6, .07, .018], [0, y - .025, .23], 'green');
  }
  p.box('relay-projecting-fascia', [2.1, .9, .22], [-.035, .78, .28], 'edge');
  p.box('relay-face-panel', [1.99, .79, .014], [-.035, .78, .397], 'face');
  p.box('blank-display', [.4, .27, .008], [.27, .88, .41], 'display');
  p.box('channel-indicator-panel', [.43, .27, .006], [-.195, .88, .409], 'body');
  for (const [i, color] of ['red', 'yellow', 'red', 'green', 'blue'].entries()) p.disc('status-light', -.87, 1.04 - i * .127, .414, .022, color);
  for (let i = 0; i < 4; i++) p.disc('channel-light', -.35 + i * .1, .84, .414, .021, 'green');
  for (const x of [-.03, .26, .55]) {
    p.box('lower-button-surround', [.13, .14, .008], [x, .55, .414], 'body');
    p.disc('lower-face-button', x, .55, .421, .046, 'dark');
  }
  for (const y of [.91, .55]) p.disc('right-face-button', .82, y, .418, .048, 'dark');
}

function probe(p) {
  const probeTip = [-1.17, .76, .045], probeEnd = [-.86, 1.14, .045], cableStart = [-.77, 1.25, .045];
  p.rod('single-metal-probe', probeTip, probeEnd, .035);
  p.rod('visible-probe-collar', probeEnd, cableStart, .044);
  const points = [cableStart, [-.67, 1.46, .04]];
  // 4.5 loose turns are a presentation arrangement, not a source cable length.
  const turns = 4.5, steps = 216;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = 2.5 - t * turns * Math.PI * 2, radius = .69 + t * .17;
    points.push([.12 + Math.cos(angle) * radius, 1.42 + Math.sin(angle) * radius, .02 * Math.sin(angle * .7)]);
  }
  const sleeveStart = [.71, .23, .015], sleeveEnd = [.64, .08, .015];
  points.push([.9, .62, .005], [.82, .42, .012], sleeveStart);
  const cable = p.tube('continuous-coiled-cable', points, .016, 'metal', 480);
  cable.userData.coilArrangementIsIllustrative = true;
  p.rod('visible-end-sleeve', sleeveStart, sleeveEnd, .024, 'dark');
  for (const [i, x, y, color] of [[0, .49, -.19, 'red'], [1, .55, -.22, 'red'], [2, .75, -.25, 'light']]) {
    const end = [x, y, .015 + i * .006];
    p.tube('visible-free-lead', [sleeveEnd, [x + .015, -.07, .02], end], .008, color, 24);
    p.rod('visible-lead-tip', end, [x - .012, y - .055, end[2]], .006, 'metal');
  }
}

function damper(p) {
  const flange = new THREE.Shape();
  flange.moveTo(-.62, -1.28); flange.lineTo(.62, -1.28); flange.lineTo(.62, 1.62); flange.lineTo(-.62, 1.62); flange.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 1.32, .085, 0, Math.PI * 2, true); flange.holes.push(hole);
  const base = p.mesh('flange-with-one-visible-hole', new THREE.ExtrudeGeometry(flange, { depth: .105, bevelEnabled: false, curveSegments: 24 }), [0, .105, 0], 'dark');
  // Shape y becomes world z; extrusion becomes downward world y.
  base.rotation.x = Math.PI / 2;
  base.userData.visibleHole = { center: [0, .105, 1.32], radius: .085 };

  // A broad concave upper surface is visible. Its radius is not measured.
  const topY = z => .79 - .25 * Math.cos(z / 1.05 * Math.PI / 2) ** 2;
  const profile = new THREE.Shape(); profile.moveTo(-1.05, .108); profile.lineTo(1.05, .108);
  for (let i = 32; i >= 0; i--) { const z = -1.05 + i * 2.1 / 32; profile.lineTo(z, topY(z)); }
  profile.closePath();
  const body = p.mesh('opaque-support-with-concave-seat', new THREE.ExtrudeGeometry(profile, { depth: 1.02, bevelEnabled: false, curveSegments: 16 }), [-.51, 0, 0], 'dark');
  body.rotation.y = Math.PI / 2;
  // A slightly inset darker upper plate follows the same visible depression.
  const plate = new THREE.Shape();
  for (let i = 0; i <= 28; i++) { const z = -.91 + i * 1.82 / 28; if (!i) plate.moveTo(z, topY(z) + .006); else plate.lineTo(z, topY(z) + .006); }
  for (let i = 28; i >= 0; i--) { const z = -.91 + i * 1.82 / 28; plate.lineTo(z, topY(z) + .018); }
  plate.closePath();
  const seat = p.mesh('visible-inset-seat-surface', new THREE.ExtrudeGeometry(plate, { depth: .78, bevelEnabled: false }), [-.39, 0, 0], 'edge');
  seat.rotation.y = Math.PI / 2;
}

const builders = { relay, probe, damper };
export function createAccessory2026Geometry(type) {
  const resolved = resolveAccessory2026Type(type);
  if (!resolved) throw new RangeError(`No reviewed accessory exterior: ${String(type)}`);
  const definition = accessory2026Types[resolved], group = new THREE.Group();
  group.name = `accessory2026-exterior:${resolved}`;
  const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: name === 'metal' ? .42 : .08 })]));
  // The seat is dark in the source; keep it distinct from the relay case palette.
  if (definition.build === 'damper') materials.edge.color.setHex(0x35494e);
  builders[definition.build](primitives(group, materials));
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.8 / Math.max(size.x, size.y, size.z);
  group.scale.setScalar(scale); group.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  group.userData = { type: resolved, units: 'arbitrary-scene-units', dimensionAccurate: false, exactMeshReuseAllowed: false, runtimeEligible: false, reviewStatus: 'independent-review-required', disclosure: ACCESSORY_2026_DISCLOSURE, sourcePages: [...definition.pages], limits: [...definition.limits], materials: Object.values(materials) };
  return group;
}

// Only standard BufferGeometry and Material resources; no textures, listeners,
// timers or render targets. The existing generic disposer is also sufficient.
export function disposeAccessory2026Geometry(group) {
  const geometries = new Set(), materials = new Set(group.userData.materials || []);
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}
