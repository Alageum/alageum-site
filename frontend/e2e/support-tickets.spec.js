import { expect, test } from '@playwright/test';

// Isolated real Strapi/PostgreSQL accounts; primary save/reload is unintercepted.
// Other interceptions are explicitly named failure or delayed-response cases.
const api = process.env.E2E_SUPPORT_API_URL?.replace(/\/$/, '');
const tickets = `${api}/support/tickets`, categories = `${api}/support/categories`;
const a = process.env.E2E_SUPPORT_ORGANIZATION_A, b = process.env.E2E_SUPPORT_ORGANIZATION_B;
const email = kind => `support-${kind}@fixture.invalid`;
const create = page => page.getByTestId('support-create');
const list = page => page.getByTestId('support-list');
const form = page => page.getByRole('form', { name: 'Новое обращение', exact: true });
const subject = page => form(page).getByRole('textbox', { name: 'Тема', exact: true });
const message = page => form(page).getByRole('textbox', { name: 'Сообщение', exact: true });
const submit = page => form(page).getByRole('button', { name: 'Создать обращение', exact: true });
const refresh = page => list(page).getByRole('button', { name: 'Обновить список обращений', exact: true });
const active = page => page.getByTestId('active-organization');
const dialog = page => page.getByRole('dialog', { name: 'Выбор организации', exact: true });
const option = (page, id) => page.getByTestId(`organization-option-${id}`);
const summaries = page => page.getByTestId('support-ticket-summary');
const loginTimes = [];
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// Do not disable the real login rate limit. Leave room for setup diagnostics and
// additional login-boundary cases, pausing only if this serial worker fills a window.
async function loginSlot() {
  while (loginTimes.length && Date.now() - loginTimes[0] > 61000) loginTimes.shift();
  if (loginTimes.length >= 16) {
    await new Promise(resolve => setTimeout(resolve, 61050 - (Date.now() - loginTimes[0])));
    while (loginTimes.length && Date.now() - loginTimes[0] > 61000) loginTimes.shift();
  }
  loginTimes.push(Date.now());
}

