import { expect, test } from '@playwright/test';

// The ordinary list/empty/isolation reads use real isolated PostgreSQL
// fixtures. Interception is limited to named error and delayed-response cases.
const api = process.env.E2E_DOCUMENT_API_URL?.replace(/\/$/, '');
const endpoint = `${api}/documents`;
const a = process.env.E2E_DOCUMENT_ORGANIZATION_A;
const b = process.env.E2E_DOCUMENT_ORGANIZATION_B;
const emptyOrganization = process.env.E2E_DOCUMENT_ORGANIZATION_EMPTY;
const versioned = process.env.E2E_DOCUMENT_ID_A;
const newest = process.env.E2E_DOCUMENT_ID_NEWEST;
const unversioned = process.env.E2E_DOCUMENT_ID_EMPTY;
const latestFile = process.env.E2E_DOCUMENT_FILE_ID_A;
const newestFile = process.env.E2E_DOCUMENT_FILE_ID_NEWEST;
const list = page => page.getByTestId('documents-list');
const summaries = page => page.getByTestId('document-summary');
const active = page => page.getByTestId('active-organization');
const alerts = page => page.locator('.shell > section').getByRole('alert');
const option = (page, id) => page.getByTestId(`organization-option-${id}`);
const email = kind => `document-${kind}@fixture.invalid`;
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
  expect(process.env.APP_ENV, 'Use backend-node/scripts/run-document-tests.sh').toBe('test');
  expect(process.env.ALAGEUM_TEST_DOCUMENT_FIXTURES).toBe('1');
  expect(Boolean(process.env.E2E_DOCUMENT_PASSWORD && process.env.E2E_DOCUMENT_PASSWORD.length >= 40)).toBe(true);
  for (const value of [api, process.env.E2E_DOCUMENT_BASE_URL]) {
    expect(Boolean(value), 'Both isolated loopback server URLs are required').toBe(true);
    const url = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
  for (const id of [a, b, emptyOrganization, versioned, newest, unversioned, latestFile, newestFile]) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(new Set([a, b, emptyOrganization]).size).toBe(3);
  // A replacement worker has a fresh local clock but shares the server limiter.
  // Waiting preserves the real limiter; there is no login retry or bypass.
  if (testInfo.workerIndex > 0) await new Promise(resolve => setTimeout(resolve, 61050));
});

