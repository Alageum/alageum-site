import { expect, test } from '@playwright/test';

// Real isolated Strapi/PostgreSQL logins. Named failure injection and delayed real
// replies cover lifecycle races; ordinary selection never edits browser storage.
const api = process.env.E2E_ORGANIZATION_API_URL?.replace(/\/$/, '');
const profileEndpoint = `${api}/organizations/current/profile`;
const meEndpoint = `${api}/auth/me`;
const organizationsEndpoint = `${api}/organizations`;
const refreshEndpoint = `${api}/auth/refresh`;
const a = process.env.E2E_ORGANIZATION_A;
const b = process.env.E2E_ORGANIZATION_B;
const fixtureName = 'Fictitious Organization Workshop';
const email = kind => `organization-${kind}@fixture.invalid`;
const company = page => page.getByTestId('company-profile');
const personal = page => page.getByTestId('personal-profile');
const chooser = page => page.getByTestId('organization-chooser');
const dialog = page => page.getByRole('dialog', { name: 'Выбор организации', exact: true });
const trigger = page => page.getByTestId('organization-switch-trigger');
const active = page => page.getByTestId('active-organization');
const option = (page, id) => page.getByTestId(`organization-option-${id}`);
const edit = page => company(page).getByRole('button', { name: 'Редактировать профиль компании', exact: true });
const save = page => company(page).getByRole('button', { name: 'Сохранить изменения', exact: true });
const contact = page => company(page).getByRole('textbox', { name: 'Контактное лицо', exact: true });
const switchSubmit = page => dialog(page).getByRole('button', { name: 'Переключить организацию', exact: true });
const cancelSelection = page => page.getByRole('button', { name: 'Отмена выбора', exact: true });
const confirmDiscard = page => page.getByTestId('organization-discard-confirmation');
const proceed = page => confirmDiscard(page).getByRole('button', { name: 'Продолжить без сохранения', exact: true });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// The complete serial suite stays below the real 20/minute login limit. The
// runner waits out its setup-login window and never disables the limiter.
test.beforeAll(() => {
  expect(process.env.APP_ENV, 'Use backend-node/scripts/run-organization-tests.sh').toBe('test');
  expect(process.env.ALAGEUM_TEST_ORGANIZATION_FIXTURES).toBe('1');
  expect(Boolean(process.env.E2E_ORGANIZATION_PASSWORD && process.env.E2E_ORGANIZATION_PASSWORD.length >= 40)).toBe(true);
  for (const value of [api, process.env.E2E_ORGANIZATION_BASE_URL]) {
    expect(Boolean(value), 'Both isolated server URLs must be provided').toBe(true);
    const url = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
  for (const id of [a, b]) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(a).not.toBe(b);
});

async function startLogin(page, kind = 'multi', next = '/b2b/profile') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email(kind));
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_ORGANIZATION_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
}
async function selectInitial(page, id = a) {
  await expect(chooser(page)).toBeVisible();
  await option(page, id).check();
  await chooser(page).getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b(?:\/profile)?$/);
  await expect(active(page)).toContainText(id);
}
async function login(page, kind = 'multi', id = a) {
  await startLogin(page, kind);
  if (kind === 'multi') await selectInitial(page, id);
  await expect(page).toHaveURL(/\/b2b\/profile$/);
  await expect(personal(page)).toContainText(email(kind));
  await expect(company(page)).toBeVisible();
  await expect(active(page)).toContainText(id);
}
async function openSelection(page, id = b) {
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await option(page, id).check();
}
async function switchTo(page, id) {
  await openSelection(page, id);
  await switchSubmit(page).click();
  await expect(dialog(page)).not.toBeVisible();
  await expect(active(page)).toContainText(id);
}
async function readProfile(page, id) {
  return page.evaluate(async ({ url, organization }) => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session') || '{}');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}`, 'X-Organization-ID': organization }, cache: 'no-store' });
    return { status: response.status, body: await response.json() };
  }, { url: profileEndpoint, organization: id });
}
async function storedOrganization(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('alageum_session') || '{}').organization_id || null);
}
async function expectReachable(locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
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
    x: window.scrollX, y: window.scrollY,
    visualTop: window.visualViewport?.pageTop ?? 0,
    headerTop: Math.round(document.querySelector('header.site-header').getBoundingClientRect().top),
  }))).toEqual({ x: 0, y: 0, visualTop: 0, headerTop: 0 });
  await expect(page.getByRole('banner')).toBeInViewport();
  await expect.poll(() => page.locator('.site-skip-link').evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, scale: Math.round((window.visualViewport?.scale ?? 1) * 1000) / 1000 }))).toEqual({ fits: true, scale: 1 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const path = testInfo.outputPath(`${name}-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
async function holdRealReply(page, endpoint, predicate = () => true) {
  const started = deferred(), release = deferred(), finished = deferred();
  let held = false, replied = false;
  const handler = async route => {
    if (route.request().method() === 'OPTIONS' || held || !predicate(route.request())) return route.continue();
    held = true;
    try {
      const actual = await route.fetch();
      replied = true; started.resolve({ status: actual.status(), body: await actual.json() });
      await release.promise;
      await route.fulfill({ response: actual });
    } catch { if (!replied) started.resolve({ status: 0 }); }
    finally { finished.resolve(); }
  };
  await page.route(endpoint, handler);
  return { started: started.promise, async release() { release.resolve(); await finished.promise; await page.unroute(endpoint, handler); } };
}
function reply(route, json, status = 200) {
  if (route.request().method() === 'OPTIONS') return route.continue();
  return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': process.env.E2E_ORGANIZATION_BASE_URL, 'cache-control': 'private, no-store' }, body: JSON.stringify(json) });
}
const denial = { error: { code: 'organization_access_denied', message: 'Fictitious revoked organization membership' } };
const expired = { error: { code: 'invalid_token', message: 'Fictitious expired session' } };

// Screenshots contain only disposable organization identity and fixture emails.
test('responsive chooser: duplicate names require an explicit UUID choice', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const meOrganizations = []; let profileReads = 0;
  page.on('request', request => {
    if (request.url() === meEndpoint) meOrganizations.push(request.headers()['x-organization-id']);
    if (request.url() === profileEndpoint) profileReads++;
  });
  await startLogin(page);
  await expect(chooser(page)).toBeVisible();
  await expect(chooser(page).getByRole('heading', { name: 'Выберите организацию', exact: true })).toBeVisible();
  for (const id of [a, b]) {
    await expect(option(page, id)).not.toBeChecked();
    await expect(option(page, id)).toHaveAccessibleName(new RegExp(`${fixtureName}.*Роль:.*UUID: ${id}`));
    await expectReachable(option(page, id));
  }
  await expect(chooser(page).getByRole('button', { name: 'Продолжить', exact: true })).toBeDisabled();
  expect(meOrganizations.every(id => !id)).toBe(true);
  expect(profileReads).toBe(0); expect(await storedOrganization(page)).toBeNull();
  await screenshot(page, testInfo, 'initial-organization-chooser');
  await selectInitial(page, b);
  await expect(personal(page)).toContainText(email('multi'));
  expect(await storedOrganization(page)).toBe(b);
  expect((await readProfile(page, b)).body.organization_id).toBe(b);
  expect(errors).toEqual([]);
});

test('responsive active organization: a single membership opens the requested profile', async ({ page }, testInfo) => {
  await login(page, 'single');
  await expect(chooser(page)).toHaveCount(0);
  await expect(active(page)).toContainText(fixtureName);
  expect(await storedOrganization(page)).toBe(a);
  // Reset this saved screenshot fixture after earlier tests may have changed A.
  // Keep the real optimistic version and current authenticated fixture grants.
  const before = await readProfile(page, a);
  expect(before.status).toBe(200); expect(before.body.organization_id).toBe(a);
  const screenshotContact = `Fictitious contact for ${a}`;
  const saved = await page.evaluate(async ({ url, organization, version, businessContact }) => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session') || '{}');
    if (session.organization_id !== organization) throw new Error('Screenshot fixture organization changed');
    const response = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}`, 'X-Organization-ID': organization, 'Content-Type': 'application/json' }, body: JSON.stringify({ version, business_contact_name: businessContact }) });
    return { status: response.status, body: await response.json() };
  }, { url: profileEndpoint, organization: a, version: before.body.version, businessContact: screenshotContact });
  expect(saved.status).toBe(200); expect(saved.body).toMatchObject({ organization_id: a, business_contact_name: screenshotContact });
  await page.reload();
  await expect(personal(page)).toContainText(email('single'));
  await expect(active(page)).toContainText(a);
  await expect(company(page)).toContainText(screenshotContact);
  await expectReachable(trigger(page));
  await screenshot(page, testInfo, 'active-single-organization');
  await page.reload();
  await expect(personal(page)).toContainText(email('single'));
  await expect(active(page)).toContainText(a);
});

