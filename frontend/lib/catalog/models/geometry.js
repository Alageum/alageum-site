import { resolveProtectionExampleType } from './protectionExampleTypes.js';
import { createProtectionExampleGeometry, disposeProtectionExampleGeometry } from './protectionExampleGeometry.js';
import { resolveMeasurementColumn2026Type } from './measurementColumn2026Types.js';
import { createMeasurementColumn2026Geometry, disposeMeasurementColumn2026Geometry } from './measurementColumn2026Geometry.js';
import { resolveAccessory2026Type } from './accessory2026Types.js';
import { createAccessory2026Geometry, disposeAccessory2026Geometry } from './accessory2026Geometry.js';
import { resolveTransformer2026Type } from './transformer2026Types.js';
import { createTransformer2026Geometry, disposeTransformer2026Geometry } from './transformer2026Geometry.js';
import * as THREE from 'three';
import { resolveModelType } from './types.js';
import { buildSourceEquipmentGeometry } from './sourceGeometry.js';

// Procedural silhouettes shared by TYPE, never generated from SKU, rating or dimensions.
// Source interpretations are documented in types.js. Unpictured types are generic
// educational forms, not reconstructions. Units below are arbitrary scene units.
const colors = { body: 0xe5e7e5, panel: 0xf1f1ed, frame: 0x737e82, dark: 0x323d44, red: 0xb92735, copper: 0xb87957, insulator: 0xaaa698, screen: 0x33474c, glass: 0x778f92, warning: 0xe3ba5d };

