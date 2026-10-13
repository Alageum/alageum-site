import { expect, test } from '@playwright/test';

// Dedicated real Strapi/PostgreSQL fixture suite. Interceptions below delay real
// replies or inject a named failure; the primary save/reload has no interception.
// Credentials and tokens stay in memory. Trace/video/automatic screenshots are off.
// Controlled pageshow is synthetic: pinned Playwright disables Chromium BFCache.
const api = process.env.E2E_PROFILE_API_URL?.replace(/\/$/, '');
const endpoint = `${api}/organizations/current/profile`;
const emails = Object.fromEntries(['editor', 'readonly', 'updateonly', 'denied', 'other', 'multi'].map(kind => [kind, `profile-${kind}@fixture.invalid`]));
const company = page => page.getByTestId('company-profile');
const personal = page => page.getByTestId('personal-profile');
const button = (page, name) => company(page).getByRole('button', { name, exact: true });
const edit = page => button(page, 'Редактировать профиль компании');
const save = page => button(page, 'Сохранить изменения');
const cancel = page => button(page, 'Отмена');
const field = (page, name) => company(page).getByRole('textbox', { name, exact: true });
const names = { name: 'Название компании', business_contact_name: 'Контактное лицо', business_contact_email: 'Рабочий email', business_contact_phone: 'Рабочий телефон', business_address: 'Рабочий адрес' };
const response = (page, method) => page.waitForResponse(value => value.url() === endpoint && value.request().method() === method);
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test.beforeAll(() => {
  expect(process.env.APP_ENV, 'Use backend-node/scripts/run-profile-tests.sh').toBe('test');
  expect(process.env.ALAGEUM_TEST_PROFILE_FIXTURES).toBe('1');
  expect(Boolean(process.env.E2E_PROFILE_PASSWORD && process.env.E2E_PROFILE_PASSWORD.length >= 40)).toBe(true);
  for (const value of [api, process.env.E2E_PROFILE_BASE_URL]) {
    expect(Boolean(value), 'Both isolated server URLs must be provided').toBe(true);
    const url = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
  for (const key of ['A', 'B']) expect(process.env[`E2E_PROFILE_ORGANIZATION_${key}`]).toMatch(/^[a-f0-9-]{36}$/);
});

async function login(page, kind = 'editor') {
  await page.goto('/login?next=%2Fb2b%2Fprofile');
  await page.getByLabel('Email', { exact: true }).fill(emails[kind]);
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_PROFILE_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/profile$/);
  await expect(personal(page)).toContainText(emails[kind]);
  await expect(company(page)).toBeVisible();
}

async function readCurrent(page) {
  return page.evaluate(async url => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session') || '{}');
    const reply = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}`, 'X-Organization-ID': session.organization_id }, cache: 'no-store' });
    return { status: reply.status, body: await reply.json() };
  }, endpoint);
}

// There is no production account/tenant picker. Exercise its existing transport
// boundary directly with a genuine fixture login; no application test hook exists.
async function installSession(page, request, kind, organization) {
  const reply = await request.post(`${api}/auth/login`, { data: { email: emails[kind], password: process.env.E2E_PROFILE_PASSWORD } });
  expect(reply.status()).toBe(200);
  const pair = await reply.json();
  await page.evaluate(session => {
    sessionStorage.setItem('alageum_session', JSON.stringify(session));
    window.dispatchEvent(new Event('alageum:session-changed'));
  }, { ...pair, organization_id: organization });
}

async function logoutSession(page) {
  await page.evaluate(async url => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session') || '{}');
    if (session.refresh_token) await fetch(`${url}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    sessionStorage.removeItem('alageum_session');
    window.dispatchEvent(new Event('alageum:session-changed'));
  }, api);
}

async function holdRealReply(page, method) {
  const started = deferred(), release = deferred(), finished = deferred();
  let held = false, replied = false, count = 0;
  const handler = async route => {
    if (route.request().method() !== method) return route.continue();
    count += 1;
    if (held) return route.continue();
    held = true;
    try {
      const actual = await route.fetch(); // The mutation may already be committed.
      replied = true; started.resolve({ status: actual.status(), body: await actual.json() });
      await release.promise;
      await route.fulfill({ response: actual });
    } catch {
      // AbortController may cancel a dismissed request before its reply is released.
      if (!replied) started.resolve({ status: 0 });
    } finally { finished.resolve(); }
  };
  await page.route(endpoint, handler);
  return { started: started.promise, count: () => count, async release() { release.resolve(); await finished.promise; await page.unroute(endpoint, handler); } };
}