test('zero memberships stays recoverable and cancel clears the incomplete login', async ({ page }) => {
  let profileReads = 0; page.on('request', request => { if (request.url() === profileEndpoint) profileReads++; });
  await startLogin(page, 'none');
  await expect(page.getByTestId('organization-empty')).toHaveText('Нет доступных организаций. Обратитесь к администратору, чтобы получить активное членство.');
  await expect(chooser(page).getByRole('radio')).toHaveCount(0);
  await expect(chooser(page).getByRole('button', { name: 'Продолжить', exact: true })).toHaveCount(0);
  await cancelSelection(page).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('alageum_session'))).toBeNull();
  expect(profileReads).toBe(0);
});

test('explicit switch keeps profile context and injected loaded order list/detail never crosses tenants', async ({ page }) => {
  // This isolated lifecycle test supplies the order.read UI permission in its
  // named /me fixture. Real database roles remain profile-only; selection and
  // organization checks still use the actual authenticated /me response.
  await page.route(meEndpoint, async route => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    const actual = await route.fetch();
    const body = await actual.json();
    if (!actual.ok()) return route.fulfill({ response: actual });
    return route.fulfill({ response: actual, json: { ...body, permissions: [...body.permissions, 'order.read'] } });
  });
  await login(page);
  const reads = []; page.on('request', request => { if (request.url() === profileEndpoint) reads.push(request.headers()['x-organization-id']); });
  await switchTo(page, b);
  await expect(page).toHaveURL(/\/b2b\/profile$/);
  await expect(personal(page)).toContainText(email('multi'));
  await expect(edit(page)).toBeVisible();
  expect(await storedOrganization(page)).toBe(b);
  expect(reads).toContain(b);
  await switchTo(page, a);
  expect(await storedOrganization(page)).toBe(a);

  // Named frontend lifecycle injection only: no order is created.
  const orderId = '00000000-0000-4000-8000-000000000071';
  const title = 'Fictitious previous-organization order';
  const previousOrder = { id: orderId, external_id: null, number: title, amount: '1.00', currency: 'KZT', status: 'fixture', items: [{ id: '00000000-0000-4000-8000-000000000072', description: 'Previous tenant line', quantity: '1.000', unit_price: null, configuration: {} }] };
  const detailHeaders = [];
  await page.route(`${api}/orders`, route => reply(route, { items: route.request().headers()['x-organization-id'] === a ? [previousOrder] : [], page: 1, page_size: 20, total: route.request().headers()['x-organization-id'] === a ? 1 : 0 }));
  await page.route(`${api}/orders/${orderId}`, route => {
    const id = route.request().headers()['x-organization-id'];
    if (route.request().method() !== 'OPTIONS') detailHeaders.push(id);
    return reply(route, id === a ? previousOrder : denial, id === a ? 200 : 403);
  });
  await page.goto('/b2b/orders');
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await switchTo(page, b);
  await expect(page).toHaveURL(/\/b2b\/orders$/);
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByText('Данных пока нет', { exact: true })).toBeVisible();
  await switchTo(page, a);
  await page.getByRole('link').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).click();
  await expect(page.getByRole('heading', { name: `Заказ ${title}`, exact: true })).toBeVisible();
  await expect(page.getByText('Previous tenant line — 1.000', { exact: true })).toBeVisible();
  await switchTo(page, b);
  await expect(page).toHaveURL(/\/b2b\/orders$/);
  await expect(page.getByRole('heading', { name: `Заказ ${title}`, exact: true })).toHaveCount(0);
  await expect(page.getByText('Previous tenant line — 1.000', { exact: true })).toHaveCount(0);
  expect(detailHeaders).toContain(a); expect(detailHeaders).not.toContain(b);
});

