import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prepareTopCapture } from './helpers/prepare-top-capture';

// No route interception: this test requires the running Node/Strapi backend and
// its isolated seeded PostgreSQL database. Mocked interruption cases remain in
// quotes.spec.js; this suite proves the same UI contract against real storage.
const api = process.env.E2E_API_URL || 'http://127.0.0.1:8016/api/v1';

test('real Node RFQ survives anonymous handoff, save, retry, reload and own list', async ({ page, request }, testInfo) => {
  const published = await request.get(`${api}/catalog/products/tmg-400`);
  expect(published.ok()).toBeTruthy();
  const product = await published.json();
  const comment = `Node RFQ ${testInfo.project.name} ${Date.now()}`;

  await page.goto('/catalog/tmg-400?source=api');
  await page.getByRole('button', { name: 'В подборку +', exact: true }).click();
  await page.goto('/selection?source=api');
  await page.getByLabel(`Количество ${product.sku}`, { exact: true }).fill('3');
  await page.getByRole('link', { name: 'Запросить КП →', exact: true }).click();
  await page.getByRole('link', { name: 'Войти и продолжить', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('buyer@demo.example');
  await page.getByLabel('Пароль', { exact: true }).fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/inquiry\?source=api$/);
  await expect(page.getByLabel(`Количество ${product.sku}`, { exact: true })).toHaveValue('3');
  await page.getByLabel('Сообщение (необязательно)', { exact: true }).fill(comment);

  const savedResponse = page.waitForResponse(response => response.url() === `${api}/quotes/catalog` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Сохранить запрос КП', exact: true }).click();
  const response = await savedResponse;
  expect(response.status()).toBe(201);
  const quote = await response.json();
  expect(quote.comment).toBe(comment);
  expect(quote.item_count).toBe(1);
  expect(quote.items[0].product_id).toBe(product.id);
  expect(Number(quote.items[0].quantity)).toBe(3);
  expect(quote.items[0].product_snapshot.public_key).toBe(product.public_key);
  expect(quote.items[0].product_snapshot.version).toBe(product.version);
  await expect(page).toHaveURL(new RegExp(`/b2b/quotes/${quote.id}$`));
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: product.translations.ru.name, exact: true })).toBeVisible();

  // Repeat the browser's exact request and prove the DB idempotency contract.
  const original = response.request();
  const headers = await original.allHeaders();
  const replay = await request.post(`${api}/quotes/catalog`, {
    headers: {
      Authorization: headers.authorization,
      'X-Organization-Id': headers['x-organization-id'],
      'Idempotency-Key': headers['idempotency-key'],
    },
    data: original.postDataJSON(),
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).id).toBe(quote.id);

  await page.getByRole('link', { name: '← Мои запросы КП', exact: true }).click();
  const ownLink = page.getByRole('link', { name: `Запрос ${quote.id.slice(0, 8)} →`, exact: true });
  await expect(ownLink).toHaveCount(1);
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await ownLink.click();
  await expect(page).toHaveURL(new URL(`/b2b/quotes/${quote.id}`, page.url()).href);
  const detailHeading = page.getByRole('heading', { level: 1, name: `Запрос ${quote.id.slice(0, 8)}`, exact: true });
  await expect(detailHeading).toHaveCount(1);
  await expect(detailHeading).toBeVisible();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  // Capture the completed flow from a deterministic viewport and focus state.
  await prepareTopCapture(page);
  const screenshotPath = testInfo.outputPath('node-rfq-saved.png');
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach('node-rfq-saved', { path: screenshotPath, contentType: 'image/png' });
});

test('organization summary compatibility keeps customer history and printable detail owner-only', async ({ page, request }, testInfo) => {
  async function login(email) {
    const response = await request.post(`${api}/auth/login`, { data: { email, password: 'ChangeMe123!' } });
    expect(response.status()).toBe(200);
    return (await response.json()).access_token;
  }
  const ownerToken = await login('buyer@demo.example');
  const peerToken = await login('admin@demo.example');
  const productResponse = await request.get(`${api}/catalog/products/tmg-400`);
  expect(productResponse.status()).toBe(200);
  const product = await productResponse.json();
  async function save(token, label) {
    const response = await request.post(`${api}/quotes/catalog`, {
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() },
      data: { comment: `Fictitious ${label} ${testInfo.project.name} ${randomUUID()}`, items: [{ product_id: product.id, quantity: '1.000' }] },
    });
    expect(response.status()).toBe(201);
    return response.json();
  }
  const own = await save(ownerToken, 'own request');
  const peer = await save(peerToken, 'peer summary comment');
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
  const summaries = await request.get(`${api}/quotes`, { headers: ownerHeaders });
  expect(summaries.status()).toBe(200);
  const summary = (await summaries.json()).items.find(item => item.id === peer.id);
  expect(summary).toBeTruthy();
  expect(Object.keys(summary).sort()).toEqual(['comment', 'created_at', 'id', 'item_count', 'status']);
  expect(summary.comment).toBe(peer.comment);
  const peerDetail = await request.get(`${api}/quotes/${peer.id}`, { headers: ownerHeaders });
  expect(peerDetail.status()).toBe(404);

  const listRequests = [];
  page.on('request', outbound => {
    const url = new URL(outbound.url());
    if (outbound.method() === 'GET' && url.href.startsWith(api) && url.pathname.endsWith('/quotes')) listRequests.push(url);
  });
  await page.goto('/login?next=%2Fb2b%2Fquotes');
  await page.getByLabel('Email', { exact: true }).fill('buyer@demo.example');
  await page.getByLabel('Пароль', { exact: true }).fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b\/quotes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Мои запросы КП', exact: true })).toBeVisible();
  await expect(page.getByText(own.comment, { exact: true })).toBeVisible();
  await expect(page.getByText(peer.comment, { exact: true })).toHaveCount(0);
  expect(listRequests.length).toBeGreaterThan(0);
  for (const url of listRequests) {
    expect(url.searchParams.get('mine')).toBe('true');
    expect(url.searchParams.get('page_size')).toBe('20');
  }
  await page.screenshot({ path: testInfo.outputPath('node-rfq-own-history.png'), fullPage: true, animations: 'disabled' });

  await page.goto(`/b2b/quotes/${peer.id}`);
  await expect(page.locator('.quotes-page').getByRole('alert')).toContainText('Запрос не найден');
  await expect(page.getByText(peer.comment, { exact: true })).toHaveCount(0);
  await page.goto(`/b2b/quotes/${peer.id}/print`);
  await expect(page.locator('.quotes-page').getByRole('alert')).toContainText('Запрос не найден');
  await expect(page.locator('[data-quote-print-document]')).toHaveCount(0);
  await expect(page.locator('[data-quote-print-paper]')).not.toHaveAttribute('data-authorized', 'true');
  await page.screenshot({ path: testInfo.outputPath('node-rfq-peer-print-denied.png'), fullPage: true, animations: 'disabled' });
  await page.goBack();
  await expect(page.locator('.quotes-page').getByRole('alert')).toContainText('Запрос не найден');
  await page.goBack();
  await expect(page.getByText(own.comment, { exact: true })).toBeVisible();
  await expect(page.getByText(peer.comment, { exact: true })).toHaveCount(0);
  for (const url of listRequests) expect(url.searchParams.get('mine')).toBe('true');
});
