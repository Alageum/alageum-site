import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, getSession, setSession, clearSession } from '../lib/api/client.js';
import { resumeFederatedLogin, logout } from '../lib/api/auth.js';
import { authProviders, startGoogle, prepareGoogle, cancelGoogle, federatedError } from '../lib/api/federated.js';
const sessionId = '10000000-0000-4000-8000-000000000001', otherId = '10000000-0000-4000-8000-000000000002';
const profile = { user: { id: 'user' }, organization: { id: otherId, name: 'Company' }, permissions: ['document.read'] };
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; }
function browser(fetcher) {
  const old = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch }, data = new Map();
  globalThis.window = { location: { origin: 'http://localhost:3000' }, dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  globalThis.fetch = fetcher;
  return () => { globalThis.window = old.window; globalThis.sessionStorage = old.sessionStorage; globalThis.fetch = old.fetch; };
}
test('callback requires expected public session boundary and sends HttpOnly cookie mode without bearer credentials', async () => {
  const calls = [], restore = browser(async (url, options) => { calls.push({ url, options });
    return response(200, url.includes('/auth/browser-session?') ? { session_id: sessionId, user: profile.user } : profile); });
  try {
    setSession({ access_token: 'old-token', refresh_token: 'old-refresh', organization_id: otherId });
    assert.deepEqual(await resumeFederatedLogin({ sessionId }), profile);
    assert.ok(calls[0].url.endsWith(`?session_id=${sessionId}`)); assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[1].options.headers.get('Authorization'), null); assert.equal(calls[1].options.headers.get('X-Browser-Session'), sessionId);
    assert.deepEqual(getSession(), { access_token: `browser:${sessionId}`, browser_session: sessionId, organization_id: otherId });
    assert.ok(!JSON.stringify(getSession()).includes('old-token'));
  } finally { restore(); }
});
test('new user with no memberships retains identity but receives no organization/permissions', async () => {
  const restore = browser(async url => {
    if (url.includes('/auth/browser-session?')) return response(200, { session_id: sessionId, user: profile.user });
    if (url.endsWith('/auth/me')) return response(403, { error: { code: 'organization_access_denied' } });
    return response(200, { items: [], total: 0, page: 1, page_size: 100 });
  });
  try { const result = await resumeFederatedLogin({ sessionId }); assert.equal(result.requiresOrganization, true); assert.deepEqual(result.memberships, []); assert.equal(getSession().organization_id, undefined); }
  finally { restore(); }
});
test('mismatching or missing callback session never bootstraps another account', async () => {
  let calls = 0; const restore = browser(async () => { calls++; return response(200, { session_id: otherId, user: profile.user }); });
  try {
    await assert.rejects(resumeFederatedLogin({}), { code: 'session_changed' }); assert.equal(calls, 0);
    await assert.rejects(resumeFederatedLogin({ sessionId }), /подтвердить сессию/); assert.deepEqual(getSession(), {});
  } finally { restore(); }
});
test('old profile 401 cannot invalidate callback bootstrap or the newer installed identity', async () => {
  const old = deferred(), session = deferred(); let meCalls = 0;
  const restore = browser(async url => {
    if (url.includes('/auth/browser-session?')) return session.promise;
    if (url.endsWith('/auth/me') && ++meCalls === 1) return old.promise;
    return response(200, profile);
  });
  try {
    setSession({ access_token: 'old-token' }); const stale = apiFetch('/auth/me');
    const current = resumeFederatedLogin({ sessionId }); old.resolve(response(401, { error: { code: 'invalid_token' } }));
    await assert.rejects(stale); session.resolve(response(200, { session_id: sessionId, user: profile.user }));
    assert.deepEqual(await current, profile); assert.equal(getSession().browser_session, sessionId);
  } finally { restore(); }
});
test('canceled or superseded browser-session response cannot replace a newer login', async () => {
  for (const cancel of [true, false]) {
    const pending = deferred(), controller = new AbortController(), restore = browser(async () => pending.promise);
    try {
      const result = resumeFederatedLogin({ sessionId, signal: controller.signal });
      if (cancel) controller.abort(); else setSession({ access_token: 'newer-token' });
      pending.resolve(response(200, { session_id: sessionId, user: profile.user }));
      await assert.rejects(result, { code: 'session_changed' }); assert.equal(getSession().access_token, cancel ? undefined : 'newer-token');
    } finally { restore(); }
  }
});
test('cookie logout uses dedicated endpoint and clears marker only after success', async () => {
  const calls = [], restore = browser(async (url, options) => { calls.push({ url, options }); return response(204); });
  try {
    setSession({ access_token: `browser:${sessionId}`, browser_session: sessionId }); await logout();
    assert.ok(calls[0].url.endsWith('/auth/browser-logout')); assert.equal(calls[0].options.headers.get('X-Browser-Session'), sessionId); assert.deepEqual(getSession(), {});
  } finally { restore(); }
});
test('provider availability does not create a flow; prepare and cancel are explicit same-origin POSTs', async () => {
  const calls = [], restore = browser(async (url, options) => { calls.push({ url, options });
    return response(200, url.endsWith('/auth/google/start') ? { authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' } : { flow_id: sessionId }); });
  try {
    await authProviders(); await prepareGoogle(); await startGoogle('https://evil.test', sessionId); await cancelGoogle(sessionId);
    assert.equal(calls[0].options.method, undefined); assert.equal(calls[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[2].options.body), { next: '/b2b', flow_id: sessionId }); assert.equal(calls[3].options.method, 'POST');
  } finally { restore(); }
});
test('untrusted authorization URL and reflected provider errors are rejected', async () => {
  const restore = browser(async () => response(200, { authorization_url: 'https://evil.test' }));
  try { await assert.rejects(startGoogle('/b2b', sessionId)); assert.ok(!federatedError('SECRET-error-description').includes('SECRET')); }
  finally { clearSession(); restore(); }
});

test('forged callback URL preserves a still-owned prior session after bootstrap rejection', async () => {
  const restore = browser(async () => response(401, { error: { code: 'authentication_required' } }));
  try {
    const prior = { access_token: 'valid-prior', refresh_token: 'valid-refresh', organization_id: otherId };
    setSession(prior); await assert.rejects(resumeFederatedLogin({ sessionId }), { status: 401 }); assert.deepEqual(getSession(), prior);
  } finally { restore(); }
});
test('stale browser logout 401 clears only the old tab marker', async () => {
  const restore = browser(async () => response(401, { error: { code: 'authentication_required' } }));
  try { setSession({ access_token: `browser:${sessionId}`, browser_session: sessionId }); await logout(); assert.deepEqual(getSession(), {}); }
  finally { restore(); }
});

test('interrupted callback suspension is document-local and never traps a reloaded tab', async () => {
  const pending = deferred(), controller = new AbortController(), restore = browser(async () => pending.promise);
  try {
    setSession({ access_token: 'valid-prior' });
    const result = resumeFederatedLogin({ sessionId, signal: controller.signal });
    assert.equal(getSession().federated_pending, true);
    assert.equal(JSON.parse(sessionStorage.getItem('alageum_session')).federated_pending, undefined);
    const freshDocument = await import(`../lib/api/sessionTransport.js?reload=${Date.now()}`);
    assert.deepEqual(freshDocument.getSession(), { access_token: 'valid-prior' });
    controller.abort(); pending.resolve(response(401, { error: { code: 'authentication_required' } }));
    await assert.rejects(result); assert.deepEqual(getSession(), { access_token: 'valid-prior' });
  } finally { restore(); }
});
