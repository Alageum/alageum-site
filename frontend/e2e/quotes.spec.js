import { expect, test } from '@playwright/test';
const productId = '11111111-1111-4111-8111-111111111111', quoteId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333', orgId = '44444444-4444-4444-8444-444444444444';
const product = { id: productId, public_key: 'rfq-test', slug: 'rfq-test', sku: 'RFQ-1', translations: { ru: { name: 'Тестовое оборудование' } }, price_mode: 'fixed', price: '1200.00', currency: 'KZT', version: 1, specs: {}, category_public_key: 'transformers' };
const quote = { id: quoteId, status: 'submitted', comment: 'Проект школы', item_count: 1, created_at: '2026-10-01T15:00:00Z', items: [{ id: productId, product_id: productId, quantity: '3', product_snapshot: product }] };
const session = { access_token: 'test-access', refresh_token: 'test-refresh', organization_id: orgId };
async function api(page, options = {}) {
  let requests = [], saved = false, failures = options.failures || 0, currentUser = userId, expired = false, expiryUsed = false, listExpiryUsed = false, savedUser = null;
  const products = options.products || [product];
  await page.route('**/api/v1/**', async route => {
    const fulfill = options => route.fulfill({ headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, x-organization-id, idempotency-key' }, ...options });
    if (route.request().method() === 'OPTIONS') return fulfill({ status: 204, body: '' });
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', '');
    if (path === '/catalog/products') return fulfill({ json: { items: options.hidden ? [] : products, total: options.hidden ? 0 : products.length } });
    if (path === '/auth/login') { currentUser = route.request().postDataJSON().email === 'second@demo.example' ? '55555555-5555-4555-8555-555555555555' : userId; expired = false; return fulfill({ json: { ...session, access_token: `test-access-${currentUser}`, refresh_token: `test-refresh-${currentUser}` } }); }
    if (path === '/auth/refresh') return fulfill({ status: 401, json: { error: { code: 'session_expired' } } });
    if (path === '/auth/me') return fulfill({ json: { user: { id: currentUser, email: currentUser === userId ? 'buyer@demo.example' : 'second@demo.example' }, organization: { id: orgId, name: 'Тестовая организация' }, permissions: ['quote.read', 'quote.create'] } });
    if (path === '/quotes/catalog' && route.request().method() === 'POST') {
      requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      if ((options.expireOnce && !expiryUsed) || expired) { expiryUsed = true; expired = true; return fulfill({ status: 401, json: { error: { code: 'session_expired' } } }); }
      saved = true; savedUser = currentUser;
      if (failures-- > 0) return route.abort('failed');
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (options.waitForSubmission) await options.waitForSubmission;
      if (options.delayedUnauthorized) return fulfill({ status: 401, json: { error: { code: 'session_expired' } } });
      return fulfill({ status: requests.length > 1 ? 200 : 201, json: quote });
    }
    if (path === '/quotes') {
      if (options.expireListOnce && !listExpiryUsed) { listExpiryUsed = true; return fulfill({ status: 401, json: { error: { code: 'session_expired' } } }); }
      expect(url.searchParams.get('mine')).toBe('true');
      return fulfill({ json: { items: (saved && savedUser === currentUser) || options.saved ? [quote] : [], total: (saved && savedUser === currentUser) || options.saved ? 1 : 0, page: 1, page_size: 20 } });
    }
    if (path === `/quotes/${quoteId}`) return fulfill(options.notFound ? { status: 404, json: { error: { code: 'quote_not_found' } } } : { json: quote });
    return fulfill({ status: 404, json: {} });
  });
  return requests;
}
async function seed(page, { authenticated = true, old = false } = {}) {
  await page.addInitScript(({ session, productId, authenticated, old }) => {
    if (authenticated && !sessionStorage.getItem('alageum_session')) sessionStorage.setItem('alageum_session', JSON.stringify(session));
    if (!localStorage.getItem('alageum.catalog.api-selection.v1')) localStorage.setItem('alageum.catalog.api-selection.v1', JSON.stringify([{ id: 'rfq-test', ...(old ? {} : { databaseId: productId }), quantity: 3 }]));
  }, { session, productId, authenticated, old });
}
test('login stays disabled before hydration and preserves the inquiry return URL', async ({ page }) => {
  await api(page);
  await seed(page, { authenticated: false });
  let releaseScripts;
  const scriptsReady = new Promise(resolve => { releaseScripts = resolve; });
  const heldScriptRequests = [];
  const holdScripts = async route => {
    if (route.request().resourceType() === 'script') {
      heldScriptRequests.push(route.request().url());
      await scriptsReady;
    }
    await route.continue();
  };
  const loginRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/auth/login')) loginRequests.push(request); });
  await page.route('**/_next/static/**', holdScripts);
  const destination = '/login?next=%2Finquiry%3Fsource%3Dapi';
  try {
    await page.goto(destination, { waitUntil: 'commit' });
    const submit = page.getByRole('button', { name: 'Войти', exact: true });
    await expect(submit).toBeDisabled();
    await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Пароль', { exact: true })).toBeDisabled();
    await expect.poll(() => heldScriptRequests.length).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(destination);
    expect(loginRequests).toHaveLength(0);
    releaseScripts();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page).toHaveURL(/\/inquiry\?source=api$/);
    await expect(page.getByLabel('Количество RFQ-1')).toHaveValue('3');
    expect(loginRequests).toHaveLength(1);
  } finally {
    releaseScripts();
    await page.unroute('**/_next/static/**', holdScripts);
  }
});
test('anonymous catalogue selection resumes through login, submits once and reloads durable detail/list', async ({ page }, testInfo) => {
  const requests = await api(page, { delay: 300 });
  await page.goto('/catalog?source=api');
  await page.getByRole('button', { name: 'В подборку +' }).click();
  await page.goto('/selection?source=api');
  await page.getByLabel('Количество RFQ-1').fill('3');
  await page.getByRole('link', { name: 'Запросить КП →' }).click();
  await page.getByRole('link', { name: 'Войти и продолжить' }).click();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  await expect(page.getByLabel('Количество RFQ-1')).toHaveValue('3');
  await page.getByLabel('Сообщение (необязательно)').fill('Проект школы');
  await testInfo.attach('rfq-review', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const submit = page.getByRole('button', { name: 'Сохранить запрос КП', exact: true });
  await submit.dblclick();
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quoteId}$`));
  expect(requests).toHaveLength(1);
  expect(requests[0].body).toEqual({ comment: 'Проект школы', items: [{ product_id: productId, quantity: 3 }] });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Тестовое оборудование' })).toBeVisible();
  await expect(page.getByText('1200.00 KZT', { exact: true })).toBeVisible();
  await testInfo.attach('rfq-saved-detail', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('link', { name: '← Мои запросы КП' }).click();
  await expect(page.getByRole('link', { name: `Запрос ${quoteId.slice(0, 8)} →` })).toBeVisible();
  await page.goto('/inquiry?source=api');
  await expect(page.getByRole('heading', { name: 'Запрос сохранён', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить запрос КП', exact: true })).toHaveCount(0);
});
test('uncertain save and reload retain the same key and body; the duplicate is not sent as a new request', async ({ page }) => {
  const requests = await api(page, { failures: 1 }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Проект школы');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Ошибка запроса КП' })).toContainText('Запрос мог сохраниться');
  await page.reload();
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('Проект школы');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quoteId}$`));
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
});
test('editing after an uncertain attempt uses a new key', async ({ page }) => {
  const requests = await api(page, { failures: 1 }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Первая версия');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Ошибка запроса КП' })).toBeVisible();
  await page.getByLabel('Сообщение (необязательно)').fill('Вторая версия');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quoteId}$`));
  expect(requests[1].key).not.toBe(requests[0].key);
  expect(requests[1].body.comment).toBe('Вторая версия');
});
test('unavailable and legacy selection entries block submission without silently dropping items', async ({ page }) => {
  const requests = await api(page, { hidden: true }); await seed(page, { old: true });
  await page.goto('/inquiry?source=api');
  await expect(page.getByText('Старая подборка:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить запрос КП', exact: true })).toBeDisabled();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Удалить rfq-test' }).click();
  await expect(page.getByText('В подборке пока нет оборудования.')).toBeVisible();
});
test('own list is guarded, direct unavailable detail has no request data', async ({ page }) => {
  await api(page, { notFound: true });
  await page.goto('/b2b/quotes');
  await expect(page.getByRole('heading', { name: 'Войдите в B2B кабинет' })).toBeVisible();
  await page.getByRole('link', { name: 'Войти', exact: true }).click();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await expect(page.getByText('У вас пока нет сохранённых запросов.')).toBeVisible();
  await page.goto(`/b2b/quotes/${quoteId}`);
  await expect(page.getByRole('heading', { name: 'Запрос недоступен' })).toBeVisible();
  await expect(page.getByText('Тестовое оборудование')).toHaveCount(0);
});
test('static inquiry remains the local demo and keyboard/mobile review fits viewport', async ({ page }) => {
  await api(page); await seed(page);
  await page.goto('/inquiry?source=static');
  await expect(page.getByRole('button', { name: 'Сохранить запрос КП', exact: true })).toHaveCount(0);
  await page.goto('/inquiry?source=api');
  const comment = page.getByLabel('Сообщение (необязательно)');
  await comment.focus(); await page.keyboard.type('Клавиатура');
  await expect(comment).toHaveValue('Клавиатура');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test('expired session interrupts submission, login restores scoped message and same retry key', async ({ page }) => {
  const requests = await api(page, { expireOnce: true }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Сохранить при истечении сессии');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Войти и продолжить' })).toBeVisible();
  await page.getByRole('link', { name: 'Войти и продолжить' }).click();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('Сохранить при истечении сессии');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quoteId}$`));
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
});
test('multiple selected original IDs and quantities survive Back and Forward exactly', async ({ page }) => {
  const secondId = '66666666-6666-4666-8666-666666666666';
  const requests = await api(page, { products: [product, { ...product, id: secondId, public_key: 'rfq-second', slug: 'rfq-second', sku: 'RFQ-2', translations: { ru: { name: 'Вторая позиция' } } }] });
  await seed(page);
  await page.goto('/catalog?source=api');
  await page.getByRole('row').filter({ hasText: 'Вторая позиция' }).getByRole('button', { name: 'В подборку +' }).click();
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Количество RFQ-2').fill('7');
  await page.getByLabel('Сообщение (необязательно)').fill('Две позиции');
  await page.getByRole('link', { name: 'Изменить подборку →', exact: true }).click();
  await expect(page).toHaveURL(/\/selection\?source=api$/);
  await page.goBack();
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('Две позиции');
  await page.goForward();
  await expect(page).toHaveURL(/\/selection\?source=api$/);
  await page.goBack();
  await expect(page.getByLabel('Количество RFQ-1')).toHaveValue('3');
  await expect(page.getByLabel('Количество RFQ-2')).toHaveValue('7');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quoteId}$`));
  expect(requests[0].body.items).toEqual([{ product_id: productId, quantity: 3 }, { product_id: secondId, quantity: 7 }]);
});
test('switching accounts hides private draft and preserves original account uncertain attempt', async ({ page }) => {
  const requests = await api(page, { failures: 1 }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Личный проект первого пользователя');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Ошибка запроса КП' })).toBeVisible();
  await page.goto('/login?next=%2Finquiry%3Fsource%3Dapi');
  await page.getByLabel('Email').fill('second@demo.example');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Повторить сохранение', exact: true })).toHaveCount(0);
  await page.getByLabel('Сообщение (необязательно)').fill('Другой проект');
  await page.getByLabel('Количество RFQ-1').fill('4');
  await page.getByLabel('Количество RFQ-1').fill('3');
  await page.goto('/login?next=%2Finquiry%3Fsource%3Dapi');
  await page.getByLabel('Email').fill('buyer@demo.example');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('Личный проект первого пользователя');
  await page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quoteId}$`));
  expect(requests[1]).toEqual(requests[0]);
});
test('blocked draft persistence stops POST before network submission', async ({ page }) => {
  const requests = await api(page); await seed(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('alageum.quote.draft.v1:')) throw new Error('quota'); return original.call(this, key, value); };
  });
  await page.goto('/inquiry?source=api');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect(page.getByRole('alert', { name: 'Ошибка запроса КП' })).toContainText('Отправка не начата');
  expect(requests).toHaveLength(0);
});


