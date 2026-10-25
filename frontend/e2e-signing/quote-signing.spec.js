import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { signingBrowserSession } from './session-fixture.js';
const org = '10000000-0000-4000-8000-000000000001', user = '20000000-0000-4000-8000-000000000001';
const quote = '30000000-0000-4000-8000-000000000001', documentId = '60000000-0000-4000-8000-000000000001';
const pdf = Buffer.from('%PDF-1.7\nBrowser transport test only\n%%EOF\n'), hash = createHash('sha256').update(pdf).digest('hex');
async function setup(page, initial = 'preparation_available', manager = false) {
  let status = initial; const mutations = [];
  await page.addInitScript(session => sessionStorage.setItem('alageum_session', JSON.stringify(session)), signingBrowserSession(org));
  const receipt = () => ({ quote_id: quote, status, prepare_allowed: status === 'preparation_available', request_allowed: status === 'ready', pdf_sha256: ['ready', 'requested'].includes(status) ? hash : null, signature_status: 'not_verified', external_delivery: 'not_configured' });
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1', '');
    const reply = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/auth/me') {
      expect(req.headers()['x-browser-session']).toMatch(/^[0-9a-f-]{36}$/);
      expect(req.headers().authorization).toBeUndefined();
      return reply({ user: { id: user, email: 'synthetic@example.invalid' }, organization: { id: org, name: 'Synthetic org' }, permissions: manager ? ['document.read', 'document.sign'] : ['quote.read', 'quote.create'] });
    }
    if (path === `/quotes/${quote}`) return reply({ id: quote, status: 'submitted', comment: null, item_count: 1, created_at: '2026-10-25T00:00:00Z', items: [{ id: '40000000-0000-4000-8000-000000000001', product_id: '50000000-0000-4000-8000-000000000001', quantity: '2.000', product_snapshot: { sku: 'TEST', translations: { ru: { name: 'Трансформатор' } }, version: 1, price: null, currency: 'KZT', price_mode: 'on_request' } }] });
    if (path === `/quotes/${quote}/signature-request/prepare`) { mutations.push({ path, body: req.postData() }); status = 'ready'; return reply(receipt()); }
    if (path === `/quotes/${quote}/signature-request`) { if (req.method() === 'POST') { mutations.push({ path, body: req.postData() }); status = 'requested'; } return reply(receipt()); }
    if (path === `/quotes/${quote}/signature-request/pdf`) return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Content-Length': String(pdf.length) }, body: pdf });
    if (path === '/documents') return reply({ items: [], page: 1, page_size: 50, total: 0 });
    if (path === '/quote-signature-requests') return reply({ items: [{ id: quote, quote_id: quote, document_id: documentId, title: 'Назначенное КП', requested_at: '2026-10-25T00:00:00Z', pdf_sha256: hash, signature_status: 'not_verified' }], page: 1, page_size: 20, total: 1 });
    if (path === `/documents/${documentId}/signing`) return reply({ enabled: true, signing_allowed: false, reason: 'verifier_unavailable', document_id: documentId, version: null, signature: null });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"code":"not_found"}}' });
  });
  return mutations;
}
test('client separately prepares exact PDF, downloads it, then hands off without signed claim', async ({ page }) => {
  const calls = await setup(page); await page.goto(`/b2b/quotes/${quote}`);
  const area = page.getByRole('region', { name: 'Подписание КП' });
  await area.getByRole('button', { name: 'Сформировать PDF итогового списка' }).click();
  await expect(area.getByText('Проверенной ЭЦП пока нет.')).toBeVisible();
  const download = page.waitForEvent('download'); await area.getByRole('button', { name: 'Скачать неизменяемый PDF' }).click(); await download;
  await area.getByRole('button', { name: 'Передать КП менеджеру на ЭЦП' }).click();
  await expect(area.getByRole('status')).toContainText('передано назначенному менеджеру');
  await expect(area.getByText('Проверенной ЭЦП пока нет.')).toBeVisible();
  expect(calls).toHaveLength(2); expect(calls.every(call => call.body === '{}')).toBeTruthy();
});
test('unconfigured routing exposes no generate or send action', async ({ page }) => {
  const calls = await setup(page, 'configuration_required'); await page.goto(`/b2b/quotes/${quote}`);
  const area = page.getByRole('region', { name: 'Подписание КП' });
  await expect(area.getByRole('status')).toContainText('требуется настройка');
  await expect(area.getByRole('button', { name: 'Передать КП менеджеру на ЭЦП' })).toHaveCount(0);
  expect(calls).toHaveLength(0);
});
test('assigned manager inbox opens genuine EDS panel and fails closed without verifier', async ({ page }) => {
  await setup(page, 'requested', true); await page.goto('/b2b/documents');
  const inbox = page.getByRole('region', { name: 'КП на мою подпись' });
  await expect(inbox).toContainText('Назначенное КП');
  await inbox.getByRole('button', { name: 'Открыть полную ЭЦП' }).click();
  await expect(page.getByTestId('document-signing')).toContainText('Серверная проверка ЭЦП не настроена');
});
