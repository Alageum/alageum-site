import { expect, test } from '@playwright/test';

// Ordinary list, pagination, inactive/global-role and tenant reads use isolated
// PostgreSQL fixtures. Only explicitly named errors/races use interception.
const api = process.env.E2E_MEMBER_API_URL?.replace(/\/$/, '');
const endpoint = `${api}/organizations/members`;
const a = process.env.E2E_MEMBER_ORGANIZATION_A, b = process.env.E2E_MEMBER_ORGANIZATION_B;
const memberId = number => `70000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const path = number => number === 1 ? '/b2b/members' : `/b2b/members?page=${number}`;
const url = number => `${endpoint}?page=${number}&page_size=50`;
const list = page => page.getByTestId('members-list');
const rows = page => page.getByTestId('member-row');
const active = page => page.getByTestId('active-organization');
const alerts = page => page.locator('.shell > section').getByRole('alert');
const option = (page, id) => page.getByTestId(`organization-option-${id}`);
const chooser = page => page.getByRole('dialog', { name: 'Выбор организации', exact: true });
const next = page => page.getByRole('button', { name: 'Следующая', exact: true });
const previous = page => page.getByRole('button', { name: 'Предыдущая', exact: true });
const first = page => page.getByRole('button', { name: 'К первой странице', exact: true });
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
  expect(process.env.APP_ENV, 'Use backend-node/scripts/run-member-tests.sh').toBe('test');
  expect(process.env.ALAGEUM_TEST_MEMBER_FIXTURES).toBe('1');
  expect(Boolean(process.env.E2E_MEMBER_PASSWORD && process.env.E2E_MEMBER_PASSWORD.length >= 40)).toBe(true);
  for (const value of [api, process.env.E2E_MEMBER_BASE_URL]) {
    expect(Boolean(value), 'Isolated loopback URLs are required').toBe(true);
    const parsed = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(parsed.hostname);
    expect(parsed.protocol).toBe('http:'); expect(parsed.username + parsed.password + parsed.search + parsed.hash).toBe('');
  }
  for (const value of [a, b]) expect(value).toMatch(/^[a-f0-9-]{36}$/);
  expect(a).not.toBe(b);
  if (testInfo.workerIndex > 0) await new Promise(resolve => setTimeout(resolve, 61050));
});

async function login(page, kind = 'reader', destination = path(1)) {
  await loginSlot();
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel('Email', { exact: true }).fill(`member-${kind}@fixture.invalid`);
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_MEMBER_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  if (kind === 'multi') {
    await option(page, a).check();
    await page.getByTestId('organization-chooser').getByRole('button', { name: 'Продолжить', exact: true }).click();
  }
  await expect(page).toHaveURL(new URL(destination, process.env.E2E_MEMBER_BASE_URL).href);
  await expect(active(page)).toContainText(kind === 'other' ? b : a);
}

async function loginPair(request, kind) {
  await loginSlot();
  const result = await request.post(`${api}/auth/login`, { data: { email: `member-${kind}@fixture.invalid`, password: process.env.E2E_MEMBER_PASSWORD } });
  expect(result.status()).toBe(200);
  return { ...await result.json(), organization_id: kind === 'other' ? b : a };
}

async function installLogin(page, request, kind, notify = true) {
  const session = await loginPair(request, kind);
  await page.evaluate(({ session, notify }) => {
    sessionStorage.setItem('alageum_session', JSON.stringify(session));
    if (notify) window.dispatchEvent(new Event('alageum:session-changed'));
  }, { session, notify });
}

async function switchTo(page, id) {
  await page.getByTestId('organization-switch-trigger').click(); await option(page, id).check();
  await chooser(page).getByRole('button', { name: 'Переключить организацию', exact: true }).click();
  await expect(chooser(page)).not.toBeVisible(); await expect(active(page)).toContainText(id);
}

const readResponse = (page, number = 1) => page.waitForResponse(value => value.url() === url(number) && value.request().method() === 'GET');
const rejection = { error: { code: 'fictitious_failure', message: 'Fictitious private server diagnostic' } };
function reply(route, body, status = 200) {
  if (route.request().method() === 'OPTIONS') return route.continue();
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': process.env.E2E_MEMBER_BASE_URL, 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
}

async function holdRealReply(page, target, { status, transform, predicate = () => true } = {}) {
  const started = deferred(), released = deferred(), finished = deferred(); let held = false;
  const handler = async route => {
    if (route.request().method() !== 'GET' || held || !predicate(route.request())) return route.continue();
    held = true;
    try {
      const actual = await route.fetch(), body = await actual.json();
      started.resolve({ status: actual.status(), body }); await released.promise;
      if (status) await reply(route, rejection, status);
      else if (transform) await reply(route, transform(body));
      else await route.fulfill({ response: actual });
    } catch { started.resolve({ status: 0 }); }
    finally { finished.resolve(); }
  };
  await page.route(target, handler);
  return { started: started.promise, async release() { released.resolve(); await finished.promise; await page.unroute(target, handler); } };
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
  const file = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path: file, fullPage: name !== 'members-list-viewport', animations: 'disabled' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

test('responsive real members preserve plain strings, inactive rows, global roles and paginated history', async ({ page }, testInfo) => {
  const errors = [], mutations = []; page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().startsWith(endpoint) && !['GET', 'OPTIONS'].includes(request.method())) mutations.push(request.method()); });
  const loaded = readResponse(page); await login(page);
  const actual = await loaded; expect(actual.status()).toBe(200);
  const body = await actual.json(); expect(body).toMatchObject({ page: 1, page_size: 50, total: 55 });
  expect(body.items.map(item => item.membership_id)).toEqual(Array.from({ length: 50 }, (_, i) => memberId(i + 1)));
  await expect(rows(page)).toHaveCount(50); await expect(page.getByTestId('members-total')).toHaveText('Всего участников: 55');
  await expect(page.getByRole('link', { name: 'Участники', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const [index, item] of body.items.entries()) {
    expect(Object.keys(item).sort()).toEqual(['display_name', 'email', 'membership_id', 'role_id', 'role_name', 'user_id']);
    expect(await rows(page).nth(index).getByTestId('member-name').textContent()).toBe(item.display_name);
    expect(await rows(page).nth(index).getByTestId('member-email').textContent()).toBe(item.email);
    expect(await rows(page).nth(index).getByTestId('member-role').textContent()).toBe(item.role_name);
  }
  await expect(list(page)).toContainText('Fictitious inactive membership');
  await expect(list(page)).toContainText('Fictitious inactive user');
  await expect(list(page)).toContainText('Fictitious global member role');
  await expect(list(page)).toContainText('fictitious member email text');
  await expect(list(page)).toContainText('Синтетикалық қатысушы 東京');
  await expect(rows(page).nth(8).getByTestId('member-email')).toBeEmpty();
  await expect(list(page).locator('img, script, a, input, select')).toHaveCount(0);
  await expect(list(page)).toContainText('Статус активности здесь не показан.');
  await expect(previous(page)).toBeDisabled();
  await screenshot(page, testInfo, 'members-list-viewport');
  const second = readResponse(page, 2); await next(page).click(); expect((await second).status()).toBe(200);
  await expect(page).toHaveURL(new URL(path(2), process.env.E2E_MEMBER_BASE_URL).href);
  await expect(rows(page)).toHaveCount(5); await expect(rows(page).first()).toContainText('Fictitious Member Row 55');
  await expect(rows(page).last()).toContainText('Fictitious Member Row 51'); await expect(next(page)).toBeDisabled();
  await screenshot(page, testInfo, 'members-page-two');
  await page.reload(); await expect(rows(page)).toHaveCount(5);
  await page.goBack(); await expect(rows(page)).toHaveCount(50); await expect(page).toHaveURL(new URL(path(1), process.env.E2E_MEMBER_BASE_URL).href);
  await page.goForward(); await expect(rows(page)).toHaveCount(5);
  expect(errors).toEqual([]); expect(mutations).toEqual([]);
});

test('responsive real out-of-range empty page preserves total and offers working recovery', async ({ page }, testInfo) => {
  const loaded = readResponse(page, 3); await login(page, 'reader', path(3));
  expect(await (await loaded).json()).toEqual({ items: [], page: 3, page_size: 50, total: 55 });
  await expect(rows(page)).toHaveCount(0); await expect(page.getByTestId('members-total')).toHaveText('Всего участников: 55');
  await expect(page.getByTestId('members-empty')).toHaveText('На этой странице нет участников. Выберите другую страницу.');
  await expect(page.getByText('Участников пока нет.', { exact: true })).toHaveCount(0);
  await screenshot(page, testInfo, 'members-empty');
  await previous(page).click(); await expect(rows(page)).toHaveCount(5);
  await first(page).click(); await expect(rows(page)).toHaveCount(50);
  await expect(page).toHaveURL(new URL(path(1), process.env.E2E_MEMBER_BASE_URL).href);
});

test('responsive error and malformed success states never become empty and explicitly retry', async ({ page }, testInfo) => {
  const loaded = readResponse(page); await login(page); await expect(rows(page)).toHaveCount(50);
  const real = await (await loaded).json();
  for (const scenario of [
    { status: 403, label: 'Нет доступа к участникам организации.' },
    { status: 500, label: 'Не удалось загрузить участников. Повторите попытку.' },
    { network: true, label: 'Не удалось загрузить участников. Повторите попытку.' },
    { status: 200, body: { items: [] }, malformed: true },
    { status: 200, body: { ...real, private_field: true }, malformed: true },
    { status: 200, body: { ...real, items: [{ ...real.items[0], email: null }] }, malformed: true },
    { status: 200, body: { ...real, items: [{ ...real.items[0], is_active: true }] }, malformed: true },
  ]) {
    let reads = 0;
    const handler = route => { if (route.request().method() === 'OPTIONS') return route.continue(); reads++; return scenario.network ? route.abort('failed') : reply(route, scenario.body ?? rejection, scenario.status); };
    await page.route(url(1), handler); await page.reload();
    await expect(alerts(page)).toHaveText(scenario.malformed ? 'Не удалось подтвердить список участников. Повторите загрузку.' : scenario.label);
    await expect(rows(page)).toHaveCount(0); await expect(page.getByTestId('members-empty')).toHaveCount(0);
    if (scenario.status === 500) await screenshot(page, testInfo, 'members-error');
    expect(reads).toBe(1); await page.unroute(url(1), handler);
    const recovered = readResponse(page); await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    expect((await recovered).status()).toBe(200); await expect(rows(page)).toHaveCount(50); await expect(alerts(page)).toHaveCount(0);
  }
});

test('responsive semantic list, keyboard pagination and mobile controls remain accessible', async ({ page }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'Участники', exact: true })).toBeVisible();
  await expect(list(page).getByRole('list')).toHaveCount(1);
  await expect(list(page).getByRole('listitem')).toHaveCount(50);
  await expect(list(page)).toHaveAttribute('aria-busy', 'false');
  const pagination = page.getByRole('navigation', { name: 'Страницы участников', exact: true });
  for (const button of await pagination.getByRole('button').all()) {
    const bounds = await button.boundingBox(); expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await next(page).focus(); await expect(next(page)).toBeFocused(); await page.keyboard.press('Enter'); await expect(rows(page)).toHaveCount(5);
  await previous(page).focus(); await page.keyboard.press('Enter'); await expect(rows(page)).toHaveCount(50);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('manage_users alone grants members while denied and profile-only users never fetch or prefetch them', async ({ page }) => {
  const reads = []; page.on('request', request => { if (request.url().startsWith(endpoint) && request.method() === 'GET') reads.push(request.url()); });
  for (const kind of ['denied', 'profile']) {
    await login(page, kind); await expect(alerts(page)).toHaveText('У вашей учётной записи нет доступа к участникам организации.');
    await expect(page.getByRole('link', { name: 'Участники', exact: true })).toHaveCount(0);
    await page.goto(path(2)); await expect(alerts(page)).toHaveText('У вашей учётной записи нет доступа к участникам организации.');
    expect(reads).toEqual([]);
  }
  await login(page); await expect(rows(page)).toHaveCount(50);
  await page.getByRole('link', { name: 'Профиль', exact: true }).click();
  await expect(page.getByTestId('company-profile').getByRole('alert')).toBeVisible();
  await page.getByRole('link', { name: 'Участники', exact: true }).click(); await expect(rows(page)).toHaveCount(50);
});

test('invalid and bounded URL pagination has no request, safe recovery and canonical page one', async ({ page }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  const reads = []; page.on('request', request => { if (request.url().startsWith(endpoint) && request.method() === 'GET') reads.push(request.url()); });
  for (const suffix of ['page=0', 'page=01', 'page=9007199254740992', 'page=2&page=3', 'page_size=100', 'page=2&next=bad', '%70age=2', 'page=%32']) {
    await page.goto(`/b2b/members?${suffix}`); await expect(alerts(page)).toContainText('Некорректный номер страницы.'); await expect(rows(page)).toHaveCount(0);
  }
  expect(reads).toEqual([]); await first(page).click(); await expect(rows(page)).toHaveCount(50);
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    history.replaceState(null, '', '/b2b/members?page=1');
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  });
  await expect(rows(page)).toHaveCount(50);
  await expect(page).toHaveURL(new URL(path(1), process.env.E2E_MEMBER_BASE_URL).href);
  expect(await page.evaluate(() => ({ length: history.length, appRouter: history.state.__NA, routerTree: Boolean(history.state.__PRIVATE_NEXTJS_INTERNALS_TREE) }))).toEqual({ length: historyLength, appRouter: true, routerTree: true });
  const bounded = readResponse(page, Number.MAX_SAFE_INTEGER); await page.goto(path(Number.MAX_SAFE_INTEGER)); expect((await bounded).status()).toBe(200);
  await expect(page.getByTestId('members-empty')).toBeVisible(); await expect(next(page)).toBeDisabled();
  await first(page).click(); await expect(rows(page)).toHaveCount(50);
});

test('older page-one success and error cannot repaint newer page two through history', async ({ page }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  await next(page).click(); await expect(rows(page)).toHaveCount(5);
  for (const status of [undefined, 403]) {
    const held = await holdRealReply(page, url(1), { status });
    await page.goBack(); expect((await held.started).status).toBe(200);
    await expect(rows(page)).toHaveCount(0); await expect(list(page)).toHaveAttribute('aria-busy', 'true');
    await page.goForward(); await expect(rows(page)).toHaveCount(5);
    await held.release(); await expect(rows(page)).toHaveCount(5); await expect(rows(page).first()).toContainText('Fictitious Member Row 55');
    await expect(alerts(page)).toHaveCount(0);
  }
});

test('repeated retry clicks abort older same-page success and failure', async ({ page }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  for (const status of [undefined, 500]) {
    const failed = route => reply(route, rejection, 500);
    await page.route(url(1), failed); await page.reload(); await expect(alerts(page)).toBeVisible(); await page.unroute(url(1), failed);
    const held = await holdRealReply(page, url(1), { status, transform: body => ({ ...body, items: body.items.map(item => ({ ...item, display_name: 'Fictitious older retry' })) }) });
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    expect((await held.started).status).toBe(200);
    await page.getByRole('button', { name: 'Обновить список', exact: true }).click(); await expect(rows(page)).toHaveCount(50);
    await held.release(); await expect(list(page)).not.toContainText('Fictitious older retry'); await expect(alerts(page)).toHaveCount(0);
  }
});

test('tenant switch on page two invalidates a held old tenant and preserves safe Back Forward pages', async ({ page }) => {
  await login(page, 'multi'); await expect(rows(page)).toHaveCount(50);
  await next(page).click(); await expect(rows(page)).toHaveCount(5);
  const held = await holdRealReply(page, url(2), { predicate: request => request.headers()['x-organization-id'] === a });
  await page.getByRole('button', { name: 'Обновить список', exact: true }).click(); expect((await held.started).status).toBe(200);
  await switchTo(page, b); await expect(page).toHaveURL(new URL(path(2), process.env.E2E_MEMBER_BASE_URL).href);
  await expect(page.getByTestId('members-total')).toHaveText('Всего участников: 2'); await expect(rows(page)).toHaveCount(0);
  await held.release(); await expect(list(page)).not.toContainText('Fictitious Member Row');
  await page.goBack(); await expect(rows(page)).toHaveCount(2); await expect(active(page)).toContainText(b);
  await expect(list(page)).not.toContainText('Fictitious Member Row');
  await page.goForward(); await expect(rows(page)).toHaveCount(0); await expect(page.getByTestId('members-total')).toHaveText('Всего участников: 2');
  await first(page).click(); await expect(rows(page)).toHaveCount(2);
});

test('cancelled organization choice never commits a delayed candidate or alters page history', async ({ page }) => {
  await login(page, 'multi', path(2)); await expect(rows(page)).toHaveCount(5);
  const before = await page.evaluate(() => history.length);
  const held = await holdRealReply(page, `${api}/auth/me`, { predicate: request => request.headers()['x-organization-id'] === b });
  await page.getByTestId('organization-switch-trigger').click(); await option(page, b).check();
  await chooser(page).getByRole('button', { name: 'Переключить организацию', exact: true }).click(); expect((await held.started).status).toBe(200);
  await chooser(page).getByRole('button', { name: 'Отмена выбора', exact: true }).click(); await expect(chooser(page)).not.toBeVisible();
  await held.release(); await expect(active(page)).toContainText(a); await expect(rows(page)).toHaveCount(5);
  await expect(page).toHaveURL(new URL(path(2), process.env.E2E_MEMBER_BASE_URL).href);
  expect(await page.evaluate(() => history.length)).toBe(before);
  await expect(page.getByTestId('organization-switch-trigger')).toBeFocused();
});

test('new login including same tenant invalidates held old success and late unauthorized reads', async ({ page, request }) => {
  for (const [kind, status] of [['peer', undefined], ['other', undefined], ['other', 401]]) {
    await login(page); await expect(rows(page)).toHaveCount(50);
    let refreshes = 0; const listener = request => { if (request.url() === `${api}/auth/refresh` && request.method() === 'POST') refreshes++; };
    page.on('request', listener);
    const held = await holdRealReply(page, url(1), { status, transform: body => ({ ...body, items: body.items.map(item => ({ ...item, display_name: 'Fictitious stale prior login' })) }) });
    await page.getByRole('button', { name: 'Обновить список', exact: true }).click(); expect((await held.started).status).toBe(200);
    await installLogin(page, request, kind); await expect(rows(page)).toHaveCount(kind === 'other' ? 2 : 50);
    await held.release(); await expect(list(page)).not.toContainText('Fictitious stale prior login'); await expect(alerts(page)).toHaveCount(0);
    await expect(active(page)).toContainText(kind === 'other' ? b : a); expect(refreshes).toBe(0); page.off('request', listener);
  }
});

test('logout during pending read removes rows and retains the exact bounded login return', async ({ page, request }) => {
  await login(page, 'reader', path(2)); await expect(rows(page)).toHaveCount(5);
  const held = await holdRealReply(page, url(2));
  await page.getByRole('button', { name: 'Обновить список', exact: true }).click(); expect((await held.started).status).toBe(200);
  await page.evaluate(() => { sessionStorage.removeItem('alageum_session'); window.dispatchEvent(new Event('alageum:session-changed')); });
  await expect(list(page)).toHaveCount(0); await held.release();
  await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toHaveAttribute('href', `/login?next=${encodeURIComponent(path(2))}`);
  await installLogin(page, request, 'other'); await expect(page.getByTestId('members-total')).toHaveText('Всего участников: 2'); await expect(rows(page)).toHaveCount(0);
  await first(page).click(); await expect(rows(page)).toHaveCount(2);
});

test('persisted pageshow hides stale rows and reloads authority after an unannounced storage change', async ({ page, request }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  await installLogin(page, request, 'other', false);
  // A controlled persisted-pageshow event reproduces a frozen document missing
  // another document's session notification; it does not claim real BFCache use.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(active(page)).toContainText(b); await expect(rows(page)).toHaveCount(2);
  await expect(list(page)).not.toContainText('Fictitious inactive membership');
  await page.evaluate(() => { sessionStorage.removeItem('alageum_session'); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await expect(list(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
});

test('Back Forward replaces a restored error with a fresh authorized page read', async ({ page }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  const fail = route => reply(route, rejection, 500);
  await page.route(url(2), fail); await next(page).click(); await expect(alerts(page)).toBeVisible(); await page.unroute(url(2), fail);
  await page.goBack(); await expect(rows(page)).toHaveCount(50);
  const loaded = readResponse(page, 2); await page.goForward(); expect((await loaded).status()).toBe(200);
  await expect(rows(page)).toHaveCount(5); await expect(alerts(page)).toHaveCount(0);
});

test('read refresh retries once and terminal expiration returns safely to the same page', async ({ page }) => {
  await login(page); await expect(rows(page)).toHaveCount(50);
  let reads = 0, refreshes = 0;
  page.on('request', request => { if (request.url() === `${api}/auth/refresh` && request.method() === 'POST') refreshes++; });
  const once = route => { if (route.request().method() !== 'GET') return route.continue(); return ++reads === 1 ? reply(route, rejection, 401) : route.continue(); };
  await page.route(url(2), once); await next(page).click(); await expect(rows(page)).toHaveCount(5);
  expect(reads).toBe(2); expect(refreshes).toBe(1); await page.unroute(url(2), once);
  const expired = route => reply(route, rejection, 401);
  await page.route(url(2), expired); await page.route(`${api}/auth/refresh`, expired); await page.reload();
  await expect(list(page)).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Войти', exact: true })).toHaveAttribute('href', `/login?next=${encodeURIComponent(path(2))}`);
  await page.unroute(url(2), expired); await page.unroute(`${api}/auth/refresh`, expired);
  await login(page, 'reader', path(2)); await expect(rows(page)).toHaveCount(5);
});