test('dirty draft cancel preserves edits and explicit confirmation discards them', async ({ page }) => {
  await login(page); const before = await readProfile(page, a);
  await edit(page).click(); await contact(page).fill('Fictitious unsaved organization contact');
  await openSelection(page); await switchSubmit(page).click();
  await expect(confirmDiscard(page)).toBeVisible();
  await confirmDiscard(page).getByRole('button', { name: 'Вернуться к выбору', exact: true }).click();
  await expect(switchSubmit(page)).toBeFocused();
  await cancelSelection(page).click();
  await expect(active(page)).toContainText(a);
  await expect(contact(page)).toHaveValue('Fictitious unsaved organization contact');
  await openSelection(page); await switchSubmit(page).click(); await proceed(page).click();
  await expect(active(page)).toContainText(b); await expect(dialog(page)).not.toBeVisible();
  await expect(contact(page)).toHaveCount(0);
  expect((await readProfile(page, a)).body).toEqual(before.body);
});

test('pending save warning explains commit uncertainty and a late save cannot replace the next organization', async ({ page }) => {
  await login(page); await edit(page).click(); await contact(page).fill('Fictitious committed previous organization');
  const held = await holdRealReply(page, profileEndpoint, request => request.method() === 'PATCH');
  await save(page).click(); expect((await held.started).status).toBe(200);
  await openSelection(page); await switchSubmit(page).click();
  await expect(confirmDiscard(page)).toContainText('Сохранение ещё выполняется. Запрос мог уже сохраниться на сервере. Смена организации не отменяет сохранение.');
  await proceed(page).click(); await expect(active(page)).toContainText(b);
  await held.release();
  await expect(active(page)).toContainText(b);
  await expect(company(page)).not.toContainText('Fictitious committed previous organization');
  await expect(company(page).getByText('Профиль компании сохранён', { exact: true })).toHaveCount(0);
  expect((await readProfile(page, a)).body.business_contact_name).toBe('Fictitious committed previous organization');
});

