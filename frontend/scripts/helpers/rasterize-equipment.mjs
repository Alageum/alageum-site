// Deterministic CPU z-buffer preview of actual Three.js triangles, for source QA.
// This deliberately does not claim GPU material, shadow or WebGL equivalence.
import * as THREE from 'three';
export function rasterizeEquipment(model, camera, width = 460, height = 340) {
  model.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const viewProjection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const depth = new Float64Array(width * height).fill(Infinity);
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) { pixels[i] = 245; pixels[i + 1] = 245; pixels[i + 2] = 240; }
  const project = point => { point.applyMatrix4(viewProjection); return [(point.x + 1) * width / 2, (1 - point.y) * height / 2, point.z]; };
  const light = new THREE.Vector3(4, 7, 5).normalize(), fill = new THREE.Vector3(-4, 3, -3).normalize();
  model.traverse(object => {
    if (!object.isMesh) return;
    const attribute = object.geometry.attributes.position, index = object.geometry.index;
    const count = index ? index.count : attribute.count;
    for (let i = 0; i < count; i += 3) {
      const vertices = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(attribute, index ? index.getX(i + j) : i + j).applyMatrix4(object.matrixWorld));
      const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
      const shade = .48 + .6 * Math.max(0, normal.dot(light)) + .14 * Math.max(0, normal.dot(fill));
      const material = object.material;
      const color = material.color.clone().multiplyScalar(shade).convertLinearToSRGB();
      const rgb = [color.r, color.g, color.b].map(channel => Math.round(255 * THREE.MathUtils.clamp(channel, 0, 1)));
      const [a, b, c] = vertices.map(project);
      const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(denominator) < 1e-9) continue;
      const xmin = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), xmax = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const ymin = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), ymax = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
        const u = ((b[1] - c[1]) * (x + .5 - c[0]) + (c[0] - b[0]) * (y + .5 - c[1])) / denominator;
        const v = ((c[1] - a[1]) * (x + .5 - c[0]) + (a[0] - c[0]) * (y + .5 - c[1])) / denominator;
        const w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const z = u * a[2] + v * b[2] + w * c[2], pixel = y * width + x;
        if (z >= depth[pixel] || z < -1 || z > 1) continue;
        depth[pixel] = z; pixels.set(rgb, pixel * 3);
      }
    }
  });
  model.traverse(object => {
    if (!object.isLineSegments) return;
    const attribute = object.geometry.attributes.position;
    const material = object.material, color = material.color.clone().convertLinearToSRGB();
    const rgb = [color.r, color.g, color.b].map(channel => channel * 255), opacity = material.opacity;
    for (let i = 0; i < attribute.count; i += 2) {
      const [a, b] = [i, i + 1].map(j => project(new THREE.Vector3().fromBufferAttribute(attribute, j).applyMatrix4(object.matrixWorld)));
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps, x = Math.floor(a[0] + (b[0] - a[0]) * t), y = Math.floor(a[1] + (b[1] - a[1]) * t);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const z = a[2] + (b[2] - a[2]) * t, pixel = y * width + x;
        if (z > depth[pixel] + .00002) continue;
        for (let c = 0; c < 3; c++) pixels[pixel * 3 + c] = pixels[pixel * 3 + c] * (1 - opacity) + rgb[c] * opacity;
      }
    }
  });
  return { data: pixels, width, height, channels: 3 };
}