export function createEquipmentGeometry(type) {
  if (resolveProtectionExampleType(type)) return createProtectionExampleGeometry(type);
  if (resolveMeasurementColumn2026Type(type)) return createMeasurementColumn2026Geometry(type);
  if (resolveAccessory2026Type(type)) return createAccessory2026Geometry(type);
  if (resolveTransformer2026Type(type)) return createTransformer2026Geometry(type);
  const group = new THREE.Group();
  group.name = `equipment-type:${resolveModelType(type)}`;
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color, roughness: key === 'copper' ? .4 : .72, metalness: key === 'frame' ? .4 : .12 })]));
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x26323a, transparent: true, opacity: .17 });
  const mesh = (geometry, at, material = 'body', outline = false) => {
    const item = new THREE.Mesh(geometry, materials[material]);
    item.position.set(...at);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    if (outline) item.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outlineMaterial));
    return item;
  };
  const box = (size, at, material = 'body', outline = false) => mesh(new THREE.BoxGeometry(...size), at, material, outline);
  const cylinder = (radius, height, at, material = 'frame', topRadius = radius) => mesh(new THREE.CylinderGeometry(topRadius, radius, height, 20), at, material);
  const foot = (x, z, width = .25) => box([width, .15, .23], [x, .09, z], 'dark');
  const vents = (x, y, z, width = .48, count = 5) => {
    for (let i = 0; i < count; i += 1) box([width, .025, .017], [x, y + i * .072, z], 'frame');
  };
  const handle = (x, y, z) => { box([.035, .2, .045], [x, y, z], 'dark'); };
  const display = (x, y, z, width = .3) => {
    box([width, .23, .045], [x, y, z], 'dark');
    box([width - .07, .13, .01], [x, y + .01, z + .029], 'glass');
    box([width - .11, .012, .012], [x, y, z + .039], 'panel');
  };
  const warning = (x, y, z, size = .13) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, size); shape.lineTo(-size, -size * .8); shape.lineTo(size, -size * .8); shape.closePath();
    mesh(new THREE.ShapeGeometry(shape), [x, y, z], 'warning');
    box([.025, .11, .008], [x, y, z + .008], 'dark');
    box([.025, .025, .008], [x, y - .072, z + .008], 'dark');
  };
  const insulator = (x, y, z, scale = 1) => {
    cylinder(.052 * scale, .36 * scale, [x, y + .18 * scale, z], 'insulator');
    for (let i = 0; i < 4; i += 1) cylinder((.11 - i * .009) * scale, .035 * scale, [x, y + (.075 + i * .067) * scale, z], 'insulator');
    cylinder(.026 * scale, .08 * scale, [x, y + .4 * scale, z], 'copper');
  };
  const oilTank = (origin = [0, 0, 0], scale = 1, instrument = false) => {
    const start = group.children.length;
    box([1.4, 1.15, .95], [0, .84, 0], 'body', true);
    box([1.6, .09, 1.12], [0, 1.46, 0], 'frame', true);
    box([1.58, .08, 1.08], [0, .23, 0], 'frame');
    if (!instrument) {
      for (const side of [-1, 1]) for (let i = 0; i < 10; i += 1) box([.065, .96, .15], [-.63 + i * .14, .82, side * .52], 'body');
      for (const side of [-1, 1]) for (let i = 0; i < 6; i += 1) box([.15, .96, .06], [side * .75, .82, -.4 + i * .16], 'body');
      for (const x of [-.58, .58]) for (const z of [-.33, .33]) { const wheel = cylinder(.095, .08, [x, .11, z], 'dark'); wheel.rotation.x = Math.PI / 2; }
      for (const x of [-.46, 0, .46]) insulator(x, 1.51, -.16);
      for (const x of [-.42, -.14, .14, .42]) insulator(x, 1.51, .31, .6);
    } else {
      for (const x of [-.46, 0, .46]) insulator(x, 1.51, 0, 1.25);
      for (const x of [-.5, .5]) foot(x, 0, .25);
      display(0, .84, .49, .48);
    }
    box([.3, .18, .025], [0, 1.06, .62], 'dark');
    for (let i = start; i < group.children.length; i += 1) { group.children[i].position.multiplyScalar(scale).add(new THREE.Vector3(...origin)); group.children[i].scale.multiplyScalar(scale); }
  };
  const cabinet = (kind, width = 1.2, height = 2.15, depth = .75, x = 0) => {
    box([width, height, depth], [x, height / 2 + .14, 0], 'body', true);
    box([width + .06, .12, depth + .06], [x, .12, 0], 'dark');
    const z = depth / 2 + .017;
    box([width - .09, height - .13, .045], [x, height / 2 + .14, z], kind === 'control-cabinet' ? 'panel' : 'body', true);
    box([width + .045, .065, depth + .035], [x, height + .17, 0], 'frame');
    if (kind === 'switchgear') {
      box([width - .1, .47, .045], [x, height - .1, z + .027], 'panel', true);
      for (const offset of [-.25, 0, .25]) display(x + offset, height - .07, z + .06, .18);
      box([width - .1, .025, .05], [x, .8, z + .035], 'frame');
      box([.47, .37, .02], [x, 1.12, z + .05], 'screen');
      box([.39, .28, .022], [x, 1.12, z + .065], 'glass');
      handle(x + width * .32, 1.35, z + .07); warning(x, .48, z + .054);
    } else if (kind === 'compensation-cabinet') {
      display(x, height - .2, z + .06, .48);
      for (const y of [.46, 1.03, 1.57]) vents(x, y, z + .05, width - .25, 4);
      handle(x + width * .36, 1.15, z + .07);
    } else if (kind === 'control-cabinet') {
      display(x - .2, height - .26, z + .07, .4);
      for (const [offset, color] of [[.13, 'red'], [.34, 'dark']]) { const button = cylinder(.045, .025, [x + offset, height - .23, z + .08], color); button.rotation.x = Math.PI / 2; }
      box([width - .12, .024, .04], [x, height - .56, z + .04], 'frame');
      handle(x - width * .33, 1, z + .07); vents(x, .36, z + .05, width - .3, 4);
    } else {
      for (const offset of [-.23, 0, .23]) display(x + offset, height - .13, z + .055, .18);
      warning(x, 1.21, z + .05); display(x, .8, z + .055, .4);
      handle(x - width * .33, 1.1, z + .07); vents(x, .33, z + .05, width - .4, 3);
    }
    // Hinges read as actual cabinet geometry when rotated, not a flat front image.
    for (const y of [.55, height - .3]) box([.04, .11, .06], [x + width / 2 - .055, y, z + .04], 'frame');
  };
  const roof = (width, depth, y) => {
    const rise = .22;
    for (const side of [-1, 1]) {
      const part = box([width / 2 + .12, .08, depth + .16], [side * width / 4, y + rise / 2, 0], 'red', true);
      part.rotation.z = -side * Math.atan2(rise, width / 2);
    }
  };
  const sourceBuilt = buildSourceEquipmentGeometry(resolveModelType(type), { group, box, cylinder, insulator, handle, display, warning, vents });
  if (!sourceBuilt) switch (resolveModelType(type)) {
    case 'oil-transformer': oilTank(); break;
    case 'instrument-transformer': oilTank([0, 0, 0], 1, true); break;
    case 'dry-transformer':
      box([1.9, .18, .85], [0, .19, 0], 'frame', true); box([1.9, .17, .7], [0, 1.84, 0], 'frame', true);
      for (const x of [-.64, 0, .64]) {
        box([.19, 1.6, .2], [x, 1.01, 0], 'dark');
        cylinder(.255, 1.28, [x, 1.01, 0], 'red');
        cylinder(.14, 1.38, [x, 1.01, 0], 'copper');
        for (const y of [.4, .53, 1.5, 1.63]) cylinder(.267, .035, [x, y, 0], 'red');
        box([.075, .22, .07], [x, 1.91, .31], 'copper');
      }
      for (const x of [-.68, .68]) for (const z of [-.27, .27]) foot(x, z);
      break;
    case 'substation':
      box([2.3, .14, 1.25], [0, .1, 0], 'dark', true); oilTank([-.51, .13, .02], .62);
      box([.87, 2.13, 1], [.67, 1.22, 0], 'body', true); box([.78, .89, .04], [.67, .71, .52], 'panel', true); box([.78, .85, .04], [.67, 1.63, .52], 'panel', true);
      box([1, .1, 1.13], [.67, 2.34, 0], 'red', true); handle(.37, .74, .56); handle(.37, 1.65, .56); warning(.7, 1.58, .55); warning(.7, .65, .55);
      for (const x of [.36, .66, .96]) insulator(x, 2.4, 0, .75);
      box([.47, .18, .45], [.07, 1.6, 0], 'body', true);
      break;
    case 'modular-substation':
      box([3.3, .15, 1.8], [0, .12, 0], 'dark', true); box([3.2, 1.65, 1.7], [0, 1.03, 0], 'body', true); roof(3.35, 1.78, 1.91);
      for (const x of [-1.01, 0, 1.01]) {
        box([.88, 1.45, .045], [x, 1.01, .88], 'panel', true); handle(x + .3, .98, .93);
        if (x !== 0) { vents(x, .39, .916, .67, 4); vents(x, 1.31, .916, .67, 4); } else warning(x, 1.21, .917);
      }
      for (const x of [-1.5, 1.5]) box([.045, 1.65, 1.73], [x, 1.03, 0], 'frame');
      break;
    case 'pole-substation':
      cylinder(.11, 3.9, [0, 1.95, -.32], 'frame'); box([1.5, .09, .25], [0, 3.62, -.18], 'frame', true);
      for (const x of [-.58, 0, .58]) insulator(x, 3.66, -.18, .66);
      oilTank([0, 1.63, .21], .62); box([1.16, .1, .98], [0, 1.72, .03], 'frame', true);
      box([.52, .64, .35], [0, .91, .04], 'body', true); handle(.16, .9, .23); warning(0, 1.02, .222, .075);
      box([.9, .07, .22], [0, 3.01, -.15], 'frame');
      for (const x of [-.36, 0, .36]) cylinder(.025, .43, [x, 3.21, -.15], 'insulator');
      break;
    case 'switchgear': cabinet('switchgear', 1.05, 2.5, 1); break;
    case 'distribution-cabinet': cabinet('distribution-cabinet'); break;
    case 'control-cabinet': cabinet('control-cabinet', 1.3, 1.9, .65); break;
    case 'compensation-cabinet': cabinet('compensation-cabinet', 1.35, 2, .82); break;
    case 'protection-cabinet':
      box([1.65, 1.37, .85], [0, .92, 0], 'body', true); box([1.49, 1.19, .04], [0, .91, .45], 'panel', true); box([1.82, .09, 1.01], [0, 1.69, 0], 'red', true);
      for (const x of [-.65, .65]) foot(x, 0, .24);
      for (const y of [.48, 1.3]) { const latch = cylinder(.045, .028, [-.58, y, .49], 'dark'); latch.rotation.x = Math.PI / 2; }
      vents(0, .5, -.441, 1.1); warning(0, .97, .479);
      break;
    case 'metering-box':
      box([.42, 2.7, .38], [0, 1.47, 0], 'body', true); box([.76, .15, .64], [0, .12, 0], 'dark', true);
      box([.47, .81, .1], [0, 1.85, .21], 'panel', true); box([.35, .69, .035], [0, 1.85, .28], 'body', true); handle(.1, 1.85, .315); roof(.85, .68, 2.89);
      break;
    case 'disconnector':
      box([2.1, .1, 1.13], [0, .22, 0], 'frame', true);
      for (const x of [-.72, 0, .72]) {
        for (const z of [-.36, .36]) insulator(x, .27, z, 1.6);
        const blade = box([.095, .08, 1.16], [x, 1.01, -.07], 'copper'); blade.rotation.x = -.48;
      }
      for (const x of [-.82, .82]) for (const z of [-.37, .37]) foot(x, z);
      box([.08, .53, .08], [1.08, .51, 0], 'dark'); box([.42, .055, .055], [1.27, .25, 0], 'dark');
      break;
    case 'wall-box':
    case 'wall-control-box': {
      const withControls = type === 'wall-control-box';
      box([1.28, 1.55, .57], [0, .85, 0], 'body', true);
      box([1.13, 1.39, .045], [0, .85, .314], 'panel', true);
      for (const x of [-.7, .7]) for (const y of [.37, 1.37]) box([.18, .17, .055], [x, y, -.28], 'frame');
      handle(-.4, .87, .36);
      if (withControls) {
        display(0, 1.23, .36, .43);
        for (const x of [-.13, .25]) for (const y of [.72, .4]) { const button = cylinder(.055, .04, [x, y, .37], 'dark'); button.rotation.x = Math.PI / 2; }
      }
      break;
    }
    case 'plain-floor-cabinet':
    case 'single-door-switchgear': {
      const switching = type === 'single-door-switchgear';
      box([1.03, 2.5, switching ? .94 : .76], [0, 1.39, 0], 'body', true);
      const front = switching ? .5 : .41;
      box([.91, switching ? 1.98 : 2.34, .045], [0, switching ? 1.18 : 1.39, front], 'panel', true);
      box([1.06, .12, switching ? .96 : .78], [0, .11, 0], 'dark');
      if (switching) { box([.91, .3, .04], [0, 2.42, front], 'body', true); box([.12, .045, .025], [0, 2.39, front + .036], 'dark'); }
      handle(-.34, 1.15, front + .05); warning(0, 1.47, front + .031);
      for (const y of [.55, 2]) box([.05, .13, .06], [.43, y, front + .025], 'frame');
      break;
    }
    case 'compact-substation':
    case 'double-compact-substation': {
      const centers = type === 'double-compact-substation' ? [-1.16, 1.16] : [0];
      for (const x of centers) {
        box([2.06, .14, 1.28], [x, .1, 0], 'dark', true);
        box([1.95, 1.48, 1.17], [x, .92, 0], 'body', true);
        box([2.08, .08, 1.32], [x, 1.72, 0], 'frame', true);
        for (const dx of [-.48, .48]) {
          box([.88, 1.31, .045], [x + dx, .91, .61], 'panel', true);
          handle(x + dx + .28, .96, .66); vents(x + dx, .34, .65, .54, 4); warning(x + dx, 1.26, .64, .09);
          box([.2, .24, .27], [x + dx, 1.88, -.07], 'frame');
          for (const dz of [-.24, 0, .24]) insulator(x + dx, 2.03, dz, .58);
        }
      }
      if (centers.length === 2) box([.27, .5, .58], [0, .43, .19], 'body', true);
      break;
    }
    case 'kiosk-substation':
      box([2.85, .12, 1.76], [0, .1, 0], 'dark', true); box([2.76, 1.82, 1.65], [0, 1.05, 0], 'body', true); roof(2.9, 1.74, 2.02);
      for (const x of [-1.23, -.63, -.06]) box([.02, 1.8, .025], [x, 1.05, .841], 'frame');
      for (const x of [.42, .99]) { box([.51, 1.55, .045], [x, .97, .86], 'panel', true); handle(x + (x < .5 ? .18 : -.18), 1.02, .91); }
      warning(.98, 1.47, .89, .095);
      break;
    case 'outdoor-switchgear-shelter':
      box([2.7, 1.9, 1.35], [0, 1.3, 0], 'body', true); roof(2.88, 1.47, 2.3);
      for (const x of [-1.17, 1.17]) { box([.15, .32, 1.2], [x, .2, 0], 'frame'); box([.42, .1, 1.4], [x, .03, 0], 'frame'); }
      for (const x of [-.89, 0, .89]) { box([.81, 1.78, .045], [x, 1.28, .7], 'panel', true); handle(x + .27, 1.22, .75); }
      break;
    case 'wall-canopy-box':
      box([1.2, 1.45, .73], [0, .84, 0], 'body', true); box([1.08, 1.32, .045], [0, .85, .4], 'panel', true);
      box([1.36, .13, .91], [0, 1.67, .02], 'frame', true); box([.29, .17, .02], [0, 1.24, .431], 'dark');
      for (const y of [.34, 1.35]) { box([.89, .06, .055], [0, y, -.54], 'frame'); for (const x of [-.39, .39]) box([.055, .06, .32], [x, y, -.43], 'frame'); }
      handle(-.4, .85, .46); warning(0, .8, .432); break;
    case 'mining-skid-substation':
      for (const z of [-.65, .65]) box([3.1, .13, .15], [0, .1, z], 'frame', true);
      box([2.9, .16, 1.35], [0, .27, 0], 'frame', true);
      box([1.23, 1.46, 1.13], [-.7, 1.04, 0], 'body', true);
      for (const x of [-.99, -.4]) { box([.53, 1.31, .04], [x, 1.04, .59], 'panel', true); vents(x, .5, .62, .35, 4); handle(x + .16, 1.18, .65); warning(x, 1.37, .62, .075); }
      oilTank([.66, .33, 0], .79);
      box([2.95, .1, 1.39], [0, 1.87, 0], 'frame', true);
      for (const x of [.2, 1.19]) for (const z of [-.48, .48]) box([.055, .91, .055], [x, 2.36, z], 'frame');
      box([1.05, .055, 1.02], [.7, 2.84, 0], 'frame');
      for (const z of [-.48, .48]) for (let i=0;i<6;i++) { box([.02,.85,.017],[.28+i*.16,2.36,z],'frame'); box([.94,.017,.017],[.7,2.01+i*.14,z],'frame'); }
      for (const x of [.47, .71, .95]) insulator(x, 1.93, 0, .8);
      break;
    case 'railway-frame-substation':
      box([3.5, .17, 1.45], [0, .1, 0], 'frame', true);
      for (const z of [-.43, .43]) {
        box([.095, 3.02, .095], [-1.35, 1.69, z], 'frame');
        insulator(-1.35, 3.22, z, .7);
        const brace=box([.06, 1.92, .06], [-1.04, 1.1, z], 'frame'); brace.rotation.z=.31;
      }
      for (const y of [2.65, 3.08]) box([.12,.08,1.06],[-1.35,y,0],'frame');
      oilTank([-.12,.23,0],.86);
      box([.39,1.68,1.11],[1.13,1.08,0],'body',true);box([.72,.72,.98],[1.35,.6,0],'body',true);
      box([.07,.74,.85],[-.15,2.26,0],'body',true);
      break;
    case 'upper-input-protection':
      box([1.23,.16,1.43],[0,.13,0],'frame',true);box([1.17,1.94,1.27],[0,1.2,0],'body',true);
      box([1.04,1.73,.045],[0,1.2,.666],'panel',true);handle(-.36,1.13,.71);warning(0,1.46,.7);
      box([1.36,.1,1.46],[0,2.24,0],'frame',true);
      for(const x of [-.45,.45]) box([.06,1.76,.07],[x,3.17,-.15],'frame');
      box([.97,.1,.78],[0,4.1,-.15],'frame',true);box([.91,.61,.64],[0,3.69,-.15],'body',true);warning(0,3.71,.185,.09);
      box([.91,.48,.58],[0,2.97,-.15],'body',true);box([.62,.45,.46],[0,2.49,-.15],'dark',true);
      for(const x of [-.34,.34]) insulator(x,4.16,-.15,.78);
      for(const x of [-.45,.45]) {const brace=box([.05,1.33,.05],[x,2.86,.27],'frame');brace.rotation.x=-.65;}
      break;
    case 'outdoor-floor-cabinet':
      box([1.3,.27,1.1],[0,.17,0],'frame',true);box([1.21,2.18,.97],[0,1.42,0],'body',true);
      box([1.07,2.01,.045],[0,1.42,.515],'panel',true);box([1.37,.1,1.14],[0,2.58,0],'frame',true);
      handle(-.36,1.27,.56);warning(0,1.73,.55);box([.25,.1,.02],[0,1.46,.55],'dark');
      break;
    default:
      box([1.5, 1.8, 1], [0, 1, 0], 'body', true); box([1.38, 1.65, .04], [0, 1, .52], 'panel', true); handle(-.5, 1, .57); warning(0, 1.05, .55);
  }
  // Normalize by longest dimension to fit one common camera for all shared types.
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.8 / Math.max(size.x, size.y, size.z);
  group.scale.setScalar(scale);
  group.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  group.userData.type = resolveModelType(type);
  // Dispose even unused palette entries (not reachable by traversing meshes).
  group.userData.materials = [...Object.values(materials), outlineMaterial];
  return group;
}

export function disposeEquipmentGeometry(group) {
  if (resolveProtectionExampleType(group.userData.type)) return disposeProtectionExampleGeometry(group);
  if (resolveMeasurementColumn2026Type(group.userData.type)) return disposeMeasurementColumn2026Geometry(group);
  if (resolveAccessory2026Type(group.userData.type)) return disposeAccessory2026Geometry(group);
  if (resolveTransformer2026Type(group.userData.type)) return disposeTransformer2026Geometry(group);
  const geometries = new Set();
  const materials = new Set(group.userData.materials || []);
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}