test('delayed success after leaving the form preserves newer navigation and recoverable completion', async ({ page }) => {
  let release;
  const waitForSubmission = new Promise(resolve => { release = resolve; });
  const requests = await api(page, { waitForSubmission }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Отложенный запрос');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole('link', { name: 'Мои запросы →', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  release();
  await expect.poll(() => page.evaluate(({ orgId, userId }) => JSON.parse(sessionStorage.getItem(`alageum.quote.draft.v1:${orgId}:${userId}`)).attempt.quoteId, { orgId, userId })).toBe(quoteId);
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await page.getByRole('link', { name: 'Новый запрос', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Запрос сохранён', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть сохранённый запрос' })).toHaveAttribute('href', `/b2b/quotes/${quoteId}`);
  expect(requests).toHaveLength(1);
});

test('pending response cannot navigate a different account or overwrite its private draft', async ({ page }) => {
  let release;
  const waitForSubmission = new Promise(resolve => { release = resolve; });
  const requests = await api(page, { waitForSubmission, expireListOnce: true }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Проект первого пользователя');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  // Keep the document and in-flight fetch alive while using the application's
  // normal client navigation and login flow to switch the active account.
  await page.getByRole('link', { name: 'Мои запросы →', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await page.getByRole('link', { name: 'Войти', exact: true }).click();
  await page.getByLabel('Email').fill('second@demo.example');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await page.getByRole('link', { name: 'Новый запрос', exact: true }).click();
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('');
  await page.getByLabel('Сообщение (необязательно)').fill('Черновик второго пользователя');
  release();
  await expect.poll(() => page.evaluate(({ orgId, userId }) => JSON.parse(sessionStorage.getItem(`alageum.quote.draft.v1:${orgId}:${userId}`)).attempt.quoteId, { orgId, userId })).toBe(quoteId);
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('Черновик второго пользователя');
  await expect(page.getByRole('heading', { name: 'Запрос сохранён', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});


test('late unauthorized POST neither retries as the new account nor expires its session', async ({ page }) => {
  let release;
  const waitForSubmission = new Promise(resolve => { release = resolve; });
  const requests = await api(page, { waitForSubmission, expireListOnce: true, delayedUnauthorized: true }); await seed(page);
  await page.goto('/inquiry?source=api');
  await page.getByLabel('Сообщение (необязательно)').fill('Приватные данные первого пользователя');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole('link', { name: 'Мои запросы →', exact: true }).click();
  // The list's expired session response prompts a normal login without unloading
  // the document, so the original POST remains genuinely in flight.
  await page.getByRole('link', { name: 'Войти', exact: true }).click();
  await page.getByLabel('Email').fill('second@demo.example');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await page.getByRole('link', { name: 'Новый запрос', exact: true }).click();
  await page.getByLabel('Сообщение (необязательно)').fill('Новый приватный черновик');
  const response = page.waitForResponse(value => value.url().endsWith('/quotes/catalog') && value.status() === 401);
  release(); await response;
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  await expect(page.getByLabel('Сообщение (необязательно)')).toHaveValue('Новый приватный черновик');
  await expect(page.getByText('second@demo.example', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Войти и продолжить' })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  const original = await page.evaluate(({ orgId, userId }) => JSON.parse(sessionStorage.getItem(`alageum.quote.draft.v1:${orgId}:${userId}`)).attempt, { orgId, userId });
  expect(original.key).toBe(requests[0].key); expect(original.quoteId).toBeNull();
});
