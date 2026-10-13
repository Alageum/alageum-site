import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { installNativePageProbe } from './helpers/page-native-editor-probe.mjs';

const cms = process.env.E2E_PAGE_CMS_BASE_URL?.replace(/\/$/, '');
const frontend = process.env.EDITORIAL_PAGES_BASE_URL?.replace(/\/$/, '');
const origin = cms ? new URL(cms).origin : undefined;
const uid = 'api::page.page';
const collection = `/content-manager/collection-types/${uid}`;
const contentFields = ['slug', 'title', 'locale_code', 'body'];
const fields = [...contentFields, 'documentId', 'publishedAt'];
const select = (value, keys = fields) => Object.fromEntries(keys.filter(key => Object.hasOwn(value ?? {}, key)).map(key => [key, value[key]]));
const blocks = text => [{ type: 'paragraph', children: [{ type: 'text', text }] }];
const bodyField = page => page.locator('[data-slate-editor="true"]');
const action = (page, name) => page.getByRole('button', { name, exact: true });
const cases = ['keyboard-save-create', 'keyboard-publish-rapid-edits', 'keyboard-save-rapid-revision',
  'keyboard-publish-clear', 'cancel-leave-retains-input', 'confirm-leave-unmounts-input', 'discard-cancel-and-reset'];

test.describe.configure({ mode: 'serial' });

function nativeResponse(page, pathname, method = 'GET') {
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && decodeURIComponent(url.pathname) === pathname && response.request().method() === method;
  }, { timeout: 8000 });
}

async function nativeLogin(page) {
  const email = process.env.E2E_PAGE_PROBE_EMAIL;
  const password = process.env.E2E_PAGE_PROBE_PASSWORD;
  expect(Boolean(email && password), 'Disposable probe credentials must be supplied in memory').toBe(true);
  await page.goto(`${cms}/auth/login`);
  await page.getByRole('textbox', { name: /^email(?:\s*\*)?$/i }).fill(email);
  await page.getByLabel(/^password(?:\s*\*)?$/i).fill(password);
  const pending = Promise.all([
    nativeResponse(page, '/admin/login', 'POST'), nativeResponse(page, '/admin/users/me'),
    nativeResponse(page, '/admin/users/me/permissions'),
  ]);
  await page.getByRole('button', { name: /^(login|log in)$/i }).click();
  const [login, profile, permissions] = await pending;
  for (const response of [login, profile, permissions]) expect(response.status()).toBe(200);
  const { data: user } = await profile.json();
  expect(user.email === email, 'Authenticated the exact disposable probe user').toBe(true);
  expect(user.roles.map(role => role.code)).toEqual(['alageum-page-test-probe']);
  const { data: grants } = await permissions.json();
  expect(grants.map(grant => `${grant.subject}:${grant.action}`).sort()).toEqual(
    ['create', 'read', 'update', 'publish'].map(name => `${uid}:plugin::content-manager.explorer.${name}`).sort(),
  );
  await expect(page).not.toHaveURL(/\/auth\/login/);
}

// The test-only native probe is attached before input to this exact synthetic
// Page. It observes selections, operations and the real callback without
// changing selections, timers, clocks, or publication behavior. Observation can
// still affect scheduling; a clean run does not establish that the race is gone.
async function startEvents(page, slug) {
  await page.evaluate(({ slug }) => {
    const nativeEditor = window.__alageumNativePageProbe.attach({ slug });
    const events = [];
    const types = ['beforeinput', 'input', 'keydown', 'click', 'blur'];
    const listener = event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      let category;
      if (target.closest('[data-slate-editor="true"]')) category = 'body';
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        category = event.shiftKey ? 'publish-shortcut' : 'save-shortcut';
      } else if (event.type === 'click') {
        const label = target.closest('button, a, [role="menuitem"]')?.textContent?.trim();
        if (['Back', 'Cancel', 'Confirm', 'Discard changes'].includes(label)) category = label.toLowerCase().replaceAll(' ', '-');
      }
      if (category && events.length < 1500) events.push({ type: event.type, category, atMs: performance.timeOrigin + performance.now() });
    };
    types.forEach(type => document.addEventListener(type, listener, { capture: true, passive: true }));
    window.__pageSyncRegression = { events, nativeEditor,
      stop: () => types.forEach(type => document.removeEventListener(type, listener, true)) };
  }, { slug });
}