test('revoked membership during selection leaves the current organization unchanged', async ({ page }) => {
  await login(page); await openSelection(page);
  await page.route(meEndpoint, route => route.request().headers()['x-organization-id'] === b
    ? reply(route, denial, 403) : route.continue());
  await switchSubmit(page).click();
  await expect(page.getByTestId('organization-error')).toBeVisible();
  await expect(dialog(page)).toBeVisible();
  await expect(active(page)).toContainText(a);
  expect(await storedOrganization(page)).toBe(a);
  await cancelSelection(page).click(); await expect(edit(page)).toBeVisible();
});

test('fresh role permissions from validation replace stale membership grants', async ({ page }) => {
  await login(page); await openSelection(page);
  let privateReads = 0;
  page.on('request', request => { if (request.url() === profileEndpoint && request.headers()['x-organization-id'] === b) privateReads++; });
  await page.route(meEndpoint, async route => {
    if (route.request().headers()['x-organization-id'] !== b) return route.continue();
    const actual = await route.fetch(), body = await actual.json();
    await route.fulfill({ response: actual, json: { ...body, permissions: [] } });
  });
  await switchSubmit(page).click(); await expect(active(page)).toContainText(b);
  await expect(company(page).getByRole('alert')).toBeVisible();
  await expect(edit(page)).toHaveCount(0); await expect(save(page)).toHaveCount(0);
  expect(privateReads).toBe(0);
});

test('fresh stale-session detail recovery requires choice and never requests the old record under the new tenant', async ({ page }) => {
  await login(page);
  const stale = '00000000-0000-4000-8000-000000000099';
  const oldDetail = `/orders/00000000-0000-4000-8000-000000000098`;
  const detailRequests = [];
  page.on('request', request => { if (request.url() === `${api}${oldDetail}`) detailRequests.push(request.headers()['x-organization-id']); });
  await page.evaluate(id => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session'));
    session.organization_id = id; sessionStorage.setItem('alageum_session', JSON.stringify(session));
  }, stale);
  await page.goto(`/b2b${oldDetail}`);
  await expect(company(page)).toHaveCount(0);
  await expect(trigger(page)).toHaveText('Выбрать организацию');
  await trigger(page).click(); await expect(dialog(page)).toBeVisible();
  await expect(option(page, a)).not.toBeChecked(); await expect(option(page, b)).not.toBeChecked();
  expect(await storedOrganization(page)).toBe(stale);
  await option(page, b).check(); await switchSubmit(page).click();
  await expect(dialog(page)).not.toBeVisible(); await expect(active(page)).toContainText(b);
  await expect(page).toHaveURL(/\/b2b\/orders$/);
  expect(detailRequests).toEqual([]);
  await page.locator('.sidebar').getByRole('link', { name: 'Профиль', exact: true }).click();
  await expect(personal(page)).toContainText(email('multi'));
  expect(await storedOrganization(page)).toBe(b);
});

