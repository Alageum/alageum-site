import { expect, test } from '@playwright/test';

// The ordinary list/detail/empty/isolation reads use real isolated PostgreSQL
// fixtures. Interception is limited to named error and delayed-response cases.
const api = process.env.E2E_ORDERS_API_URL?.replace(/\/$/, '');
const endpoint = `${api}/orders`;
const a = process.env.E2E_ORDERS_ORGANIZATION_A;
const b = process.env.E2E_ORDERS_ORGANIZATION_B;
const emptyOrganization = process.env.E2E_ORDERS_ORGANIZATION_EMPTY;
const precise = process.env.E2E_ORDERS_ID_A;
const foreign = process.env.E2E_ORDERS_ID_B;
const empty = process.env.E2E_ORDERS_ID_EMPTY;
const newest = '40000000-0000-4000-8000-000000000003';
const missing = '40000000-0000-4000-8000-000000000099';
const list = page => page.getByTestId('orders-list');
const detail = page => page.getByTestId('order-detail');
const summaries = page => page.getByTestId('order-summary');
const active = page => page.getByTestId('active-organization');
const alerts = page => page.locator('.shell > section').getByRole('alert');
const option = (page, id) => page.getByTestId(`organization-option-${id}`);
const email = kind => `orders-${kind}@fixture.invalid`;
const loginTimes = [];
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

async function loginSlot() {
  while (loginTimes.length && Date.now() - loginTimes[0] > 61000) loginTimes.shift();
  if (loginTimes.length >= 16) {
    await new Promise(resolve => setTimeout(resolve, 61050 - (Date.now() - loginTimes[0])));
    while (loginTimes.length && Date.now() - loginTimes[0] > 61000) loginTimes.shift();
  }
  loginTimes.push(Date.now());
}

