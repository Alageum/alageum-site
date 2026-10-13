import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { expect, test } from '@playwright/test';

const cms = process.env.E2E_PAGE_CMS_BASE_URL?.replace(/\/$/, '');
const frontend = process.env.EDITORIAL_PAGES_BASE_URL?.replace(/\/$/, '');
const origin = cms ? new URL(cms).origin : undefined;
const uid = 'api::page.page';
const collection = `/content-manager/collection-types/${uid}`;
const fields = ['slug', 'title', 'locale_code', 'body', 'publishedAt', 'documentId'];
const contentFields = ['slug', 'title', 'locale_code', 'body'];
const titleField = page => page.locator('input[name="title"]');
const slugField = page => page.locator('input[name="slug"]');
const bodyField = page => page.locator('[data-slate-editor="true"]');
const action = (page, name) => page.getByRole('button', { name, exact: true });
const blocks = text => [{ type: 'paragraph', children: [{ type: 'text', text }] }];
const select = (value, names = fields) => Object.fromEntries(names.filter(name => Object.hasOwn(value ?? {}, name)).map(name => [name, value[name]]));

// Exactly twelve measured attempts, one serial test, zero retries. Fill is the
// actual Playwright contenteditable fill operation, not a physical clipboard paste.
const attempts = ['body-title-create', 'title-body-create', 'immediate-body-edit'].flatMap(scenario =>
  ['pressSequentially', 'contenteditable-fill'].flatMap(input =>
    ['Save', 'Publish'].map(button => ({ scenario, input, button }))),
);

test.describe.configure({ mode: 'serial' });

function nativeResponse(page, pathname, method = 'GET') {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && decodeURIComponent(url.pathname) === pathname && response.request().method() === method;
  }, { timeout: 10000 });
}

async function nativeLogin(page) {
  const email = process.env.E2E_PAGE_PROBE_EMAIL;
  const password = process.env.E2E_PAGE_PROBE_PASSWORD;
  expect(Boolean(email && password), 'Disposable probe credentials must be supplied in memory').toBe(true);
  await page.goto(`${cms}/auth/login`);
  await page.getByRole('textbox', { name: /^email(?:\s*\*)?$/i }).fill(email);
  await page.getByLabel(/^password(?:\s*\*)?$/i).fill(password);
  const responses = Promise.all([
    nativeResponse(page, '/admin/login', 'POST'),
    nativeResponse(page, '/admin/users/me'),
    nativeResponse(page, '/admin/users/me/permissions'),
  ]);
  await page.getByRole('button', { name: /^(login|log in)$/i }).click();
  const [login, profile, permissions] = await responses;
  for (const response of [login, profile, permissions]) expect(response.status()).toBe(200);
  const { data: user } = await profile.json();
  expect(user.email === email, 'Authenticated the exact disposable probe user').toBe(true);
  expect(user.roles.map(role => role.code)).toEqual(['alageum-page-test-probe']);
  expect(user.roles.some(role => role.code === 'strapi-super-admin')).toBe(false);
  const { data: grants } = await permissions.json();
  expect(grants.map(grant => `${grant.subject}:${grant.action}`).sort()).toEqual(
    ['create', 'read', 'update', 'publish'].map(name => `${uid}:plugin::content-manager.explorer.${name}`).sort(),
  );
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

async function openCreate(page, slug) {
  await page.goto(`${cms}${collection}/create`);
  await expect(page.getByRole('heading', { name: 'Create an entry', exact: true })).toBeVisible();
  await expect(bodyField(page)).toHaveCount(1);
  await expect(bodyField(page)).toHaveAttribute('contenteditable', 'true');
  await slugField(page).fill(slug);
  await expect(page.getByRole('combobox', { name: 'locale_code', exact: true })).toContainText('ru');
}

async function enterBody(page, method, text) {
  if (method === 'contenteditable-fill') {
    await bodyField(page).fill(text);
  } else {
    await bodyField(page).click();
    await bodyField(page).press('ControlOrMeta+A');
    await bodyField(page).pressSequentially(text); // Default speed; no artificial delay.
  }
}

// Observe only genuine events, without dispatching, preventing, intercepting,
// reading field values, replacing timers, or touching Slate/React state.
async function startEvents(page) {
  await page.evaluate(() => {
    const events = [];
    const types = ['beforeinput', 'input', 'focus', 'blur', 'keydown', 'keyup', 'pointerdown', 'click'];
    const listener = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      let category;
      if (target.closest('[data-slate-editor="true"]')) category = 'body';
      else if (target.matches('input[name="title"]')) category = 'title';
      else if (target.matches('input[name="slug"]')) category = 'slug';
      else {
        const label = target.closest('button')?.textContent?.trim();
        if (label === 'Save') category = 'save-action';
        if (label === 'Publish') category = 'publish-action';
      }
      if (category && events.length < 2000) events.push({ type: event.type, target: category, atMs: performance.timeOrigin + performance.now() });
    };
    for (const type of types) document.addEventListener(type, listener, { capture: true, passive: true });
    window.__pageFastSaveProbe = {
      events,
      stop: () => { for (const type of types) document.removeEventListener(type, listener, true); },
    };
  });
}