async function drainEvents(page, optional = false) {
  return page.evaluate(({ optional }) => {
    const probe = window.__pageSyncRegression;
    if (!probe) {
      if (optional) return null;
      throw new Error('Page event probe missing');
    }
    try {
      let nativeEditor;
      try { probe.stop(); }
      finally { nativeEditor = probe.nativeEditor.stop(); }
      return { events: probe.events, nativeEditor };
    } finally {
      delete window.__pageSyncRegression;
    }
  }, { optional });
}

async function preserveInterruptedProbe(page, record) {
  if (!record) return;
  try {
    const collected = await drainEvents(page, true);
    if (collected) record.interruptedNativeProbe = collected;
  } catch {
    // Preserve the original operation failure; never persist a raw browser or
    // callback exception that could contain unrelated/private runtime data.
    record.interruptedNativeProbeUnavailable = 'PROBE_COLLECTION_FAILED';
  }
}

async function collectEvents(page, record, actionCategory) {
  const collected = await drainEvents(page);
  record.events = collected.events;
  record.nativeEditor = collected.nativeEditor;
  expect(record.nativeEditor?.schemaVersion, 'Native diagnostic must attach to the synthetic Page').toBe(1);
  expect(record.nativeEditor.diagnosticOnly).toBe(true);
  expect(record.nativeEditor.events.some(event => event.type === 'attach' && event.phase === 'setup')).toBe(true);
  const lastEdit = record.events.filter(event => event.category === 'body' && ['beforeinput', 'input'].includes(event.type)).at(-1);
  const trigger = record.events.find(event => event.category === actionCategory);
  const elapsed = lastEdit && trigger ? trigger.atMs - lastEdit.atMs : null;
  record.timing = {
    anchor: lastEdit?.type ?? null, lastBodyEditAtMs: lastEdit?.atMs ?? null,
    actionCategory, actionAtMs: trigger?.atMs ?? null, inputToActionMs: elapsed,
    withinDebounceWindow: elapsed !== null && elapsed >= 0 && elapsed < 300,
  };
}

async function screenshot(page, testInfo, record, suffix = '') {
  if (!decodeURIComponent(new URL(page.url()).pathname).includes(collection)) return;
  if (await page.locator('input[type="password"]').count()) return;
  const name = `page-sync-${record.number}-${record.scenario}${suffix}`;
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled', timeout: 5000 });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  record.screenshots.push(`${name}.png`);
}

async function expectBody(page, expected) {
  await expect(bodyField(page)).toHaveCount(1);
  const texts = expected?.map(block => block.children.map(child => child.text).join('')) ?? [''];
  await expect(bodyField(page).locator('p[data-slate-node="element"]')).toHaveText(texts);
}

async function readDraft(page, record, documentId, expected) {
  const pending = nativeResponse(page, `${collection}/${documentId}`);
  await page.goto(`${cms}${collection}/${documentId}?status=draft`);
  const response = await pending;
  const data = select((await response.json()).data);
  record.reads.push({ kind: 'draft', method: 'GET', status: response.status(), fields: data });
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).searchParams.get('status')).toBe('draft');
  expect(data).toEqual({ ...expected, documentId, publishedAt: null });
  await expect(page.locator('input[name="title"]')).toHaveValue(expected.title);
  await expectBody(page, expected.body);
}

async function readPublic(request, publicPage, record, expected, slug) {
  const response = await request.get(`${origin}/api/v1/pages/${slug}?locale=ru`, { timeout: 8000 });
  const api = { kind: 'public-api', method: 'GET', status: response.status() };
  record.reads.push(api);
  expect(response.status()).toBe(expected ? 200 : 404);
  if (expected) {
    const payload = await response.json();
    api.fields = select({ ...payload, publishedAt: payload.published_at });
    expect(select(api.fields, contentFields)).toEqual({ ...expected, body: expected.body ?? [] });
    expect(Number.isFinite(Date.parse(api.fields.publishedAt))).toBe(true);
  }
  const rendered = await publicPage.goto(`${frontend}/pages/ru/${slug}`);
  const renderedRead = { kind: 'public-page', method: 'GET', status: rendered.status() };
  record.reads.push(renderedRead);
  expect(rendered.status()).toBe(expected ? 200 : 404);
  if (expected) {
    renderedRead.title = await publicPage.getByRole('heading', { level: 1 }).textContent();
    renderedRead.bodyText = await publicPage.locator('.editorial-body').textContent();
    expect(renderedRead.title).toBe(expected.title);
    expect(renderedRead.bodyText).toBe(expected.body?.[0].children[0].text ?? '');
  } else await expect(publicPage.locator('.editorial-page')).toHaveCount(0);
}

async function typeBody(page, text) {
  await bodyField(page).click();
  await bodyField(page).press('ControlOrMeta+A');
  await bodyField(page).pressSequentially(text);
}

