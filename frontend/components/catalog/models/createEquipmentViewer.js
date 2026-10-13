import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEquipmentGeometry, disposeEquipmentGeometry } from '@/lib/catalog/models/geometry';
import { resolveProtectionExampleType } from '@/lib/catalog/models/protectionExampleTypes';

/** Called only after the user activates 3D. No render loop, autoplay or remote assets. */
export function createEquipmentViewer(canvas, type, onFailure) {
  let renderer;
  let equipment;
  let controls;
  let ground;
  let resizeObserver;
  let frame = 0;
  let disposed = false;
  let removeListeners = () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    removeListeners();
    controls?.dispose();
    if (equipment) disposeEquipmentGeometry(equipment);
    if (ground) { ground.geometry.dispose(); ground.material.dispose(); }
    renderer?.dispose();
    renderer?.forceContextLoss();
  };
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Page-69 examples use pale neutral faces: hosted captures at 1.45 put
    // even the side face above RGB 200. Use neutral exposure for these two
    // schematic examples; retain the reviewed lighting of all other types.
    renderer.toneMappingExposure = resolveProtectionExampleType(type) ? 1.0 : 1.45;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    equipment = createEquipmentGeometry(type);
    scene.add(equipment);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7c848b, 2.5));
    const light = new THREE.DirectionalLight(0xfff8e9, 3.5);
    light.position.set(3, 6, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 16 });
    light.shadow.normalBias = .04;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xdde9ff, 1.2);
    fill.position.set(-5, 3, -3);
    scene.add(fill);
    ground = new THREE.Mesh(new THREE.CircleGeometry(3.1, 48), new THREE.ShadowMaterial({ color: 0x536169, opacity: .18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -.015;
    ground.receiveShadow = true;
    scene.add(ground);
    const bounds = new THREE.Box3().setFromObject(equipment);
    const center = bounds.getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 40);
    const home = new THREE.Vector3(4.3, 3.35, 6.4).add(new THREE.Vector3(0, center.y - 1.15, 0));
    camera.position.copy(home);
    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, center.y * .94, 0);
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.enablePan = false;
    controls.minDistance = 4.1;
    controls.maxDistance = 11;
    controls.minPolarAngle = .2;
    controls.maxPolarAngle = Math.PI / 2 + .08;
    controls.rotateSpeed = .7;
    controls.zoomSpeed = .7;
    controls.update();
    controls.saveState();
    const render = () => {
      frame = 0;
      if (disposed) return;
      try { renderer.render(scene, camera); } catch { onFailure(); }
    };
    // Coalesce input/resize events; never schedule a frame from inside render().
    const requestRender = () => { if (!disposed && !frame) frame = requestAnimationFrame(render); };
    const resize = () => {
      if (disposed) return;
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const rotate = (horizontal, vertical = 0) => {
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      spherical.theta += horizontal;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + vertical, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
      requestRender();
    };
    const zoom = (direction) => {
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * (direction > 0 ? .86 : 1.16), controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
      requestRender();
    };
    const reset = () => { controls.reset(); requestRender(); };
    const keydown = (event) => {
      const actions = { ArrowLeft: () => rotate(.2), ArrowRight: () => rotate(-.2), ArrowUp: () => rotate(0, -.12), ArrowDown: () => rotate(0, .12), '+': () => zoom(1), '=': () => zoom(1), '-': () => zoom(-1), Home: reset, '0': reset };
      if (!actions[event.key]) return;
      event.preventDefault();
      actions[event.key]();
    };
    const contextLost = (event) => { event.preventDefault(); onFailure(); };
    controls.addEventListener('change', requestRender);
    canvas.addEventListener('keydown', keydown);
    canvas.addEventListener('webglcontextlost', contextLost);
    removeListeners = () => {
      controls.removeEventListener('change', requestRender);
      canvas.removeEventListener('keydown', keydown);
      canvas.removeEventListener('webglcontextlost', contextLost);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    return { rotate, zoom, reset, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
