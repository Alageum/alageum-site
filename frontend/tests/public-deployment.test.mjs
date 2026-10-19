import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { NextRequest } from 'next/server.js';
import { deploymentMode } from '../lib/deployment/config.js';
import { publicRoutePolicy } from '../lib/deployment/publicMode.js';

test('public deployment is explicit and rejects a backend or CMS preview configuration', () => {
  assert.equal(deploymentMode({}), 'connected');
  assert.equal(deploymentMode({ ALAGEUM_PUBLIC_ONLY: '0' }), 'connected');
  assert.equal(deploymentMode({ ALAGEUM_PUBLIC_ONLY: '1' }), 'public-only');
  for (const bad of [
    { ALAGEUM_PUBLIC_ONLY: 'yes' },
    { API_INTERNAL_BASE_URL: 'https://backend.example/api/v1' },
    { NEXT_PUBLIC_API_URL: 'https://backend.example/api/v1' },
    { NEXT_PUBLIC_CATALOG_SOURCE: 'api' }, { COMPANY_SOURCE: 'cms' }, { PAGES_STATIC_PREVIEW: '1' },
  ]) assert.throws(() => deploymentMode({ ALAGEUM_PUBLIC_ONLY: '1', ...bad }));
});
test('public route policy covers localized and encoded private routes, preserving local drafts and public assets', () => {
  for (const prefix of ['', '/ru', '/kk', '/en']) {
    for (const path of ['/login', '/account', '/register', '/verify-email', '/forgot-password', '/reset-password', '/b2b/quotes', '/admin/catalog', '/cms', '/ai', '/pages/ru/about']) assert.equal(publicRoutePolicy(prefix + path), 'unavailable');
    assert.equal(publicRoutePolicy(prefix + '/api/v1/auth/browser-login'), 'api');
  }
  assert.equal(publicRoutePolicy('/catalog', '?source=api'), 'unavailable');
  assert.equal(publicRoutePolicy('/selection', '?source=api'), 'unavailable');
  assert.equal(publicRoutePolicy('/catalog/10000000-0000-4000-8000-000000000001'), 'unavailable');
  assert.equal(publicRoutePolicy('/%61ccount'), 'unavailable');
  assert.equal(publicRoutePolicy('/account%2fanything'), 'unavailable');
  assert.equal(publicRoutePolicy('/%bad'), 'api');
  for (const path of ['/', '/company', '/catalog', '/catalog/cat-ktpbk', '/selection', '/client', '/client/projects', '/client/support', '/inquiry', '/careers/apply', '/documents', '/brand/alageum.svg', '/accounting']) assert.equal(publicRoutePolicy(path), 'public');
});
test('actual Next proxy redirects private reads and refuses writes without forwarding credentials', async () => {
  const previous = process.env.NEXT_PUBLIC_SITE_MODE;
  process.env.NEXT_PUBLIC_SITE_MODE = 'public-only';
  try {
    const source = (await fs.readFile(new URL('../proxy.js', import.meta.url), 'utf8'))
      .replace("'next/server'", JSON.stringify(new URL('../node_modules/next/server.js', import.meta.url).href))
      .replace("'./lib/i18n/routing'", JSON.stringify(new URL('../lib/i18n/routing.js', import.meta.url).href))
      .replace("'./lib/deployment/publicMode'", JSON.stringify(new URL('../lib/deployment/publicMode.js', import.meta.url).href));
    const { proxy } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    for (const path of ['/login?next=%2Fb2b', '/en/account?token=never-reflect', '/admin/catalog', '/pages/ru/about']) {
      const response = proxy(new NextRequest(`https://example.test${path}`));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('location'), `https://example.test${path.startsWith('/en/') ? '/en' : ''}/service-unavailable`);
      assert.equal(response.headers.get('x-middleware-rewrite'), null);
    }
    for (const path of ['/api/v1/auth/browser-login', '/en/api/test', '/b2b/quotes']) {
      const response = proxy(new NextRequest(`https://example.test${path}`, { method: 'POST', body: '{}' }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, 'service_unavailable');
      assert.equal(response.headers.get('x-middleware-rewrite'), null);
    }
    assert.equal(proxy(new NextRequest('https://example.test/catalog')).headers.get('x-middleware-next'), '1');
    assert.equal(proxy(new NextRequest('https://example.test/healthz')).headers.get('set-cookie'), null);
    process.env.NEXT_PUBLIC_SITE_MODE = 'connected';
    assert.equal(proxy(new NextRequest('https://example.test/login')).headers.get('x-middleware-next'), '1');
    assert.equal(proxy(new NextRequest('https://example.test/healthz')).headers.get('set-cookie'), null);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_MODE; else process.env.NEXT_PUBLIC_SITE_MODE = previous; }
});
test('public-mode API clients fail before network or credential use', async () => {
  const previous = process.env.NEXT_PUBLIC_SITE_MODE, oldFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SITE_MODE = 'public-only';
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('network must remain unused'); };
  try {
    const { apiFetch } = await import('../lib/api/client.js');
    const { authProviders, passwordBrowserLogin } = await import('../lib/api/federated.js');
    for (const invoke of [() => apiFetch('/auth/account'), () => authProviders(), () => passwordBrowserLogin('synthetic@example.test', 'synthetic', undefined)]) {
      await assert.rejects(invoke(), error => error.status === 503 && error.code === 'service_unavailable');
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = oldFetch; if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_MODE; else process.env.NEXT_PUBLIC_SITE_MODE = previous; }
});
test('explicit public mode retains an honest unavailable page without credential forms', async () => {
  const page = await fs.readFile(new URL('../app/service-unavailable/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /<form|as="form"|onSubmit|type="password"/);
});