async function collectEvents(page, record) {
  if (record.events) return;
  record.events = await page.evaluate(() => {
    const probe = window.__pageFastSaveProbe;
    if (!probe) return [];
    probe.stop();
    delete window.__pageFastSaveProbe;
    return probe.events;
  });
  const bodyEvents = record.events.filter(event => event.target === 'body');
  const lastInput = bodyEvents.filter(event => event.type === 'input').at(-1);
  const lastBeforeInput = bodyEvents.filter(event => event.type === 'beforeinput').at(-1);
  // Slate may preventDefault on beforeinput and apply the edit internally, so a
  // native input event is not guaranteed (notably fill or final punctuation).
  // Preserve both facts and label the latest real edit-intent/input event used
  // for timing; never infer a DOM input event that did not occur.
  const lastEdit = bodyEvents.filter(event => ['beforeinput', 'input'].includes(event.type)).at(-1);
  const target = `${record.button.toLowerCase()}-action`;
  const pointer = record.events.find(event => event.type === 'pointerdown' && event.target === target);
  const click = record.events.find(event => event.type === 'click' && event.target === target);
  const blur = record.events.filter(event => event.type === 'blur' && event.target === 'body').at(-1);
  record.timings = {
    lastBodyInputAtMs: lastInput?.atMs ?? null,
    lastBodyBeforeInputAtMs: lastBeforeInput?.atMs ?? null,
    bodyEditTimingEventType: lastEdit?.type ?? null,
    bodyEditTimingAtMs: lastEdit?.atMs ?? null,
    bodyBlurAtMs: blur?.atMs ?? null,
    actionPointerAtMs: pointer?.atMs ?? null,
    actionClickAtMs: click?.atMs ?? null,
    inputToPointerMs: lastEdit && pointer ? pointer.atMs - lastEdit.atMs : null,
    inputToClickMs: lastEdit && click ? click.atMs - lastEdit.atMs : null,
  };
  record.withinDebounceWindow = {
    pointer: record.timings.inputToPointerMs !== null && record.timings.inputToPointerMs >= 0 && record.timings.inputToPointerMs < 300,
    click: record.timings.inputToClickMs !== null && record.timings.inputToClickMs >= 0 && record.timings.inputToClickMs < 300,
  };
}

async function screenshot(page, testInfo, record, suffix = '') {
  const name = `fast-save-${record.kind}-${record.number}${suffix}`;
  const path = testInfo.outputPath(`${name}.png`);
  // Never screenshot login, authentication errors, or password fields.
  if (!new URL(page.url()).pathname.includes('/content-manager/collection-types/')) return;
  await page.screenshot({ path, fullPage: true, animations: 'disabled', timeout: 5000 });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  record.screenshots.push(`${name}.png`);
}

function check(record, label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) record.mismatches.push(label);
}

async function reloadDraft(page, record) {
  const documentId = record.response?.documentId;
  if (!/^[a-z0-9]+$/.test(documentId ?? '')) {
    record.mismatches.push('response.documentId');
    return;
  }
  // Full native navigation followed by a real reload. Read the draft explicitly,
  // including after Publish, so the native GET cannot be a cached published tab.
  await page.goto(`${cms}${collection}/${documentId}?status=draft`);
  const loaded = nativeResponse(page, `${collection}/${documentId}`);
  await page.reload();
  const response = await loaded;
  const payload = await response.json();
  record.reloaded = { method: 'GET', status: response.status(), fields: select(payload.data) };
  check(record, 'reload.status', response.status(), 200);
  check(record, 'reload.draft-query', new URL(response.url()).searchParams.get('status'), 'draft');
  check(record, 'reload.content', select(payload.data, contentFields), record.expected);
  check(record, 'reload.documentId', payload.data?.documentId, documentId);
  check(record, 'reload.publishedAt', payload.data?.publishedAt, null);
  await expect(bodyField(page)).toBeVisible();
  record.reloaded.ui = {
    title: await titleField(page).inputValue(),
    slug: await slugField(page).inputValue(),
    body: (await bodyField(page).locator('p[data-slate-node="element"]').allTextContents()).map(text => blocks(text)[0]),
  };
  check(record, 'reload.ui-title', record.reloaded.ui.title, record.expected.title);
  check(record, 'reload.ui-slug', record.reloaded.ui.slug, record.expected.slug);
  check(record, 'reload.ui-body', record.reloaded.ui.body, record.expected.body);
}

