import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { signingBrowserSession, nextSigningSessionId } from './session-fixture.js';

const documentId = '60000000-0000-4000-8000-000000000001';
const versionId = '70000000-0000-4000-8000-000000000001';
const intentId = '80000000-0000-4000-8000-000000000001';
const orgA = '10000000-0000-4000-8000-000000000001', orgB = '10000000-0000-4000-8000-000000000002';
const content = Buffer.from('%PDF-1.7\nFictitious browser transport fixture\n%%EOF');
const hash = createHash('sha256').update(content).digest('hex');
const cms = Buffer.from('Fictitious CMS for transport tests, never cryptographic proof').toString('base64');
const version = { id: versionId, number: 9, sha256: hash, size_bytes: content.length, media_type: 'application/pdf' };
const signature = { id: '90000000-0000-4000-8000-000000000001', status: 'pending_verification', version_id: versionId, sha256: hash, delivery_status: 'not_configured', created_at: '2026-10-12T00:00:00Z' };
const panel = page => page.getByTestId('document-signing');
async function setup(page, { available = true, permissions = ['document.read', 'document.sign'], signing = 'success', submitFailure = false } = {}) {
  const calls = []; let submitted = 0;
  await page.addInitScript(({ session, cms, signing }) => {
    sessionStorage.setItem('alageum_session', JSON.stringify(session));
    window.__signingSockets = []; window.__signingCommands = [];
    const Original = window.WebSocket;
    window.WebSocket = class {
      constructor(url) {
        if (url !== 'wss://127.0.0.1:13579/') return new Original(url);
        this.closed = false; window.__signingSockets.push(this); queueMicrotask(() => this.onopen?.());
      }
      send(value) {
        window.__signingCommands.push(JSON.parse(value));
        if (signing === 'success') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ status: true, body: { result: cms } }) }));
        if (signing === 'malformed') queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ status: true, body: {} }) }));
        if (signing === 'disconnect') queueMicrotask(() => this.onclose?.());
      }
      close() { this.closed = true; }
    };
  }, { session: signingBrowserSession(orgA), cms, signing });
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    const organization = request.headers()['x-organization-id'] || orgA;
    const method = request.method(); calls.push({ path, method, body: request.postData() });
    const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/me') {
      expect(request.headers()['x-browser-session']).toMatch(/^[0-9a-f-]{36}$/);
      expect(request.headers().authorization).toBeUndefined();
      return reply({ user: { id: '20000000-0000-4000-8000-000000000001', email: 'fictitious@example.invalid' }, organization: { id: organization, name: organization === orgA ? 'Fictitious A' : 'Fictitious B' }, permissions });
    }
    if (path === '/quote-signature-requests') return reply({ items: [], page: 1, page_size: 20, total: 0 });
    if (path === '/documents') return reply({ items: [{ id: documentId, number: 'FIXTURE-009', title: organization === orgA ? 'Fictitious signing document' : 'Fictitious other organization', external_id: null, source: 'fixture', type_code: 'fixture_pdf', latest_file_id: versionId }], page: 1, page_size: 50, total: 1 });
    if (path === `/documents/${documentId}/signing`) return reply({ enabled: true, signing_allowed: available, reason: available ? null : 'verifier_unavailable', document_id: documentId, version, signature: null });
    if (path.endsWith('/signing/intents')) return reply({ id: intentId, document_id: documentId, version_id: versionId, sha256: hash, expires_at: '2099-01-01T00:00:00Z', content_base64: content.toString('base64') });
    if (path.endsWith(`/signatures/${signature.id}/verify`) && method === 'POST') return reply({ ...signature, status: 'verified' });
    if (path.endsWith(`/intents/${intentId}/cancel`) && method === 'POST') return route.fulfill({ status: 204 });
    if (path.endsWith(`/intents/${intentId}`)) {
      submitted++;
      if (submitFailure && submitted === 1) return route.abort('failed');
      return reply(signature);
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"fixture_route_missing"}}' });
  });
  await page.goto('/b2b/documents');
  await expect(page.getByTestId('document-summary')).toContainText('Fictitious signing document');
  return calls;
}
const submissions = calls => calls.filter(call => call.method === 'POST' && call.path.endsWith(`/intents/${intentId}`));
async function open(page) { await page.getByRole('button', { name: 'Подпись ЭЦП', exact: true }).click(); await expect(panel(page).getByTestId('signing-hash')).toHaveText(hash); }

test('immutable preview precedes explicit signing; pending status and recipient limitation stay honest', async ({ page }, testInfo) => {
  const calls = await setup(page); await open(page);
  expect(await page.evaluate(() => window.__signingSockets.length)).toBe(0);
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(0);
  await panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true }).click();
  await expect(panel(page).getByTestId('signing-status')).toHaveText('Подпись сохранена. Ожидает проверки сервером.');
  await expect(panel(page)).toContainText('Получатель и отправка не настроены. Документ не отправлен.');
  expect(submissions(calls)).toHaveLength(1);
  expect(await page.evaluate(() => window.__signingCommands.length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`signing-pending-${testInfo.project.name}.png`), fullPage: true });
});

test('provider unavailable blocks preparation and never connects to NCALayer', async ({ page }, testInfo) => {
  const calls = await setup(page, { available: false }); await open(page);
  await expect(panel(page)).toContainText('Серверная проверка ЭЦП не настроена. Подписание недоступно.');
  await expect(panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true })).toBeDisabled();
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(0);
  expect(await page.evaluate(() => window.__signingSockets.length)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath(`signing-unavailable-${testInfo.project.name}.png`), fullPage: true });
});

