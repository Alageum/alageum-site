import assert from 'node:assert/strict';
import test from 'node:test';
import { apiFetch, getSession, setSession } from '../lib/api/client.js';
import { getSessionGeneration } from '../lib/api/sessionTransport.js';
import { login, selectOrganization } from '../lib/api/auth.js';
import { getOrganizationMemberships } from '../lib/api/organizations.js';
import { organizationContentBoundary, organizationDestination } from '../lib/organizations/navigation.js';
const orgA = '10000000-0000-4000-8000-000000000001', orgB = '10000000-0000-4000-8000-000000000002';
const sessionA = { access_token: 'a', refresh_token: 'ra', organization_id: orgA };
const sessionB = { access_token: 'b', refresh_token: 'rb', organization_id: orgB };
const profile = (id = orgA, permissions = []) => ({ user: { id: 'user-a' }, organization: { id, name: 'Same display name' }, permissions });
const member = (id, index = 0) => ({ id: `membership-${index}`, organization_id: id, organization_name: 'Same display name', role_id: `role-${index}`, role_name: 'Member', permissions: [] });
const page = (items, total = items.length, number = 1) => ({ items, total, page: number, page_size: 100 });
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const denied = (code = 'organization_access_denied') => response(code === 'organization_required' ? 400 : 403, { error: { code } });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function browser(fetcher) {
  const old = { window: globalThis.window, storage: globalThis.sessionStorage, fetch: globalThis.fetch }, data = new Map(), events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  globalThis.sessionStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  globalThis.fetch = fetcher;
  return { events, restore() { globalThis.window = old.window; globalThis.sessionStorage = old.storage; globalThis.fetch = old.fetch; } };
}

test('candidate header validates a new membership without changing the active session before success', async () => {
  const pending = deferred(), calls = [], env = browser(async (url, options) => { calls.push({ url, options }); return pending.promise; });
  try {
    setSession(sessionA); const generation = getSessionGeneration();
    const choosing = selectOrganization(orgB, { expectedGeneration: generation });
    assert.deepEqual(getSession(), sessionA);
    assert.equal(calls[0].url.endsWith('/auth/me'), true);
    assert.equal(calls[0].options.headers.get('X-Organization-ID'), orgB);
    assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer a');
    pending.resolve(response(200, profile(orgB, ['quote.read'])));
    assert.deepEqual(await choosing, profile(orgB, ['quote.read']));
    assert.equal(getSession().organization_id, orgB); assert.notEqual(getSessionGeneration(), generation);
  } finally { env.restore(); }
});

test('revoked membership or role between list and choice keeps the original organization and grants', async () => {
  const env = browser(async () => denied());
  try { setSession(sessionA); await assert.rejects(selectOrganization(orgB), { status: 403 }); assert.deepEqual(getSession(), sessionA); }
  finally { env.restore(); }
});

test('candidate with an unexpected tenant response is rejected before commit', async () => {
  const env = browser(async () => response(200, profile(orgA)));
  try { setSession(sessionA); await assert.rejects(selectOrganization(orgB), { code: 'invalid_organization_context' }); assert.deepEqual(getSession(), sessionA); }
  finally { env.restore(); }
});

test('cancelled candidate cannot commit even if the server ignores abort', async () => {
  const pending = deferred(), controller = new AbortController(), env = browser(async () => pending.promise);
  try {
    setSession(sessionA); const choosing = selectOrganization(orgB, { signal: controller.signal });
    controller.abort(); pending.resolve(response(200, profile(orgB)));
    await assert.rejects(choosing, { code: 'session_changed' }); assert.deepEqual(getSession(), sessionA);
  } finally { env.restore(); }
});

test('newest selection wins even when an older validation returns first', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const env = browser(async () => ++calls === 1 ? first.promise : second.promise);
  try {
    setSession(sessionA); const older = selectOrganization(orgB), newer = selectOrganization(orgA);
    first.resolve(response(200, profile(orgB))); await assert.rejects(older, { code: 'session_changed' });
    second.resolve(response(200, profile(orgA))); await newer; assert.equal(getSession().organization_id, orgA);
  } finally { env.restore(); }
});

test('selection snapshot cannot apply to a newer login, including an identical account and token pair', async () => {
  let calls = 0; const env = browser(async () => { calls++; return response(200, profile(orgB)); });
  try {
    setSession(sessionA); const expectedGeneration = getSessionGeneration(); setSession(sessionA);
    await assert.rejects(selectOrganization(orgB, { expectedGeneration }), { code: 'session_changed' });
    assert.equal(calls, 0); assert.deepEqual(getSession(), sessionA);
  } finally { env.restore(); }
});

