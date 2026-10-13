import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import fixtures from '../../backend-node/scripts/seed-test-quote-print-users.js';

// Every request reaches real Node/Strapi + PostgreSQL. No route interception,
// fabricated HTTP reply, runtime test endpoint, or live catalog enrichment.
const api = process.env.E2E_QUOTE_PRINT_API_URL;
const manifest = JSON.parse(process.env.E2E_QUOTE_PRINT_MANIFEST || '{}');
const printView = page => page.locator('.quote-print-page');
const preview = page => page.locator('[data-quote-print-document="preview"]');
const paper = page => page.locator('[data-quote-print-paper]');
const printButton = page => page.getByRole('button', { name: 'Печать', exact: true });

test.beforeAll(() => {
  // Guarded helper also checks the exact URL, dedicated database and role.
  fixtures.validateFixtureEnvironment();
  expect(manifest.fixture).toBe('disposable-quote-print');
  for (const value of [api, process.env.E2E_QUOTE_PRINT_BASE_URL]) {
    const url = new URL(value);
    expect(url.protocol).toBe('http:');
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
});

async function login(page, kind, target) {
  await page.goto(`/login?next=${encodeURIComponent(target)}`);
  await page.getByLabel('Email', { exact: true }).fill(fixtures.EMAILS[kind]);
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.E2E_QUOTE_PRINT_PASSWORD);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(new URL(target, process.env.E2E_QUOTE_PRINT_BASE_URL).href);
}

function observeApi(page) {
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/')) requests.push({ path: url.pathname.slice('/api/v1'.length), method: request.method() });
  });
  return requests;
}

