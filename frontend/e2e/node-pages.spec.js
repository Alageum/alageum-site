import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { expectCatalogViewport, expectReceivesPointer } from './helpers/catalog-viewport';

// Real Strapi 5.56 Content Manager, with fresh users from the dedicated Page
// harness. No API-created test entries, mocked publication, or injected tokens.
const cms = process.env.E2E_PAGE_CMS_BASE_URL?.replace(/\/$/, '');
const frontend = process.env.EDITORIAL_PAGES_BASE_URL?.replace(/\/$/, '');
const origin = cms ? new URL(cms).origin : undefined;
const uid = 'api::page.page';
const collection = `/content-manager/collection-types/${uid}`;
const roleActions = {
  editor: ['create', 'read', 'update'],
  publisher: ['publish', 'read'],
  denied: [],
};

test.beforeAll(() => {
  expect(process.env.APP_ENV, 'Use the explicit disposable Page harness').toBe('test');
  for (const value of [cms, frontend]) {
    expect(value, 'The harness must allocate both Page servers').toBeTruthy();
    const url = new URL(value);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.protocol).toBe('http:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
  }
});

function nativeResponse(page, pathname, method = 'GET') {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && decodeURIComponent(url.pathname) === pathname && response.request().method() === method;
  });
}

async function nativeLogin(page, kind) {
  const email = process.env[`E2E_PAGE_${kind.toUpperCase()}_EMAIL`];
  const password = process.env[`E2E_PAGE_${kind.toUpperCase()}_PASSWORD`];
  expect(email, 'Run the dedicated Page fixture harness').toBeTruthy();
  expect(password, 'The fixture password must be passed in memory').toBeTruthy();
  await page.goto(`${cms}/auth/login`);
  await page.getByRole('textbox', { name: /^email(?:\s*\*)?$/i }).fill(email);
  await page.getByLabel(/^password(?:\s*\*)?$/i).fill(password);
  // Observe the actual profile/permissions loaded by native authentication.
  // The login response itself has an unpopulated user; it cannot prove roles.
  const login = nativeResponse(page, '/admin/login', 'POST');
  const profile = nativeResponse(page, '/admin/users/me');
  const permissions = nativeResponse(page, '/admin/users/me/permissions');
  await page.getByRole('button', { name: /^(login|log in)$/i }).click();
  const responses = await Promise.all([login, profile, permissions]);
  for (const response of responses) expect(response.status()).toBe(200);
  const { data: user } = await responses[1].json();
  expect(user.email).toBe(email);
  expect(user.roles.map(role => role.code)).toEqual([`alageum-page-test-${kind}`]);
  expect(user.roles.some(role => role.code === 'strapi-super-admin')).toBe(false);
  const { data: grants } = await responses[2].json();
  expect(grants.map(grant => `${grant.subject}:${grant.action}`).sort()).toEqual(
    roleActions[kind].map(action => `${uid}:plugin::content-manager.explorer.${action}`).sort(),
  );
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('link', { name: 'ALAGEUM catalog', exact: true })).toHaveCount(0);
}

// TextInput inherits these names from Field.Root. BlocksInput uses Slate's
// native editor marker (there is exactly one Blocks field in the Page schema).
const titleField = page => page.locator('input[name="title"]');
const slugField = page => page.locator('input[name="slug"]');
const bodyField = page => page.locator('[data-slate-editor="true"]');
const action = (page, name) => page.getByRole('button', { name, exact: true });
const documentStatus = (page, status) => page.getByRole('status', { name: status, exact: true });

async function writeDraft(page, title, body) {
  await expect(bodyField(page)).toHaveCount(1);
  await expect(bodyField(page)).toHaveAttribute('contenteditable', 'true');
  await bodyField(page).click();
  await bodyField(page).press('ControlOrMeta+A');
  await bodyField(page).pressSequentially(body);
  // Strapi paragraphs consume Tab. The title fill below moves focus outside
  // Blocks; the save helper verifies the actual submitted form state as well.
  await bodyField(page).press('Tab');
  await titleField(page).fill(title);
  // Native drag controls are siblings of the paragraph inside Slate. Assert
  // exactly one content paragraph; the save response also checks its full body.
  await expect(bodyField(page).locator('p[data-slate-node="element"]')).toHaveText([body]);
}

