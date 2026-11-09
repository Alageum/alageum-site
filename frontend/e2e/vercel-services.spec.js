import { test, expect } from '@playwright/test';

test.skip(process.env.E2E_VERCEL_SERVICES !== '1', 'Requires the explicit public-only Vercel ingress fixture');

test('Vercel public ingress refuses every API method without backend fallback', async ({ request }) => {
  for (const path of ['/api/v1/health', '/api/v1/readiness', '/api/openapi.json', '/api/v1/catalog/products/tmg-400', '/api/not-a-real-route']) {
    const response = await request.get(path);
    expect(response.status()).toBe(503);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect((await response.json()).error.code).toBe('service_unavailable');
  }
  const login = await request.post('/api/v1/auth/browser-login', { data: {} });
  expect(login.status()).toBe(503);
  expect((await login.json()).error.code).toBe('service_unavailable');
});

test('Vercel serves public pages/assets and replaces private entry points with honest unavailable state', async ({ request }) => {
  for (const path of ['/', '/company', '/catalog', '/client', '/en/company']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  }
  for (const path of ['/admin/catalog', '/login', '/account', '/en/account', '/catalog?source=api']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/(?:en\/)?service-unavailable$/);
    const unavailable = await request.get(response.headers().location);
    expect(unavailable.status()).toBe(200);
    expect(await unavailable.text()).not.toMatch(/<form|type="password"/);
  }
  for (const path of ['/docs', '/redoc', '/.env', '/README_HANDOFF.md',
    '/backend/app/core/config.py', '/backend-node/src/index.js', '/frontend/package.json',
    '/frontend/next.config.mjs', '/frontend/lib/api/client.js', '/frontend/.env', '/frontend/.env.production']) {
    const response = await request.get(path);
    expect(response.status(), `${path} must never expose repository source or environment files`).toBe(404);
  }
  const asset = await request.get('/brand/logo.png');
  expect(asset.status()).toBe(200);
  expect(asset.headers()['content-type']).toContain('image/png');
});

test('reloading the homepage at the top does not snap to the footer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const hero = page.getByRole('main').getByRole('heading', { level: 1 });
  await expect(hero).toBeInViewport();
  await page.reload();
  await expect(hero).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('contentinfo')).toHaveCSS('scroll-snap-align', 'none');
});

test('photos decode on public pages through the deployed ingress', async ({ page }) => {
  for (const [path, alt] of [
    ['/', 'Силовые трансформаторы в цехе Кентауского трансформаторного завода'],
    ['/company', 'Специалисты Алматинского электромеханического завода у электротехнического оборудования'],
    ['/projects', 'Автотрансформатор в производственном цехе Asia Trafo'],
  ]) {
    await page.goto(path);
    const photo = page.getByRole('img', { name: alt, exact: true }).first();
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate(image => image.complete && image.naturalWidth > 0), {
      message: `The photograph must load and decode on ${path}`,
    }).toBe(true);
  }
});

test('public catalogue browsing never makes backend requests or implies submitted data', async ({ page }) => {
  const apiRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Каталог оборудования', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Кабинет недоступен', exact: true }).first()).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/service-unavailable$/);
  await expect(page.getByRole('heading', { name: 'Сервис временно недоступен', exact: true })).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.getByText('Данные из черновиков сохраняются только в этом браузере и не отправляются компании автоматически.')).toBeVisible();
  expect(apiRequests).toEqual([]);
});