test('candidate can refresh a current login and still uses the candidate tenant on the retried read', async () => {
  const headers = [];
  const env = browser(async (url, options) => {
    if (url.endsWith('/auth/refresh')) { assert.equal(JSON.parse(options.body).refresh_token, 'ra'); return response(200, { access_token: 'rotated', refresh_token: 'rr' }); }
    headers.push(options.headers.get('X-Organization-ID'));
    return options.headers.get('Authorization') === 'Bearer rotated' ? response(200, profile(orgB)) : response(401);
  });
  try {
    setSession(sessionA); await selectOrganization(orgB);
    assert.deepEqual(headers, [orgB, orgB]); assert.deepEqual(getSession(), { access_token: 'rotated', refresh_token: 'rr', organization_id: orgB });
  } finally { env.restore(); }
});

test('expired candidate login clears expired credentials without choosing a fallback tenant', async () => {
  const calls = [], env = browser(async url => { calls.push(url); return response(401); });
  try {
    setSession(sessionA); await assert.rejects(selectOrganization(orgB), { status: 401 });
    assert.equal(calls.length, 2); assert.deepEqual(getSession(), {});
  } finally { env.restore(); }
});

test('invalid selection IDs are rejected without a request or display-name lookup', async () => {
  let calls = 0; const env = browser(async () => { calls++; return response(200); });
  try { setSession(sessionA); await assert.rejects(selectOrganization('Same display name'), { code: 'invalid_organization' }); assert.equal(calls, 0); }
  finally { env.restore(); }
});

test('membership listing reads all pages, preserving distinct identities with duplicate names', async () => {
  const members = Array.from({ length: 101 }, (_, i) => member(`10000000-0000-4000-8000-${String(i).padStart(12, '0')}`, i));
  const calls = [], env = browser(async url => { calls.push(url); return response(200, url.includes('page=1&') ? page(members.slice(0, 100), 101) : page(members.slice(100), 101, 2)); });
  try { setSession(sessionA); assert.deepEqual(await getOrganizationMemberships(), members); assert.equal(calls.length, 2); }
  finally { env.restore(); }
});

test('changed totals or duplicate organization IDs fail closed instead of hiding a membership', async () => {
  const members = Array.from({ length: 100 }, (_, i) => member(`org-${i}`, i));
  for (const tail of [page([member('last')], 102, 2), page([members[0]], 101, 2)]) {
    const env = browser(async url => response(200, url.includes('page=1&') ? page(members, 101) : tail));
    try { setSession(sessionA); await assert.rejects(getOrganizationMemberships(), { code: 'invalid_memberships' }); }
    finally { env.restore(); }
  }
});

test('multi-membership login returns choices without silently selecting equal display names', async () => {
  const pair = { access_token: 'new', refresh_token: 'new-refresh' }, members = [member(orgA), member(orgB, 1)];
  const env = browser(async url => url.endsWith('/auth/login') ? response(200, pair) : url.endsWith('/auth/me') ? denied('organization_required') : response(200, page(members)));
  try {
    setSession(sessionB); const result = await login('test@example.test', 'fixture');
    assert.equal(result.requiresOrganization, true); assert.deepEqual(result.memberships, members);
    assert.equal(result.sessionGeneration, getSessionGeneration()); assert.deepEqual(getSession(), pair);
  } finally { env.restore(); }
});

test('zero-membership login reports empty choices and never restores the prior account', async () => {
  const pair = { access_token: 'none', refresh_token: 'none-refresh' };
  const env = browser(async url => url.endsWith('/auth/login') ? response(200, pair) : url.endsWith('/auth/me') ? denied() : response(200, page([])));
  try {
    setSession(sessionB); const result = await login('test@example.test', 'fixture');
    assert.equal(result.requiresOrganization, true); assert.deepEqual(result.memberships, []); assert.deepEqual(getSession(), pair);
  } finally { env.restore(); }
});

test('one available listed membership is revalidated rather than trusted for grants', async () => {
  const pair = { access_token: 'new', refresh_token: 'new-refresh' }; let meCalls = 0;
  const env = browser(async (url, options) => {
    if (url.endsWith('/auth/login')) return response(200, pair);
    if (url.endsWith('/auth/me')) {
      if (++meCalls === 1) return denied('organization_required');
      assert.equal(options.headers.get('X-Organization-ID'), orgA); return response(200, profile(orgA, ['quote.read']));
    }
    return response(200, page([{ ...member(orgA), permissions: ['organization.profile.update'] }]));
  });
  try { const result = await login('test@example.test', 'fixture'); assert.deepEqual(result.permissions, ['quote.read']); assert.equal(getSession().organization_id, orgA); }
  finally { env.restore(); }
});

