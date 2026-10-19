import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInThisContext } from 'node:vm';
import { expect } from '@playwright/test';
import { login } from '../lib/api/auth.js';
import { apiFetch, getSession } from '../lib/api/client.js';

const origin = 'http://127.0.0.1:3135';
const source = readFileSync(new URL('../e2e/quotes.spec.js', import.meta.url), 'utf8');
// Execute the actual spec's fixtures without registering its browser tests.
// These checks exercise the route mock, not a second copy of its contract.
const fixtureSource = source.slice(0, source.indexOf("\ntest('login stays")).replace(/^import .*;\n/gm, '');
const fixtures = runInThisContext(`(function(expect, test, randomBytes, randomUUID) {
${fixtureSource}
return { api, seed, mockPassword, orgId, userId, quoteId, productId };
})`)(expect, { info: () => ({ project: { use: { baseURL: origin } } }) }, randomBytes, randomUUID);

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}
async function browser(options = {}) {
  const previous = Object.fromEntries(['window', 'sessionStorage', 'localStorage', 'fetch'].map(key => [key, globalThis[key]]));
  const jar = new Map(), scripts = [], calls = [];
  let handler;
  const page = {
    context: () => ({ addCookies: async cookies => { for (const cookie of cookies) jar.set(cookie.name, cookie); } }),
    route: async (pattern, next) => { assert.equal(pattern, '**/api/v1/**'); handler = next; },
    addInitScript: async (callback, args) => { scripts.push(() => callback(args)); },
  };
  const dispatch = async (path, { method = 'GET', body, headers = {}, url } = {}) => {
    headers = { ...(!['GET', 'HEAD'].includes(method) ? { origin } : {}), cookie: [...jar.values()].map(cookie => `${cookie.name}=${cookie.value}`).join('; '), ...headers };
    calls.push({ path, method, headers, body });
    let response;
    await handler({
      request: () => ({ url: () => url || `${origin}/api/v1${path}`, method: () => method, allHeaders: async () => headers, postDataJSON: () => body }),
      fulfill: async value => { response = value; },
      abort: async () => { throw new TypeError('Mock network failure after acceptance'); },
    });
    assert.ok(response, `No mocked response for ${path}`);
    return new Response(response.status === 204 ? null : JSON.stringify(response.json ?? {}), {
      status: response.status ?? 200, headers: { 'content-type': 'application/json', ...response.headers },
    });
  };
  globalThis.window = Object.assign(new EventTarget(), { location: { origin } });
  globalThis.sessionStorage = storage(); globalThis.localStorage = storage();
  globalThis.fetch = (url, options = {}) => dispatch(new URL(url, origin).pathname.replace('/api/v1', ''), {
    url: new URL(url, origin).href, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined,
    headers: Object.fromEntries(new Headers(options.headers)),
  });
  const requests = await fixtures.api(page, options);
  return {
    page, jar, calls, requests, dispatch, runScripts: () => scripts.forEach(run => run()),
    restore() { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}
const signIn = email => login(email || 'buyer@demo.example', fixtures.mockPassword);
const headersFor = sessionId => ({ 'x-browser-session': sessionId, 'x-organization-id': fixtures.orgId });
const quoteBody = { comment: 'Project', items: [{ product_id: fixtures.productId, quantity: 3 }] };

test('quote seed installs public marker and separate HttpOnly cookie without resurrecting expired login', async () => {
  const mock = await browser();
  try {
    await fixtures.seed(mock.page); mock.runScripts();
    const marker = JSON.parse(sessionStorage.getItem('alageum_session'));
    assert.deepEqual(Object.keys(marker).sort(), ['access_token', 'browser_session', 'organization_id']);
    assert.equal(marker.access_token, `browser:${marker.browser_session}`);
    assert.equal(marker.organization_id, fixtures.orgId); assert.deepEqual(getSession(), marker);
    const cookie = mock.jar.get('alageum_dev_session');
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.url, `${origin}/`);
    assert.match(cookie.value, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!JSON.stringify([...sessionStorage.values]).includes(cookie.value));
    assert.equal((await mock.dispatch('/auth/me', { headers: headersFor(marker.browser_session) })).status, 200);
    sessionStorage.removeItem('alageum_session'); mock.runScripts();
    assert.equal(sessionStorage.getItem('alageum_session'), null);
  } finally { mock.restore(); }
});

test('real auth coordinator completes mock prepare/login/me with public-only browser storage', async () => {
  const mock = await browser();
  try {
    assert.equal((await signIn()).user.id, fixtures.userId);
    assert.deepEqual(mock.calls.map(call => call.path), ['/auth/browser-prepare', '/auth/browser-login', '/auth/me']);
    const [prepare, accepted, me] = mock.calls;
    assert.equal(prepare.headers.origin, origin); assert.equal(accepted.headers.origin, origin);
    assert.equal(accepted.body.email, 'buyer@demo.example'); assert.equal(accepted.body.password, fixtures.mockPassword);
    assert.match(accepted.body.flow_id, /^[0-9a-f-]{36}$/);
    const marker = getSession();
    assert.equal(me.headers['x-browser-session'], marker.browser_session);
    assert.ok(mock.calls.every(call => !call.headers.authorization));
    assert.deepEqual(JSON.parse(sessionStorage.getItem('alageum_session')), marker);
    assert.equal(marker.refresh_token, undefined);
    for (const cookie of mock.jar.values()) assert.ok(!sessionStorage.getItem('alageum_session').includes(cookie.value));
    assert.equal((await mock.dispatch('/auth/browser-login', { method: 'POST', body: accepted.body })).status, 401);
    await signIn('second@demo.example');
    assert.notEqual(getSession().browser_session, marker.browser_session);
    assert.equal((await mock.dispatch('/auth/me', { headers: headersFor(marker.browser_session) })).status, 401);
    assert.equal((await apiFetch('/auth/me')).user.email, 'second@demo.example');
  } finally { mock.restore(); }
});

test('quote mock enforces origin, cookie/boundary and tenant, and refuses legacy endpoints', async () => {
  const mock = await browser();
  try {
    for (const badOrigin of ['https://other.example', undefined]) assert.equal((await mock.dispatch('/auth/browser-prepare', { method: 'POST', headers: { origin: badOrigin } })).status, 403);
    await signIn();
    const headers = headersFor(getSession().browser_session);
    for (const invalid of [{ ...headers, cookie: '' }, { ...headers, 'x-browser-session': randomUUID() }, { ...headers, 'x-browser-session': undefined }]) {
      assert.equal((await mock.dispatch('/auth/me', { headers: invalid })).status, 401);
    }
    assert.equal((await mock.dispatch('/quotes?mine=true', { headers: { ...headers, 'x-organization-id': randomUUID() } })).status, 403);
    assert.equal((await mock.dispatch('/quotes/catalog', { method: 'POST', headers: { ...headers, origin: 'https://other.example' }, body: quoteBody })).status, 403);
    assert.equal(mock.requests.length, 0);
    for (const path of ['/auth/login', '/auth/refresh']) await assert.rejects(mock.dispatch(path, { method: 'POST' }), /Unexpected legacy browser auth request/);
    await assert.rejects(mock.dispatch('/auth/me', { headers: { ...headers, authorization: 'Bearer legacy' } }), /toBeUndefined/);
    await assert.rejects(mock.dispatch('/catalog/products', { url: 'http://127.0.0.1:8000/api/v1/catalog/products' }), /toBe/);
  } finally { mock.restore(); }
});

test('prepare is latest-flow only, credentials explicit, and old cancellation leaves newer flow valid', async () => {
  const mock = await browser();
  try {
    const prepare = async () => (await (await mock.dispatch('/auth/browser-prepare', { method: 'POST', body: {} })).json()).flow_id;
    const first = await prepare(), second = await prepare();
    const body = { email: 'buyer@demo.example', password: fixtures.mockPassword, flow_id: first };
    assert.equal((await mock.dispatch('/auth/browser-login', { method: 'POST', body })).status, 401);
    await mock.dispatch('/auth/browser-cancel', { method: 'POST', body: { flow_id: first } });
    body.flow_id = second;
    assert.equal((await mock.dispatch('/auth/browser-login', { method: 'POST', body: { ...body, password: '' } })).status, 401);
    assert.equal((await mock.dispatch('/auth/browser-login', { method: 'POST', body, headers: { origin: 'https://other.example' } })).status, 403);
    assert.equal((await mock.dispatch('/auth/browser-login', { method: 'POST', body, headers: { cookie: '' } })).status, 401);
    const accepted = await mock.dispatch('/auth/browser-login', { method: 'POST', body });
    assert.equal(accepted.status, 200); assert.deepEqual(Object.keys(await accepted.json()).sort(), ['session_id', 'user']);
  } finally { mock.restore(); }
});

test('uncertain-save mock retains acceptance and identical retry request/key', async () => {
  const mock = await browser({ failures: 1 });
  try {
    await signIn();
    const options = { method: 'POST', headers: { ...headersFor(getSession().browser_session), 'idempotency-key': randomUUID() }, body: quoteBody };
    await assert.rejects(mock.dispatch('/quotes/catalog', options), /Mock network failure/);
    assert.equal((await mock.dispatch('/quotes/catalog', options)).status, 200);
    assert.equal(mock.requests.length, 2); assert.deepEqual(mock.requests[1], mock.requests[0]);
  } finally { mock.restore(); }
});

test('expired quote mutation is recorded once and fresh login permits identical retry', async () => {
  const mock = await browser({ expireOnce: true });
  try {
    await signIn();
    const options = { method: 'POST', headers: { ...headersFor(getSession().browser_session), 'idempotency-key': randomUUID() }, body: quoteBody };
    assert.equal((await mock.dispatch('/quotes/catalog', options)).status, 401);
    await signIn(); options.headers['x-browser-session'] = getSession().browser_session;
    assert.equal((await mock.dispatch('/quotes/catalog', options)).status, 200);
    assert.equal(mock.requests.length, 2); assert.deepEqual(mock.requests[1], mock.requests[0]);
  } finally { mock.restore(); }
});

test('in-flight accepted quote remains owned by original account after newer login', async () => {
  let release;
  const waitForSubmission = new Promise(resolve => { release = resolve; });
  const mock = await browser({ waitForSubmission, expireListOnce: true });
  try {
    await signIn();
    const old = getSession().browser_session;
    const pending = mock.dispatch('/quotes/catalog', { method: 'POST', headers: headersFor(old), body: quoteBody });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(mock.requests.length, 1);
    assert.equal((await mock.dispatch('/quotes?mine=true', { headers: headersFor(old) })).status, 401);
    await signIn('second@demo.example');
    release(); assert.equal((await pending).status, 201);
    const own = await (await mock.dispatch('/quotes?mine=true', { headers: headersFor(getSession().browser_session) })).json();
    assert.deepEqual(own.items, []); assert.equal(own.total, 0);
  } finally { release(); mock.restore(); }
});