async function login(page, kind = 'reader', next = '/b2b/documents') {
  await loginSlot();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email(kind));
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_DOCUMENT_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  if (kind === 'multi') {
    await option(page, a).check();
    await page.getByTestId('organization-chooser').getByRole('button', { name: 'Продолжить', exact: true }).click();
  }
  await expect(page).toHaveURL(new RegExp(`${next}$`));
  await expect(active(page)).toContainText(kind === 'other' ? b : kind === 'empty' ? emptyOrganization : a, { useInnerText: true });
}
async function installLogin(page, request, kind) {
  await loginSlot();
  const result = await request.post(`${api}/auth/login`, { data: { email: email(kind), password: process.env.E2E_DOCUMENT_PASSWORD } });
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
  await expect(active(page)).toContainText(id, { useInnerText: true });
}
const readResponse = page => page.waitForResponse(value => value.url() === endpoint && value.request().method() === 'GET');
const summary = (page, title) => summaries(page).filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const overview = page => page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true });
const documents = page => page.locator('.sidebar').getByRole('link', { name: 'Документы', exact: true });
function reply(route, body, status = 200) {
  if (route.request().method() === 'OPTIONS') return route.continue();
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': process.env.E2E_DOCUMENT_BASE_URL, 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
}
const rejection = { error: { code: 'fictitious_failure', message: 'Fictitious failure' } };
async function holdRealReply(page, url, { status, transform, method = 'GET', predicate = () => true } = {}) {
  const started = deferred(), released = deferred(), finished = deferred(); let held = false;
  const handler = async route => {
    if (route.request().method() !== method || held || !predicate(route.request())) return route.continue();
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

test('responsive document metadata retains the exact first-page DTO through reload and history', async ({ page }, testInfo) => {
  const errors = [], fileRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/api\/v1\/files(?:\/|\?|$)/.test(request.url())) fileRequests.push(request.url()); });
  const listed = readResponse(page); await login(page);
  const response = await listed; expect(response.status()).toBe(200);
  const firstPage = await response.json();
  expect(firstPage).toMatchObject({ page: 1, page_size: 50, total: 3 });
  expect(firstPage.items.map(item => item.id)).toEqual([newest, versioned, unversioned]);
  expect(firstPage.items.map(item => item.number)).toEqual(['FIXTURE-DOC-003', 'FIXTURE-DOC-001', null]);
  expect(firstPage.items.map(item => item.title)).toEqual(['Fictitious newest document', 'Fictitious versioned document', 'Fictitious unversioned document']);
  expect(firstPage.items.map(item => item.type_code)).toEqual(['fixture_active', 'fixture_inactive', 'fixture_active']);
  expect(firstPage.items.map(item => item.latest_file_id)).toEqual([newestFile, latestFile, null]);
  expect(firstPage.items.map(item => item.external_id)).toEqual([null, 'DISPOSABLE-DOCUMENT-001', null]);
  for (const item of firstPage.items) {
    expect(Object.keys(item).sort()).toEqual(['external_id', 'id', 'latest_file_id', 'number', 'source', 'title', 'type_code']);
    expect(item.source).toBe('FIXTURE');
  }
  await expect(summaries(page)).toHaveCount(3);
  await expect(summaries(page).first()).toContainText('FIXTURE-DOC-003', { useInnerText: true });
  await expect(summary(page, 'Fictitious versioned document')).toContainText('fixture_inactive', { useInnerText: true });
  await expect(summary(page, 'Fictitious unversioned document')).toContainText('Без номера', { useInnerText: true });
  await expect(page.getByText('FIXTURE-OTHER-001', { exact: true })).toHaveCount(0);
  await expect(list(page).getByRole('link')).toHaveCount(0);
  await expect(list(page).getByRole('button')).toHaveCount(0);
  await expect(list(page).locator('[download], a[href*="/files/"], a[href*="/documents/"]')).toHaveCount(0);
  await expect(list(page)).not.toContainText(latestFile, { useInnerText: true });
  await screenshot(page, testInfo, 'documents-list');
  await page.reload(); await expect(summaries(page)).toHaveCount(3);
  await overview(page).click(); await expect(list(page)).toHaveCount(0);
  const restored = readResponse(page); await page.goBack(); expect((await restored).status()).toBe(200);
  await expect(summary(page, 'Fictitious versioned document')).toContainText('FIXTURE-DOC-001', { useInnerText: true });
  await page.goForward(); await expect(list(page)).toHaveCount(0);
  await documents(page).click(); await expect(summaries(page)).toHaveCount(3);
  expect(fileRequests).toEqual([]); expect(errors).toEqual([]);
});

test('responsive empty documents are a successful real first-page read', async ({ page }, testInfo) => {
  const loaded = readResponse(page); await login(page, 'empty');
  const response = await loaded; expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ items: [], page: 1, page_size: 50, total: 0 });
  await expect(list(page).getByRole('status')).toHaveText('Данных пока нет', { useInnerText: true });
  await expect(summaries(page)).toHaveCount(0);
  await expect(alerts(page)).toHaveCount(0);
  await screenshot(page, testInfo, 'documents-empty');
});

test('document.read permission gate prevents document requests on direct navigation and reload', async ({ page }) => {
  const reads = []; page.on('request', request => { if (request.method() === 'GET' && request.url().startsWith(endpoint)) reads.push(request.url()); });
  await login(page, 'denied');
  await expect(alerts(page)).toHaveText('У вашей учётной записи нет доступа к документам.', { useInnerText: true });
  await expect(documents(page)).toHaveCount(0);
  await expect(list(page)).toHaveCount(0);
  await page.reload();
  await expect(alerts(page)).toHaveText('У вашей учётной записи нет доступа к документам.', { useInnerText: true });
  expect(reads).toEqual([]);
});

