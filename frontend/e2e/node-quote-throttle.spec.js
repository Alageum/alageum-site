import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { prepareTopCapture } from './helpers/prepare-top-capture';

// Real Node/Strapi, seeded disposable PostgreSQL, and the production frontend.
// No routes are intercepted, storage is never seeded, and no clock is mocked.
const api = process.env.E2E_API_URL || 'http://127.0.0.1:8016/api/v1';
const createUrl = `${api}/quotes/catalog`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const windowMs = 60_000;

async function expectThrottle(response) {
  expect(response.status()).toBe(429);
  const headers = await response.headers();
  expect(headers['cache-control']).toMatch(/(?:^|,)\s*no-store(?:,|$)/);
  expect(headers['x-request-id']).toMatch(uuid);
  expect(headers['retry-after']).toBeUndefined();
  expect(await response.json()).toEqual({ error: {
    code: 'rate_limit_exceeded', message: 'Too many requests', details: null,
    request_id: headers['x-request-id'],
  } });
  return headers['x-request-id'];
}

async function inquiryStorage(page) {
  return page.evaluate(() => ({
    selection: localStorage.getItem('alageum.catalog.api-selection.v1'),
    drafts: Object.keys(sessionStorage).filter(key => key.startsWith('alageum.quote.draft.v1:'))
      .map(key => ({ key, value: JSON.parse(sessionStorage.getItem(key)) })),
  }));
}