async function expectResponsive(page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, scrollX: window.scrollX, scale: Math.round((window.visualViewport?.scale ?? 1) * 1000) / 1000 }))).toEqual({ fits: true, scrollX: 0, scale: 1 });
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

async function fillProfile(page, values) {
  for (const [key, value] of Object.entries(values)) {
    const input = field(page, names[key]);
    await expectReachable(input);
    await input.fill(value);
  }
}

// The screenshots contain only saved fictitious company data and fixture emails.
test('responsive saved profile: real save, personal identity separation and reload', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await login(page);
  const before = await readCurrent(page); expect(before.status).toBe(200);
  await edit(page).click();
  const values = {
    name: `Fictitious Workshop ${testInfo.project.name}`,
    business_contact_name: 'Fictitious business contact',
    business_contact_email: 'office@fixture.invalid',
    business_contact_phone: '+0 000 000 000 extension example',
    business_address: 'Fictitious Example Avenue 12, Example District',
  };
  await fillProfile(page, values);
  await expectReachable(cancel(page)); await expectReachable(save(page)); await expectResponsive(page);
  const savedReply = response(page, 'PATCH'); await save(page).click();
  const saved = await savedReply; expect(saved.status()).toBe(200);
  const snapshot = await saved.json(); expect(snapshot).toMatchObject({ ...values, organization_id: process.env.E2E_PROFILE_ORGANIZATION_A, version: before.body.version + 1 });
  await expect(company(page).getByRole('status')).toContainText('Профиль компании сохранён');
  await expect(personal(page)).toContainText('Fictitious Profile editor');
  await expect(personal(page)).toContainText(emails.editor);
  await expect(personal(page)).not.toContainText(values.business_contact_email);
  expect((await readCurrent(page)).body).toEqual(snapshot);
  await expectResponsive(page);
  // A full-page capture must start from a settled viewport. Otherwise mobile
  // fixed layers can be composited at the previous scroll position even though
  // the responsive form assertions passed. Keep application styling unchanged.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
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
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const path = testInfo.outputPath(`saved-fictitious-profile-${testInfo.project.name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach('saved-fictitious-company-profile', { path, contentType: 'image/png' });
  const reloaded = response(page, 'GET'); await page.reload(); expect((await reloaded).status()).toBe(200);
  await expect(company(page)).toContainText(values.name); await edit(page).click();
  for (const [key, value] of Object.entries(values)) await expect(field(page, names[key])).toHaveValue(value);
  await expectReachable(cancel(page)); await cancel(page).click(); await expectResponsive(page);
  expect(errors).toEqual([]);
});

test('responsive validation: error keeps draft and all controls reachable', async ({ page }) => {
  await login(page); await edit(page).click();
  for (const [key, max] of Object.entries({ name: 240, business_contact_name: 200, business_contact_email: 320, business_contact_phone: 80, business_address: 2000 })) await expect(field(page, names[key])).toHaveAttribute('maxlength', String(max));
  await field(page, names.name).fill('Fictitious validation draft');
  await page.route(endpoint, route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'validation_error', message: 'Fictitious validation rejection' } }) }) : route.continue());
  await save(page).click();
  const alert = company(page).getByRole('alert'); await expect(alert).toBeVisible(); await expectReachable(alert);
  await expect(field(page, names.name)).toHaveValue('Fictitious validation draft');
  await expectReachable(cancel(page)); await expectReachable(save(page)); await expectResponsive(page);
  await cancel(page).click(); await expect(edit(page)).toBeVisible();
});

for (const kind of ['readonly', 'updateonly', 'denied']) test(`${kind} fixture has no company mutation controls`, async ({ page }) => {
  const requests = []; page.on('request', value => { if (value.url() === endpoint) requests.push(value.method()); });
  await login(page, kind);
  await expect(edit(page)).toHaveCount(0); await expect(save(page)).toHaveCount(0);
  if (kind === 'readonly') { await expect(company(page)).toContainText('Fictitious'); expect(requests).toContain('GET'); }
  else { await expect(company(page).getByRole('alert')).toBeVisible(); expect(requests).not.toContain('GET'); }
  expect(requests).not.toContain('PATCH');
});

test('repeated clicks create one write while pending', async ({ page }) => {
  await login(page); await edit(page).click(); await field(page, names.name).fill('Fictitious repeated click');
  const held = await holdRealReply(page, 'PATCH');
  await save(page).evaluate(element => { element.click(); element.click(); element.form?.requestSubmit(); });
  expect((await held.started).status).toBe(200);
  await expect(company(page)).toHaveAttribute('aria-busy', 'true');
  expect(held.count()).toBe(1); await held.release();
  await expect(company(page).getByRole('status')).toContainText('Профиль компании сохранён');
  expect(held.count()).toBe(1);
});

test('same-session controlled persisted pageshow preserves an unsaved company draft without mutation replay', async ({ page }) => {
  await login(page); await edit(page).click();
  const requests = [], mutations = [];
  page.on('request', request => {
    if (request.url() === endpoint && ['GET', 'PATCH'].includes(request.method())) requests.push(request.method());
    if (request.url().startsWith(`${api}/`) && ['POST', 'PATCH'].includes(request.method())) mutations.push({ method: request.method(), url: request.url() });
  });
  await field(page, names.name).fill('Fictitious saved before controlled pageshow');
  const savedReply = response(page, 'PATCH'); await save(page).click();
  const saved = await savedReply; expect(saved.status()).toBe(200);
  const snapshot = await saved.json();
  await expect(company(page).getByRole('status')).toContainText('Профиль компании сохранён');
  await edit(page).click();
  await field(page, names.name).fill('Fictitious unsaved controlled pageshow draft');
  await field(page, names.business_contact_name).fill('Fictitious unsaved draft contact');
  await page.evaluate(() => {
    // Synthetic lifecycle signal with identical storage, not native BFCache.
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(field(page, names.name)).toHaveValue('Fictitious unsaved controlled pageshow draft');
  await expect(field(page, names.business_contact_name)).toHaveValue('Fictitious unsaved draft contact');
  await expect(save(page)).toBeEnabled();
  await expect(company(page)).toHaveAttribute('aria-busy', 'false');
  expect(requests).toEqual(['PATCH']);
  expect(mutations).toEqual([{ method: 'PATCH', url: endpoint }]);
  expect((await readCurrent(page)).body).toEqual(snapshot);
  expect(requests).toEqual(['PATCH', 'GET']);
  expect(mutations).toEqual([{ method: 'PATCH', url: endpoint }]);
  await expect(field(page, names.name)).toHaveValue('Fictitious unsaved controlled pageshow draft');
});

test('cancel discards draft and late write cannot close a newer edit', async ({ page }) => {
  await login(page); const before = await readCurrent(page); await edit(page).click();
  await field(page, names.name).fill('Fictitious discarded draft'); await cancel(page).click();
  expect((await readCurrent(page)).body).toEqual(before.body);
  await edit(page).click(); await field(page, names.name).fill('Fictitious delayed committed write');
  const held = await holdRealReply(page, 'PATCH'); await save(page).click(); expect((await held.started).status).toBe(200);
  await cancel(page).click();
  await button(page, 'Загрузить актуальные данные').click(); await edit(page).click();
  await field(page, names.name).fill('Fictitious newer unsaved draft');
  await held.release(); await expect(field(page, names.name)).toHaveValue('Fictitious newer unsaved draft');
  await expect(save(page)).toBeEnabled();
  await expect(company(page).getByText('Профиль компании сохранён', { exact: true })).toHaveCount(0);
});

test('version conflict retains draft until explicit latest-data reload', async ({ page, browser }) => {
  const context = await browser.newContext({ baseURL: process.env.E2E_PROFILE_BASE_URL }); const other = await context.newPage();
  try {
    await login(page); await login(other);
    await edit(page).click(); await field(page, names.name).fill('Fictitious unsaved conflict draft');
    await edit(other).click(); await field(other, names.name).fill('Fictitious newer server profile');
    const saved = response(other, 'PATCH'); await save(other).click(); expect((await saved).status()).toBe(200);
    const conflict = response(page, 'PATCH'); await save(page).click(); expect((await conflict).status()).toBe(409);
    await expect(company(page).getByRole('alert')).toBeVisible();
    await expect(field(page, names.name)).toHaveValue('Fictitious unsaved conflict draft');
    const latest = response(page, 'GET'); await button(page, 'Загрузить актуальные данные').click(); expect((await latest).status()).toBe(200);
    await expect(company(page)).toContainText('Fictitious newer server profile');
    await expect(company(page)).not.toContainText('Fictitious unsaved conflict draft');
  } finally { await context.close(); }
});

test('newer navigation and back ignore a late write from the unmounted editor', async ({ page }) => {
  await login(page); await edit(page).click(); await field(page, names.name).fill('Fictitious unmounted save');
  const held = await holdRealReply(page, 'PATCH'); await save(page).click(); expect((await held.started).status).toBe(200);
  await page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true }).click(); await expect(page).toHaveURL(/\/b2b$/);
  await held.release(); await expect(company(page)).toHaveCount(0);
  await page.goBack(); await expect(page).toHaveURL(/\/b2b\/profile$/);
  await expect(company(page)).toContainText('Fictitious unmounted save');
  await expect(company(page).getByText('Профиль компании сохранён', { exact: true })).toHaveCount(0);
});

test('late read after logout cannot restore personal or company identity', async ({ page }) => {
  await login(page); await page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true }).click();
  const held = await holdRealReply(page, 'GET');
  await page.locator('.sidebar').getByRole('link', { name: 'Профиль', exact: true }).click(); expect((await held.started).status).toBe(200);
  await logoutSession(page); await held.release();
  await expect(personal(page)).toHaveCount(0);
  await expect(edit(page)).toHaveCount(0); await expect(company(page)).toHaveCount(0);
});

test('late write after account switch cannot replace the next account company', async ({ page, request }) => {
  await login(page); await edit(page).click(); await field(page, names.name).fill('Fictitious previous account response');
  const held = await holdRealReply(page, 'PATCH'); await save(page).click(); expect((await held.started).status).toBe(200);
  await installSession(page, request, 'other', process.env.E2E_PROFILE_ORGANIZATION_B);
  await expect(personal(page)).toContainText(emails.other); await expect(company(page)).toContainText('Fictitious Profile Workshop B');
  await held.release(); await expect(personal(page)).toContainText(emails.other);
  await expect(company(page)).toContainText('Fictitious Profile Workshop B'); await expect(company(page)).not.toContainText('Fictitious previous account response');
});

test('multi-membership tenant switch ignores late reads and writes from the previous tenant', async ({ page, request }) => {
  await page.goto('/login'); await installSession(page, request, 'multi', process.env.E2E_PROFILE_ORGANIZATION_A); await page.goto('/b2b/profile');
  await expect(edit(page)).toBeVisible();
  await page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true }).click();
  const read = await holdRealReply(page, 'GET'); await page.locator('.sidebar').getByRole('link', { name: 'Профиль', exact: true }).click(); expect((await read.started).status).toBe(200);
  await page.evaluate(id => { const session = JSON.parse(sessionStorage.getItem('alageum_session')); session.organization_id = id; sessionStorage.setItem('alageum_session', JSON.stringify(session)); window.dispatchEvent(new Event('alageum:session-changed')); }, process.env.E2E_PROFILE_ORGANIZATION_B);
  await expect(company(page)).toContainText('Fictitious Profile Workshop B'); await read.release();
  await expect(company(page)).toContainText('Fictitious Profile Workshop B');
  await edit(page).click(); await field(page, names.business_contact_name).fill('Fictitious previous tenant contact');
  const write = await holdRealReply(page, 'PATCH'); await save(page).click(); expect((await write.started).status).toBe(200);
  await page.evaluate(id => { const session = JSON.parse(sessionStorage.getItem('alageum_session')); session.organization_id = id; sessionStorage.setItem('alageum_session', JSON.stringify(session)); window.dispatchEvent(new Event('alageum:session-changed')); }, process.env.E2E_PROFILE_ORGANIZATION_A);
  await expect(company(page)).not.toContainText('Fictitious Profile Workshop B'); await write.release();
  await expect(company(page)).not.toContainText('Fictitious previous tenant contact');
  expect((await readCurrent(page)).body.organization_id).toBe(process.env.E2E_PROFILE_ORGANIZATION_A);
});

test('mutation 401 expires session without refresh or replay', async ({ page }) => {
  await login(page); await edit(page).click(); await field(page, names.name).fill('Fictitious rejected mutation');
  let mutations = 0, refreshes = 0;
  page.on('request', value => { if (value.url() === `${api}/auth/refresh`) refreshes += 1; });
  await page.route(endpoint, route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    mutations += 1;
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'authentication_required', message: 'Fixture expired session' } }) });
  });
  await save(page).click(); await expect(edit(page)).toHaveCount(0); await expect(save(page)).toHaveCount(0);
  await expect(personal(page)).toHaveCount(0);
  expect(mutations).toBe(1); expect(refreshes).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('alageum_session'))).toBeNull();
});

test('anonymous public company and catalog do not depend on profile fixtures', async ({ page }) => {
  let profileReads = 0; page.on('request', value => { if (value.url() === endpoint) profileReads += 1; });
  await page.route(endpoint, route => route.abort('failed'));
  for (const path of ['/company', '/catalog?source=static']) {
    expect((await page.goto(path)).status()).toBe(200);
    await expect(page.locator('header.site-header')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
  }
  expect(profileReads).toBe(0);
});