test('expired access and expired refresh clear identity during selection', async ({ page }) => {
  await login(page); await openSelection(page);
  let refreshes = 0;
  await page.route(meEndpoint, route => reply(route, expired, 401));
  await page.route(refreshEndpoint, route => { if (route.request().method() !== 'OPTIONS') refreshes++; return reply(route, expired, 401); });
  await switchSubmit(page).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('alageum_session'))).toBeNull();
  await expect(personal(page)).toHaveCount(0); await expect(company(page)).toHaveCount(0);
  expect(refreshes).toBe(1);
});

test('successful refresh during selection preserves the explicit candidate UUID', async ({ page }) => {
  await login(page); await openSelection(page);
  const candidateHeaders = []; let rejected = false, refreshes = 0;
  page.on('request', request => { if (request.url() === refreshEndpoint && request.method() === 'POST') refreshes++; });
  await page.route(meEndpoint, route => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    const id = route.request().headers()['x-organization-id'];
    candidateHeaders.push(id);
    if (id === b && !rejected) { rejected = true; return reply(route, expired, 401); }
    return route.continue();
  });
  await switchSubmit(page).click();
  await expect(dialog(page)).not.toBeVisible(); await expect(active(page)).toContainText(b);
  expect(await storedOrganization(page)).toBe(b);
  expect(candidateHeaders.filter(id => id === b).length).toBeGreaterThanOrEqual(2);
  expect(refreshes).toBe(1);
});

test('dismissed membership loading cannot reopen the chooser or change the current organization', async ({ page }) => {
  await login(page);
  const held = await holdRealReply(page, `${organizationsEndpoint}?*`);
  await trigger(page).click(); expect((await held.started).status).toBe(200);
  await cancelSelection(page).click(); await expect(dialog(page)).not.toBeVisible();
  await held.release(); await expect(dialog(page)).not.toBeVisible();
  await expect(active(page)).toContainText(a); expect(await storedOrganization(page)).toBe(a);
  await expect(trigger(page)).toBeFocused();
});

test('dismissed validation ignores the late candidate profile', async ({ page }) => {
  await login(page); await openSelection(page);
  const held = await holdRealReply(page, meEndpoint, request => request.headers()['x-organization-id'] === b);
  await switchSubmit(page).click(); expect((await held.started).status).toBe(200);
  await page.keyboard.press('Escape'); await expect(dialog(page)).not.toBeVisible();
  await held.release(); await expect(active(page)).toContainText(a);
  expect(await storedOrganization(page)).toBe(a); await expect(trigger(page)).toBeFocused();
});

test('late profile read cannot replace the explicitly switched organization', async ({ page }) => {
  await login(page);
  await page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true }).click();
  const held = await holdRealReply(page, profileEndpoint, request => request.method() === 'GET' && request.headers()['x-organization-id'] === a);
  await page.locator('.sidebar').getByRole('link', { name: 'Профиль', exact: true }).click(); expect((await held.started).status).toBe(200);
  await switchTo(page, b); await held.release();
  await expect(active(page)).toContainText(b); await expect(edit(page)).toBeVisible();
  expect((await readProfile(page, b)).body.organization_id).toBe(b);
});

test('Back, Forward, Escape and backdrop dismiss selection without changing tenant and restore focus', async ({ page }) => {
  await login(page);
  await page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true }).click();
  await page.locator('.sidebar').getByRole('link', { name: 'Профиль', exact: true }).click();
  await openSelection(page); await page.goBack();
  await expect(page).toHaveURL(/\/b2b$/); await expect(dialog(page)).not.toBeVisible();
  await page.goForward(); await expect(page).toHaveURL(/\/b2b\/profile$/);
  await expect(dialog(page)).not.toBeVisible(); await expect(active(page)).toContainText(a);
  await trigger(page).focus(); await page.keyboard.press('Enter'); await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(dialog(page)).not.toBeVisible(); await expect(trigger(page)).toBeFocused();
  await openSelection(page);
  const box = await dialog(page).boundingBox(); expect(box.x).toBeGreaterThan(1); expect(box.y).toBeGreaterThan(1);
  await page.mouse.click(Math.max(0, box.x - 1), Math.max(0, box.y - 1));
  await expect(dialog(page)).not.toBeVisible(); await expect(trigger(page)).toBeFocused();
  expect(await storedOrganization(page)).toBe(a);
});

