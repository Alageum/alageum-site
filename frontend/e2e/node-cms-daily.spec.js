import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const cms = process.env.E2E_CMS_BASE_URL || 'http://127.0.0.1:8016/cms';
const origin = new URL(cms).origin;
const api = process.env.E2E_API_URL || `${origin}/api/v1`;
const frontend = process.env.E2E_BASE_URL || 'http://127.0.0.1:3141';
const plugin = `${origin}/alageum-catalog`;
const editorEmail = 'cms-editor@node-ci.example';
const editor = page => page.getByRole('region', { name: 'Catalog product editor', exact: true });
const field = (page, name) => editor(page).getByLabel(name, { exact: true });
const moneyFields = page => editor(page).locator('.alageum-grid').filter({ has: page.getByLabel('Price', { exact: true }) });

test.beforeAll(() => {
  expect(process.env.APP_ENV, 'Only run against explicitly disposable local fixtures').toBe('test');
  for (const url of [cms, api, frontend]) {
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(url).hostname);
  }
  expect(new URL(api).origin).toBe(origin);
});

async function nativeLogin(page) {
  const password = process.env.E2E_CMS_EDITOR_PASSWORD;
  expect(password, 'Seed the explicit disposable native CMS editor fixture first').toBeTruthy();
  await page.goto(`${cms}/auth/login`);
  await page.getByRole('textbox', { name: /^email(?:\s*\*)?$/i }).fill(editorEmail);
  await page.getByLabel(/^password(?:\s*\*)?$/i).fill(password);
  const loginResponse = page.waitForResponse(response => response.url() === `${origin}/admin/login` && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^(login|log in)$/i }).click();
  const response = await loginResponse;
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data.user.email).toBe(editorEmail);
  const token = data.token || data.accessToken;
  expect(typeof token).toBe('string');
  const profileResponse = await page.request.get(`${origin}/admin/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(profileResponse.status()).toBe(200);
  const { data: profile } = await profileResponse.json();
  expect(Array.isArray(profile.roles)).toBe(true);
  expect(profile.roles.some(role => role.code === 'strapi-super-admin')).toBe(false);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  return token;
}

async function nativeRead(request, token, id) {
  const response = await request.get(`${plugin}/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  return response.json();
}

async function mutation(page, id, { button = 'Save product', action = '', status = 200, clickCount = 1 } = {}) {
  const url = `${plugin}/products${id ? `/${id}` : ''}${action ? `/${action}` : ''}`;
  const method = !id || action ? 'POST' : 'PUT';
  const pending = page.waitForResponse(response => response.url() === url && response.request().method() === method);
  await editor(page).getByRole('button', { name: button, exact: true }).click({ clickCount });
  const response = await pending;
  expect(response.status()).toBe(status);
  const body = await response.json();
  if (status < 400) {
    await expect(field(page, 'Version')).toHaveValue(String(body.version));
    await expect(editor(page).getByRole('button', { name: 'Save product', exact: true })).toBeEnabled();
  }
  return body;
}