test.beforeAll(async ({}, testInfo) => {
  expect(process.env.APP_ENV, 'Use backend-node/scripts/run-support-tests.sh').toBe('test');
  expect(process.env.ALAGEUM_TEST_SUPPORT_FIXTURES).toBe('1');
  expect(Boolean(process.env.E2E_SUPPORT_PASSWORD && process.env.E2E_SUPPORT_PASSWORD.length >= 40)).toBe(true);
  for (const value of [api, process.env.E2E_SUPPORT_BASE_URL]) {
    expect(Boolean(value), 'Both isolated loopback server URLs are required').toBe(true);
    const url = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
  for (const id of [a, b]) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(a).not.toBe(b);
  // A replacement worker loses loginTimes, while the backend retains its real
  // 20/minute window. With workers=1, clear that window before every later
  // worker (including mobile) starts; the first worker has the runner cooldown.
  // This wait never retries a rejected login or changes the backend limiter.
  if (testInfo.workerIndex > 0) await new Promise(resolve => setTimeout(resolve, 61050));
});

async function login(page, kind = 'editor') {
  await loginSlot();
  await page.goto('/login?next=%2Fb2b%2Fsupport');
  await page.getByLabel('Email', { exact: true }).fill(email(kind));
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_SUPPORT_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  if (kind === 'multi') {
    await option(page, a).check();
    await page.getByTestId('organization-chooser').getByRole('button', { name: 'Продолжить', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/b2b\/support$/);
  await expect(active(page)).toContainText(kind === 'other' ? b : a);
}
async function fill(page, title = 'Fictitious support draft', body = 'Fictitious support message') {
  await form(page).getByRole('combobox', { name: 'Категория', exact: true }).selectOption({ label: 'DEV Other' });
  await subject(page).fill(title); await message(page).fill(body);
}
async function response(page, method) {
  return page.waitForResponse(value => value.url() === tickets && value.request().method() === method);
}
async function readTickets(page) {
  return page.evaluate(async url => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session') || '{}');
    const reply = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}`, 'X-Organization-ID': session.organization_id }, cache: 'no-store' });
    return { status: reply.status, body: await reply.json() };
  }, tickets);
}
async function installLogin(page, request, kind = 'editor') {
  await loginSlot();
  const result = await request.post(`${api}/auth/login`, { data: { email: email(kind), password: process.env.E2E_SUPPORT_PASSWORD } });
  expect(result.status()).toBe(200);
  const pair = await result.json();
  await page.evaluate(session => {
    sessionStorage.setItem('alageum_session', JSON.stringify(session));
    window.dispatchEvent(new Event('alageum:session-changed'));
  }, { ...pair, organization_id: kind === 'other' ? b : a });
}
async function choose(page, id) {
  await page.getByTestId('organization-switch-trigger').click();
  await option(page, id).check();
  await dialog(page).getByRole('button', { name: 'Переключить организацию', exact: true }).click();
}
async function finishSwitch(page, id) {
  const confirmation = page.getByTestId('organization-discard-confirmation');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Продолжить без сохранения', exact: true }).click();
  await expect(dialog(page)).not.toBeVisible(); await expect(active(page)).toContainText(id);
}
function reply(route, body, status = 200) {
  if (route.request().method() === 'OPTIONS') return route.continue();
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': process.env.E2E_SUPPORT_BASE_URL, 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
}
function failure(route, status) { return reply(route, { error: { code: 'fictitious_rejection', message: 'Fictitious support rejection' } }, status); }
async function holdRealReply(page, endpoint, predicate = () => true) {
  const started = deferred(), release = deferred(), finished = deferred();
  let held = false;
  const handler = async route => {
    if (route.request().method() === 'OPTIONS' || held || !predicate(route.request())) return route.continue();
    held = true;
    try {
      const actual = await route.fetch();
      started.resolve({ status: actual.status(), body: await actual.json() });
      await release.promise; await route.fulfill({ response: actual });
    } catch { started.resolve({ status: 0 }); }
    finally { finished.resolve(); }
  };
  await page.route(endpoint, handler);
  return { started: started.promise, async release() { release.resolve(); await finished.promise; await page.unroute(endpoint, handler); } };
}
async function reachable(locator) {
  await locator.scrollIntoViewIfNeeded(); await expect(locator).toBeInViewport();
  expect(await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
}
async function screenshot(page, testInfo, name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => ({
    x: window.scrollX, y: window.scrollY, top: window.visualViewport?.pageTop ?? 0,
    header: Math.round(document.querySelector('header.site-header').getBoundingClientRect().top),
  }))).toEqual({ x: 0, y: 0, top: 0, header: 0 });
  await expect(page.getByRole('banner')).toBeInViewport();
  await expect.poll(() => page.locator('.site-skip-link').evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, scale: Math.round((window.visualViewport?.scale ?? 1) * 1000) / 1000 }))).toEqual({ fits: true, scale: 1 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('responsive saved ticket: real create, summary, reload and organization isolation', async ({ page, request }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);
  const title = ` Fictitious saved support ${testInfo.project.name} ${Date.now()} `;
  await fill(page, title, ' Fictitious message with retained whitespace\n');
  await reachable(submit(page));
  const saved = response(page, 'POST'); await submit(page).click();
  const actual = await saved; expect(actual.status()).toBe(201);
  const summary = await actual.json(); expect(summary).toMatchObject({ subject: title, category: 'other', status: 'new' });
  expect(Object.keys(summary).sort()).toEqual(['category', 'id', 'status', 'subject']);
  await expect(form(page).getByRole('status')).toHaveText('Обращение создано');
  await expect(subject(page)).toHaveValue(''); await expect(message(page)).toHaveValue('');
  await expect(summaries(page).filter({ hasText: title.trim() })).toHaveCount(1);
  await page.reload(); await expect(summaries(page).filter({ hasText: title.trim() })).toHaveCount(1);
  await reachable(refresh(page));
  await screenshot(page, testInfo, 'saved-fictitious-ticket');
  // Real login to the other organization must never expose this accepted summary.
  await installLogin(page, request, 'other'); await expect(active(page)).toContainText(b);
  await expect(list(page)).toHaveAttribute('aria-busy', 'false');
  await expect(summaries(page).filter({ hasText: title.trim() })).toHaveCount(0);
  expect((await readTickets(page)).body.items.some(item => item.id === summary.id)).toBe(false);
  expect(errors).toEqual([]);
});

test('responsive validation: code-point limits, exact whitespace and cancel preserve a safe draft', async ({ page }, testInfo) => {
  await login(page); await fill(page, '😀'.repeat(301), '😀'.repeat(10001));
  let writes = 0; page.on('request', value => { if (value.url() === tickets && value.method() === 'POST') writes++; });
  await submit(page).click();
  await expect(subject(page)).toHaveAttribute('aria-invalid', 'true'); await expect(message(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(form(page).getByRole('alert')).toHaveText('Проверьте поля обращения.');
  expect(writes).toBe(0); await reachable(submit(page));
  await screenshot(page, testInfo, 'fictitious-ticket-validation');
  // The valid astral boundary must reach the server unchanged, not be truncated
  // by the browser's UTF-16 maxlength behavior.
  await subject(page).fill('😀'.repeat(300)); await message(page).fill('😀'.repeat(10000));
  const saved = response(page, 'POST'); await submit(page).click(); expect((await saved).status()).toBe(201);
  await expect(form(page).getByRole('status')).toHaveText('Обращение создано');
  await fill(page, 'Fictitious draft to discard');
  await form(page).getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(subject(page)).toHaveValue(''); await expect(message(page)).toHaveValue(''); expect(writes).toBe(1);
});

for (const kind of ['readonly', 'createonly', 'denied']) test(`${kind} permissions limit navigation and resource requests independently`, async ({ page }) => {
  const calls = []; page.on('request', value => { if ([tickets, categories].includes(value.url())) calls.push(`${value.method()} ${value.url()}`); });
  await login(page, kind);
  if (kind === 'denied') {
    await expect(page.getByRole('main').getByRole('alert')).toContainText('нет доступа к обращениям');
    await expect(page.getByRole('link', { name: 'Поддержка', exact: true })).toHaveCount(0);
    await expect(form(page)).toHaveCount(0); await expect(list(page)).toHaveCount(0); expect(calls).toEqual([]);
  } else {
    await expect(page.getByRole('link', { name: 'Поддержка', exact: true })).toBeVisible();
    if (kind === 'readonly') {
      await expect(form(page)).toHaveCount(0); await expect(list(page)).toHaveAttribute('aria-busy', 'false');
      expect(calls).toContain(`GET ${tickets}`); expect(calls).not.toContain(`GET ${categories}`);
    } else {
      await expect(list(page)).toHaveCount(0); await fill(page, `Fictitious create-only ${Date.now()}`);
      const saved = response(page, 'POST'); await submit(page).click(); expect((await saved).status()).toBe(201);
      await expect(form(page).getByRole('status')).toHaveText('Обращение создано');
      expect(calls).toContain(`GET ${categories}`); expect(calls).not.toContain(`GET ${tickets}`);
    }
  }
});

test('permitted reads distinguish pending, failure and empty without discarding the draft', async ({ page }) => {
  let categoryMode = 'held', listMode = 'held'; const release = deferred();
  await page.route(categories, async route => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    if (categoryMode === 'held') await release.promise;
    if (categoryMode === 'error') return failure(route, 503);
    if (categoryMode === 'malformed') return reply(route, {});
    if (categoryMode === 'empty') return reply(route, { items: [], total: 0, page: 1, page_size: 50 });
    return route.continue();
  });
  await page.route(tickets, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    if (listMode === 'held') await release.promise;
    if (listMode === 'error') return failure(route, 503);
    if (listMode === 'malformed') return reply(route, { items: 'invalid' });
    if (listMode === 'empty') return reply(route, { items: [], total: 0, page: 1, page_size: 50 });
    return route.continue();
  });
  await login(page);
  await expect(create(page).getByRole('status')).toHaveText('Загрузка категорий…');
  await expect(list(page).getByRole('status')).toHaveText('Загрузка обращений…'); await expect(submit(page)).toBeDisabled();
  await subject(page).fill('Fictitious draft retained across read errors');
  categoryMode = 'error'; listMode = 'error'; release.resolve();
  await expect(create(page).getByRole('alert')).toContainText('Не удалось загрузить категории');
  await expect(list(page).getByRole('alert')).toContainText('Не удалось загрузить обращения');
  categoryMode = 'malformed'; listMode = 'malformed';
  await create(page).getByRole('button', { name: 'Повторить загрузку категорий' }).click(); await refresh(page).click();
  await expect(create(page).getByRole('alert')).toContainText('Не удалось загрузить категории');
  await expect(list(page).getByRole('alert')).toContainText('Не удалось загрузить обращения');
  categoryMode = 'empty'; listMode = 'empty';
  await create(page).getByRole('button', { name: 'Повторить загрузку категорий' }).click(); await refresh(page).click();
  await expect(create(page).getByRole('status')).toContainText('Нет доступных категорий');
  await expect(list(page).getByRole('status')).toHaveText('Обращений пока нет.'); await expect(submit(page)).toBeDisabled();
  categoryMode = 'real'; listMode = 'real';
  await create(page).getByRole('button', { name: 'Повторить загрузку категорий' }).click(); await refresh(page).click();
  await expect(form(page).getByRole('combobox')).toBeEnabled(); await expect(subject(page)).toHaveValue('Fictitious draft retained across read errors');
});

test('synchronous repeated clicks send one real POST while pending', async ({ page }) => {
  await login(page); await fill(page, `Fictitious repeated support ${Date.now()}`);
  let writes = 0; page.on('request', value => { if (value.url() === tickets && value.method() === 'POST') writes++; });
  const held = await holdRealReply(page, tickets, value => value.method() === 'POST');
  await form(page).evaluate(element => { element.requestSubmit(); element.requestSubmit(); element.requestSubmit(); });
  expect((await held.started).status).toBe(201); await expect(form(page)).toHaveAttribute('aria-busy', 'true'); expect(writes).toBe(1);
  await held.release(); await expect(form(page).getByRole('status')).toHaveText('Обращение создано'); expect(writes).toBe(1);
});

test('known 422 and 403 rejections preserve draft and never refresh or replay a POST', async ({ page }) => {
  await login(page); await fill(page, 'Fictitious rejected support draft'); let status = 422, writes = 0, refreshes = 0;
  page.on('request', value => { if (value.url() === `${api}/auth/refresh`) refreshes++; });
  await page.route(tickets, route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++; return failure(route, status);
  });
  await submit(page).click(); await expect(form(page).getByRole('alert')).toHaveText('Fictitious support rejection');
  await expect(subject(page)).toHaveValue('Fictitious rejected support draft'); await expect(submit(page)).toBeEnabled(); expect(writes).toBe(1);
  status = 403; await submit(page).click(); await expect(form(page).getByRole('alert')).toHaveText('Нет доступа к созданию обращений.');
  expect(writes).toBe(2); expect(refreshes).toBe(0); await expect(subject(page)).toHaveValue('Fictitious rejected support draft');
});

test('401 mutation expiry signs out without refresh or replay', async ({ page }) => {
  await login(page); await fill(page); let writes = 0, refreshes = 0;
  await expect(list(page)).toHaveAttribute('aria-busy', 'false');
  page.on('request', value => { if (value.url() === `${api}/auth/refresh`) refreshes++; });
  await page.route(tickets, route => { if (route.request().method() !== 'POST') return route.continue(); writes++; return failure(route, 401); });
  await submit(page).click(); await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет', exact: true })).toBeVisible();
  expect(writes).toBe(1); expect(refreshes).toBe(0); await expect(form(page)).toHaveCount(0);
});

test('lost or malformed real acceptance stays uncertain after refresh and requires a new blank draft', async ({ page }) => {
  await login(page); const title = `Fictitious uncertain support ${Date.now()}`; await fill(page, title); let writes = 0, malformed = false;
  await page.route(tickets, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++; const actual = await route.fetch(); expect(actual.status()).toBe(201);
    if (malformed) return route.fulfill({ response: actual, body: '{' });
    await route.abort('failed');
  });
  await submit(page).click(); await expect(form(page).getByRole('alert')).toContainText('Обращение могло быть создано');
  await expect(submit(page)).toBeDisabled(); await expect(subject(page)).toHaveValue(title);
  await refresh(page).click(); await expect(summaries(page).filter({ hasText: title })).toHaveCount(1);
  await expect(submit(page)).toBeDisabled(); await expect(form(page).getByRole('alert')).toContainText('не подтверждает'); expect(writes).toBe(1);
  await form(page).getByRole('button', { name: 'Очистить форму для нового обращения' }).click();
  await expect(subject(page)).toHaveValue(''); await expect(message(page)).toHaveValue(''); await expect(submit(page)).toBeEnabled(); expect(writes).toBe(1);
  malformed = true; await fill(page, 'Fictitious malformed receipt draft'); await submit(page).click();
  await expect(form(page).getByRole('alert')).toContainText('Обращение могло быть создано');
  await expect(subject(page)).toHaveValue('Fictitious malformed receipt draft'); await expect(submit(page)).toBeDisabled(); expect(writes).toBe(2);
});

test('create-only ambiguous failure never requests a forbidden list', async ({ page }) => {
  await login(page, 'createonly'); await fill(page); let reads = 0, writes = 0;
  await page.route(tickets, route => {
    if (route.request().method() === 'GET') { reads++; return route.continue(); }
    if (route.request().method() === 'POST') { writes++; return failure(route, 503); }
    return route.continue();
  });
  await submit(page).click(); await expect(form(page).getByRole('alert')).toContainText('уточните результат у сотрудника');
  await expect(list(page)).toHaveCount(0); await expect(submit(page)).toBeDisabled(); expect(reads).toBe(0); expect(writes).toBe(1);
});

test('cancelling a pending write cannot let its delayed success clear a newer draft', async ({ page }) => {
  await login(page); await fill(page, `Fictitious cancelled wait ${Date.now()}`);
  const held = await holdRealReply(page, tickets, value => value.method() === 'POST'); await submit(page).click(); expect((await held.started).status).toBe(201);
  await form(page).getByRole('button', { name: 'Прервать ожидание' }).click();
  await expect(form(page).getByRole('alert')).toContainText('Обращение могло быть создано'); await expect(submit(page)).toBeDisabled();
  await form(page).getByRole('button', { name: 'Очистить форму для нового обращения' }).click();
  await fill(page, 'Fictitious newer unsaved draft'); await held.release();
  await expect(subject(page)).toHaveValue('Fictitious newer unsaved draft'); await expect(form(page).getByRole('status')).toHaveCount(0);
});

test('dirty organization switch cancellation keeps draft; confirmed switch clears it', async ({ page }) => {
  await login(page, 'multi'); await fill(page, 'Fictitious unsaved organization draft');
  await choose(page, b); await expect(page.getByTestId('organization-discard-confirmation')).toContainText('несохранённые изменения');
  await dialog(page).getByRole('button', { name: 'Отмена выбора' }).click();
  await expect(active(page)).toContainText(a); await expect(subject(page)).toHaveValue('Fictitious unsaved organization draft');
  await choose(page, b); await finishSwitch(page, b); await expect(subject(page)).toHaveValue(''); await expect(message(page)).toHaveValue('');
});

for (const boundary of ['organization', 'new login']) test(`late category and ticket reads stay hidden after ${boundary}`, async ({ page, request }) => {
  await login(page, boundary === 'organization' ? 'multi' : 'editor');
  await expect(form(page).getByRole('combobox')).toBeEnabled(); await expect(list(page)).toHaveAttribute('aria-busy', 'false');
  const lateCategories = await holdRealReply(page, categories);
  const lateList = await holdRealReply(page, tickets, value => value.method() === 'GET');
  await page.reload(); expect((await lateCategories.started).status).toBe(200); expect((await lateList.started).status).toBe(200);
  if (boundary === 'organization') {
    await choose(page, b); await expect(dialog(page)).not.toBeVisible(); await expect(active(page)).toContainText(b);
  } else { await installLogin(page, request, 'other'); await expect(active(page)).toContainText(b); }
  await expect(form(page).getByRole('combobox')).toBeEnabled(); await expect(list(page)).toHaveAttribute('aria-busy', 'false');
  const current = await list(page).innerText();
  await lateCategories.release(); await lateList.release();
  await expect(active(page)).toContainText(b); await expect(list(page)).toHaveText(current, { useInnerText: true });
  await expect(form(page).getByRole('alert')).toHaveCount(0);
});

for (const boundary of ['organization', 'same-account login']) test(`late successful POST cannot confirm in a newer ${boundary} context`, async ({ page, request }) => {
  await login(page, boundary === 'organization' ? 'multi' : 'editor'); await fill(page, `Fictitious delayed write ${Date.now()}`);
  const held = await holdRealReply(page, tickets, value => value.method() === 'POST'); await submit(page).click(); expect((await held.started).status).toBe(201);
  if (boundary === 'organization') {
    await choose(page, b); await expect(page.getByTestId('organization-discard-confirmation')).toContainText('Сохранение ещё выполняется');
    await finishSwitch(page, b);
  } else { await installLogin(page, request); await expect(subject(page)).toHaveValue(''); }
  await fill(page, 'Fictitious current context draft'); await held.release();
  await expect(subject(page)).toHaveValue('Fictitious current context draft'); await expect(form(page).getByRole('status')).toHaveCount(0);
  await expect(submit(page)).toBeEnabled();
});

test('Back and Forward after leaving a pending write never replay or confirm it', async ({ page }) => {
  await login(page); await fill(page, `Fictitious navigation support ${Date.now()}`); let writes = 0;
  page.on('request', value => { if (value.url() === tickets && value.method() === 'POST') writes++; });
  const held = await holdRealReply(page, tickets, value => value.method() === 'POST'); await submit(page).click(); expect((await held.started).status).toBe(201);
  await page.getByRole('link', { name: 'Профиль', exact: true }).click(); await expect(page).toHaveURL(/\/b2b\/profile$/);
  await held.release(); await page.goBack(); await expect(page).toHaveURL(/\/b2b\/support$/);
  await expect(subject(page)).toHaveValue(''); await expect(form(page).getByRole('status')).toHaveCount(0);
  await page.goForward(); await expect(page).toHaveURL(/\/b2b\/profile$/); expect(writes).toBe(1);
});