test.beforeAll(async ({}, testInfo) => {
  expect(process.env.APP_ENV, 'Use backend-node/scripts/run-orders-tests.sh').toBe('test');
  expect(process.env.ALAGEUM_TEST_ORDERS_FIXTURES).toBe('1');
  expect(Boolean(process.env.E2E_ORDERS_PASSWORD && process.env.E2E_ORDERS_PASSWORD.length >= 40)).toBe(true);
  for (const value of [api, process.env.E2E_ORDERS_BASE_URL]) {
    expect(Boolean(value), 'Both isolated loopback server URLs are required').toBe(true);
    const url = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
  for (const id of [a, b, emptyOrganization, precise, foreign, empty]) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(new Set([a, b, emptyOrganization]).size).toBe(3);
  // A replacement worker has a fresh local clock but shares the server limiter.
  // Waiting preserves the real limiter; there is no login retry or bypass.
  if (testInfo.workerIndex > 0) await new Promise(resolve => setTimeout(resolve, 61050));
});

async function login(page, kind = 'reader', next = '/b2b/orders') {
  await loginSlot();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email(kind));
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_ORDERS_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  if (kind === 'multi') {
    await option(page, a).check();
    await page.getByTestId('organization-chooser').getByRole('button', { name: 'Продолжить', exact: true }).click();
  }
  await expect(page).toHaveURL(new RegExp(`${next}$`));
  await expect(active(page)).toContainText(kind === 'other' ? b : kind === 'empty' ? emptyOrganization : a);
}
async function installLogin(page, request, kind) {
  await loginSlot();
  const result = await request.post(`${api}/auth/login`, { data: { email: email(kind), password: process.env.E2E_ORDERS_PASSWORD } });
  expect(result.status()).toBe(200);
  const pair = await result.json();
  await page.evaluate(session => {
    sessionStorage.setItem('alageum_session', JSON.stringify(session));
    window.dispatchEvent(new Event('alageum:session-changed'));
  }, { ...pair, organization_id: kind === 'other' ? b : a });
}
async function switchTo(page, id) {
  await page.getByTestId('organization-switch-trigger').click();
  await option(page, id).check();
  await page.getByRole('dialog', { name: 'Выбор организации', exact: true }).getByRole('button', { name: 'Переключить организацию', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Выбор организации', exact: true })).not.toBeVisible();
  await expect(active(page)).toContainText(id);
}
const readResponse = (page, id) => page.waitForResponse(value => value.url() === (id ? `${endpoint}/${id}` : endpoint) && value.request().method() === 'GET');
const orderLink = (page, number) => summaries(page).filter({ has: page.getByRole('heading', { name: number, exact: true }) });
const backToList = page => detail(page).getByRole('link', { name: 'К списку заказов', exact: true });
function reply(route, body, status = 200) {
  if (route.request().method() === 'OPTIONS') return route.continue();
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': process.env.E2E_ORDERS_BASE_URL, 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
}
const rejection = { error: { code: 'fictitious_failure', message: 'Fictitious failure' } };
async function holdRealReply(page, url, { status, transform, predicate = () => true } = {}) {
  const started = deferred(), released = deferred(), finished = deferred(); let held = false;
  const handler = async route => {
    if (route.request().method() !== 'GET' || held || !predicate(route.request())) return route.continue();
    held = true;
    try {
      const actual = await route.fetch();
      const body = await actual.json();
      started.resolve({ status: actual.status(), body });
      await released.promise;
      if (status) await reply(route, rejection, status);
      else if (transform) await reply(route, transform(body));
      else await route.fulfill({ response: actual });
    } catch { started.resolve({ status: 0 }); }
    finally { finished.resolve(); }
  };
  await page.route(url, handler);
  return { started: started.promise, async release() { released.resolve(); await finished.promise; await page.unroute(url, handler); } };
}
async function screenshot(page, testInfo, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, top: window.visualViewport?.pageTop ?? 0, header: Math.round(document.querySelector('header.site-header').getBoundingClientRect().top) }))).toEqual({ x: 0, y: 0, top: 0, header: 0 });
  await expect(page.getByRole('banner')).toBeInViewport();
  await expect.poll(() => page.locator('.site-skip-link').evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, scale: Math.round((window.visualViewport?.scale ?? 1) * 1000) / 1000 }))).toEqual({ fits: true, scale: 1 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('responsive orders list and detail preserve real snapshot decimals through reload and history', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const listed = readResponse(page); await login(page);
  const response = await listed; expect(response.status()).toBe(200);
  const firstPage = await response.json();
  expect(firstPage).toMatchObject({ page: 1, page_size: 50, total: 3 });
  await expect(summaries(page)).toHaveCount(3);
  await expect(summaries(page).first()).toContainText('FIXTURE-ORD-003');
  await expect(orderLink(page, 'FIXTURE-ORD-001')).toContainText('9999999999999999.99 KZT');
  await expect(page.getByText('FIXTURE-OTHER-001', { exact: true })).toHaveCount(0);
  await screenshot(page, testInfo, 'orders-list');
  const loaded = readResponse(page, precise); await orderLink(page, 'FIXTURE-ORD-001').click();
  const actual = await loaded; expect(actual.status()).toBe(200);
  const body = await actual.json();
  expect(body).toMatchObject({ id: precise, amount: '9999999999999999.99' });
  expect(body.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ quantity: '999999999999999.999', unit_price: '9999999999999999.99' }),
    expect.objectContaining({ quantity: '0.001', unit_price: null }),
  ]));
  await expect(detail(page).getByRole('heading', { name: 'Заказ FIXTURE-ORD-001', exact: true })).toBeVisible();
  await expect(page.getByTestId('order-item').filter({ hasText: 'Fictitious precise item — 999999999999999.999' })).toBeVisible();
  await expect(page.getByTestId('order-item').filter({ hasText: 'Fictitious nullable item — 0.001' })).toBeVisible();
  await screenshot(page, testInfo, 'orders-detail');
  await page.reload(); await expect(detail(page)).toContainText('9999999999999999.99 KZT');
  await backToList(page).click(); await expect(summaries(page)).toHaveCount(3);
  await page.goBack(); await expect(detail(page)).toContainText('9999999999999999.99 KZT');
  await page.goForward(); await expect(summaries(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('responsive empty orders and no-item order are successful real reads', async ({ page, request }, testInfo) => {
  const loaded = readResponse(page); await login(page, 'empty');
  const response = await loaded; expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ items: [], page: 1, page_size: 50, total: 0 });
  await expect(list(page).getByRole('status')).toHaveText('Данных пока нет');
  await expect(summaries(page)).toHaveCount(0);
  await screenshot(page, testInfo, 'orders-empty');
  await installLogin(page, request, 'reader');
  await expect(summaries(page)).toHaveCount(3);
  const detailRead = readResponse(page, empty); await orderLink(page, 'FIXTURE-ORD-002').click();
  expect((await (await detailRead).json()).items).toEqual([]);
  await expect(detail(page)).toContainText('Сумма: 0.00 KZT');
  await expect(detail(page).getByRole('status')).toHaveText('В заказе пока нет позиций.');
});