async function createForm(page, request, token, label) {
  const key = `cms-daily-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const name = `${label} ${key}`;
  const response = await request.get(`${plugin}/categories?page_size=100`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  const { items } = await response.json();
  const category = items.find(item => item.is_published);
  expect(category, 'The disposable catalog seed must include a published category').toBeTruthy();
  await page.goto(`${cms}/plugins/alageum-catalog`);
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(field(page, 'Status')).toHaveValue('draft');
  await expect(field(page, 'Price mode')).toHaveValue('on_request');
  await field(page, 'Public key').fill(key);
  await field(page, 'Slug').fill(key);
  await field(page, 'Category').selectOption(category.id);
  await field(page, 'Name (RU)').fill(name);
  await field(page, 'Description (RU)').fill('Fresh synthetic product for the disposable native CMS daily workflow.');
  return { key, name };
}

async function reloadProduct(page, product) {
  await page.reload();
  await expect(field(page, 'Public key')).toHaveValue(product.public_key);
  await expect(field(page, 'Version')).toHaveValue(String(product.version));
  await expect(editor(page).getByRole('button', { name: 'Save product', exact: true })).toBeEnabled();
}

async function publicState(request, product, published) {
  for (const key of [product.public_key, product.id]) {
    const response = await request.get(`${api}/catalog/products/${key}`);
    expect(response.status()).toBe(published ? 200 : 404);
    if (published) {
      const body = await response.json();
      for (const name of ['id', 'public_key', 'slug', 'status', 'version', 'price_mode', 'price', 'currency', 'translations']) {
        expect(body[name]).toEqual(product[name]);
      }
    }
  }
  const response = await request.get(`${api}/catalog/products?${new URLSearchParams({ q: product.public_key, page_size: '100' })}`);
  expect(response.status()).toBe(200);
  const { items } = await response.json();
  expect(items.filter(item => item.id === product.id)).toHaveLength(published ? 1 : 0);
}

async function publicDetail(page, product, published) {
  await page.goto(`${frontend}/catalog/${product.public_key}?source=api`);
  if (!published) {
    await expect(page.getByRole('heading', { name: 'Товар недоступен', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: product.translations.ru.name, exact: true })).toHaveCount(0);
  } else {
    await expect(page.getByRole('heading', { name: product.translations.ru.name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: `${product.price} ${product.currency}`, exact: true })).toBeVisible();
    await expect(page.getByText(`АКТУАЛЬНАЯ ВЕРСИЯ ${product.version}`, { exact: true })).toBeVisible();
  }
}

async function publicList(page, product, published) {
  await page.goto(`${frontend}/catalog?${new URLSearchParams({ source: 'api', q: product.public_key })}`);
  await expect(page.getByRole('status').filter({ hasText: /^Найдено:/ })).toHaveText(published ? 'Найдено: 1' : 'Найдено: 0');
  const link = page.getByRole('link', { name: product.translations.ru.name, exact: true });
  await expect(link).toHaveCount(published ? 1 : 0);
  if (published) await expect(page.getByRole('cell', { name: `${product.price} ${product.currency}`, exact: true })).toBeVisible();
}

async function evidence(page, testInfo, target, filename) {
  // Only call after native login. Capture the editor/public content itself;
  // never the password form, session storage, headers, or browser traces.
  await expect(page.getByLabel(/^password(?:\s*\*)?$/i)).toHaveCount(0);
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  const path = testInfo.outputPath(filename);
  await target.screenshot({ path, animations: 'disabled', caret: 'hide' });
  await testInfo.attach(filename, { path, contentType: 'image/png' });
}

test('native daily workflow creates a draft, persists exact prices, publishes, hides and restores', async ({ page, request }, testInfo) => {
  const token = await nativeLogin(page);
  const { key, name } = await createForm(page, request, token, 'CMS daily product');
  let creates = 0;
  page.on('request', request => { if (request.url() === `${plugin}/products` && request.method() === 'POST') creates += 1; });
  let product = await mutation(page, null, { status: 201, clickCount: 2 });
  expect(product.public_key).toBe(key);
  expect(product.status).toBe('draft');
  expect(product.version).toBe(1);
  expect(product.price).toBeNull();
  expect(product.currency).toBeNull();
  await publicState(request, product, false);
  await reloadProduct(page, product);
  await expect(field(page, 'Name (RU)')).toHaveValue(name);
  expect(creates, 'A double-click must create exactly one native CMS product').toBe(1);
  const matches = await request.get(`${plugin}/products?${new URLSearchParams({ public_key: key })}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(matches.status()).toBe(200);
  expect((await matches.json()).total).toBe(1);

  await field(page, 'Price mode').selectOption('fixed');
  await field(page, 'Price').fill('1250.10');
  await field(page, 'Currency').fill('usd');
  await expect(field(page, 'Currency')).toHaveValue('USD');
  product = await mutation(page, product.id);
  expect(product.price).toBe('1250.10');
  expect(product.currency).toBe('USD');
  expect(product.status).toBe('draft');
  await reloadProduct(page, product);
  await expect(field(page, 'Price')).toHaveValue('1250.10');
  await expect(field(page, 'Currency')).toHaveValue('USD');

  // Integer cents exceed Number.MAX_SAFE_INTEGER: no float rounding is allowed.
  await field(page, 'Price').fill('90071992547409.91');
  await field(page, 'Currency').fill('EUR');
  product = await mutation(page, product.id);
  expect(product.price).toBe('90071992547409.91');
  expect(product.currency).toBe('EUR');
  expect(product.version).toBe(3);
  expect((await nativeRead(request, token, product.id)).price).toBe(product.price);
  await reloadProduct(page, product);
  await expect(field(page, 'Price')).toHaveValue(product.price);
  await expect(field(page, 'Currency')).toHaveValue('EUR');
  await evidence(page, testInfo, moneyFields(page), 'native-cms-exact-price-desktop.png');
  await publicState(request, product, false);

  const publicPage = await page.context().newPage();
  try {
    await publicDetail(publicPage, product, false);
    await publicList(publicPage, product, false);
    await field(page, 'Status').selectOption('published');
    product = await mutation(page, product.id);
    expect(product.status).toBe('published');
    expect(product.version).toBe(4);
    await publicState(request, product, true);
    await publicList(publicPage, product, true);
    await evidence(publicPage, testInfo, publicPage.locator('.catalog-page'), 'public-catalog-exact-price-desktop.png');
    await publicDetail(publicPage, product, true);
    await evidence(publicPage, testInfo, publicPage.locator('.product-summary'), 'public-product-exact-price-desktop.png');
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicDetail(publicPage, product, true);
    await evidence(publicPage, testInfo, publicPage.locator('.product-summary'), 'public-product-exact-price-mobile.png');

    product = await mutation(page, product.id, { button: 'Hide product', action: 'hide' });
    expect(product.status).toBe('hidden');
    expect(product.version).toBe(5);
    await publicState(request, product, false);
    await publicDetail(publicPage, product, false);
    await publicList(publicPage, product, false);
    await reloadProduct(page, product);
    await expect(field(page, 'Status')).toHaveValue('hidden');

    product = await mutation(page, product.id, { button: 'Restore draft', action: 'restore' });
    expect(product.status).toBe('draft');
    expect(product.version).toBe(6);
    expect(product.price).toBe('90071992547409.91');
    expect(product.currency).toBe('EUR');
    await publicState(request, product, false);
    await publicDetail(publicPage, product, false);
    await publicList(publicPage, product, false);
    await reloadProduct(page, product);
    await expect(field(page, 'Status')).toHaveValue('draft');
    await field(page, 'Status').selectOption('published');
    product = await mutation(page, product.id);
    expect(product.version).toBe(7);
    await publicState(request, product, true);
    await publicDetail(publicPage, product, true);
    await publicList(publicPage, product, true);
    await reloadProduct(page, product);
    await expect(field(page, 'Price')).toHaveValue('90071992547409.91');
    await expect(field(page, 'Currency')).toHaveValue('EUR');
    await page.setViewportSize({ width: 390, height: 844 });
    // Strapi scrolls its content inside a fixed viewport. Capture visible
    // sections separately so offscreen editor content is not clipped out.
    await evidence(page, testInfo, editor(page).locator('.alageum-grid').first(), 'native-cms-republished-mobile.png');
    await evidence(page, testInfo, moneyFields(page), 'native-cms-exact-price-mobile.png');
  } finally { await publicPage.close(); }
});