async function capture(page, testInfo, name) {
  await prepareTopCapture(page);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('real quote throttle preserves inquiry and login, then explicitly retries once after expiry', async ({ page, request }, testInfo) => {
  const startedAt = performance.now();
  const comment = `Fictitious quote throttle ${randomUUID()}`;
  const published = await request.get(`${api}/catalog/products/tmg-400`, { timeout: 5_000 });
  expect(published.status()).toBe(200);
  const product = await published.json();
  const browserPosts = [];
  page.on('request', outbound => {
    if (outbound.url() === createUrl && outbound.method() === 'POST') browserPosts.push(outbound);
  });

  await page.goto('/catalog/tmg-400?source=api');
  await page.getByRole('button', { name: 'В подборку +', exact: true }).click();
  await page.goto('/selection?source=api');
  await page.getByLabel(`Количество ${product.sku}`, { exact: true }).fill('3');
  await page.getByRole('link', { name: 'Запросить КП →', exact: true }).click();
  const selectionBeforeLogin = (await inquiryStorage(page)).selection;
  await page.getByRole('link', { name: 'Войти и продолжить', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('buyer@demo.example');
  await page.getByLabel('Пароль', { exact: true }).fill('ChangeMe123!');

  // Earlier real RFQ cases share this peer IP. Discover the remaining quota
  // without assuming how many of their accepted attempts are still in-window.
  // Decoded anonymous JSON cannot create a quote; each allowed attempt is 401.
  let acceptedAt = null, rejectedAt = null, drained = 0, drainRequests = 0, drainRequestId;
  for (let index = 0; index < 11; index += 1) {
    const response = await request.post(createUrl, { data: {}, timeout: 5_000 });
    drainRequests += 1;
    if (response.status() === 429) {
      rejectedAt = performance.now();
      drainRequestId = await expectThrottle(response);
      break;
    }
    expect(response.status(), 'Each allowed anonymous attempt must stop at authentication').toBe(401);
    acceptedAt = performance.now();
    drained += 1;
  }
  expect(rejectedAt, 'At most ten accepted requests must exhaust this real peer-IP bucket').not.toBeNull();
  const recoveryAnchor = acceptedAt ?? rejectedAt;

  const loginResponse = page.waitForResponse(response => response.url() === `${api}/auth/login` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  expect((await loginResponse).status(), 'Quote exhaustion must not consume the independent login bucket').toBe(200);
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  const quantity = page.getByLabel(`Количество ${product.sku}`, { exact: true });
  // The wrapping label's raw text includes controlled textarea content after editing.
  const message = page.getByRole('main').getByRole('textbox', { name: 'Сообщение (необязательно)', exact: true });
  await expect(message).toHaveCount(1);
  await expect(quantity).toHaveValue('3');
  expect((await inquiryStorage(page)).selection).toBe(selectionBeforeLogin);
  await message.fill(comment);
  const beforeSubmit = await inquiryStorage(page);
  expect(beforeSubmit.drafts).toHaveLength(1);
  expect(beforeSubmit.drafts[0].value.comment).toBe(comment);

  const unsolicitedNavigations = [];
  const observeNavigation = frame => { if (frame === page.mainFrame()) unsolicitedNavigations.push(frame.url()); };
  page.on('framenavigated', observeNavigation);
  const rejectedResponse = page.waitForResponse(response => response.url() === createUrl && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  const blocked = await rejectedResponse;
  const blockedRequestId = await expectThrottle(blocked);
  expect(blockedRequestId).not.toBe(drainRequestId);
  const error = page.getByRole('alert', { name: 'Ошибка запроса КП', exact: true });
  await expect(error).toHaveText('Слишком много попыток. Подождите немного и повторите с теми же данными.');
  await expect(error).toBeFocused();
  const retry = page.getByRole('button', { name: 'Повторить сохранение', exact: true });
  await expect(retry).toBeEnabled();
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  await expect(quantity).toHaveValue('3');
  await expect(message).toHaveValue(comment);
  expect(browserPosts).toHaveLength(1);

  const originalHeaders = await blocked.request().allHeaders();
  const originalBody = blocked.request().postDataJSON();
  const originalKey = originalHeaders['idempotency-key'];
  expect(originalKey).toMatch(uuid);
  expect(originalBody).toEqual({ comment, items: [{ product_id: product.id, quantity: 3 }] });
  const blockedStorage = await inquiryStorage(page);
  expect(blockedStorage.selection).toBe(beforeSubmit.selection);
  expect(blockedStorage.drafts).toHaveLength(1);
  expect(blockedStorage.drafts[0].key).toBe(beforeSubmit.drafts[0].key);
  expect(blockedStorage.drafts[0].value).toMatchObject({ comment, attempt: { key: originalKey, payload: originalBody, quoteId: null } });
  const authHeaders = { Authorization: originalHeaders.authorization };
  if (originalHeaders['x-organization-id']) authHeaders['X-Organization-ID'] = originalHeaders['x-organization-id'];
  async function ownList() {
    const response = await request.get(`${api}/quotes?mine=true&page=1&page_size=20`, { headers: authHeaders, timeout: 5_000 });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toMatch(/no-store/);
    return response.json();
  }
  const beforeSave = await ownList();
  expect(beforeSave.items.filter(quote => quote.comment === comment)).toHaveLength(0);
  await capture(page, testInfo, 'node-quote-throttle-safe-error');

  // The same preserved attempt is also usable at mobile width. This creates no
  // second test/project, login, submission, or competing quota consumer.
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({ width: 393, height: 851 });
  await expect(error).toBeVisible();
  await expect(message).toHaveValue(comment);
  await expect(quantity).toHaveValue('3');
  await expect(retry).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await capture(page, testInfo, 'node-quote-throttle-mobile-error');
  await page.setViewportSize(desktopViewport);

  // Actual elapsed time, not a fake clock, reset endpoint, bypass, or raised
  // limit. A receipt timestamp is conservative; if already full, the first
  // rejection is later than every previously accepted attempt. Rejections must
  // not move this deadline or a retry at this point will still return 429.
  const remainingMs = Math.max(0, recoveryAnchor + windowMs + 250 - performance.now());
  if (remainingMs) await new Promise(resolve => setTimeout(resolve, remainingMs));
  expect(performance.now() - recoveryAnchor).toBeGreaterThanOrEqual(windowMs);
  expect(browserPosts, 'No mutation may replay automatically while the real throttle expires').toHaveLength(1);
  expect(unsolicitedNavigations, 'A rejected save must not navigate the inquiry').toEqual([]);
  page.off('framenavigated', observeNavigation);
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  await expect(error).toBeVisible();
  await expect(quantity).toHaveValue('3');
  await expect(message).toHaveValue(comment);
  expect(await inquiryStorage(page)).toEqual(blockedStorage);

  const savedResponse = page.waitForResponse(response => response.url() === createUrl && response.request().method() === 'POST');
  await retry.click();
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  expect(browserPosts).toHaveLength(2);
  expect((await saved.request().allHeaders())['idempotency-key']).toBe(originalKey);
  expect(saved.request().postDataJSON()).toEqual(originalBody);
  const quote = await saved.json();
  expect(quote.comment).toBe(comment);
  expect(quote.item_count).toBe(1);
  expect(quote.items[0].product_id).toBe(product.id);
  expect(Number(quote.items[0].quantity)).toBe(3);
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quote.id}$`));
  await expect(page.getByText(comment, { exact: true })).toBeVisible();

  const replay = await request.post(createUrl, {
    headers: { ...authHeaders, 'Idempotency-Key': originalKey }, data: originalBody, timeout: 5_000,
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).id).toBe(quote.id);
  const afterSave = await ownList();
  expect(afterSave.total).toBe(beforeSave.total + 1);
  expect(afterSave.items.filter(item => item.id === quote.id)).toHaveLength(1);
  expect(afterSave.items.filter(item => item.comment === comment)).toHaveLength(1);
  await page.getByRole('link', { name: '← Мои запросы КП', exact: true }).click();
  const ownLink = page.getByRole('link', { name: `Запрос ${quote.id.slice(0, 8)} →`, exact: true });
  await expect(ownLink).toHaveCount(1);
  await expect(ownLink).toHaveAttribute('href', `/b2b/quotes/${quote.id}`);
  await expect(page.getByText(comment, { exact: true })).toHaveCount(1);
  await ownLink.click();
  await expect(page).toHaveURL(new URL(`/b2b/quotes/${quote.id}`, page.url()).href);
  await expect(page.getByRole('heading', { name: product.translations.ru.name, exact: true })).toBeVisible();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: product.translations.ru.name, exact: true })).toBeVisible();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await capture(page, testInfo, 'node-quote-throttle-saved');

  const evidencePath = testInfo.outputPath('node-quote-throttle-evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    status: 'passed', drainRequests, acceptedDrainRequests: drained,
    recoveryAnchor: acceptedAt === null ? 'first-rejection' : 'last-accepted-drain',
    realWindowMs: windowMs, errorRequestIds: [drainRequestId, blockedRequestId],
    loginStatus: 200, rejectedStatus: 429, explicitRetryStatus: 201, replayStatus: 200,
    browserQuotePosts: browserPosts.length, newOwnQuotes: afterSave.total - beforeSave.total,
    mobileViewport: { width: 393, height: 851 }, elapsedMs: Math.round(performance.now() - startedAt),
  }, null, 2));
  await testInfo.attach('node-quote-throttle-evidence', { path: evidencePath, contentType: 'application/json' });
});