test('responsive failed and malformed document reads show bounded errors and explicit retry', async ({ page }, testInfo) => {
  const loaded = readResponse(page); await login(page); await expect(summaries(page)).toHaveCount(3);
  const actualPage = await (await loaded).json();
  const actual = actualPage.items.find(item => item.id === versioned);
  for (const scenario of [
    { status: 403, label: 'Нет доступа к документам.' },
    { status: 500, label: 'Не удалось загрузить документы. Повторите попытку.' },
    { network: true, label: 'Не удалось загрузить документы. Повторите попытку.' },
    { status: 200, body: { items: [] }, label: 'Не удалось подтвердить данные документов. Повторите загрузку.' },
    { status: 200, body: { ...actualPage, items: [{ ...actual, latest_file_id: 1 }] }, label: 'Не удалось подтвердить данные документов. Повторите загрузку.' },
    { status: 200, body: { ...actualPage, items: [{ ...actual, latest_file_id: '/files/private' }] }, label: 'Не удалось подтвердить данные документов. Повторите загрузку.' },
    { status: 200, body: { ...actualPage, items: [{ ...actual, type_code: {} }] }, label: 'Не удалось подтвердить данные документов. Повторите загрузку.' },
    { status: 200, body: { ...actualPage, items: [{ ...actual, number: undefined }] }, label: 'Не удалось подтвердить данные документов. Повторите загрузку.' },
    { status: 200, body: { ...actualPage, items: [{ ...actual, download_url: 'https://fixture.invalid' }] }, label: 'Не удалось подтвердить данные документов. Повторите загрузку.' },
  ]) {
    let requests = 0;
    const handler = route => { if (route.request().method() === 'OPTIONS') return route.continue(); requests++; return scenario.network ? route.abort('failed') : reply(route, scenario.body ?? rejection, scenario.status); };
    await page.route(endpoint, handler); await page.reload();
    await expect(alerts(page)).toHaveText(scenario.label, { useInnerText: true });
    await expect(list(page).getByRole('status')).toHaveCount(0);
    await expect(summaries(page)).toHaveCount(0);
    if (scenario.status === 500) await screenshot(page, testInfo, 'documents-retry');
    expect(requests).toBe(1); await page.unroute(endpoint, handler);
    const recovered = readResponse(page);
    await list(page).getByRole('button', { name: 'Повторить', exact: true }).click();
    expect((await recovered).status()).toBe(200);
    await expect(summaries(page)).toHaveCount(3);
    await expect(alerts(page)).toHaveCount(0);
  }
});

test('explicit nullable metadata and concurrent count differences remain valid document reads', async ({ page }) => {
  const loaded = readResponse(page); await login(page); await expect(summaries(page)).toHaveCount(3);
  const actualPage = await (await loaded).json(), actual = actualPage.items.find(item => item.id === versioned);
  for (const payload of [
    { ...actualPage, items: [{ ...actual, number: null, external_id: null, latest_file_id: null }], total: 0 },
    { ...actualPage, items: [], total: 3 },
  ]) {
    const handler = route => reply(route, payload);
    await page.route(endpoint, handler); await page.reload();
    await expect(list(page)).toHaveAttribute('aria-busy', 'false');
    await expect(summaries(page)).toHaveCount(payload.items.length);
    if (payload.items.length) await expect(summaries(page)).toContainText('Без номера', { useInnerText: true });
    else await expect(list(page).getByRole('status')).toHaveText('Данных пока нет', { useInnerText: true });
    await expect(alerts(page)).toHaveCount(0);
    await page.unroute(endpoint, handler);
  }
});