test('invalid credentials expose no membership choices and anonymous public pages stay independent', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('organization-unknown@fixture.invalid');
  await page.getByLabel('Пароль', { exact: true }).fill('Fictitious wrong password 123!');
  const failed = page.waitForResponse(response => response.url() === `${api}/auth/login`);
  await page.getByRole('button', { name: 'Войти', exact: true }).click(); expect((await failed).status()).toBe(401);
  const loginError = page.locator('form').filter({ has: page.getByLabel('Email', { exact: true }) }).getByRole('alert');
  await expect(loginError).toHaveText('Email or password is incorrect');
  await expect(loginError).toBeVisible(); await expect(chooser(page)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('alageum_session'))).toBeNull();
  let privateReads = 0;
  page.on('request', request => { if (request.url().startsWith(organizationsEndpoint) || request.url() === meEndpoint) privateReads++; });
  for (const path of ['/company', '/catalog?source=static']) {
    expect((await page.goto(path)).status()).toBe(200);
    await expect(page.locator('header.site-header')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
  }
  expect(privateReads).toBe(0);
});

test('injected accepted RFQ reply cannot navigate after a real organization switch', async ({ page }) => {
  // Explicit frontend response injection: real logins, memberships and /me
  // validation; no quote grants or RFQs are written to PostgreSQL fixtures.
  const productId = '00000000-0000-4000-8000-000000000072';
  const quoteId = '00000000-0000-4000-8000-000000000073';
  const product = { id: productId, public_key: 'organization-race-fixture', slug: 'organization-race-fixture', sku: 'ORG-RACE', translations: { ru: { name: 'Fictitious organization race equipment' } }, price_mode: 'fixed', price: '1.00', currency: 'KZT', version: 1, specs: {}, category_public_key: 'transformers' };
  await page.route(meEndpoint, async route => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    const actual = await route.fetch();
    if (actual.status() !== 200) return route.fulfill({ response: actual });
    const body = await actual.json();
    return route.fulfill({ response: actual, json: { ...body, permissions: [...body.permissions, 'quote.read', 'quote.create'] } });
  });
  await page.route(`${api}/catalog/products*`, route => reply(route, { items: [product], total: 1 }));
  await page.route(`${api}/quotes?*`, route => reply(route, { items: [], total: 0, page: 1, page_size: 20 }));
  const started = deferred(), release = deferred(), finished = deferred();
  let mutations = 0, target;
  await page.route(`${api}/quotes/catalog`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    mutations++; target = route.request().headers()['x-organization-id'];
    started.resolve(); await release.promise;
    try { await reply(route, { id: quoteId, status: 'submitted', item_count: 1 }, 201); }
    finally { finished.resolve(); }
  });
  await login(page);
  await page.goto('/catalog?source=api');
  await page.getByRole('button', { name: 'В подборку +', exact: true }).click();
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)', { exact: true }).fill('Fictitious previous organization RFQ');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click(); await started.promise;
  const originalDraftKeys = await page.evaluate(organization => Object.keys(sessionStorage).filter(key => key.startsWith(`alageum.quote.draft.v1:${organization}:`)), a);
  expect(originalDraftKeys).toHaveLength(1);
  const [originalDraftKey] = originalDraftKeys;
  await page.getByRole('link', { name: 'Мои запросы →', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await switchTo(page, b);
  const late = page.waitForResponse(response => response.url() === `${api}/quotes/catalog` && response.status() === 201);
  release.resolve(); await finished.promise; await (await late).finished();
  await expect.poll(() => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).attempt.quoteId, originalDraftKey)).toBe(quoteId);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await expect(active(page)).toContainText(b);
  await expect(page.getByText('Fictitious previous organization RFQ', { exact: true })).toHaveCount(0);
  expect(mutations).toBe(1); expect(target).toBe(a); expect(await storedOrganization(page)).toBe(b);
});