test('permission gate prevents list and direct detail requests before order.read', async ({ page }) => {
  const reads = []; page.on('request', request => { if (request.method() === 'GET' && request.url().startsWith(endpoint)) reads.push(request.url()); });
  await login(page, 'denied');
  await expect(alerts(page)).toHaveText('У вашей учётной записи нет доступа к заказам.');
  await expect(page.getByRole('link', { name: 'Заказы', exact: true })).toHaveCount(0);
  await page.goto(`/b2b/orders/${precise}`);
  await expect(alerts(page)).toHaveText('У вашей учётной записи нет доступа к заказам.');
  await expect(detail(page)).toHaveCount(0); expect(reads).toEqual([]);
});

test('responsive failed and malformed reads are visible errors with explicit retry', async ({ page }, testInfo) => {
  const loaded = readResponse(page); await login(page); await expect(summaries(page)).toHaveCount(3);
  const actualPage = await (await loaded).json();
  const preciseOrder = actualPage.items.find(item => item.id === precise);
  for (const scenario of [
    { url: endpoint, path: '/b2b/orders', status: 403, label: 'Нет доступа к заказам.' },
    { url: endpoint, path: '/b2b/orders', status: 500, label: 'Не удалось загрузить заказы. Повторите попытку.' },
    { url: endpoint, path: '/b2b/orders', network: true, label: 'Не удалось загрузить заказы. Повторите попытку.' },
    { url: endpoint, path: '/b2b/orders', status: 200, body: { items: [] }, label: 'Не удалось подтвердить данные заказа. Повторите загрузку.' },
    { url: endpoint, path: '/b2b/orders', status: 200, body: { ...actualPage, items: [{ ...preciseOrder, amount: 1 }] }, label: 'Не удалось подтвердить данные заказа. Повторите загрузку.' },
    { url: `${endpoint}/${precise}`, path: `/b2b/orders/${precise}`, status: 200, body: { id: precise, items: [] }, label: 'Не удалось подтвердить данные заказа. Повторите загрузку.' },
    { url: `${endpoint}/${precise}`, path: `/b2b/orders/${precise}`, status: 200, body: { ...preciseOrder, id: newest }, label: 'Не удалось подтвердить данные заказа. Повторите загрузку.' },
    { url: `${endpoint}/${precise}`, path: `/b2b/orders/${precise}`, status: 403, label: 'Нет доступа к заказам.' },
    { url: `${endpoint}/${precise}`, path: `/b2b/orders/${precise}`, status: 404, label: 'Заказ не найден.' },
  ]) {
    let requests = 0;
    const handler = route => { if (route.request().method() === 'OPTIONS') return route.continue(); requests++; return scenario.network ? route.abort('failed') : reply(route, scenario.body ?? rejection, scenario.status); };
    await page.route(scenario.url, handler); await page.goto(scenario.path);
    await expect(alerts(page)).toHaveText(scenario.label);
    await expect(page.getByText('Данных пока нет', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('order-item')).toHaveCount(0);
    if (scenario.status === 500) await screenshot(page, testInfo, 'orders-retry');
    expect(requests).toBe(1); await page.unroute(scenario.url, handler);
    const recovered = readResponse(page, scenario.path === '/b2b/orders' ? undefined : precise);
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    expect((await recovered).status()).toBe(200);
    if (scenario.path === '/b2b/orders') await expect(summaries(page)).toHaveCount(3);
    else await expect(detail(page)).toContainText('Заказ FIXTURE-ORD-001');
    await expect(alerts(page)).toHaveCount(0);
  }
});

test('foreign, missing and malformed IDs never display an accessible old detail', async ({ page }) => {
  await login(page, 'reader', `/b2b/orders/${precise}`);
  await expect(detail(page)).toContainText('Заказ FIXTURE-ORD-001');
  for (const id of [foreign, missing]) {
    const pending = readResponse(page, id); await page.goto(`/b2b/orders/${id}`);
    expect((await pending).status()).toBe(404);
    await expect(alerts(page)).toHaveText('Заказ не найден.');
    await expect(page.getByTestId('order-item')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Заказ FIXTURE-ORD-001', exact: true })).toHaveCount(0);
  }
  let invalidReads = 0; page.on('request', request => { if (request.url() === `${endpoint}/not-a-uuid`) invalidReads++; });
  await page.goto('/b2b/orders/not-a-uuid');
  await expect(alerts(page)).toHaveText('Некорректный номер заказа.'); expect(invalidReads).toBe(0);
});

test('route changes cancel a held detail and ignore late success and error for the old ID', async ({ page }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  for (const status of [undefined, 403]) {
    const held = await holdRealReply(page, `${endpoint}/${precise}`, { status });
    await orderLink(page, 'FIXTURE-ORD-001').click();
    expect((await held.started).status).toBe(200);
    await expect(detail(page).getByRole('status')).toHaveText('Загрузка заказов…');
    await backToList(page).click(); await expect(summaries(page)).toHaveCount(3);
    await orderLink(page, 'FIXTURE-ORD-003').click(); await expect(detail(page)).toContainText('Заказ FIXTURE-ORD-003');
    await held.release();
    await expect(detail(page)).toContainText('Fictitious newest item — 1.000');
    await expect(detail(page)).not.toContainText('FIXTURE-ORD-001'); await expect(alerts(page)).toHaveCount(0);
    await backToList(page).click(); await expect(summaries(page)).toHaveCount(3);
  }
});

test('organization switch drops pending old detail before new-tenant reads and history restores', async ({ page }) => {
  await login(page, 'multi'); await expect(summaries(page)).toHaveCount(3);
  const oldDetailHeaders = []; page.on('request', request => { if (request.url() === `${endpoint}/${precise}` && request.method() === 'GET') oldDetailHeaders.push(request.headers()['x-organization-id']); });
  const held = await holdRealReply(page, `${endpoint}/${precise}`);
  await orderLink(page, 'FIXTURE-ORD-001').click(); expect((await held.started).status).toBe(200);
  await switchTo(page, b); await expect(page).toHaveURL(/\/b2b\/orders$/);
  await expect(summaries(page)).toHaveCount(1); await expect(summaries(page)).toContainText('FIXTURE-OTHER-001');
  await held.release();
  await expect(page.getByText('Fictitious precise item', { exact: false })).toHaveCount(0);
  await page.goBack(); await expect(summaries(page)).toContainText('FIXTURE-OTHER-001');
  await page.goForward(); await expect(summaries(page)).toContainText('FIXTURE-OTHER-001');
  expect(oldDetailHeaders).toContain(a); expect(oldDetailHeaders).not.toContain(b);
});

test('new login and same-organization login invalidate held list responses', async ({ page, request }) => {
  for (const kind of ['peer', 'other']) {
    await login(page); await expect(summaries(page)).toHaveCount(3);
    // A named stale-response marker makes same-organization re-login observable
    // even though both real accounts are allowed to read the same snapshots.
    const held = await holdRealReply(page, endpoint, { transform: body => ({ ...body, items: body.items.map(item => ({ ...item, number: 'Fictitious stale prior login' })) }) });
    await page.reload(); expect((await held.started).status).toBe(200);
    await installLogin(page, request, kind);
    await expect(list(page)).toHaveAttribute('aria-busy', 'false');
    await held.release();
    await expect(active(page)).toContainText(kind === 'other' ? b : a);
    await expect(summaries(page)).toHaveCount(kind === 'other' ? 1 : 3);
    await expect(list(page)).not.toContainText('Fictitious stale prior login');
    if (kind === 'other') await expect(list(page)).not.toContainText('FIXTURE-ORD-001');
    await expect(alerts(page)).toHaveCount(0);
  }
});

test('late old-login 401 cannot refresh or sign out the newer login', async ({ page, request }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  let refreshes = 0; page.on('request', request => { if (request.url() === `${api}/auth/refresh` && request.method() === 'POST') refreshes++; });
  const held = await holdRealReply(page, `${endpoint}/${precise}`, { status: 401 });
  await orderLink(page, 'FIXTURE-ORD-001').click(); expect((await held.started).status).toBe(200);
  await installLogin(page, request, 'other');
  await expect(page).toHaveURL(/\/b2b\/orders$/); await expect(summaries(page)).toContainText('FIXTURE-OTHER-001');
  await held.release();
  await expect(active(page)).toContainText(b); await expect(summaries(page)).toHaveCount(1); expect(refreshes).toBe(0);
});

test('Back and Forward reload a failed detail without restoring its stale error', async ({ page }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  const handler = route => reply(route, rejection, 500);
  await page.route(`${endpoint}/${newest}`, handler);
  await orderLink(page, 'FIXTURE-ORD-003').click(); await expect(detail(page).getByRole('alert')).toBeVisible();
  await page.unroute(`${endpoint}/${newest}`, handler);
  await page.goBack(); await expect(summaries(page)).toHaveCount(3);
  const restored = readResponse(page, newest); await page.goForward(); expect((await restored).status()).toBe(200);
  await expect(detail(page)).toContainText('Заказ FIXTURE-ORD-003'); await expect(alerts(page)).toHaveCount(0);
});

test('read refresh recovers once and terminal expiration preserves a safe exact detail login return', async ({ page }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  let reads = 0, refreshes = 0;
  page.on('request', request => { if (request.url() === `${api}/auth/refresh` && request.method() === 'POST') refreshes++; });
  const once = route => {
    if (route.request().method() !== 'GET') return route.continue();
    return ++reads === 1 ? reply(route, rejection, 401) : route.continue();
  };
  await page.route(`${endpoint}/${precise}`, once);
  await orderLink(page, 'FIXTURE-ORD-001').click();
  await expect(detail(page)).toContainText('Заказ FIXTURE-ORD-001');
  expect(reads).toBe(2); expect(refreshes).toBe(1);
  await page.unroute(`${endpoint}/${precise}`, once);
  const unauthorized = route => reply(route, rejection, 401);
  const expired = route => reply(route, rejection, 401);
  await page.route(`${endpoint}/${empty}`, unauthorized);
  await page.route(`${api}/auth/refresh`, expired);
  await page.goto(`/b2b/orders/${empty}`);
  await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
  await expect(detail(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/b2b/orders/${empty}`)}`);
  await page.unroute(`${endpoint}/${empty}`, unauthorized); await page.unroute(`${api}/auth/refresh`, expired);
  await login(page, 'reader', `/b2b/orders/${empty}`);
  await expect(detail(page)).toContainText('Заказ FIXTURE-ORD-002');
});