for (const [name, replacement] of [['tenant', { ...sessionA, organization_id: orgB }], ['account', sessionB], ['same-account login', sessionA]]) {
  test(`late successful resource mutation cannot run its continuation after a ${name} boundary`, async () => {
    const pending = deferred(), env = browser(async () => pending.promise); let navigations = 0;
    try {
      setSession(sessionA);
      const request = apiFetch('/support/tickets', { method: 'POST', body: '{}' }).then(() => { navigations++; });
      setSession(replacement); pending.resolve(response(201, { id: 'old-resource' }));
      await assert.rejects(request, { code: 'session_changed' }); assert.equal(navigations, 0); assert.deepEqual(getSession(), replacement);
    } finally { env.restore(); }
  });
}

test('a context change during JSON parsing blocks the successful continuation', async () => {
  const body = deferred(), started = deferred();
  const env = browser(async () => ({ status: 200, ok: true, json: async () => { started.resolve(); return body.promise; } }));
  try { setSession(sessionA); const read = apiFetch('/quotes'); await started.promise; setSession(sessionB); body.resolve({ private: 'old' }); await assert.rejects(read, { code: 'session_changed' }); }
  finally { env.restore(); }
});

test('late 204 success is guarded too', async () => {
  const pending = deferred(), env = browser(async () => pending.promise);
  try { setSession(sessionA); const deletion = apiFetch('/resource', { method: 'DELETE' }); setSession(sessionB); pending.resolve(response(204)); await assert.rejects(deletion, { code: 'session_changed' }); }
  finally { env.restore(); }
});

test('an ordinary token refresh does not suppress an in-flight success from the same login and tenant', async () => {
  const pending = deferred(), env = browser(async () => pending.promise);
  try {
    setSession(sessionA); const read = apiFetch('/quotes'); const generation = getSessionGeneration();
    setSession({ ...sessionA, access_token: 'rotated', refresh_token: 'rr' }, { preserveGeneration: true });
    pending.resolve(response(200, { ok: true })); assert.deepEqual(await read, { ok: true }); assert.equal(getSessionGeneration(), generation);
  } finally { env.restore(); }
});

test('all private mutation methods require explicit retry after 401 and never refresh or replay', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    let calls = 0; const env = browser(async () => { calls++; return response(401); });
    try { setSession(sessionA); await assert.rejects(apiFetch('/resource', { method }), { status: 401 }); assert.equal(calls, 1); assert.deepEqual(getSession(), {}); }
    finally { env.restore(); }
  }
});

test('a newer login attempt prevents an older candidate selection from committing', async () => {
  const candidate = deferred(), nextLogin = deferred();
  const env = browser(async url => url.endsWith('/auth/login') ? nextLogin.promise : candidate.promise);
  try {
    setSession(sessionA); const choosing = selectOrganization(orgB);
    const signingIn = login('new@example.test', 'fixture');
    candidate.resolve(response(200, profile(orgB)));
    await assert.rejects(choosing, { code: 'session_changed' }); assert.deepEqual(getSession(), sessionA);
    nextLogin.resolve(response(401)); await assert.rejects(signingIn, { status: 401 });
  } finally { env.restore(); }
});

test('a late 401 after a parallel read refreshed tokens retries within the same login only', async () => {
  const delayed = deferred(), calls = [];
  const env = browser(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/first') && options.headers.get('Authorization') === 'Bearer a') return delayed.promise;
    if (url.endsWith('/auth/refresh')) return response(200, { access_token: 'rotated', refresh_token: 'rr' });
    if (options.headers.get('Authorization') === 'Bearer a') return response(401);
    return response(200, { ok: true });
  });
  try {
    setSession(sessionA); const first = apiFetch('/first'); await apiFetch('/second');
    delayed.resolve(response(401)); assert.deepEqual(await first, { ok: true });
    assert.equal(calls.filter(call => call.url.endsWith('/auth/refresh')).length, 1);
    assert.equal(getSession().organization_id, orgA);
  } finally { env.restore(); }
});

test('fresh stale-session detail recovery gates an old record before the first valid profile mounts', () => {
  const oldPath = `/b2b/orders/${orgA}`;
  const initial = { key: null, blockedPath: null, sessionGeneration: 7 };
  assert.equal(organizationContentBoundary(initial, null, 7, oldPath), initial);
  const recovered = organizationContentBoundary(initial, 'user:b:new-login', 8, oldPath);
  assert.equal(recovered.blockedPath, oldPath);
  assert.equal(organizationDestination(oldPath), '/b2b/orders');
});

test('restored valid sessions and approved initial-login detail returns keep their record route', () => {
  for (const generation of [0, 9]) {
    const initial = { key: null, blockedPath: null, sessionGeneration: generation };
    const installed = organizationContentBoundary(initial, 'current-profile', generation, `/b2b/quotes/${orgA}`);
    assert.equal(installed.blockedPath, null);
    assert.equal(organizationContentBoundary(installed, 'current-profile', generation, '/b2b/profile'), installed);
  }
});