async function rapidBody(page, text) {
  await bodyField(page).fill('First replacement, superseded immediately.');
  await bodyField(page).fill('Second replacement, also superseded.');
  await typeBody(page, text);
}

async function keyboardMutation(page, report, record, expected, documentId, kind, enter, purpose = 'measured') {
  const operation = { kind, purpose, keyboardTarget: 'title', expected, events: [], timing: null };
  record.operations.push(operation);
  record.stage = `${purpose}-${kind}-input`;
  await startEvents(page, expected.slug);
  const start = report.writes.length;
  const method = kind === 'save' && documentId ? 'PUT' : 'POST';
  const pathname = `${collection}${documentId ? `/${documentId}` : ''}${kind === 'publish' ? '/actions/publish' : ''}`;
  const pending = nativeResponse(page, pathname, method).then(response => response, () => null);
  await enter();
  // Native BlocksContent consumes modified Enter as a paragraph split/newline
  // before the window-level document shortcut runs. Focus a regular native
  // field so this bounded sync regression does not conflate that separate
  // shortcut collision with field-to-form synchronization. No assertions,
  // screenshots, value reads, polls, or waits precede the shortcut; its actual
  // input→focus→shortcut time must still establish the <300ms case.
  await page.locator('input[name="title"]').focus();
  await page.keyboard.press(kind === 'publish' ? 'ControlOrMeta+Shift+Enter' : 'ControlOrMeta+Enter');
  record.stage = `${purpose}-${kind}-response`;
  const response = await pending;
  await collectEvents(page, operation, `${kind}-shortcut`);
  expect(response, 'Expected one real native mutation after the keyboard shortcut').not.toBeNull();
  operation.method = method;
  operation.status = response.status();
  operation.submitted = select(response.request().postDataJSON(), contentFields);
  operation.response = select((await response.json()).data);
  expect(report.writes.length - start).toBe(1);
  expect(operation.status).toBe(kind === 'save' && !documentId ? 201 : 200);
  expect(operation.submitted).toEqual(expected);
  expect(select(operation.response, contentFields)).toEqual(expected);
  expect(operation.response.documentId).toMatch(/^[a-z0-9]+$/);
  if (documentId) expect(operation.response.documentId).toBe(documentId);
  if (kind === 'save') expect(operation.response.publishedAt).toBeNull();
  else expect(Number.isFinite(Date.parse(operation.response.publishedAt))).toBe(true);
  expect(operation.timing.withinDebounceWindow, 'Immediate keyboard coverage must be measured within300ms').toBe(true);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  return operation.response.documentId;
}

async function afterOldDebounce(page, record, reason) {
  // Deliberate post-cancel/reset/unmount observation, never an input→save delay.
  // Use real elapsed browser time; do not override application clocks or timers.
  const before = Date.now();
  await page.waitForTimeout(350);
  record.lateChecks.push({ reason, kind: 'real-time-after-action', minimumMs: 350, observedMs: Date.now() - before });
}

async function leaveDialog(page) {
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Are you sure you want to leave this page? All your modifications will be lost.');
  return dialog;
}