test('missing and invalid daily fields preserve the draft and explain what needs correction', async ({ page, request }, testInfo) => {
  const token = await nativeLogin(page);
  const { key, name } = await createForm(page, request, token, 'CMS validation product');
  let creates = 0;
  page.on('request', request => { if (request.url() === `${plugin}/products` && request.method() === 'POST') creates += 1; });
  for (const label of ['Public key', 'Slug']) {
    await field(page, label).fill('');
    await editor(page).getByRole('button', { name: 'Save product', exact: true }).click();
    expect(await field(page, label).evaluate(input => input.validity.valueMissing)).toBe(true);
    expect(await field(page, label).evaluate(input => input.validationMessage)).not.toBe('');
    await expect(field(page, 'Status')).toHaveValue('draft');
    expect(creates).toBe(0);
    await field(page, label).fill(key);
  }
  await field(page, 'Name (RU)').fill('');
  await mutation(page, null, { status: 422 });
  await expect(editor(page).getByRole('alert')).toContainText('A translated product name is required');
  await expect(field(page, 'Public key')).toHaveValue(key);
  await expect(field(page, 'Status')).toHaveValue('draft');
  await field(page, 'Name (RU)').fill(name);
  let product = await mutation(page, null, { status: 201 });
  expect(product.version).toBe(1);
  await field(page, 'Price mode').selectOption('fixed');
  await field(page, 'Currency').fill('USD');
  await editor(page).getByRole('button', { name: 'Save product', exact: true }).click();
  expect(await field(page, 'Price').evaluate(input => input.validity.valueMissing)).toBe(true);
  expect(await field(page, 'Price').evaluate(input => input.validationMessage)).not.toBe('');
  await field(page, 'Price').fill('12.34');
  for (const value of ['', 'US']) {
    await field(page, 'Currency').fill(value);
    await editor(page).getByRole('button', { name: 'Save product', exact: true }).click();
    expect(await field(page, 'Currency').evaluate(input => input.validity.valid)).toBe(false);
    expect(await field(page, 'Currency').evaluate(input => input.validationMessage)).not.toBe('');
    expect((await nativeRead(request, token, product.id)).version).toBe(1);
  }

  await field(page, 'Price').fill('-1.00');
  await field(page, 'Currency').fill('ZZZ');
  await mutation(page, product.id, { status: 422 });
  await expect(editor(page).getByRole('alert')).toContainText(/price/i);
  await expect(editor(page).getByRole('alert')).toContainText(/currency/i);
  await expect(field(page, 'Price')).toHaveValue('-1.00');
  await expect(field(page, 'Currency')).toHaveValue('ZZZ');
  await expect(field(page, 'Status')).toHaveValue('draft');
  const unchanged = await nativeRead(request, token, product.id);
  expect(unchanged.version).toBe(1);
  expect(unchanged.price_mode).toBe('on_request');
  expect(unchanged.price).toBeNull();
  expect(unchanged.currency).toBeNull();
  await publicState(request, product, false);
  await evidence(page, testInfo, editor(page).getByRole('alert'), 'native-cms-validation-summary-desktop.png');
  await evidence(page, testInfo, moneyFields(page), 'native-cms-invalid-price-currency-desktop.png');
  // Errors must identify the actual controls, including for screen-reader users.
  await expect(field(page, 'Price')).toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'Price')).toHaveAccessibleDescription(/decimal|price|non-negative/i);
  await expect(field(page, 'Currency')).toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'Currency')).toHaveAccessibleDescription(/currency|ISO/i);

  await field(page, 'Currency').fill('USD');
  for (const invalid of ['12.345', '1,25', 'not-a-price']) {
    await field(page, 'Price').fill(invalid);
    await mutation(page, product.id, { status: 422 });
    await expect(field(page, 'Price')).toHaveValue(invalid);
    await expect(field(page, 'Price')).toHaveAttribute('aria-invalid', 'true');
    expect((await nativeRead(request, token, product.id)).version).toBe(1);
    await publicState(request, product, false);
  }
  await field(page, 'Price').fill('0');
  product = await mutation(page, product.id);
  expect(product.price).toBe('0.00');
  expect(product.currency).toBe('USD');
  expect(product.status).toBe('draft');
  expect(product.version).toBe(2);
  await expect(field(page, 'Price')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'Currency')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(field(page, 'Price')).toHaveAccessibleDescription('');
  await expect(field(page, 'Currency')).toHaveAccessibleDescription('');
  await reloadProduct(page, product);
  await expect(field(page, 'Price')).toHaveValue('0.00');
  await expect(field(page, 'Currency')).toHaveValue('USD');
  await publicState(request, product, false);
});