async function inspectPublic(request, publicPage, record) {
  const { slug } = record.expected;
  const response = await request.get(`${origin}/api/v1/pages/${slug}?locale=ru`, { timeout: 10000 });
  record.public = { api: { method: 'GET', status: response.status() } };
  if (response.status() === 200) {
    const payload = await response.json();
    record.public.api.fields = select({ ...payload, publishedAt: payload.published_at });
  }
  const rendered = await publicPage.goto(`${frontend}/pages/ru/${slug}`);
  record.public.page = { method: 'GET', status: rendered.status() };
  const expectedStatus = record.button === 'Publish' ? 200 : 404;
  check(record, 'public.api-status', response.status(), expectedStatus);
  check(record, 'public.page-status', rendered.status(), expectedStatus);
  if (record.button === 'Publish') {
    check(record, 'public.api-content', select(record.public.api.fields, contentFields), record.expected);
    check(record, 'public.publishedAt', record.public.api.fields?.publishedAt, record.response?.publishedAt);
    if (rendered.status() === 200) {
      record.public.page.fields = {
        title: await publicPage.getByRole('heading', { level: 1 }).textContent(),
        body: await publicPage.locator('.editorial-body').textContent(),
      };
      check(record, 'public.ui-title', record.public.page.fields.title, record.expected.title);
      check(record, 'public.ui-body', record.public.page.fields.body, record.expected.body[0].children[0].text);
    }
  } else check(record, 'public.no-draft-render', await publicPage.locator('.editorial-page').count(), 0);
}

async function performAttempt(page, publicPage, request, testInfo, record, enter, documentId) {
  const pathname = `${collection}${documentId ? `/${documentId}` : ''}${record.button === 'Publish' ? '/actions/publish' : ''}`;
  const method = record.button === 'Save' && documentId ? 'PUT' : 'POST';
  let stage = 'start-observer';
  const observeRequest = request => {
    const url = new URL(request.url());
    if (url.origin !== origin || decodeURIComponent(url.pathname) !== pathname || request.method() !== method) return;
    record.writes.push({ method: request.method(), requestedAtMs: Date.now(), submitted: select(request.postDataJSON()) });
  };
  try {
    await startEvents(page);
    page.on('request', observeRequest);
    // Register before input; collect values only from the actual native request.
    // Convert timeout into a value immediately so failed UI actions cannot leave
    // a rejected response promise running in the background.
    const pending = nativeResponse(page, pathname, method).then(response => ({ response }), () => ({ response: null }));
    stage = 'input';
    await enter();
    stage = 'action';
    // No field/form assertions, screenshots, polls, sleeps, or state reads occur
    // between the final input and this real click. Standard actionability is kept;
    // its actual event timing below determines whether this was under 300ms.
    await action(page, record.button).click();
    stage = 'response';
    const { response } = await pending;
    if (!response) throw new Error('Expected native Page response was not observed');
    record.request = { method: response.request().method(), status: response.status(), respondedAtMs: Date.now() };
    record.submitted = select(response.request().postDataJSON());
    record.response = select((await response.json()).data);
    await collectEvents(page, record);
    await screenshot(page, testInfo, record);
    // Pinned 5.56 PublishAction publishes directly when there are no draft
    // relations. Page has no relation attributes: do not accept unrelated dialogs.
    check(record, 'unexpected-dialog', await page.getByRole('dialog').count(), 0);
    check(record, 'write-count', record.writes.length, 1);
    check(record, 'request.status', response.status(), record.button === 'Save' && !documentId ? 201 : 200);
    check(record, 'submitted.content', select(record.submitted, contentFields), record.expected);
    check(record, 'response.content', select(record.response, contentFields), record.expected);
    check(record, 'submitted-vs-response.body', record.submitted.body, record.response.body);
    if (documentId) check(record, 'response.documentId-existing', record.response.documentId, documentId);
    if (record.button === 'Save') check(record, 'response.private-draft', record.response.publishedAt, null);
    else check(record, 'response.publishedAt', Number.isFinite(Date.parse(record.response.publishedAt)), true);
    stage = 'native-reload';
    await reloadDraft(page, record);
    stage = 'public-read';
    await inspectPublic(request, publicPage, record);
    stage = 'comparison';
    expect(record.mismatches, 'Selected native Page evidence differs from the entered fixture').toEqual([]);
    record.outcome = 'passed';
  } catch {
    record.outcome = 'failed';
    record.failureStage = stage;
    if (!record.mismatches.length) record.mismatches.push(`${stage}.operation`);
    // Capture live evidence before the test/browser fixture and harness teardown.
    await collectEvents(page, record).catch(() => { record.eventCaptureFailed = true; });
    await screenshot(page, testInfo, record, '-failure').catch(() => { record.screenshotCaptureFailed = true; });
    throw new Error(`Native Page ${record.kind} ${record.number} failed at ${stage}: ${record.mismatches.join(', ')}`);
  } finally {
    page.off('request', observeRequest);
  }
}