test('route interruption and Back restore discard held document success and error', async ({ page }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  for (const status of [undefined, 403]) {
    const held = await holdRealReply(page, endpoint, { status, transform: body => ({ ...body, items: body.items.map(item => ({ ...item, number: 'Fictitious stale prior route' })) }) });
    await page.reload(); expect((await held.started).status).toBe(200);
    await expect(list(page).getByRole('status')).toHaveText('Загрузка документов…', { useInnerText: true });
    await overview(page).click(); await expect(list(page)).toHaveCount(0);
    const restored = readResponse(page); await page.goBack(); expect((await restored).status()).toBe(200);
    await expect(summaries(page)).toHaveCount(3);
    await held.release();
    await expect(list(page)).not.toContainText('Fictitious stale prior route', { useInnerText: true });
    await expect(alerts(page)).toHaveCount(0);
    await page.goForward(); await expect(list(page)).toHaveCount(0);
    await documents(page).click(); await expect(summaries(page)).toHaveCount(3);
  }
});

test('organization switch drops held document reads and history restores the current tenant', async ({ page }) => {
  await login(page, 'multi'); await expect(summaries(page)).toHaveCount(3);
  const requestedOrganizations = []; page.on('request', request => { if (request.url() === endpoint && request.method() === 'GET') requestedOrganizations.push(request.headers()['x-organization-id']); });
  const held = await holdRealReply(page, endpoint);
  await page.reload(); expect((await held.started).status).toBe(200);
  await switchTo(page, b); await expect(page).toHaveURL(/\/b2b\/documents$/);
  await expect(summaries(page)).toHaveCount(1);
  await expect(summaries(page)).toContainText('FIXTURE-OTHER-001', { useInnerText: true });
  await held.release();
  await expect(list(page)).not.toContainText('FIXTURE-DOC-001', { useInnerText: true });
  await overview(page).click(); await expect(list(page)).toHaveCount(0);
  const restored = readResponse(page); await page.goBack(); expect((await restored).status()).toBe(200);
  await expect(summaries(page)).toContainText('FIXTURE-OTHER-001', { useInnerText: true });
  await page.goForward(); await expect(list(page)).toHaveCount(0);
  await documents(page).click(); await expect(summaries(page)).toHaveCount(1);
  expect(requestedOrganizations[0]).toBe(a);
  expect(requestedOrganizations.slice(1).every(id => id === b)).toBe(true);
  await expect(alerts(page)).toHaveCount(0);
});