test('document.read alone retains list without signing controls or signing requests', async ({ page }) => {
  const calls = await setup(page, { permissions: ['document.read'] });
  await expect(page.getByRole('button', { name: 'Подпись ЭЦП', exact: true })).toHaveCount(0);
  expect(calls.filter(call => call.path.includes('/signing'))).toHaveLength(0);
});

test('lost result can explicitly replay the exact signature without a second signing operation', async ({ page }) => {
  const calls = await setup(page, { submitFailure: true }); await open(page);
  await panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Повторить передачу подписи', exact: true })).toBeVisible();
  expect(submissions(calls)).toHaveLength(1);
  await panel(page).getByRole('button', { name: 'Повторить передачу подписи', exact: true }).click();
  await expect(panel(page).getByTestId('signing-status')).toContainText('Ожидает проверки');
  expect(submissions(calls)).toHaveLength(2); expect(submissions(calls)[0].body).toBe(submissions(calls)[1].body);
  expect(await page.evaluate(() => window.__signingCommands.length)).toBe(1);
});

for (const action of ['Закрыть', 'Отменить', 'organization', 'logout', 'new-login']) test(`interrupt ${action} closes socket and suppresses late submission`, async ({ page }, testInfo) => {
  const calls = await setup(page, { signing: 'hold' }); await open(page);
  await panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true }).click();
  await expect(panel(page)).toContainText('Подтвердите подписание в NCALayer.');
  if (action === 'Закрыть') {
    // Long SHA/UUID values must not grow the panel horizontally on mobile.
    const layout = await panel(page).evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const hash = element.querySelector('[data-testid="signing-hash"]');
      return { left: bounds.left, right: bounds.right, viewport: document.documentElement.clientWidth,
        hashOverflow: hash.scrollWidth - hash.clientWidth };
    });
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.hashOverflow).toBeLessThanOrEqual(1);
    const close = panel(page).getByRole('button', { name: 'Закрыть', exact: true });
    await close.scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
    console.log('Signing responsive layout:', JSON.stringify({ project: testInfo.project.name, ...layout }));
    await page.screenshot({ path: testInfo.outputPath('signing-responsive-layout.png') });
    await close.click();
  } else if (action === 'Отменить') await panel(page).getByRole('button', { name: action, exact: true }).click();
  else await page.evaluate(({ action, orgB, nextSigningSessionId }) => {
    const session = JSON.parse(sessionStorage.getItem('alageum_session'));
    if (action === 'logout') sessionStorage.removeItem('alageum_session');
    else sessionStorage.setItem('alageum_session', JSON.stringify({ ...session, ...(action === 'organization' ? { organization_id: orgB } : { browser_session: nextSigningSessionId }) }));
    window.dispatchEvent(new Event('alageum:session-changed'));
  }, { action, orgB, nextSigningSessionId });
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(cms => { const socket = window.__signingSockets[0]; socket.onmessage?.({ data: JSON.stringify({ status: true, body: { result: cms } }) }); return socket.closed; }, cms)).toBe(true);
  expect(submissions(calls)).toHaveLength(0);
  if (action === 'Закрыть' || action === 'Отменить') {
    await open(page); expect(await page.evaluate(() => window.__signingSockets.length)).toBe(1);
  }
});

for (const signing of ['malformed', 'disconnect']) test(`${signing} response does not submit or claim success`, async ({ page }) => {
  const calls = await setup(page, { signing }); await open(page);
  await panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(panel(page).getByTestId('signing-status')).toHaveCount(0);
  expect(submissions(calls)).toHaveLength(0); expect(await page.evaluate(() => window.__signingCommands.length)).toBe(1);
});


test('navigation and Back do not resurrect an in-progress signature', async ({ page }) => {
  const calls = await setup(page, { signing: 'hold' }); await open(page);
  await panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true }).click();
  await expect(panel(page)).toContainText('Подтвердите подписание в NCALayer.');
  await page.locator('.sidebar').getByRole('link', { name: 'Обзор', exact: true }).click();
  await expect(page).toHaveURL(/\/b2b$/);
  expect(await page.evaluate(() => window.__signingSockets[0].closed)).toBe(true);
  await page.goBack();
  await expect(page.getByTestId('document-summary')).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  expect(submissions(calls)).toHaveLength(0);
  expect(await page.evaluate(() => window.__signingCommands.length)).toBe(1);
});


test('pending signature can be explicitly checked again server-side without a second signing request', async ({ page }) => {
  const calls = await setup(page); await open(page);
  await panel(page).getByRole('button', { name: 'Подписать в NCALayer', exact: true }).click();
  await expect(panel(page).getByTestId('signing-status')).toContainText('Ожидает проверки сервером');
  await panel(page).getByRole('button', { name: 'Повторить проверку', exact: true }).click();
  await expect(panel(page).getByTestId('signing-status')).toHaveText('Подпись проверена сервером.');
  expect(calls.filter(call => call.path.endsWith('/verify'))).toHaveLength(1);
  expect(submissions(calls)).toHaveLength(1);
  expect(await page.evaluate(() => window.__signingCommands.length)).toBe(1);
});