function expectReadOnly(requests) {
  expect(requests.filter(request => request.path.startsWith('/quotes') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
  expect(requests.filter(request => request.path.startsWith('/catalog') || request.path === '/organizations/current/profile')).toEqual([]);
}

async function screenshot(page, testInfo, name) {
  await page.evaluate(() => document.fonts.ready);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function installPrintCapture(page, testInfo) {
  const pdf = testInfo.project.name.endsWith('desktop');
  let count = 0;
  const paths = [];
  if (pdf) await page.exposeFunction('captureFixturePrint', async () => {
    const path = testInfo.outputPath(`persisted-request-${++count}.pdf`);
    // This invokes Chromium's real beforeprint/afterprint lifecycle. The feature
    // grants one print only after fresh /auth/me and own-quote reads have passed.
    const bytes = await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await testInfo.attach(`persisted-request-${count}`, { path, contentType: 'application/pdf' });
    paths.push(path);
  });
  await page.evaluate(usePdf => {
    window.fixturePrintRecords = [];
    // Installed after the mounted feature listener, so each capture observes the
    // actual one-use DOM gate after the app handles beforeprint.
    window.addEventListener('beforeprint', () => {
      const element = document.querySelector('[data-quote-print-paper]');
      window.fixturePrintRecords.push({ authorized: element?.getAttribute('data-authorized') === 'true', text: element?.querySelector('[data-quote-print-document="paper"]')?.textContent || '' });
    });
    window.print = usePdf ? () => window.captureFixturePrint() : () => {
      window.dispatchEvent(new Event('beforeprint'));
      window.dispatchEvent(new Event('afterprint'));
    };
  }, pdf);
  return paths;
}

test('responsive own persisted request reloads, prints twice and keeps frozen decimals', async ({ page }, testInfo) => {
  const quote = manifest.quotes.owner, requests = observeApi(page);
  await login(page, 'owner', `/b2b/quotes/${quote.id}`);
  await page.getByRole('link', { name: 'Версия для печати', exact: true }).click();
  await expect(page).toHaveURL(new URL(`/b2b/quotes/${quote.id}/print`, process.env.E2E_QUOTE_PRINT_BASE_URL).href);
  await expect(preview(page)).toContainText(quote.comment);
  await page.reload();
  await expect(preview(page)).toContainText(quote.comment);
  await expect(preview(page)).toContainText('Исторический тестовый трансформатор');
  await expect(preview(page)).toContainText('123456789012345.678 KZT');
  await expect(preview(page)).toContainText('999999999999999.999');
  await expect(preview(page)).toContainText('1.250');
  await expect(preview(page)).toContainText('По запросу');
  await expect(preview(page)).not.toContainText('CURRENT CATALOG MUST NEVER APPEAR');
  await expect(preview(page)).toContainText('Это не коммерческое предложение продавца');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await screenshot(page, testInfo, 'real-persisted-preview');
  expectReadOnly(requests);
  await installPrintCapture(page, testInfo);
  for (let index = 0; index < 2; index += 1) {
    requests.length = 0;
    await printButton(page).click();
    await expect.poll(() => page.evaluate(() => window.fixturePrintRecords.length)).toBe(index + 1);
    await expect(page.getByRole('status')).toContainText('Для повторной печати нажмите «Печать»');
    await expect(preview(page)).toHaveCount(0);
    await expect(paper(page)).not.toHaveAttribute('data-authorized', 'true');
    expect(requests.filter(request => request.method !== 'OPTIONS')).toEqual([{ path: '/auth/me', method: 'GET' }, { path: `/quotes/${quote.id}`, method: 'GET' }]);
    const record = await page.evaluate(i => window.fixturePrintRecords[i], index);
    expect(record.authorized).toBe(true);
    expect(record.text).toContain(quote.comment);
    expect(record.text).toContain('999999999999999.999');
    expect(record.text).toContain('123456789012345.678 KZT');
    expectReadOnly(requests);
  }
  // A second native event cannot reuse the successful print's grant or data.
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect((await page.evaluate(() => window.fixturePrintRecords.at(-1))).authorized).toBe(false);
  await expect(paper(page).locator('[data-quote-print-document]')).toHaveCount(0);
});

test('legacy missing and partial snapshots remain explicit historical gaps', async ({ page }, testInfo) => {
  const quote = manifest.quotes.legacy, requests = observeApi(page);
  await login(page, 'owner', `/b2b/quotes/${quote.id}/print`);
  await expect(preview(page)).toContainText(quote.comment);
  await expect(preview(page)).toContainText('Историческая копия товара не сохранена');
  await expect(preview(page)).toContainText('Историческое название товара не сохранено');
  await expect(preview(page)).toContainText('FIXTURE-LEGACY-PARTIAL');
  await expect(preview(page)).toContainText('123456789012345.678 (валюта не сохранена)');
  await expect(preview(page)).toContainText('999999999999999.999');
  await expect(preview(page)).toContainText('0.001');
  await expect(preview(page)).not.toContainText('CURRENT CATALOG MUST NEVER APPEAR');
  await screenshot(page, testInfo, 'real-legacy-gaps');
  const pdfPaths = await installPrintCapture(page, testInfo);
  await printButton(page).click();
  await expect(page.getByRole('status')).toContainText('Для повторной печати нажмите «Печать»');
  expect((await page.evaluate(() => window.fixturePrintRecords[0])).authorized).toBe(true);
  await expect.poll(() => pdfPaths.length).toBe(1);
  const pages = execFileSync('pdftotext', ['-layout', pdfPaths[0], '-'], { encoding: 'utf8' }).split('\f').filter(text => text.trim());
  for (const [index, item] of quote.items.entries()) {
    const heading = `${index + 1}. ${item.product_snapshot.sku || 'Позиция запроса'}`;
    const itemPages = pages.filter(text => text.replace(/\s+/g, ' ').includes(heading));
    expect(itemPages).toHaveLength(1);
    // A short line's ID may not be orphaned onto a page without its saved data.
    expect(itemPages[0]).toContain(item.product_id);
    expect(itemPages[0]).toContain(item.quantity);
  }
  const lastItemPage = pages.find(text => text.includes(quote.items.at(-1).product_id));
  expect(lastItemPage).toContain('Конец запроса');
  expectReadOnly(requests);
});

test('same-organization other owner and cross-tenant requests disclose no private data', async ({ browser }, testInfo) => {
  const quote = manifest.quotes.owner;
  // Both accounts have quote.read. The persisted request still belongs only to
  // its creator within its selected organization.
  for (const kind of ['peer', 'other']) {
    const context = await browser.newContext({ baseURL: process.env.E2E_QUOTE_PRINT_BASE_URL });
    const visitor = await context.newPage(), requests = observeApi(visitor);
    try {
      await login(visitor, kind, `/b2b/quotes/${quote.id}/print`);
      await expect(printView(visitor).getByRole('alert')).toContainText('Запрос не найден');
      await expect(preview(visitor)).toHaveCount(0);
      await expect(visitor.getByText(quote.comment, { exact: true })).toHaveCount(0);
      await expect(paper(visitor)).not.toHaveAttribute('data-authorized', 'true');
      await screenshot(visitor, testInfo, `real-${kind}-denied`);
      expectReadOnly(requests);
    } finally { await context.close(); }
  }
});

test('current quote.read revocation clears an already-open preview before print', async ({ page }, testInfo) => {
  const quote = manifest.quotes.owner, requests = observeApi(page);
  await login(page, 'owner', `/b2b/quotes/${quote.id}/print`);
  await expect(preview(page)).toContainText(quote.comment);
  expectReadOnly(requests);
  await installPrintCapture(page, testInfo);
  try {
    await fixtures.setOwnerRead(manifest, false);
    requests.length = 0;
    await printButton(page).click();
    await expect(printView(page).getByRole('alert')).toContainText('Доступ к печати запроса не подтверждён');
    await expect(preview(page)).toHaveCount(0);
    await expect(page.getByText(quote.comment, { exact: true })).toHaveCount(0);
    await expect(paper(page)).not.toHaveAttribute('data-authorized', 'true');
    expect(await page.evaluate(() => window.fixturePrintRecords)).toEqual([]);
    expect(requests.filter(request => request.method !== 'OPTIONS')).toEqual([{ path: '/auth/me', method: 'GET' }]);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    expect((await page.evaluate(() => window.fixturePrintRecords.at(-1))).authorized).toBe(false);
    await expect(paper(page).locator('[data-quote-print-document]')).toHaveCount(0);
    await screenshot(page, testInfo, 'real-revoked-print-cleared');
    expectReadOnly(requests);
    await page.reload();
    await expect(printView(page).getByRole('alert')).toContainText('Нет доступа к запросам КП');
    await expect(preview(page)).toHaveCount(0);
  } finally { await fixtures.setOwnerRead(manifest, true); }
});