async function discardDialog(page) {
  await action(page, 'More document actions').click();
  await page.getByRole('menuitem', { name: 'Discard changes', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Are you sure you want to discard the changes? This action is irreversible.');
  return dialog;
}

test('native Page: synchronous Blocks preserve keyboard edits, clear, cancellation and discard', async ({ page, browser, request }, testInfo) => {
  const report = { schemaVersion: 1, totals: { planned: 7, attempted: 0, passed: 0, failed: 0 },
    debounceWindowMs: 300, scenarios: [], writes: [] };
  let publicContext;
  let observeRequest;
  let observeResponse;
  let current;
  try {
    expect(process.env.APP_ENV).toBe('test');
    expect(process.env.ALAGEUM_TEST_PAGE_FAST_SAVE, 'Reuse only the explicitly enabled disposable probe actor').toBe('1');
    for (const base of [cms, frontend]) {
      expect(base).toBeTruthy();
      const url = new URL(base);
      expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
      expect(url.protocol).toBe('http:');
      expect(url.username + url.password + url.search + url.hash).toBe('');
    }
    await page.addInitScript(installNativePageProbe);
    await nativeLogin(page);
    const pendingWrites = new Map();
    observeRequest = nativeRequest => {
      const url = new URL(nativeRequest.url());
      const pathname = decodeURIComponent(url.pathname);
      if (url.origin !== origin || !(pathname === collection || pathname.startsWith(`${collection}/`))
        || !['POST', 'PUT', 'DELETE', 'PATCH'].includes(nativeRequest.method())) return;
      const write = { scenario: current?.scenario ?? 'outside-scenario', method: nativeRequest.method(),
        action: pathname.endsWith('/actions/publish') ? 'publish' : pathname.endsWith('/actions/discard') ? 'discard' : 'save',
        requestedAtMs: Date.now(), submitted: select(nativeRequest.postDataJSON() ?? {}, contentFields) };
      report.writes.push(write);
      pendingWrites.set(nativeRequest, write);
    };
    observeResponse = response => {
      const write = pendingWrites.get(response.request());
      if (write) { write.status = response.status(); pendingWrites.delete(response.request()); }
    };
    page.on('request', observeRequest);
    page.on('response', observeResponse);
    publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const publicPage = await publicContext.newPage();
    const base = { slug: `page-sync-${randomUUID()}`, title: 'Native Page synchronization regression', locale_code: 'ru' };
    const first = { ...base, body: blocks('Keyboard-created draft body.') };
    const published = { ...base, body: blocks('Final rapid edit published by keyboard!') };
    const revised = { ...base, body: blocks('Final rapid private revision saved by keyboard!') };
    const cleared = { ...base, body: null };
    let documentId;
    const scenario = async (number, work) => {
      const record = { number, id: cases[number - 1], scenario: cases[number - 1], stage: 'start',
        operations: [], reads: [], lateChecks: [], screenshots: [], mismatches: [] };
      current = record;
      report.scenarios.push(record);
      report.totals.attempted++;
      const start = report.writes.length;
      try {
        await work(record);
        record.writeCount = report.writes.length - start;
        await screenshot(page, testInfo, record);
        record.outcome = 'passed';
        report.totals.passed++;
      } catch {
        await preserveInterruptedProbe(page, record);
        record.writeCount = report.writes.length - start;
        record.outcome = 'failed';
        record.mismatches.push(`${record.stage}.assertion-or-operation`);
        report.totals.failed++;
        await screenshot(page, testInfo, record, '-failure').catch(() => { record.screenshotCaptureFailed = true; });
        throw new Error(`Native Page sync scenario ${number} failed at ${record.stage}`);
      }
    };

    await scenario(1, async record => {
      await page.goto(`${cms}${collection}/create`);
      await expect(bodyField(page)).toHaveAttribute('contenteditable', 'true');
      await page.locator('input[name="slug"]').fill(base.slug);
      await page.locator('input[name="title"]').fill(base.title);
      documentId = await keyboardMutation(page, report, record, first, undefined, 'save', () => typeBody(page, first.body[0].children[0].text));
      record.stage = 'verify-private-create';
      await readDraft(page, record, documentId, first);
      await readPublic(request, publicPage, record, null, base.slug);
    });
    await scenario(2, async record => {
      await keyboardMutation(page, report, record, published, documentId, 'publish', () => rapidBody(page, published.body[0].children[0].text));
      record.stage = 'verify-latest-publication';
      await readDraft(page, record, documentId, published);
      await readPublic(request, publicPage, record, published, base.slug);
    });
    await scenario(3, async record => {
      await keyboardMutation(page, report, record, revised, documentId, 'save', () => rapidBody(page, revised.body[0].children[0].text));
      record.stage = 'verify-private-revision';
      await readDraft(page, record, documentId, revised);
      await readPublic(request, publicPage, record, published, base.slug);
    });
    await scenario(4, async record => {
      record.input = 'contenteditable-fill-empty';
      await keyboardMutation(page, report, record, cleared, documentId, 'publish', async () => {
        // Preserve the exact failing contenteditable-fill operation. Neither
        // its intent nor a beforeinput event proves native deletion occurred;
        // the diagnostic records the actual selection and callback path.
        await bodyField(page).fill('');
      });
      record.stage = 'verify-native-null-public-empty-array';
      await readDraft(page, record, documentId, cleared);
      await readPublic(request, publicPage, record, cleared, base.slug);
      // Repeat independent nonempty→empty publications without delaying the
      // input→shortcut boundary. A previous run lost the clear at only 7.8ms.
      // Each restoration is an explicit fixture mutation, not an automatic
      // retry of a failed clear; any mismatch stops the scenario immediately.
      for (let round = 1; round <= 4; round++) {
        const restored = { ...base, body: blocks(`Final repeat ${round} body!`) };
        await keyboardMutation(page, report, record, restored, documentId, 'publish',
          () => bodyField(page).fill(restored.body[0].children[0].text), `repeat-${round}-restore`);
        await readDraft(page, record, documentId, restored);
        await readPublic(request, publicPage, record, restored, base.slug);
        await keyboardMutation(page, report, record, cleared, documentId, 'publish',
          () => bodyField(page).fill(''), `repeat-${round}-clear`);
        await readDraft(page, record, documentId, cleared);
        await readPublic(request, publicPage, record, cleared, base.slug);
      }
    });
    await scenario(5, async record => {
      record.stage = 'cancel-navigation';
      const start = report.writes.length;
      const text = 'Unsaved text retained after Cancel.';
      await startEvents(page, base.slug);
      await typeBody(page, text);
      const dialog = await leaveDialog(page);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await collectEvents(page, record, 'back');
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expectBody(page, blocks(text));
      await afterOldDebounce(page, record, 'cancel-leave');
      await expectBody(page, blocks(text));
      await readPublic(request, publicPage, record, cleared, base.slug);
      expect(report.writes.length - start).toBe(0);
    });
    await scenario(6, async record => {
      record.stage = 'confirm-navigation-and-unmount';
      const start = report.writes.length;
      await startEvents(page, base.slug);
      await bodyField(page).fill('Unsaved text discarded by leaving the editor.');
      const dialog = await leaveDialog(page);
      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
      await collectEvents(page, record, 'back');
      await expect(bodyField(page)).toHaveCount(0);
      await expect.poll(() => decodeURIComponent(new URL(page.url()).pathname)).toBe(new URL(`${cms}${collection}`).pathname);
      await afterOldDebounce(page, record, 'confirmed-leave-unmount');
      record.stage = 'verify-reopened-saved-body';
      await readDraft(page, record, documentId, cleared);
      await afterOldDebounce(page, record, 'reopened-editor');
      await expectBody(page, null);
      await readPublic(request, publicPage, record, cleared, base.slug);
      expect(report.writes.length - start).toBe(0);
    });
    await scenario(7, async record => {
      // Native discard uses the existing update permission. A persisted private
      // revision is required: unsaved-only changes do not enable that action.
      const draft = { ...base, body: blocks('Saved revision to discard back to empty publication.') };
      await keyboardMutation(page, report, record, draft, documentId, 'save', () => typeBody(page, draft.body[0].children[0].text), 'setup');
      await readDraft(page, record, documentId, draft);
      const start = report.writes.length;
      const unsaved = 'Unsaved edits survive the discard dialog Cancel.';
      record.stage = 'cancel-discard';
      await startEvents(page, base.slug);
      await bodyField(page).fill(unsaved);
      let dialog = await discardDialog(page);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await collectEvents(page, record, 'discard-changes');
      await afterOldDebounce(page, record, 'cancel-discard');
      await expectBody(page, blocks(unsaved));
      expect(report.writes.length - start).toBe(0);
      record.stage = 'confirm-discard';
      await startEvents(page, base.slug);
      await bodyField(page).fill('Newest unsaved edit must not return after reset.');
      dialog = await discardDialog(page);
      const pending = nativeResponse(page, `${collection}/${documentId}/actions/discard`, 'POST').then(response => response, () => null);
      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
      const response = await pending;
      expect(response).not.toBeNull();
      record.discard = { method: 'POST', status: response.status(), receivedAtMs: Date.now(), response: select((await response.json()).data) };
      await collectEvents(page, record.discard, 'confirm');
      expect(record.discard.status).toBe(200);
      // Menu/dialog actionability can exceed 300ms. Preserve the measured
      // coverage classification without calling a slower reset a fast one.
      expect(select(record.discard.response, contentFields)).toEqual(cleared);
      await expectBody(page, null);
      await afterOldDebounce(page, record, 'confirmed-discard-reset');
      await expectBody(page, null);
      record.stage = 'verify-discard-persistence';
      await readDraft(page, record, documentId, cleared);
      await readPublic(request, publicPage, record, cleared, base.slug);
      expect(report.writes.length - start).toBe(1);
    });
    expect(report.totals).toEqual({ planned: 7, attempted: 7, passed: 7, failed: 0 });
    expect(report.writes).toHaveLength(14);
  } finally {
    await preserveInterruptedProbe(page, current);
    if (observeRequest) page.off('request', observeRequest);
    if (observeResponse) page.off('response', observeResponse);
    // Only this curated line is persisted by the parent redactor. No auth
    // response, raw exception, headers, storage, email, or password is included.
    console.log(`PAGE_SYNC_REGRESSION_EVIDENCE=${JSON.stringify(report)}`);
    await publicContext?.close();
  }
});