test('native Page: bounded fast Save and dirty Publish preserve all entered Blocks', async ({ page, browser, request }, testInfo) => {
  const report = {
    schemaVersion: 1,
    totals: { planned: 12, attempted: 0, passed: 0, failed: 0 },
    debounceWindowMs: 300,
    timingAnchor: 'latest-body-beforeinput-or-input',
    underDebounceWindow: { pointer: 0, click: 0 },
    setupWrites: [],
    attempts: [],
  };
  let publicContext;
  try {
    expect(process.env.APP_ENV, 'Use the disposable Page harness').toBe('test');
    expect(process.env.ALAGEUM_TEST_PAGE_FAST_SAVE, 'Explicit probe opt-in is required').toBe('1');
    for (const base of [cms, frontend]) {
      expect(base, 'Both disposable Page servers must be allocated').toBeTruthy();
      const url = new URL(base);
      expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
      expect(url.protocol).toBe('http:');
      expect(url.username + url.password + url.search + url.hash).toBe('');
    }
    expect(attempts).toHaveLength(12);
    await nativeLogin(page);
    publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const publicPage = await publicContext.newPage();
    for (const [index, plan] of attempts.entries()) {
      const number = index + 1;
      const expected = {
        slug: `fast-save-${randomUUID()}`,
        title: `Native Page probe ${number}`,
        locale_code: 'ru',
        body: blocks(`Probe ${number} body entered immediately.`),
      };
      await openCreate(page, expected.slug);
      let documentId;
      if (plan.scenario === 'immediate-body-edit') {
        const setup = {
          kind: 'setup', number, scenario: 'initial-draft', input: 'contenteditable-fill', button: 'Save',
          expected: { ...expected, body: blocks(`Initial draft ${number}.`) }, writes: [], screenshots: [], mismatches: [],
        };
        report.setupWrites.push(setup);
        await performAttempt(page, publicPage, request, testInfo, setup, async () => {
          await enterBody(page, setup.input, setup.expected.body[0].children[0].text);
          await titleField(page).fill(expected.title);
        });
        // performAttempt verified a genuine native reload plus public 404.
        documentId = setup.response.documentId;
      }
      const record = { kind: 'attempt', number, ...plan, expected, writes: [], screenshots: [], mismatches: [] };
      report.attempts.push(record);
      report.totals.attempted++;
      try {
        await performAttempt(page, publicPage, request, testInfo, record, async () => {
          const text = expected.body[0].children[0].text;
          if (plan.scenario === 'body-title-create') {
            await enterBody(page, plan.input, text);
            // Match the existing helper's real Tab followed by title fill.
            await bodyField(page).press('Tab');
            await titleField(page).fill(expected.title);
          } else if (plan.scenario === 'title-body-create') {
            await titleField(page).fill(expected.title);
            await enterBody(page, plan.input, text);
          } else await enterBody(page, plan.input, text);
        }, documentId);
        report.totals.passed++;
      } catch (error) {
        report.totals.failed++;
        throw error; // First mismatch ends the matrix; never retry a write.
      }
    }
    expect(report.totals).toEqual({ planned: 12, attempted: 12, passed: 12, failed: 0 });
  } finally {
    for (const record of report.attempts) {
      if (record.withinDebounceWindow?.pointer) report.underDebounceWindow.pointer++;
      if (record.withinDebounceWindow?.click) report.underDebounceWindow.click++;
    }
    report.fastWindowCovered = report.underDebounceWindow.click === 12;
    // The harness extracts this single allowlisted line from Playwright stdout
    // and writes it only after its redactor. No raw response/auth files exist.
    console.log(`PAGE_FAST_SAVE_PROBE_EVIDENCE=${JSON.stringify(report)}`);
    await publicContext?.close();
  }
});
