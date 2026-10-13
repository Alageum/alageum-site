import * as THREE from 'three';
import { transformer2026Types, resolveTransformer2026Type, TRANSFORMER_2026_DISCLOSURE } from './transformer2026Types.js';

// A small shared vocabulary constructs every reviewed topology. No rating, SKU,
// catalogue dimensions, material of internal windings or unpictured rear apparatus
// is inferred. Closed tanks and enclosures stay opaque. Scene units are arbitrary.
const palette = { body: 0xcad0ce, edge: 0x617079, panel: 0xe4e7e3, dark: 0x343f45, porcelain: 0xb4a999, cast: 0xaa6755, coil: 0xb8976a, metal: 0xa3aeb0 };
function primitives(root, materials) {
  const mesh = (name, geometry, at, color = 'body', parent = root) => {
    const item = new THREE.Mesh(geometry, materials[color]); item.name = name;
    item.position.set(...at); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  };
  const box = (name, size, at, color, parent) => mesh(name, new THREE.BoxGeometry(...size), at, color, parent);
  const cylinder = (name, r, h, at, color = 'body', parent = root, segments = 16) => mesh(name, new THREE.CylinderGeometry(r, r, h, segments), at, color, parent);
  const assembly = (name, at, build, rotation = [0, 0, 0]) => {
    const part = new THREE.Group(); part.name = name; part.position.set(...at); part.rotation.set(...rotation); root.add(part); build(part); return part;
  };
  const bushing = (name, at, height = .46, rotation = [0, 0, 0], radius = .1) => assembly(name, at, part => {
    cylinder('porcelain-core', radius * .5, height, [0, height / 2, 0], 'porcelain', part);
    for (let i = 0; i < 4; i++) cylinder('porcelain-shed', radius * (1 - i * .08), .035, [0, height * (.18 + i * .19), 0], 'porcelain', part);
    cylinder('terminal-contact', radius * .22, .09, [0, height + .03, 0], 'dark', part);
  }, rotation);
  const platedLvBushing = (at, name = 'top-lv-bushing') => assembly(name, at, part => {
    // Large page-13/page-17 LV terminals visibly exceed the HV row and end in
    // flat four-hole contact plates. Proportions below remain arbitrary units.
    cylinder('lv-porcelain-core', .055, .3, [0, .15, 0], 'porcelain', part);
    for (let i = 0; i < 3; i++) cylinder('lv-porcelain-shed', .105 - i * .009, .035, [0, .07 + i * .073, 0], 'porcelain', part);
    cylinder('lv-contact-neck', .047, .14, [0, .34, 0], 'dark', part);
    box('lv-flat-contact-plate', [.17, .19, .028], [0, .48, 0], 'metal', part);
    for (const x of [-.042, .042]) for (const y of [.435, .525]) {
      const hole = cylinder('lv-contact-plate-hole', .014, .032, [x, y, .002], 'dark', part); hole.rotation.x = Math.PI / 2;
    }
  });
  const rails = (w, d, wheels = false) => {
    for (const x of [-w * .32, w * .32]) {
      box('base-channel', [.13, .14, d + .25], [x, wheels ? .24 : .08, 0], 'edge');
      if (wheels) for (const z of [-d * .42, d * .42]) { const wheel = cylinder('transport-wheel', .11, .09, [x, .11, z], 'dark'); wheel.rotation.z = Math.PI / 2; }
    }
  };
  const corrugations = (w, h, d, y, sides = true, smoothFront = false) => {
    for (const z of smoothFront ? [-d / 2 - .06] : [-d / 2 - .06, d / 2 + .06]) for (let i = 0; i < 12; i++) box('corrugated-wall-fin', [.037, h * .86, .18], [-w * .45 + i * w * .9 / 11, y, z], 'body');
    if (sides) for (const x of [-w / 2 - .06, w / 2 + .06]) for (let i = 0; i < 6; i++) box('corrugated-end-fin', [.18, h * .86, .037], [x, y, -d * .4 + i * d * .8 / 5], 'body');
  };
  const conservator = (x, y, z, length = .95, radius = .22) => {
    for (const dz of [-length * .3, length * .3]) box('conservator-support', [.055, .28, .055], [x, y - radius - .13, z + dz], 'edge');
    const body = cylinder('external-conservator', radius, length, [x, y, z]); body.rotation.x = Math.PI / 2;
    const end = cylinder('conservator-end-cap', radius * .94, .014, [x, y, z + length / 2 + .01], 'panel'); end.rotation.x = Math.PI / 2;
    box('conservator-visible-pipe', [.045, .3, .045], [x, y - radius - .28, z], 'edge');
  };
  const longConservator = (x, y, z, length, radius = .22) => {
    const body = cylinder('external-conservator-long-axis', radius, length, [x, y, z]); body.rotation.z = Math.PI / 2;
    for (const dx of [-length * .35, length * .35]) box('conservator-support', [.055, .34, .055], [x + dx, y - radius - .17, z], 'edge');
  };
  const radiatorBank = (x, y, z, width, height, depth = .45) => {
    assembly('external-radiator-unit', [x, y, z], part => {
      for (let i = 0; i < 8; i++) box('external-radiator-panel', [width, height, .027], [0, 0, -depth / 2 + i * depth / 7], 'body', part);
      for (const dy of [-height * .48, height * .48]) box('radiator-header', [.055, .055, depth + .09], [0, dy, 0], 'edge', part);
    });
  };
  const endFans = (x, y, z, levels, height, end = 1) => {
    // Source end views show fan axes parallel to the tank length. Only the
    // explicitly drawn bank ends are represented, not one fan on every panel.
    for (let i = 0; i < levels; i++) {
      const fy = y + (levels === 1 ? height * .2 : (i - .5) * height * .5);
      const disc = cylinder('visible-fan-housing', .2, .045, [x, fy, z], 'dark'); disc.rotation.z = Math.PI / 2;
      for (const angle of [0, Math.PI / 3, -Math.PI / 3]) { const blade = box('visible-fan-grille', [.018, .34, .018], [x + end * .03, fy, z], 'metal'); blade.rotation.x = angle; }
    }
  };
  const smoothBushing = (at, height) => {
    cylinder('high-voltage-column-base', .16, .09, at, 'edge');
    cylinder('smooth-high-voltage-column', .092, height, [at[0], at[1] + height / 2, at[2]], 'porcelain');
    cylinder('high-voltage-terminal-contact', .03, .12, [at[0], at[1] + height + .04, at[2]], 'dark');
  };
  const grille = (name, x, y, z, w, h, mesh = false, parent = root) => {
    box(name, [w, h, .022], [x, y, z], 'dark', parent);
    for (let i = 0; i < 7; i++) box('vent-horizontal', [w, .018, .025], [x, y - h * .44 + h * .88 * i / 6, z + .02], 'metal', parent);
    if (mesh) for (let i = 0; i < 11; i++) box('vent-vertical', [.018, h, .026], [x - w * .46 + w * .92 * i / 10, y, z + .021], 'metal', parent);
  };
  return { root, box, cylinder, bushing, platedLvBushing, rails, corrugations, conservator, longConservator, radiatorBank, endFans, smoothBushing, grille, assembly };
}
function oil(p, o) {
  const [w, h, d] = ({ small: [1.5, 1.1, .82], large: [1.8, 1.65, 1], tall: [1.28, 1.8, .86], flat: [1.6, 1.4, .75], compact: [.9, 1.03, .72] })[o.size];
  const bottom = .18, top = h + bottom;
  p.rails(w, d);
  p.box('closed-oil-tank', [w, h, d], [0, bottom + h / 2, 0]);
  p.box('tank-cover', [w + .12, .07, d + .12], [0, top + .035, 0], 'panel');
  if (o.cooling === 'corrugated') p.corrugations(w, h, d, bottom + h / 2, true, o.poleBracket || o.sideBox);
  if (o.cooling === 'thin-ribs') for (const z of [-d / 2 - .025, d / 2 + .025]) for (let i = 0; i < 9; i++) p.box('visible-long-wall-rib', [.025, h * .77, .06], [-w * .38 + i * w * .76 / 8, bottom + h / 2, z], 'body');
  if (o.cooling === 'panels') for (const x of [-w * .33, w * .33]) for (const z of [-d / 2 - .34, d / 2 + .34]) p.radiatorBank(x, bottom + h / 2, z, .44, h * .82);
  // Flat TMTO tank illustrations intentionally omit the source's small schematic
  // cutaway, which identifies oil/active part rather than an exterior opening.
  const high = o.largeLvPlates ? .3 : o.tallBushings ? .7 : .44;
  const row = (count, z, height, name = 'top-lv-bushing', tilted = false) => { for (let i = 0; i < count; i++) p.bushing(name, [count === 1 ? 0 : -w * .31 + i * w * .62 / (count - 1), top + .075, z], height, [tilted ? -.4 : 0, 0, tilted ? (i - (count - 1) / 2) * -.3 : 0]); };
  if (o.sideTerminals) {
    for (let i = 0; i < o.hv; i++) p.bushing('end-hv-terminal', [w / 2 + .03, top - .31, -.26 + i * .26], .37, [0, 0, -Math.PI / 2], .085);
    for (let i = 0; i < o.lv; i++) { const terminal = p.platedLvBushing([-w / 2 - .03, top - .31, -.2 + i * .4], 'end-lv-terminal'); terminal.rotation.z = Math.PI / 2; }
  } else if (o.sideOnly) {
    for (const z of [-.21, .21]) p.bushing('horizontal-hv-bushing', [w / 2 + .04, top - .33, z], .52, [0, 0, -Math.PI / 2]);
    for (const x of [-.16, .16]) p.bushing('side-lv-bushing', [x, top - .14, d / 2 + .02], .16, [Math.PI / 2, 0, 0], .052);
  } else if (o.flanged) {
    for (const sign of [-1, 1]) {
      p.box('terminal-flange', [.35, .085, d * .87], [sign * w * .38, top + .1, 0], 'edge');
      const count = sign < 0 ? o.hv : o.lv;
      for (let i = 0; i < count; i++) { const z = -d * .3 + i * d * .6 / (count - 1); if (sign < 0) p.bushing('flange-hv-bushing', [sign * w * .38, top + .16, z], .32); else p.platedLvBushing([sign * w * .38 + (i % 2 ? -.09 : .09), top + .16, z], 'flange-lv-bushing'); }
    }
  } else if (o.singleRow) {
    for (let i = 0; i < 6; i++) p.bushing(i < 3 ? 'top-hv-bushing' : 'top-lv-bushing', [-w * .39 + i * w * .78 / 5, top + .075, .17], i < 3 ? .4 : .28);
  } else if (!o.hood && !o.sideBox) {
    row(o.hv, -.21, high, 'top-hv-bushing', o.tilted);
    if (o.largeLvPlates || o.lvPlates) for (let i = 0; i < o.lv; i++) { const terminal = p.platedLvBushing([-w * .31 + i * w * .62 / (o.lv - 1), top + .075, .23]); if (o.lvPlateHeight) terminal.scale.setScalar(o.lvPlateHeight / .575); if(o.lv >= 7) { terminal.scale.x *= .7; terminal.scale.z *= .7; } }
    else row(o.lv, .23, o.equalRows ? high : .25);
    if (o.thirdRow) row(3, 0, .31, 'top-tertiary-bushing');
  }
  if (o.conservator) {
    if (o.conservatorAxis === 'long-front') p.longConservator(0, top + .86, d * .47, w * .77);
    else { const cx = -w / 2 - .28; p.conservator(cx, top + .61, 0, d * 1.07); for (const z of [-d * .3, d * .3]) p.box('external-conservator-support-arm', [.38, .055, .055], [-w / 2 - .12, top + .12, z], 'edge'); }
  }
  if (o.fillTube) { p.cylinder('visible-oil-fill-tube', .036, .56, [(o.fillTubeSide || 1) * w * .46, top + .3, -.16], 'edge'); p.cylinder('oil-fill-cap', .06, .045, [(o.fillTubeSide || 1) * w * .46, top + .6, -.16], 'edge'); }
  if (o.drive) { p.box('external-tap-drive', [.33, .52, .22], [w / 2 + .18, top - .52, .2], 'panel'); p.box('external-drive-shaft', [.033, .53, .035], [w / 2 + .1, top - .13, .2], 'edge'); }
  if (o.poleBracket) {
    for (const x of [-.2, .2]) p.box('pole-mount-bracket', [.055, .65, .15], [x, .58, d / 2 + .22], 'edge');
    p.box('pole-mount-crossbar', [.52, .07, .15], [0, .37, d / 2 + .22], 'edge');
  }
  if (o.hood) {
    // Opaque hood: neither terminal routing nor unseen internal switch is invented.
    p.box('protective-terminal-hood', [w * .72, .42, d * .72], [0, top + .28, 0], 'panel');
    p.box('hood-top', [w * .74, .055, d * .75], [0, top + .51, 0], 'edge');
  }
  if (o.sideBox) { p.box('closed-side-terminal-box', [w * .74, .63, .46], [0, top - .42, d / 2 + .25], 'panel'); p.box('side-terminal-lid', [w * .78, .055, .49], [0, top - .08, d / 2 + .25], 'edge'); }
}
function measurement(p, o) {
  const h = .92, w = 1.05, d = .72, top = h + .18;
  p.rails(w, d);
  if (o.tank === 'box') { p.box('closed-rectangular-instrument-tank', [w, h, d], [0, .18 + h / 2, 0]); p.box('instrument-tank-cover', [w + .08, .055, d + .08], [0, top, 0], 'panel'); }
  else { p.cylinder(o.tank === 'polygon' ? 'closed-polygonal-instrument-tank' : 'closed-cylindrical-instrument-tank', .53, h, [0, .18 + h / 2, 0], 'body', p.root, o.tank === 'polygon' ? 8 : 24); p.cylinder('instrument-tank-cover', .57, .06, [0, top, 0], 'panel', p.root, o.tank === 'polygon' ? 8 : 24); }
  if (o.basePolygon) p.cylinder('polygonal-mounting-base', .56, .07, [0, .2, 0], 'edge', p.root, 6);
  if (o.column) {
    p.bushing('single-insulating-column', [0, top + .04, 0], 1.23, [0, 0, 0], .23);
    p.cylinder('upper-cylindrical-chamber', .22, .34, [0, top + 1.5, 0], 'body');
    p.cylinder('upper-chamber-terminal-contact', .033, .14, [0, top + 1.74, 0], 'dark');
    // Secondary contacts versus plugs cannot be classified from this source.
    // No guessed secondary terminals; record binding is held separately.
  } else {
    for (let i = 0; i < o.hv; i++) p.bushing('instrument-hv-bushing', [o.poleCylinder ? 0 : o.hv === 1 ? 0 : -.3 + .6 * i / (o.hv - 1), top + .03, o.poleCylinder ? -.28 + i * .56 : o.triangular && i === 1 ? -.3 : o.triangular ? .02 : -.12], o.bracket ? .65 : .58);
    for (let i = 0; i < o.lv; i++) p.bushing('instrument-secondary-terminal', [o.poleCylinder ? .3 : -.33 + .66 * i / Math.max(1, o.lv - 1), top + .03, o.poleCylinder ? -.27 + .54 * i / (o.lv - 1) : o.secondaryArc ? .22 + .17 * Math.sin(Math.PI * i / (o.lv - 1)) : .25], .13, [0, 0, 0], .045);
  }
  if (o.bracket) {
    for (const y of [.42, .92]) { p.box('visible-mounting-arm', [.12, .1, .3], [.57, y, 0], 'edge'); p.box('pole-mount-plate', [.08, .26, .28], [.72, y, 0], 'edge'); }
  }
}
function dryOpen(p, o, offsetY = 0, scale = 1) {
  const start = p.root.children.length;
  p.rails(1.8, .82, o.wheels);
  for (const y of [.42, 1.75]) p.box('visible-core-clamp', [1.95, .16, .83], [0, y, 0], 'edge');
  for (const x of [-.63, 0, .63]) {
    if (o.coil === 'cast') p.cylinder('visible-cast-coil', .27, 1.02, [x, 1.08, 0], 'cast');
    else p.box('visible-foil-coil-block', [.51, 1.04, .66], [x, 1.08, 0], 'coil');
    if (!o.busbarFront) p.box('visible-top-terminal-tab', [.13, .24, .05], [x, 1.94, .2], 'metal');
    if (o.terminalPlates) { p.box('front-terminal-plate', [.29, .28, .032], [x, 1.2, .35], 'panel'); for (const dx of [-.08, .08]) p.cylinder('terminal-bolt', .025, .035, [x + dx, 1.23, .39], 'dark').rotation.x = Math.PI / 2; }
  }
  if (o.busbarFront) for (const [count, z, name] of [[o.busbarFront, .34, 'front-busbar-terminal'], [o.busbarRear, -.34, 'rear-busbar-terminal']]) {
    p.box('visible-terminal-busbar-support', [1.7, .07, .07], [0, 1.88, z], 'edge');
    for (let i = 0; i < count; i++) p.box(name, [count > 6 ? .075 : .11, .26, .03], [-.74 + i * 1.48 / (count - 1), 1.99, z], 'metal');
  }
  if (o.links) {
    for (const [a, b] of [[[-.63, 1.48], [.63, .69]], [[-.63, .69], [0, 1.48]], [[0, .69], [.63, 1.48]]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const link = p.box('visible-diagonal-front-link', [.025, Math.hypot(dx, dy), .025], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .31], 'metal'); link.rotation.z = -Math.atan2(dx, dy);
    }
  }
  for (const item of p.root.children.slice(start)) { item.position.multiplyScalar(scale); item.position.y += offsetY; item.scale.multiplyScalar(scale); }
}
function enclosure(p, o) {
  const w = o.compact ? 1.24 : 1.96, h = o.compact ? 1.62 : 2.1, d = o.compact ? .87 : 1.02, y0 = o.wheels ? .33 : .17;
  p.rails(w, d, o.wheels);
  if (!o.cutaway) p.box('closed-dry-transformer-enclosure', [w, h, d], [0, y0 + h / 2, 0], 'panel');
  else {
    p.box('cutaway-back-panel', [w, h, .05], [0, y0 + h / 2, -d / 2], 'panel');
    for (const x of [-w / 2, w / 2]) p.box('cutaway-side-panel', [.05, h, d], [x, y0 + h / 2, 0], 'panel');
    p.box('cutaway-upper-front-panel', [w, h * .63, .055], [0, y0 + h * .685, d / 2], 'panel');
    dryOpen(p, { coil: 'cast', wheels: false }, y0 - .05, .8);
  }
  p.box('enclosure-roof', [w + .08, .06, d + .08], [0, y0 + h + .035, 0], 'edge');
  p.grille('upper-vent', 0, y0 + h * .78, d / 2 + .032, w * .74, h * .23, o.mesh);
  if (!o.cutaway) p.grille('lower-vent', 0, y0 + h * .22, d / 2 + .032, w * .74, h * .23, o.mesh);
  for (const x of [-w * .34, w * .34]) p.box('lifting-lug', [.075, .11, .07], [x, y0 + h + .115, 0], 'edge');
  if (o.sideTerminal) p.box('flush-side-terminal-panel', [.025, .24, d * .58], [w / 2 + .014, y0 + h * .8, 0], 'edge');
  if (o.sideVents) for (const level of o.sideVents === 'both' ? [.22, .78] : [.22]) p.assembly('visible-side-vent', [w / 2 + .027, y0 + h * level, 0], parent => p.grille('side-vent-face', 0, 0, 0, d * .7, h * .23, o.mesh, parent), [0, Math.PI / 2, 0]);
  if (o.topBushings) {
    for (const x of [-.58, 0, .58]) p.bushing('roof-hv-bushing', [x, y0 + h + .07, -.15], .54);
    for (const x of [-.45, -.15, .15, .45]) p.bushing('roof-lv-bushing', [x, y0 + h + .07, .29], .22, [0, 0, 0], .055);
  }
}
function powerAssembly(p, o) {
  const w = o.wide ? 2.5 : 2.08, h = o.tall ? 1.82 : 1.5, d = 1.03, y0 = .34, top = y0 + h;
  p.rails(w, d, true);
  p.box('closed-power-transformer-tank', [w, h, d], [0, y0 + h / 2, 0]);
  p.box('power-tank-cover', [w + .14, .075, d + .12], [0, top + .04, 0], 'panel');
  for (const unit of o.radiatorUnits) {
    const z = unit.side * (d / 2 + .4), x = unit.x * w;
    p.radiatorBank(x, y0 + h * .48, z, unit.width * w, h * .85, .46);
    for (const y of [y0 + .12, top - .2]) p.box('visible-radiator-connection', [.045, .045, .37], [x, y, unit.side * .64], 'edge');
  }
  for (const fan of o.fanEnds || []) {
    const units = o.radiatorUnits.filter(unit => unit.side === fan.side);
    const fraction = fan.x ?? (fan.end > 0 ? Math.max(...units.map(unit => unit.x + unit.width / 2)) : Math.min(...units.map(unit => unit.x - unit.width / 2)));
    const x = fraction * w + fan.end * .07, z = fan.side * (d / 2 + .4);
    if (fan.housingOnly) p.box('unclassified-cooling-end-housing', [.065, h * .73, .43], [x, y0 + h * .48, z], 'edge');
    else p.endFans(x, y0 + h * .48, z, fan.levels, h * .85, fan.end);
  }
  for (const terminalGroup of o.terminalGroups) for (const [x, z] of terminalGroup.positions) {
    const at = [x * w, top + .09, z], name = `power-${terminalGroup.role}-terminal`;
    if (terminalGroup.profile === 'smooth') p.smoothBushing(at, terminalGroup.height);
    else if (terminalGroup.profile === 'plate') { const terminal = p.platedLvBushing(at, name); terminal.scale.setScalar(terminalGroup.height / .575); }
    else p.bushing(name, at, terminalGroup.height, [0, 0, 0], terminalGroup.role === 'primary' ? .105 : .07);
  }
  if (o.conservatorAxis === 'long-side') p.longConservator(-w * .18, top + .59, d / 2 + .28, w * .62, .26);
  else p.conservator((o.conservatorEnd || -1) * (w / 2 + .18), top + .59, 0, 1.3, .26);
  if (o.ladder) {
    for (const dx of [-.13, .13]) { const rail = p.box('external-access-ladder-rail', [.036, h + .77, .037], [-w / 2 - .32 + dx, (top + .2) / 2, .74], 'edge'); rail.rotation.z = -.12; }
    for (let i = 0; i < 7; i++) p.box('external-access-ladder-rung', [.31, .035, .035], [-w / 2 - .32 + i * .02, .17 + i * .28, .74], 'edge');
  }
  if (o.externalCylinder) {
    p.cylinder('external-cylindrical-side-chamber', .29, h * .62, [w / 2 + .25, top - h * .29, 0], 'body');
    p.cylinder('external-chamber-lid', .32, .05, [w / 2 + .25, top + .045, 0], 'edge');
  }
  if (o.drive) { p.box('external-rpn-drive-case', [.32, .66, .35], [w / 2 + .19, y0 + .72, .23], 'panel'); p.box('visible-rpn-drive-shaft', [.033, .72, .033], [w / 2 + .14, top - .18, .23], 'edge'); }
}
const builders = { oil, measurement, 'dry-open': dryOpen, enclosure, 'power-assembly': powerAssembly };
export function createTransformer2026Geometry(type) {
  const resolved = resolveTransformer2026Type(type);
  if (!resolved) throw new RangeError(`No reviewed transformer construction: ${String(type)}`);
  const definition = transformer2026Types[resolved], group = new THREE.Group();
  group.name = `transformer2026-topology:${resolved}`;
  const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name, new THREE.MeshStandardMaterial({ color, roughness: .73, metalness: name === 'edge' ? .3 : .1 })]));
  builders[definition.build](primitives(group, materials), definition.layout);
  const bounds = new THREE.Box3().setFromObject(group), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.8 / Math.max(size.x, size.y, size.z);
  group.scale.setScalar(scale); group.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  group.userData = { type: resolved, units: 'arbitrary-scene-units', dimensionAccurate: false, exactMeshReuseAllowed: false, reviewStatus: 'topology-proposal', disclosure: TRANSFORMER_2026_DISCLOSURE, sourcePages: [...definition.pages], materials: Object.values(materials) };
  return group;
}
export function disposeTransformer2026Geometry(group) {
  const geometries = new Set(), materials = new Set(group.userData.materials || []);
  group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); });
  for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); group.clear();
}