async function saveDraft(page, expected, documentId) {
  const saved = nativeResponse(page, `${collection}${documentId ? `/${documentId}` : ''}`, documentId ? 'PUT' : 'POST');
  await expect(action(page, 'Save')).toBeEnabled();
  await action(page, 'Save').click();
  const response = await saved;
  expect(response.status()).toBe(documentId ? 200 : 201);
  expect(response.request().postDataJSON(), 'Native Page must submit the complete entered Blocks body').toMatchObject(expected);
  const { data } = await response.json();
  expect(data).toMatchObject({ ...expected, publishedAt: null });
  expect(data.documentId).toMatch(/^[a-z0-9]+$/);
  if (documentId) expect(data.documentId).toBe(documentId);
  expect(Number.isFinite(Date.parse(data.updatedAt))).toBe(true);
  await expect(page).toHaveURL(new RegExp(`/content-manager/collection-types/api::page\\.page/${data.documentId}(?:\\?|$)`));
  await expect(action(page, 'Save')).toBeDisabled();
  await expect(action(page, 'Publish')).toBeDisabled();
  return data;
}

async function openDraft(page, documentId, expected) {
  const loaded = nativeResponse(page, `${collection}/${documentId}`);
  await page.goto(`${cms}${collection}/${documentId}?status=draft`);
  const response = await loaded;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).searchParams.get('status')).toBe('draft');
  const { data } = await response.json();
  expect(data).toMatchObject({ documentId, publishedAt: null, ...expected });
  await expect(titleField(page)).toHaveValue(expected.title);
  await expect(page.getByRole('tab', { name: 'draft', exact: true })).toHaveAttribute('aria-selected', 'true');
  return data;
}

async function publishDraft(page, documentId, expected) {
  await expect(titleField(page)).toBeDisabled();
  await expect(slugField(page)).toBeDisabled();
  await expect(bodyField(page)).toHaveAttribute('contenteditable', 'false');
  await expect(action(page, 'Save')).toBeDisabled();
  await expect(action(page, 'Publish')).toBeEnabled();
  const published = nativeResponse(page, `${collection}/${documentId}/actions/publish`, 'POST');
  await action(page, 'Publish').click();
  const response = await published;
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data).toMatchObject({ documentId, ...expected });
  expect(Number.isFinite(Date.parse(data.publishedAt))).toBe(true);
  await expect(documentStatus(page, 'published')).toBeVisible();
  await expect(action(page, 'Publish')).toBeDisabled();
  return data;
}

async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectAbsent(request, slug) {
  expect((await request.get(`${origin}/api/v1/pages/${slug}?locale=ru`)).status()).toBe(404);
  // Assert HTTP status as well as UI: a streamed notFound() can return 200.
  expect((await request.get(`${frontend}/pages/ru/${slug}`)).status()).toBe(404);
}

async function expectPublished(page, slug, title, body) {
  const response = await page.goto(`${frontend}/pages/ru/${slug}`);
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page.locator('.editorial-body')).toHaveText(body);
}

