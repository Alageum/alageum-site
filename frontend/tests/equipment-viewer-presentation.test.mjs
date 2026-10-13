import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Three from 'three';
import { equipmentModelTypes } from '../lib/catalog/models/types.js';
import { transformer2026Types } from '../lib/catalog/models/transformer2026Types.js';
import { accessory2026Types } from '../lib/catalog/models/accessory2026Types.js';
import { measurementColumn2026Types } from '../lib/catalog/models/measurementColumn2026Types.js';
import { protectionExampleTypes } from '../lib/catalog/models/protectionExampleTypes.js';

let harnessVersion = 0;

// Actual viewer and Three geometry/math; substitute only browser/GPU edges.
// These are configuration/lifecycle checks, not rendered-pixel evidence.
async function harness() {
  const renderers = [], controls = [], frames = new Map(), saved = new Map(); let nextFrame = 0;
  const set = (key, value) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
  class Renderer {
    constructor() { this.shadowMap = {}; this.renders = []; renderers.push(this); }
    setPixelRatio(value) { this.pixelRatio = value; } setClearColor() {}
    setSize(width, height) { this.size = [width, height]; }
    render(scene, camera) { this.renders.push({ exposure: this.toneMappingExposure, model: scene.children[0], camera: camera.position.clone() }); }
    dispose() { this.disposed = true; } forceContextLoss() { this.contextLost = true; }
  }
  class Controls extends Three.EventDispatcher {
    constructor(camera) { super(); this.camera = camera; this.target = new Three.Vector3(); controls.push(this); }
    update() { this.camera.lookAt(this.target); this.dispatchEvent({ type: 'change' }); }
    saveState() { this.home = this.camera.position.clone(); }
    reset() { this.camera.position.copy(this.home); this.update(); }
    dispose() { this.disposed = true; }
  }
  set('__viewerPresentationTest', { THREE: { ...Three, WebGLRenderer: Renderer }, OrbitControls: Controls });
  set('window', { devicePixelRatio: 1 });
  set('ResizeObserver', class { observe() {} disconnect() { this.disconnected = true; } });
  set('requestAnimationFrame', callback => { frames.set(++nextFrame, callback); return nextFrame; });
  set('cancelAnimationFrame', id => frames.delete(id));
  const source = readFileSync(new URL('../components/catalog/models/createEquipmentViewer.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const { THREE } = globalThis.__viewerPresentationTest;')
    .replace("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';", 'const { OrbitControls } = globalThis.__viewerPresentationTest;')
    .replace("'@/lib/catalog/models/geometry'", JSON.stringify(new URL('../lib/catalog/models/geometry.js', import.meta.url).href))
    .replace("'@/lib/catalog/models/protectionExampleTypes'", JSON.stringify(new URL('../lib/catalog/models/protectionExampleTypes.js', import.meta.url).href));
  const { createEquipmentViewer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#fixture-${++harnessVersion}`);
  return {
    open(type, width = 557, height = 330) {
      const listeners = new Map(), errors = [];
      const canvas = { getBoundingClientRect: () => ({ width, height }), addEventListener: (key, value) => listeners.set(key, value), removeEventListener: key => listeners.delete(key) };
      const session = createEquipmentViewer(canvas, type, () => errors.push('failure'));
      return { session, errors, listeners, renderer: renderers.at(-1), control: controls.at(-1) };
    },
    flush() { const current = [...frames.values()]; frames.clear(); current.forEach(callback => callback()); },
    close() { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

test('actual viewer changes exposure for only the two page-69 types across the entire existing type library', async () => {
  const h = await harness();
  try {
    const oldTypes = Object.keys({ ...equipmentModelTypes, ...transformer2026Types, ...accessory2026Types, ...measurementColumn2026Types });
    assert.equal(oldTypes.length, 126);
    for (const type of [...oldTypes, ...Object.keys(protectionExampleTypes), 'source69-ptm-u1-example-extra', 'source69-tde9-u3-example-extra', 'source69-paired-protection-examples-icon', '__proto__', undefined, null]) {
      const { session, renderer, errors } = h.open(type); h.flush();
      const expected = Object.hasOwn(protectionExampleTypes, type) ? 1.0 : 1.45;
      assert.equal(renderer.toneMappingExposure, expected, String(type));
      assert.equal(renderer.renders.length, 1); assert.equal(renderer.renders[0].exposure, expected);
      assert.equal(renderer.toneMapping, Three.ACESFilmicToneMapping); assert.deepEqual(errors, []);
      session.dispose(); assert.equal(renderer.disposed, true); assert.equal(renderer.contextLost, true);
    }
  } finally { h.close(); }
});

test('desktop/mobile sizing, controls, disposal and reopening retain independent renderer exposure', async () => {
  const h = await harness();
  try {
    for (const [width, height] of [[557, 330], [380, 300], [288, 300]]) for (const type of Object.keys(protectionExampleTypes)) {
      const { session, renderer, control, listeners, errors } = h.open(type, width, height); h.flush();
      assert.deepEqual(renderer.size, [width, height]); const home = renderer.renders.at(-1).camera.clone();
      session.rotate(.25); h.flush(); assert.notDeepEqual(renderer.renders.at(-1).camera.toArray(), home.toArray());
      session.zoom(1); h.flush(); assert.ok(renderer.renders.at(-1).camera.distanceTo(control.target) < home.distanceTo(control.target));
      session.reset(); h.flush(); assert.deepEqual(renderer.renders.at(-1).camera.toArray(), home.toArray());
      assert.ok(renderer.renders.every(frame => frame.exposure === 1.0));
      session.rotate(.25); const rendered = renderer.renders.length; session.dispose(); h.flush();
      assert.equal(renderer.renders.length, rendered); assert.equal(listeners.size, 0); assert.equal(control.disposed, true); assert.deepEqual(errors, []);
      const reopened = h.open('protection-cabinet', width, height); h.flush();
      assert.equal(reopened.renderer.renders[0].exposure, 1.45); reopened.session.dispose();
    }
  } finally { h.close(); }
});
