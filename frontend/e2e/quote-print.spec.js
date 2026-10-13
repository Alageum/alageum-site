import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Frontend acceptance fixtures only: no real accounts, catalog records or RFQ
// writes. The real backend's owner/tenant predicates have their own contract tests.
const quoteId = '22222222-2abc-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const otherUserId = '55555555-5555-4555-8555-555555555555';
const orgId = '44444444-4444-4444-8444-444444444444';
const otherOrgId = '66666666-6666-4666-8666-666666666666';
const detailPath = `/quotes/${quoteId}`;
const printPath = `/b2b${detailPath}/print`;
const title = 'Запрос коммерческого предложения';
const savedName = 'Учебный трансформатор — сохранённая версия';
const currentName = 'Новый товар, который нельзя подставлять';
const currentCompany = 'Текущая учебная компания, не снимок запроса';
const session = { access_token: 'fictitious-print-owner', organization_id: orgId };
const screen = page => page.locator('.quote-print-page');
const paper = page => page.locator('[data-quote-print-paper]');
const printButton = page => page.getByRole('button', { name: 'Печать', exact: true });
const privateDocument = page => page.locator('[data-quote-print-document]');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixtureQuote(count = 3) {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`,
    product_id: `88888888-8888-4888-8888-${String(index + 1).padStart(12, '0')}`,
    quantity: index === 0 ? '2.125' : index === 1 ? '999999999999999.999' : '3.000',
    product_snapshot: {
      sku: `SAVED-${String(index + 1).padStart(3, '0')}`,
      public_key: `fictitious-saved-${index + 1}`,
      translations: { ru: { name: index === 0 ? savedName : `Учебная позиция ${index + 1}: оборудование с длинным сохранённым названием для проверки переноса строк` } },
      price_mode: index === 1 ? 'on_request' : 'fixed',
      price: index === 1 ? null : index === 0 ? '9999999999999999.99' : '1200.00',
      currency: 'KZT',
      version: index + 7,
    },
  }));
  return { id: quoteId, status: 'submitted', created_at: '2026-10-01T15:00:00Z', comment: 'Учебный проект\nСохранённый комментарий: только исторические данные.', item_count: items.length, items };
}

async function fixture(page, options = {}) {
  const state = {
    quote: options.quote || fixtureQuote(),
    permissions: options.permissions || ['quote.read', 'quote.create'],
    meStatus: 200,
    detailStatus: options.detailStatus || 200,
    profileOverride: null,
    requests: [],
    hold: null,
  };
  await page.addInitScript(({ session, authenticated, initialSession }) => {
    // Seed once per tab. Reloading after expiry/logout must not sign in again.
    if (!sessionStorage.getItem('fictitious-quote-print-seeded')) {
      sessionStorage.setItem('fictitious-quote-print-seeded', '1');
      if (authenticated) sessionStorage.setItem('alageum_session', JSON.stringify(initialSession || session));
    }
  }, { session, authenticated: options.authenticated !== false, initialSession: options.session });

  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-organization-id',
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
    const organization = request.headers()['x-organization-id'] || orgId;
    const actor = request.headers().authorization?.includes('other-user') ? otherUserId : userId;
    state.requests.push({ path, method, organization, actor });
    const profile = { user: { id: actor, email: actor === userId ? 'print-owner@fixture.invalid' : 'print-other@fixture.invalid' }, organization: { id: organization, name: currentCompany }, permissions: state.permissions };
    let status = 200;
    let json;
    if (path === '/auth/me') { status = state.meStatus; json = state.profileOverride || profile; }
    else if (path === detailPath) {
      status = actor !== userId || organization !== orgId ? 404 : state.detailStatus;
      json = state.quote;
    } else if (path === '/quotes') json = { items: actor === userId && organization === orgId ? [state.quote] : [], total: actor === userId && organization === orgId ? 1 : 0, page: 1, page_size: 20 };
    else if (path === '/organizations') json = { items: [orgId, otherOrgId].map((id, index) => ({ id: `membership-${index}`, organization_id: id, organization_name: `Учебная организация ${index + 1}`, role_id: 'fixture-buyer', role_name: 'Учебный покупатель', permissions: state.permissions })), total: 2, page: 1, page_size: 100 };
    else if (path === '/catalog/products') json = { items: [{ id: state.quote.items[0]?.product_id, translations: { ru: { name: currentName } }, price: '0.01' }], total: 1 };
    else if (path === '/auth/refresh') { status = 401; json = {}; }
    else { status = 404; json = {}; }
    if (status !== 200) json = { error: { code: status === 401 ? 'session_expired' : status === 403 ? 'access_denied' : status === 404 ? 'quote_not_found' : 'fixture_failure' } };
    // Capture a reply before delaying it, so races really deliver stale data.
    json = structuredClone(json);
    const held = state.hold?.path === path ? state.hold : null;
    if (held) {
      state.hold = null;
      held.started.resolve();
      await held.release.promise;
    }
    try { await route.fulfill({ status, headers, json }); }
    catch (error) {
      // Aborted/unmounted reads may have gone away before release.
      if (!held) throw error;
    } finally { held?.finished.resolve(); }
  });
  state.holdNext = path => {
    const held = { path, started: deferred(), release: deferred(), finished: deferred() };
    state.hold = held;
    return { started: held.started.promise, async release() { held.release.resolve(); await held.finished.promise; } };
  };
  return state;
}

async function openPrint(page) {
  await page.goto(printPath);
  await expect(screen(page).getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(screen(page)).toContainText(savedName);
  await expect(printButton(page)).toBeEnabled();
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function printState(page) {
  return page.evaluate(() => {
    const visible = element => Boolean(element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length);
    const root = document.querySelector('[data-quote-print-paper]');
    const doc = root?.querySelector('[data-quote-print-document]');
    const fallback = document.querySelector('[data-quote-print-fallback]');
    return {
      directBody: root?.parentElement === document.body,
      documentVisible: visible(doc),
      documentText: visible(doc) ? doc.innerText : '',
      fallbackVisible: visible(fallback),
      fallbackText: visible(fallback) ? fallback.innerText : '',
      headerVisible: visible(document.querySelector('header.site-header')),
      navigationVisible: visible(document.querySelector('.sidebar')),
      itemCount: doc?.querySelectorAll('.quote-print-item').length || 0,
      fits: !doc || doc.scrollWidth <= doc.clientWidth + 1,
    };
  });
}

async function printMediaState(page) {
  await page.emulateMedia({ media: 'print' });
  try { return await printState(page); }
  finally { await page.emulateMedia({ media: 'screen' }); }
}

async function mockPrint(page, { hold = false, fail = false } = {}) {
  const captures = [];
  const entered = deferred();
  const release = deferred();
  await page.exposeBinding('captureFictitiousPrint', async () => {
    captures.push(await printMediaState(page));
    entered.resolve();
    if (hold) await release.promise;
    if (fail) throw new Error('Fictitious print dialog unavailable');
  });
  await page.addInitScript(() => {
    window.print = async () => {
      window.dispatchEvent(new Event('beforeprint'));
      try { await window.captureFictitiousPrint(); }
      finally { window.dispatchEvent(new Event('afterprint')); }
    };
  });
  return { captures, entered: entered.promise, release: () => release.resolve() };
}

async function changeSession(page, next) {
  return page.evaluate(value => {
    if (value) sessionStorage.setItem('alageum_session', JSON.stringify(value));
    else sessionStorage.removeItem('alageum_session');
    window.dispatchEvent(new Event('alageum:session-changed'));
    // Privacy cleanup must happen inside the boundary event, not an effect later.
    const root = document.querySelector('[data-quote-print-paper]');
    return root?.hasAttribute('data-authorized') || false;
  }, next);
}

function expectReadOnly(state) {
  expect(state.requests.filter(request => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
  expect(state.requests.filter(request => request.path.startsWith('/catalog') || request.path.includes('/profile'))).toEqual([]);
}

test('saved RFQ preview keeps exact snapshot decimals and fits desktop/mobile', async ({ page }, testInfo) => {
  const state = await fixture(page);
  await openPrint(page);
  await expect(screen(page)).toContainText(quoteId);
  await expect(screen(page)).toContainText('2.125');
  await expect(screen(page)).toContainText('999999999999999.999');
  await expect(screen(page)).toContainText('9999999999999999.99');
  await expect(screen(page)).toContainText('1200.00');
  await expect(screen(page)).toContainText('KZT');
  await expect(screen(page)).toContainText('По запросу');
  await expect(screen(page)).toContainText('SAVED-001');
  await expect(screen(page).locator('.quote-print-item').first().getByText('7', { exact: true })).toBeVisible();
  await expect(screen(page).locator('time')).toHaveAttribute('datetime', '2026-10-01T15:00:00Z');
  await expect(screen(page).locator('time')).toContainText('15:00 UTC');
  await expect(screen(page)).toContainText('Это не коммерческое предложение продавца');
  await expect(screen(page)).toContainText('Сохранённый комментарий');
  await expect(screen(page)).not.toContainText(currentName);
  await expect(screen(page)).not.toContainText(currentCompany);
  await expect(screen(page)).not.toContainText(/Итого|Общая стоимость/);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const screenshotPath = testInfo.outputPath('fictitious-saved-rfq-preview.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('fictitious-saved-rfq-preview', { path: screenshotPath, contentType: 'image/png' });
  const blocked = await printMediaState(page);
  expect(blocked.documentVisible).toBe(false);
  expect(blocked.fallbackVisible).toBe(true);
  expectReadOnly(state);
});

test('missing and partial historical snapshots remain explicitly missing in print', async ({ page }) => {
  const quote = fixtureQuote(4);
  quote.items[1].product_snapshot = {};
  quote.items[2].product_snapshot = null;
  quote.items[3].product_snapshot = { sku: 'PARTIAL-004', price: '42.42', currency: 'KZT' };
  const state = await fixture(page, { quote });
  const printing = await mockPrint(page);
  await openPrint(page);
  await expect(screen(page)).toContainText(/не сохранен|не сохранён|отсутствует/i);
  await expect(screen(page).locator('.quote-print-item').filter({ hasText: 'PARTIAL-004' })).toContainText('Не сохранена');
  await printButton(page).click();
  await expect.poll(() => printing.captures.length).toBe(1);
  const captured = printing.captures[0];
  expect(captured.directBody).toBe(true);
  expect(captured.documentVisible).toBe(true);
  expect(captured.fallbackVisible).toBe(false);
  expect(captured.documentText).toContain('999999999999999.999');
  expect(captured.documentText).toContain('3.000');
  expect(captured.documentText).not.toContain('SAVED-002');
  expect(captured.documentText).not.toContain('42.42 KZT');
  expect(captured.documentText).not.toContain(currentName);
  expect(captured.documentText).not.toContain(currentCompany);
  await expect(privateDocument(page)).toHaveCount(0);
  expectReadOnly(state);
});

test('uppercase UUID routes normalize to the saved RFQ endpoint', async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`/b2b/quotes/${quoteId.toUpperCase()}/print`);
  await expect(screen(page)).toContainText(savedName);
  expect(state.requests.filter(request => request.path.startsWith('/quotes/')).map(request => request.path)).toEqual([detailPath]);
  expectReadOnly(state);
});

test('each print refreshes permission and saved detail in order, including repeated cancellation', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page);
  await openPrint(page);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const start = state.requests.length;
    state.quote = { ...state.quote, comment: `Учебная сохранённая версия ${attempt}` };
    const held = state.holdNext('/auth/me');
    await printButton(page).click();
    await held.started;
    await expect(privateDocument(page)).toHaveCount(0);
    await expect(screen(page)).not.toContainText(savedName);
    await held.release();
    await expect.poll(() => printing.captures.length).toBe(attempt);
    expect(printing.captures[attempt - 1].documentText).toContain(`Учебная сохранённая версия ${attempt}`);
    expect(state.requests.slice(start).map(({ method, path }) => `${method} ${path}`)).toEqual(['GET /auth/me', `GET ${detailPath}`]);
    await expect(privateDocument(page)).toHaveCount(0);
    await expect(printButton(page)).toBeEnabled();
    expect((await printMediaState(page)).documentVisible).toBe(false);
  }
  expectReadOnly(state);
});

test('native menu/Ctrl+P lifecycle cannot print the cached private preview', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page);
  await openPrint(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const blocked = await printMediaState(page);
  expect(blocked.documentVisible).toBe(false);
  expect(blocked.fallbackVisible).toBe(true);
  expect(blocked.fallbackText).toContain('Печать');
  expect(blocked.headerVisible).toBe(false);
  expect(blocked.navigationVisible).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(privateDocument(page)).toHaveCount(0);
  expect(printing.captures).toHaveLength(0);
  await printButton(page).click();
  await expect.poll(() => printing.captures.length).toBe(1);
  expect(printing.captures[0].documentText).toContain(savedName);
  expectReadOnly(state);
});

test('rapid print activation makes only one fresh authorization/detail read', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page);
  await openPrint(page);
  const start = state.requests.length;
  const held = state.holdNext('/auth/me');
  await printButton(page).evaluate(button => { button.click(); button.click(); });
  await held.started;
  await expect(printButton(page)).toBeDisabled();
  await held.release();
  await expect.poll(() => printing.captures.length).toBe(1);
  await expect(printButton(page)).toBeEnabled();
  expect(state.requests.slice(start).map(request => request.path)).toEqual(['/auth/me', detailPath]);
  expectReadOnly(state);
});

for (const kind of ['anonymous', 'no permission', 'other owner', 'other tenant', 'invalid id']) {
  test(`direct print URL rejects ${kind} without leaking saved data`, async ({ page }) => {
    const state = await fixture(page, {
      authenticated: kind !== 'anonymous',
      permissions: kind === 'no permission' ? [] : undefined,
      session: kind === 'other owner' ? { ...session, access_token: 'fictitious-other-user' } : kind === 'other tenant' ? { ...session, organization_id: otherOrgId } : undefined,
    });
    await page.goto(kind === 'invalid id' ? '/b2b/quotes/not-a-uuid/print' : printPath);
    await expect(page.getByText(/Войдите в B2B кабинет|Нет доступа к запросам КП|Запрос недоступен|Запрос не найден/).first()).toBeVisible();
    await expect(page.getByText(savedName, { exact: true })).toHaveCount(0);
    await expect(privateDocument(page)).toHaveCount(0);
    if (['anonymous', 'no permission', 'invalid id'].includes(kind)) expect(state.requests.filter(request => request.path === detailPath)).toHaveLength(0);
    expect((await printMediaState(page)).documentVisible).toBe(false);
    expectReadOnly(state);
  });
}

for (const kind of ['permission revoked', 'different user', 'different organization']) {
  test(`print revalidation rejects ${kind} before loading any private detail`, async ({ page }) => {
    const state = await fixture(page);
    const printing = await mockPrint(page);
    await openPrint(page);
    const start = state.requests.length;
    if (kind === 'permission revoked') state.permissions = [];
    else state.profileOverride = { user: { id: kind === 'different user' ? otherUserId : userId }, organization: { id: kind === 'different organization' ? otherOrgId : orgId }, permissions: ['quote.read'] };
    await printButton(page).click();
    await expect(screen(page)).not.toContainText(savedName);
    await expect(screen(page).getByRole('alert')).toBeVisible();
    await expect(privateDocument(page)).toHaveCount(0);
    expect(printing.captures).toHaveLength(0);
    expect(state.requests.slice(start).map(request => request.path)).toEqual(['/auth/me']);
    expect((await printMediaState(page)).documentVisible).toBe(false);
    expectReadOnly(state);
  });
}

for (const status of [401, 403, 404, 500]) {
  test(`failed saved-detail refresh (${status}) clears the old document and never opens print`, async ({ page }) => {
    const state = await fixture(page);
    const printing = await mockPrint(page);
    await openPrint(page);
    state.detailStatus = status;
    await printButton(page).click();
    await expect(page.getByText(savedName, { exact: true })).toHaveCount(0);
    await expect(privateDocument(page)).toHaveCount(0);
    await expect.poll(() => state.requests.filter(request => request.path === detailPath).length).toBe(2);
    await settle(page);
    expect(printing.captures).toHaveLength(0);
    expect((await printMediaState(page)).documentVisible).toBe(false);
    expectReadOnly(state);
  });
}

for (const kind of ['logout', 'same-account relogin', 'other-account login']) {
  test(`pending print cannot survive ${kind}`, async ({ page }) => {
    const state = await fixture(page);
    const printing = await mockPrint(page);
    await openPrint(page);
    const held = state.holdNext(detailPath);
    await printButton(page).click();
    await held.started;
    const next = kind === 'logout' ? null : { ...session, access_token: kind === 'same-account relogin' ? 'fictitious-print-owner-new-login' : 'fictitious-other-user' };
    expect(await changeSession(page, next)).toBe(false);
    if (kind !== 'logout') await expect(page).toHaveURL(/\/b2b\/quotes$/);
    await held.release();
    await settle(page);
    expect(printing.captures).toHaveLength(0);
    await expect(privateDocument(page)).toHaveCount(0);
    await expect(page.getByText(savedName, { exact: true })).toHaveCount(0);
    expect((await printMediaState(page)).documentVisible).toBe(false);
    expectReadOnly(state);
  });
}

test('late unauthorized print reply cannot expire a newer login', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page);
  await openPrint(page);
  state.detailStatus = 401;
  const held = state.holdNext(detailPath);
  await printButton(page).click();
  await held.started;
  expect(await changeSession(page, { ...session, access_token: 'fictitious-other-user-new-login' })).toBe(false);
  await held.release();
  await expect(page.getByTestId('active-organization')).toContainText(orgId);
  await settle(page);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('alageum_session') || '{}').access_token)).toBe('fictitious-other-user-new-login');
  expect(printing.captures).toHaveLength(0);
  await expect(privateDocument(page)).toHaveCount(0);
  expectReadOnly(state);
});

test('real organization chooser interrupts a pending print and never reads the old RFQ as the next tenant', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page);
  await openPrint(page);
  const held = state.holdNext(detailPath);
  await printButton(page).click();
  await held.started;
  await page.getByTestId('organization-switch-trigger').click();
  await page.getByTestId(`organization-option-${otherOrgId}`).check();
  await page.getByRole('button', { name: 'Переключить организацию', exact: true }).click();
  await expect(page.getByTestId('active-organization')).toContainText(otherOrgId);
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await held.release();
  await settle(page);
  expect(printing.captures).toHaveLength(0);
  await expect(privateDocument(page)).toHaveCount(0);
  expect(state.requests.filter(request => request.path === detailPath && request.organization === otherOrgId)).toEqual([]);
  expectReadOnly(state);
});

test('an active one-use paper grant is removed synchronously on session change', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page, { hold: true });
  await openPrint(page);
  await printButton(page).click();
  await printing.entered;
  expect(printing.captures[0].documentVisible).toBe(true);
  expect(await changeSession(page, null)).toBe(false);
  expect((await printMediaState(page)).documentVisible).toBe(false);
  printing.release();
  await expect(privateDocument(page)).toHaveCount(0);
  expectReadOnly(state);
});

test('a second native beforeprint cannot reuse an already-consumed explicit grant', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page, { hold: true });
  await openPrint(page);
  await printButton(page).click();
  await printing.entered;
  expect(printing.captures[0].documentVisible).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const blocked = await printMediaState(page);
  expect(blocked.documentVisible).toBe(false);
  expect(blocked.fallbackVisible).toBe(true);
  printing.release();
  await expect(privateDocument(page)).toHaveCount(0);
  expect(printing.captures).toHaveLength(1);
  expectReadOnly(state);
});

test('print failure, close/back, pagehide and bfcache restore leave no reusable private paper', async ({ page }) => {
  const state = await fixture(page);
  const printing = await mockPrint(page, { fail: true });
  await openPrint(page);
  await printButton(page).click();
  await expect.poll(() => printing.captures.length).toBe(1);
  await expect(privateDocument(page)).toHaveCount(0);
  await page.getByRole('link', { name: /Закрыть просмотр/ }).click();
  await expect(page).toHaveURL(new RegExp(`/b2b${detailPath}$`));
  await expect(paper(page)).toHaveCount(0);
  await page.goBack();
  await expect(screen(page)).toContainText(savedName);
  const held = state.holdNext(detailPath);
  await printButton(page).click();
  await held.started;
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await held.release();
  await settle(page);
  expect(printing.captures).toHaveLength(1);
  await expect(privateDocument(page)).toHaveCount(0);
  expect((await printMediaState(page)).documentVisible).toBe(false);
  const readsBeforeRestore = state.requests.length;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(screen(page)).toContainText(savedName);
  expect(state.requests.slice(readsBeforeRestore).map(request => request.path)).toEqual(['/auth/me', detailPath]);
  expect((await printMediaState(page)).documentVisible).toBe(false);
  expectReadOnly(state);
});

test('@pdf genuine multipage browser PDF uses the one-use grant and native printing fails closed afterward', async ({ page }, testInfo) => {
  const quote = fixtureQuote(48);
  const commentTail = 'COMMENT-END-FICTITIOUS-4821';
  const nameTail = 'NAME-END-FICTITIOUS-7315';
  quote.comment = `${Array.from({ length: 60 }, (_, index) => `Строка ${index + 1}: учебный длинный комментарий покупателя.`).join('\n')}\n${commentTail}`;
  // Synthetic saved-snapshot stress data deliberately exceeds today's catalog
  // name limit: printing historical JSON must not clip an oversized old field.
  quote.items[0].product_snapshot.translations.ru.name = `${savedName}\n${Array.from({ length: 85 }, (_, index) => `Строка ${index + 1} сохранённого имени оборудования`).join('\n')}\n${nameTail}`;
  const state = await fixture(page, { quote });
  let explicitPdf;
  const explicitPath = testInfo.outputPath('fictitious-rfq-multipage.pdf');
  await page.exposeBinding('captureFictitiousPdf', async () => {
    await page.emulateMedia({ media: 'print' });
    try { explicitPdf = await page.pdf({ path: explicitPath, format: 'A4', printBackground: true, preferCSSPageSize: true }); }
    finally { await page.emulateMedia({ media: 'screen' }); }
  });
  await page.addInitScript(() => { window.print = () => window.captureFictitiousPdf(); });
  await openPrint(page);
  // Registered after the application's listener: inspect the actual print gate
  // synchronously. An async binding observer could race the real afterprint.
  await page.evaluate(() => {
    window.fictitiousPdfEvents = [];
    window.addEventListener('beforeprint', () => {
      const visible = element => Boolean(element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && element.getClientRects().length);
      const root = document.querySelector('[data-quote-print-paper]');
      const doc = root?.querySelector('[data-quote-print-document]');
      window.fictitiousPdfEvents.push({
        directBody: root?.parentElement === document.body,
        documentVisible: visible(doc),
        documentText: visible(doc) ? doc.innerText : '',
        fallbackVisible: visible(document.querySelector('[data-quote-print-fallback]')),
        headerVisible: visible(document.querySelector('header.site-header')),
        navigationVisible: visible(document.querySelector('.sidebar')),
        itemCount: doc?.querySelectorAll('.quote-print-item').length || 0,
        fits: !doc || doc.scrollWidth <= doc.clientWidth + 1,
      });
    });
  });
  await printButton(page).click();
  await expect.poll(() => Boolean(explicitPdf)).toBe(true);
  const captures = await page.evaluate(() => window.fictitiousPdfEvents);
  expect(captures).toHaveLength(1);
  expect(explicitPdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect((explicitPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThan(1);
  expect(captures[0].directBody).toBe(true);
  expect(captures[0].documentVisible).toBe(true);
  expect(captures[0].documentText).toContain(savedName);
  expect(captures[0].documentText).toContain('SAVED-048');
  expect(captures[0].itemCount).toBe(48);
  expect(captures[0].headerVisible).toBe(false);
  expect(captures[0].navigationVisible).toBe(false);
  expect(captures[0].fits).toBe(true);
  const text = execFileSync('pdftotext', ['-layout', explicitPath, '-'], { encoding: 'utf8' });
  for (const expected of [commentTail, nameTail, 'SAVED-048', '999999999999999.999', '9999999999999999.99']) expect(text).toContain(expected);
  expect(text).not.toContain(currentCompany);
  expect(text).not.toContain('Подборка');
  await testInfo.attach('fictitious-rfq-multipage', { path: explicitPath, contentType: 'application/pdf' });
  await expect(privateDocument(page)).toHaveCount(0);
  const blockedPath = testInfo.outputPath('fictitious-native-print-blocked.pdf');
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: blockedPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  const blocked = (await page.evaluate(() => window.fictitiousPdfEvents)).at(-1);
  expect(blocked.documentVisible).toBe(false);
  expect(blocked.fallbackVisible).toBe(true);
  expect(blocked.documentText).toBe('');
  const blockedText = execFileSync('pdftotext', ['-layout', blockedPath, '-'], { encoding: 'utf8' });
  expect(blockedText).toContain('Печать');
  for (const privateText of [quoteId, savedName, commentTail, nameTail, '999999999999999.999']) expect(blockedText).not.toContain(privateText);
  await testInfo.attach('fictitious-native-print-blocked', { path: blockedPath, contentType: 'application/pdf' });
  expectReadOnly(state);
});

test('@pdf native PDF from ordinary saved detail contains only the safe print instruction', async ({ page }, testInfo) => {
  const state = await fixture(page);
  await page.goto(`/b2b${detailPath}`);
  await expect(page.getByRole('heading', { name: savedName, exact: true })).toBeVisible();
  const path = testInfo.outputPath('fictitious-detail-native-print-blocked.pdf');
  await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
  expect(text).toContain('Печать');
  expect(text).not.toContain(quoteId);
  expect(text).not.toContain(savedName);
  expect(text).not.toContain('999999999999999.999');
  expect(text).not.toContain(currentCompany);
  await testInfo.attach('fictitious-detail-native-print-blocked', { path, contentType: 'application/pdf' });
  expectReadOnly(state);
});
