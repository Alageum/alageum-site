import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { plainText } = require('../../backend-node/tests/helpers/local-smtp-capture.js');
const [work, results, phase] = process.argv.slice(2);
assert.ok(path.isAbsolute(work) && path.isAbsolute(results));
assert.ok(['initial', 'recreated', 'restored', 'reset'].includes(phase));
const origin = 'https://site.example.test';
const ca = fs.readFileSync(path.join(work, 'ca/cert.pem'));
const stateFile = path.join(work, 'account-state.json');
const state = phase === 'initial' ? { email: 'compose-proof@example.test', password: 'Synthetic-compose-password!', cookies: {}, boundary: '' }
  : JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const reportFile = path.join(results, 'checks.json');
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {
  schema_version: 1, commit: process.env.GITHUB_SHA,
  environment: 'disposable_github_hosted_runner', production_cutover_approved: false, checks: [],
};
function passed(name) {
  report.checks.push({ name, status: 'passed' });
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(`Passed: ${name}`);
}
async function raw(route, { method = 'GET', body, headers = {}, tlsOptions = {} } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port: 443, servername: 'site.example.test', ca,
      path: route, method, ...tlsOptions, headers: { Host: 'site.example.test', ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('HTTPS proof timeout'))); req.end(payload);
  });
}
async function api(route, { method = 'GET', body, expected = 200, sentOrigin = origin, boundary = state.boundary } = {}) {
  const response = await raw(`/api/v1${route}`, { method, body, headers: {
    Origin: sentOrigin, Cookie: Object.entries(state.cookies).map(([key, value]) => `${key}=${value}`).join('; '),
    ...(boundary ? { 'X-Browser-Session': boundary } : {}),
  } });
  assert.equal(response.status, expected, `${method} ${route} status`);
  assert.match(response.headers['strict-transport-security'] || '', /max-age=31536000/);
  for (const cookie of response.headers['set-cookie'] || []) {
    assert.ok(/;\s*secure/i.test(cookie), 'Cookie must be Secure');
    assert.ok(/;\s*httponly/i.test(cookie), 'Cookie must be HttpOnly');
    assert.ok(/;\s*samesite=lax/i.test(cookie), 'Cookie must be SameSite=Lax');
    assert.ok(/;\s*path=\/(?:;|$)/i.test(cookie), 'Cookie must use root path');
    assert.ok(!/;\s*domain=/i.test(cookie), 'Cookie must be host-only');
    const pair = cookie.split(';', 1)[0], at = pair.indexOf('=');
    state.cookies[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return response.text ? JSON.parse(response.text) : null;
}
async function mailToken(route) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const messages = JSON.parse(fs.readFileSync(path.join(work, 'capture/messages.json'), 'utf8'));
    for (const message of messages) {
      assert.equal(message.secure, true, 'Mail must use verified STARTTLS');
      assert.deepEqual(message.recipients, [state.email]);
      for (const match of plainText(message).matchAll(/https:\/\/site\.example\.test\/[^\s]+/g)) {
        const url = new URL(match[0]);
        if (url.pathname === route) {
          assert.equal(url.origin, origin);
          const token = new URLSearchParams(url.hash.slice(1)).get('token');
          assert.ok(/^[A-Za-z0-9_-]{64}$/.test(token), 'Expected a synthetic account token');
          return token;
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Locally captured TLS account mail did not arrive');
}
async function login() {
  const prepare = await api('/auth/browser-prepare', { method: 'POST', body: {} });
  const result = await api('/auth/browser-login', { method: 'POST', body: { email: state.email, password: state.password, flow_id: prepare.flow_id } });
  assert.ok(/^[a-f0-9-]{36}$/.test(result.session_id), 'Browser boundary must be an opaque UUID');
  state.boundary = result.session_id;
  assert.ok(state.cookies['__Host-alageum_session'], 'Host-only session cookie required');
  assert.equal(Object.hasOwn(result, 'access_token'), false);
}
if (phase === 'initial') {
  const health = await raw('/healthz');
  assert.equal(health.status, 200); assert.equal(JSON.parse(health.text).service, 'frontend');
  assert.equal((await api('/readiness')).database, 'ok');
  assert.equal((await api('/version')).environment, 'production');
  await assert.rejects(raw('/healthz', { tlsOptions: { ca: undefined } }), /certificate|issuer|self.signed/i);
  await assert.rejects(raw('/healthz', { tlsOptions: { servername: 'wrong.example.test' } }));
  const redirect = await new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: 80, path: '/healthz', headers: { Host: 'site.example.test' } }, res => {
      res.resume(); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('HTTP redirect timeout'))); req.on('error', reject);
  });
  assert.deepEqual(redirect, { status: 308, location: `${origin}/healthz` });
  passed('verified_https_frontend_liveness_backend_readiness_and_https_redirect');
  let cms = await raw('/cms');
  if ([301, 302, 307, 308].includes(cms.status)) {
    assert.ok(['/cms/', `${origin}/cms/`].includes(cms.headers.location)); cms = await raw('/cms/');
  }
  assert.equal(cms.status, 200); assert.match(cms.headers['content-type'], /text\/html/);
  assert.ok(/strapi/i.test(cms.text), 'Native CMS HTML is served at /cms');
  assert.ok(!cms.text.includes('/_next/'), 'Native CMS must not route to Next');
  const catalog = await raw('/admin/catalog');
  assert.equal(catalog.status, 200); assert.ok(catalog.text.includes('/_next/'), 'Business catalog admin must route to Next');
  const nativeAdmin = await raw('/admin/init');
  assert.equal(nativeAdmin.status, 200); assert.match(nativeAdmin.headers['content-type'], /json/);
  for (const blocked of ['/admin/register-admin', '/admin/register-admin/', '/admin/register-admin/child'])
    assert.equal((await raw(blocked, { method: 'POST', body: {} })).status, 404, 'Public first-admin creation is denied');
  passed('native_cms_admin_api_and_next_catalog_routes_are_distinct');
  await api('/auth/register', { method: 'POST', expected: 202,
    body: { email: state.email, password: state.password, display_name: 'Synthetic Compose customer' } });
  await api('/auth/verify-email', { method: 'POST', body: { token: await mailToken('/verify-email') } });
  await login();
  const account = await api('/auth/account');
  assert.equal(account.user.email, state.email); assert.equal(account.onboarding_status, 'no_company');
  assert.deepEqual(account.permissions, []);
  await api('/auth/me', { expected: 403 });
  await api('/auth/account', { expected: 401, boundary: '' });
  await api('/auth/browser-logout', { method: 'POST', body: {}, sentOrigin: 'https://evil.example.test', expected: 403 });
  assert.equal((await api('/auth/account')).user.email, state.email);
  passed('same_origin_signup_real_tls_mail_verification_secure_cookie_and_csrf_boundaries');
} else if (phase === 'reset') {
  await api('/auth/forgot-password', { method: 'POST', body: { email: state.email }, expected: 202 });
  const token = await mailToken('/reset-password');
  state.password = 'Changed-synthetic-compose-password!';
  await api('/auth/reset-password', { method: 'POST', body: { token, password: state.password } });
  await api('/auth/account', { expected: 401 });
  await login(); await api('/auth/browser-logout', { method: 'POST', body: {}, expected: 204 });
  await api('/auth/account', { expected: 401 });
  passed('restored_stack_tls_reset_mail_revokes_old_cookie_and_new_login_logout_work');
} else {
  assert.equal((await api('/readiness')).database, 'ok');
  assert.equal((await api('/auth/account')).user.email, state.email);
  const media = await raw('/uploads/server-proof.png');
  assert.equal(media.status, 200); assert.match(media.headers['content-type'], /image\/png/);
  const hidden = await raw('/private-quarantine/server-proof.bin');
  assert.equal(hidden.status, 404);
  passed(phase === 'recreated' ? 'database_cookie_and_public_media_survive_container_recreation'
    : 'paired_database_media_restore_preserves_verified_identity_session_and_public_media');
}
fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
