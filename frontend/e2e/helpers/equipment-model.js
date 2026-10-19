import { expect } from '@playwright/test';

// The current detail viewer starts automatically when its exact, admitted type
// mounts. This assertion never clicks an activation control and deliberately
// fails on a fallback or unusable context; existing pixel-evidence checks reject
// blank rendering, and forced no-WebGL cases test fallback separately.
export async function expectAutomaticModel(viewer, { timeout = 30_000 } = {}) {
  await expect(viewer).toHaveAttribute('data-model-status', 'ready', { timeout });
  await expect(viewer.getByRole('button', { name: 'Открыть 3D-модель', exact: true })).toHaveCount(0);
  const canvas = viewer.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0);
  }), { timeout }).toBe(true);
  return canvas;
}

// Gate the actual lazy renderer bytes, not the app/bootstrap chunks. With
// automatic startup the gate must be installed before navigation; blocking all
// chunks there would prevent hydration and would never exercise cancellation.
export async function holdAutomaticModelImport(page) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const requests = [];
  await page.route('**/_next/static/chunks/**', async route => {
    const response = await route.fetch();
    const body = await response.body();
    const script = body.toString('utf8');
    if (script.includes('forceContextLoss') && script.includes('toneMappingExposure') && script.includes('webglcontextlost')) {
      requests.push(route.request());
      await gate;
    }
    await route.fulfill({ response, body });
  });
  return { requests, release };
}
