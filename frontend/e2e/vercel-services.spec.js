import { test, expect } from '@playwright/test';

test.skip(process.env.E2E_VERCEL_SERVICES !== '1', 'Requires vercel dev -L shared-origin ingress');

test('Vercel sends API paths to FastAPI without stripping the prefix or falling back', async ({ request }) => {
  for (const path of ['/api/v1/health', '/api/v1/readiness']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe('ok');
  }
  const schema = await request.get('/api/openapi.json');
  expect(schema.status()).toBe(200);
  expect((await schema.json()).paths).toHaveProperty('/api/v1/catalog/products');
  const product = await request.get('/api/v1/catalog/products/tmg-400');
  expect(product.status()).toBe(200);
  expect((await product.json()).public_key).toBe('tmg-400');
  const missing = await request.get('/api/not-a-real-route');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
});

test('Vercel sends pages and assets to Next.js and does not expose backend docs', async ({ request }) => {
  for (const path of ['/', '/catalog', '/admin/catalog', '/login']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  }
  for (const path of ['/docs', '/redoc']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('text/html');
  }
  const asset = await request.get('/brand/logo.png');
  expect(asset.status()).toBe(200);
  expect(asset.headers()['content-type']).toContain('image/png');
});

test('live catalog browser requests use the same public origin', async ({ page, baseURL }) => {
  const apiRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/')) apiRequests.push(request.url());
  });
  const productsResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/v1/catalog/products' && response.status() === 200);
  await page.goto('/catalog?source=api');
  await productsResponse;
  await expect(page.getByRole('heading', { name: 'Оборудование и цены', exact: true })).toBeVisible();
  await expect(page.getByRole('alert', { name: 'Ошибка каталога' })).toHaveCount(0);
  expect(apiRequests.length).toBeGreaterThan(0);
  for (const url of apiRequests) expect(new URL(url).origin).toBe(new URL(baseURL).origin);
});