test('native Page: editor saves private drafts and a separate publisher controls publication', async ({ page, browser, request }, testInfo) => {
  const publisherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const publisher = await publisherContext.newPage();
    const publicPage = await publicContext.newPage();
    const slug = `native-page-${randomUUID()}`;
    const first = {
      slug, locale_code: 'ru', title: 'Native Page first publication',
      body: [{ type: 'paragraph', children: [{ type: 'text', text: 'First body entered in the native Blocks editor.' }] }],
    };
    const second = {
      ...first, title: 'Native Page private revision',
      body: [{ type: 'paragraph', children: [{ type: 'text', text: 'Revised body stays private until publisher approval.' }] }],
    };

    await nativeLogin(page, 'editor');
    await page.goto(`${cms}${collection}`);
    await page.getByRole('link', { name: 'Create new entry', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create an entry', exact: true })).toBeVisible();
    await slugField(page).fill(slug);
    await expect(page.getByRole('combobox', { name: 'locale_code', exact: true })).toContainText('ru');
    await writeDraft(page, first.title, first.body[0].children[0].text);
    const created = await saveDraft(page, first);
    await expect(documentStatus(page, 'draft')).toBeVisible();
    await expectAbsent(request, slug);
    await screenshot(page, testInfo, 'native-page-editor-private-draft');

    await nativeLogin(publisher, 'publisher');
    await openDraft(publisher, created.documentId, first);
    await publishDraft(publisher, created.documentId, first);
    await expectPublished(publicPage, slug, first.title, first.body[0].children[0].text);

    // Re-read this document's draft, never the published tab or a stale form.
    await openDraft(page, created.documentId, first);
    await writeDraft(page, second.title, second.body[0].children[0].text);
    const revised = await saveDraft(page, second, created.documentId);
    expect(Date.parse(revised.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    await expect(documentStatus(page, 'modified')).toBeVisible();
    await expectPublished(publicPage, slug, first.title, first.body[0].children[0].text);
    await expect(publicPage.locator('.editorial-page')).not.toContainText(second.title);
    await expect(publicPage.locator('.editorial-page')).not.toContainText(second.body[0].children[0].text);

    await openDraft(publisher, created.documentId, second);
    await publishDraft(publisher, created.documentId, second);
    await expectPublished(publicPage, slug, second.title, second.body[0].children[0].text);
    await screenshot(publisher, testInfo, 'native-page-publisher-republished');

    // A clean published document has a direct native Unpublish menu action;
    // the keep/replace-draft dialog applies only to a modified document.
    await action(publisher, 'More document actions').click();
    const unpublished = nativeResponse(publisher, `${collection}/${created.documentId}/actions/unpublish`, 'POST');
    await publisher.getByRole('menuitem', { name: 'Unpublish', exact: true }).click();
    expect((await unpublished).status()).toBe(200);
    await expect(documentStatus(publisher, 'draft')).toBeVisible();
    await expectAbsent(request, slug);
    const missing = await publicPage.goto(`${frontend}/pages/ru/${slug}`);
    expect(missing.status()).toBe(404);
    await expect(publicPage.locator('.editorial-page')).toHaveCount(0);
  } finally {
    await publisherContext.close();
    await publicContext.close();
  }
});

test('native Page: the denied administrator cannot open the native Page editor', async ({ page }) => {
  await nativeLogin(page, 'denied');
  await page.goto(`${cms}${collection}/create`);
  await expect(page.getByText("You don't have the permissions to access that content", { exact: true })).toBeVisible();
  await expect(titleField(page)).toHaveCount(0);
  await expect(bodyField(page)).toHaveCount(0);
  await expect(action(page, 'Save')).toHaveCount(0);
  await expect(action(page, 'Publish')).toHaveCount(0);
});

test('public Page: responsive RU about renders the shared shell without browser Page API reads', async ({ page }, testInfo) => {
  const errors = [];
  const pageRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/api\/v1\/pages(?:\/|\?|$)/.test(request.url())) pageRequests.push(request.url());
  });
  const response = await page.goto(`${frontend}/pages/ru/about`);
  expect(response.status()).toBe(200);
  const assertRender = async () => {
    await expect(page.locator('.editorial-page')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('О компании');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.editorial-body')).toContainText('Alageum Electric — электротехническая группа Казахстана.');
    await expect(page.locator('.editorial-body').getByRole('heading', { name: 'НАША МИССИЯ', exact: true })).toBeVisible();
    await expect(page.locator('header.site-header')).toBeVisible();
    await expect(page.locator('footer.site-footer')).toBeVisible();
    await expect(page.locator('main.site-main > .editorial-page.site-container')).toHaveCount(1);
    await expect(page.locator('.editorial-body img, .editorial-body iframe, .editorial-body script')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex.*nofollow/);
    // Verify actual CSS application, not just presence of a stylesheet link.
    await expect(page.locator('.editorial-body')).toHaveCSS('font-size', page.viewportSize().width <= 760 ? '15px' : '17px');
    await expect(page.locator('.editorial-body')).toHaveCSS('border-top-width', '1px');
    await expect(page.locator('body')).toHaveCSS('margin', '0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };
  await assertRender();
  expect((await page.reload()).status()).toBe(200);
  await assertRender();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator('.site-brand-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('footer.site-footer').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.site-footer-logo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, testInfo, `page-about-ru-${testInfo.project.name}`);
  expect(pageRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('public Page: absent and untranslated entries have hard Next 404 responses', async ({ request }) => {
  for (const path of ['/pages/ru/native-page-does-not-exist', '/pages/en/about', '/pages/kk/about', '/pages/kz/about']) {
    const response = await request.get(`${frontend}${path}`);
    expect(response.status(), path).toBe(404);
  }
});


test('public Page: responsive CMS company is authoritative within the existing navigation and shell', async ({ page }, testInfo) => {
  const errors = [], pageRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/api\/v1\/pages(?:\/|\?|$)/.test(request.url())) pageRequests.push(request.url());
  });
  expect((await page.goto(`${frontend}/catalog`)).status()).toBe(200);
  await expectCatalogViewport(page);
  const assertRender = async () => {
    await expect(page.locator('main.site-main > .editorial-page.site-container')).toHaveAttribute('lang', 'ru');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('О компании');
    await expect(page.locator('.editorial-body')).toContainText('Alageum Electric — электротехническая группа Казахстана.');
    await expect(page.locator('.editorial-body').getByRole('heading', { name: 'НАША МИССИЯ', exact: true })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${frontend}/company`);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex.*nofollow/);
    await expect(page.locator('header.site-header')).toBeVisible();
    await expect(page.locator('footer.site-footer')).toBeVisible();
    await expect(page.locator('header.site-header .site-nav-link[href="/company"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.site-mobile-navigation a[href="/company"]').first()).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('header.site-header a[href="/catalog"]').first()).toHaveAttribute('href', '/catalog');
    await expect(page.locator('.corp-mission, #history, .corp-about-opening, .corp-end-note')).toHaveCount(0);
    await expect(page.locator('.editorial-body img, .editorial-body iframe, .editorial-body script')).toHaveCount(0);
    await expect(page.locator('.editorial-body')).toHaveCSS('font-size', page.viewportSize().width <= 760 ? '15px' : '17px');
    await expect(page.locator('.editorial-body')).toHaveCSS('border-top-width', '1px');
    await expect(page.locator('body')).toHaveCSS('margin', '0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  };
  // Enter through the existing responsive navigation, including mobile menu
  // opening, so this verifies the real public entry point as well as reload.
  let companyLink = page.locator('header.site-header .site-nav-link[href="/company"]');
  if (page.viewportSize().width <= 760) {
    const toggle = page.getByRole('button', { name: 'Открыть навигацию', exact: true });
    await expectReceivesPointer(toggle);
    await toggle.click();
    companyLink = page.locator('.site-mobile-navigation a[href="/company"]').first();
  }
  await expectReceivesPointer(companyLink);
  await Promise.all([page.waitForURL(`${frontend}/company`), companyLink.click()]);
  await assertRender();
  expect((await page.reload()).status()).toBe(200);
  await assertRender();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.locator('.site-brand-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('footer.site-footer').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.site-footer-logo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, testInfo, `company-cms-ru-${testInfo.project.name}`);
  expect(pageRequests).toEqual([]);
  expect(errors).toEqual([]);
});
