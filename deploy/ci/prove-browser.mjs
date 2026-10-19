import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const [work, results] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(work, 'account-state.json'), 'utf8'));
const origin = 'https://site.example.test';
// NSS trusts the generated test CA in this isolated HOME. No TLS error bypass.
const browser = await chromium.launch({ env: { ...process.env, HOME: path.join(work, 'browser-home') },
  args: ['--host-resolver-rules=MAP site.example.test 127.0.0.1', '--no-proxy-server'] });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const apiRequests = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) apiRequests.push(request.url()); });
  assert.equal((await page.goto(`${origin}/login`)).status(), 200);
  await page.locator('input[type="email"]').fill(state.email);
  await page.locator('input[type="password"]').fill(state.password);
  await page.locator('form button').click();
  await page.waitForURL(`${origin}/account`, { timeout: 30000 });
  assert.ok(apiRequests.some(url => new URL(url).pathname === '/api/v1/auth/browser-login'));
  assert.ok(apiRequests.every(url => new URL(url).origin === origin), 'Every browser API request stays same-origin');
  const cookie = (await context.cookies()).find(item => item.name === '__Host-alageum_session');
  assert.ok(cookie, 'Chromium accepted the production session cookie');
  assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax');
  assert.equal(cookie.path, '/'); assert.equal(cookie.domain, 'site.example.test');
  assert.equal((await page.evaluate(() => document.cookie)).includes('__Host-alageum_session'), false);
  const cms = await context.newPage();
  const failedAssets = [];
  cms.on('response', response => {
    if (['script', 'stylesheet'].includes(response.request().resourceType()) && response.status() >= 400) failedAssets.push(response.status());
  });
  assert.equal((await cms.goto(`${origin}/cms`)).status(), 200);
  // Fresh native Strapi has the first-administrator form. Do not create one.
  await cms.locator('input').first().waitFor({ state: 'visible', timeout: 45000 });
  assert.equal(failedAssets.length, 0, 'Native CMS assets must load through HTTPS');
  await context.close();
  const file = path.join(results, 'checks.json'), report = JSON.parse(fs.readFileSync(file, 'utf8'));
  report.checks.push({ name: 'chromium_trusted_tls_real_login_cookie_same_origin_and_native_cms_assets', status: 'passed' });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log('Passed: Chromium real frontend login, same-origin cookies and native CMS assets');
} finally { await browser.close(); }