test('logout discards held document success and error before history can restore metadata', async ({ page }) => {
  for (const status of [undefined, 401]) {
    await login(page); await expect(summaries(page)).toHaveCount(3);
    const held = await holdRealReply(page, endpoint, { status });
    await page.reload(); expect((await held.started).status).toBe(200);
    await page.evaluate(async url => {
      const session = JSON.parse(sessionStorage.getItem('alageum_session') || '{}');
      const response = await fetch(`${url}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!response.ok) throw new Error('Fixture logout failed');
      sessionStorage.removeItem('alageum_session');
      window.dispatchEvent(new Event('alageum:session-changed'));
    }, api);
    await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
    await held.release();
    await expect(list(page)).toHaveCount(0);
    await page.getByRole('banner').getByRole('link', { name: 'ALAGEUM Electric — главная', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
    await expect(list(page)).toHaveCount(0);
    expect(await page.evaluate(() => Boolean(JSON.parse(sessionStorage.getItem('alageum_session') || '{}').access_token))).toBe(false);
  }
});

test('same-organization and different-organization new logins invalidate held document responses', async ({ page, request }) => {
  for (const kind of ['peer', 'other']) {
    await login(page); await expect(summaries(page)).toHaveCount(3);
    const held = await holdRealReply(page, endpoint, { transform: body => ({ ...body, items: body.items.map(item => ({ ...item, number: 'Fictitious stale prior login' })) }) });
    await page.reload(); expect((await held.started).status).toBe(200);
    await installLogin(page, request, kind);
    await expect(list(page)).toHaveAttribute('aria-busy', 'false');
    await held.release();
    await expect(active(page)).toContainText(kind === 'other' ? b : a, { useInnerText: true });
    await expect(summaries(page)).toHaveCount(kind === 'other' ? 1 : 3);
    await expect(list(page)).not.toContainText('Fictitious stale prior login', { useInnerText: true });
    if (kind === 'other') await expect(list(page)).not.toContainText('FIXTURE-DOC-001', { useInnerText: true });
    await expect(alerts(page)).toHaveCount(0);
  }
});

test('late old-login document 401 cannot refresh or sign out a newer login', async ({ page, request }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  let refreshes = 0; page.on('request', request => { if (request.url() === `${api}/auth/refresh` && request.method() === 'POST') refreshes++; });
  const held = await holdRealReply(page, endpoint, { status: 401 });
  await page.reload(); expect((await held.started).status).toBe(200);
  await installLogin(page, request, 'other');
  await expect(summaries(page)).toContainText('FIXTURE-OTHER-001', { useInnerText: true });
  await held.release();
  await expect(active(page)).toContainText(b, { useInnerText: true });
  await expect(summaries(page)).toHaveCount(1); expect(refreshes).toBe(0);
});

test('Back and Forward reload failed documents without restoring a stale error', async ({ page }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  await overview(page).click(); await expect(list(page)).toHaveCount(0);
  const handler = route => reply(route, rejection, 500);
  await page.route(endpoint, handler);
  await documents(page).click(); await expect(alerts(page)).toHaveText('Не удалось загрузить документы. Повторите попытку.', { useInnerText: true });
  await page.unroute(endpoint, handler);
  await page.goBack(); await expect(list(page)).toHaveCount(0);
  const restored = readResponse(page); await page.goForward(); expect((await restored).status()).toBe(200);
  await expect(summaries(page)).toHaveCount(3); await expect(alerts(page)).toHaveCount(0);
});

test('document refresh recovers once and terminal expiration preserves the exact documents login return', async ({ page }) => {
  await login(page); await expect(summaries(page)).toHaveCount(3);
  let reads = 0, refreshes = 0;
  page.on('request', request => { if (request.url() === `${api}/auth/refresh` && request.method() === 'POST') refreshes++; });
  const once = route => {
    if (route.request().method() !== 'GET') return route.continue();
    return ++reads === 1 ? reply(route, rejection, 401) : route.continue();
  };
  await page.route(endpoint, once); await page.reload();
  await expect(summaries(page)).toHaveCount(3);
  expect(reads).toBe(2); expect(refreshes).toBe(1);
  await page.unroute(endpoint, once);
  const unauthorized = route => reply(route, rejection, 401), expired = route => reply(route, rejection, 401);
  await page.route(endpoint, unauthorized); await page.route(`${api}/auth/refresh`, expired);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
  await expect(list(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toHaveAttribute('href', '/login?next=%2Fb2b%2Fdocuments');
  await page.unroute(endpoint, unauthorized); await page.unroute(`${api}/auth/refresh`, expired);
  await login(page); await expect(summaries(page)).toHaveCount(3);
});

test('interrupted documents login cannot install a late session or reopen documents', async ({ page }) => {
  let documentReads = 0; page.on('request', request => { if (request.url() === endpoint && request.method() === 'GET') documentReads++; });
  const held = await holdRealReply(page, `${api}/auth/login`, { method: 'POST' });
  await loginSlot();
  await page.goto('/login?next=%2Fb2b%2Fdocuments');
  await page.getByLabel('Email', { exact: true }).fill(email('reader'));
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_DOCUMENT_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  expect((await held.started).status).toBe(200);
  await page.getByRole('banner').getByRole('link', { name: 'ALAGEUM Electric — главная', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await held.release();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => Boolean(JSON.parse(sessionStorage.getItem('alageum_session') || '{}').access_token))).toBe(false);
  expect(documentReads).toBe(0);
  await page.goto('/b2b/documents');
  await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});
