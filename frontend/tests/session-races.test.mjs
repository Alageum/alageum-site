import assert from 'node:assert/strict';
import test from 'node:test';
import { apiFetch, getSession, setSession } from '../lib/api/client.js';
import { createQuote } from '../lib/api/quotes.js';
import { updateOrganizationProfile } from '../lib/api/organizations.js';
import { getSessionGeneration } from '../lib/api/sessionTransport.js';
import { login } from '../lib/api/auth.js';
import { createCompanyProfileEditor, organizationProfileScope } from '../lib/organizations/profile.js';
const accountA = { access_token: 'access-a', refresh_token: 'refresh-a', organization_id: 'org-a' };
const accountB = { access_token: 'access-b', refresh_token: 'refresh-b', organization_id: 'org-b' };
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function browser(fetcher) {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch, data = new Map(), events = [];
  globalThis.window = { dispatchEvent: event => { if (event.type === 'alageum:session-expired') events.push(event.type); } };
  const oldStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  globalThis.fetch = fetcher;
  return { events, restore() { globalThis.window = oldWindow; globalThis.fetch = oldFetch; globalThis.sessionStorage = oldStorage; } };
}
test('catalogue POST never auto-retries or refreshes after 401, preserving a newer account', async () => {
  const pending = deferred(), calls = [], env = browser(async (url, options) => { calls.push({ url, options }); return pending.promise; });
  try {
    setSession(accountA);
    const post = createQuote({ comment: 'private-a', items: [] }, 'request-a');
    setSession(accountB); pending.resolve(response(401));
    await assert.rejects(post, { status: 401 });
    assert.equal(calls.length, 1); assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer access-a');
    assert.deepEqual(getSession(), accountB); assert.deepEqual(env.events, []);
  } finally { env.restore(); }
});

test('profile PATCH sends the version once, never refreshes, and preserves a newer login', async () => {
  const pending = deferred(), calls = [], env = browser(async (url, options) => { calls.push({ url, options }); return pending.promise; });
  try {
    setSession(accountA);
    const save = updateOrganizationProfile({ version: 3, name: 'Private company A' });
    setSession(accountB); pending.resolve(response(401));
    await assert.rejects(save, { status: 401 });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/organizations/current/profile'));
    assert.equal(calls[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0].options.body), { version: 3, name: 'Private company A' });
    assert.equal(calls[0].options.headers.get('X-Organization-ID'), 'org-a');
    assert.deepEqual(getSession(), accountB); assert.deepEqual(env.events, []);
  } finally { env.restore(); }
});

test('expired profile PATCH requires explicit reauthentication without mutation replay', async () => {
  let calls = 0; const env = browser(async () => { calls++; return response(401); });
  try {
    setSession(accountA);
    await assert.rejects(updateOrganizationProfile({ version: 0, name: 'Draft' }), { status: 401 });
    assert.equal(calls, 1); assert.deepEqual(getSession(), {}); assert.deepEqual(env.events, ['alageum:session-expired']);
  } finally { env.restore(); }
});

test('same-account re-login creates a boundary even when credentials are identical', async () => {
  const pending = deferred(), env = browser(async () => pending.promise);
  try {
    setSession(accountA); const generation = getSessionGeneration();
    const save = updateOrganizationProfile({ version: 0, name: 'Old login' });
    setSession(accountA); assert.notEqual(getSessionGeneration(), generation);
    pending.resolve(response(401)); await assert.rejects(save, { status: 401 });
    assert.deepEqual(getSession(), accountA); assert.deepEqual(env.events, []);
  } finally { env.restore(); }
});

test('normal GET refresh preserves login generation', async () => {
  const env = browser(async (url, options) => url.endsWith('/auth/refresh')
    ? response(200, { access_token: 'rotated-a', refresh_token: 'rotated-refresh-a' })
    : options.headers.get('Authorization') === 'Bearer rotated-a' ? response(200, { ok: true }) : response(401));
  try {
    setSession(accountA); const generation = getSessionGeneration();
    assert.deepEqual(await apiFetch('/organizations/current/profile'), { ok: true });
    assert.equal(getSessionGeneration(), generation);
    assert.equal(getSession().access_token, 'rotated-a');
  } finally { env.restore(); }
});

test('old refresh cannot cross a same-account re-login with identical credentials', async () => {
  const pending = deferred(), started = deferred(), calls = [];
  const env = browser(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/refresh')) { started.resolve(); return pending.promise; }
    return response(401);
  });
  try {
    setSession(accountA); const read = apiFetch('/organizations/current/profile'); await started.promise;
    setSession(accountA); pending.resolve(response(200, { access_token: 'stale', refresh_token: 'stale' }));
    await assert.rejects(read, { code: 'session_changed' });
    assert.equal(calls.length, 2); assert.deepEqual(getSession(), accountA); assert.deepEqual(env.events, []);
  } finally { env.restore(); }
});

test('ordinary session refresh preserves an unsaved company draft but same-account login invalidates it', async () => {
  const snapshot = { organization_id: 'org-a', name: 'Company', business_contact_email: null, version: 0 };
  const profile = { user: { id: 'user-a' }, organization: { id: 'org-a' } };
  const env = browser(async (url, options) => url.endsWith('/auth/refresh')
    ? response(200, { access_token: 'rotated-a', refresh_token: 'rotated-refresh-a' })
    : options.headers.get('Authorization') === 'Bearer rotated-a' ? response(200, {}) : response(401));
  let state, writes = 0;
  try {
    setSession(accountA);
    const scope = organizationProfileScope(profile, 1, getSessionGeneration());
    const editor = createCompanyProfileEditor({
      read: async () => snapshot, save: async () => { writes++; return snapshot; }, organizationId: 'org-a', canEdit: () => true,
      isCurrent: () => scope === organizationProfileScope(profile, 1, getSessionGeneration()), onChange: next => { state = next; }, onConfirmed() {},
    });
    await editor.load(); editor.edit(); editor.change('name', 'Unsaved draft');
    await apiFetch('/quotes?mine=true');
    assert.equal(state.editing, true); assert.equal(state.draft.name, 'Unsaved draft');
    editor.change('name', 'Still editable after refresh'); assert.equal(state.draft.name, 'Still editable after refresh');
    setSession(getSession()); await editor.submit(); assert.equal(writes, 0);
    editor.change('name', 'Must be ignored'); assert.equal(state.draft.name, 'Still editable after refresh');
    let newState;
    const nextEditor = createCompanyProfileEditor({ read: async () => snapshot, save: async () => snapshot, organizationId: 'org-a', canEdit: () => true, isCurrent: () => true, onChange: next => { newState = next; }, onConfirmed() {} });
    await nextEditor.load(); assert.equal(newState.draft, null); nextEditor.edit(); assert.equal(newState.draft.name, 'Company');
    editor.dispose(); nextEditor.dispose();
  } finally { env.restore(); }
});

test('delayed login /me cannot restore credentials after a newer login', async () => {
  const pendingMe = deferred(), started = deferred();
  const env = browser(async url => {
    if (url.endsWith('/auth/login')) return response(200, accountA);
    started.resolve(); return pendingMe.promise;
  });
  try {
    const signingIn = login('a@example.test', 'test-password'); await started.promise;
    setSession(accountB); pendingMe.resolve(response(200, { user: { id: 'a' }, organization: { id: 'org-a' } }));
    await assert.rejects(signingIn, { code: 'session_changed' }); assert.deepEqual(getSession(), accountB);
  } finally { env.restore(); }
});

test('latest login attempt wins even if older login response arrives last', async () => {
  const first = deferred(), second = deferred(), calls = [];
  const env = browser(async (url, options) => {
    if (url.endsWith('/auth/login')) { calls.push(JSON.parse(options.body).email); return calls.length === 1 ? first.promise : second.promise; }
    return response(200, { user: { id: 'b' }, organization: { id: 'org-b' } });
  });
  try {
    const oldLogin = login('a@example.test', 'test-password'), newLogin = login('b@example.test', 'test-password');
    second.resolve(response(200, accountB)); await newLogin;
    first.resolve(response(200, accountA)); await assert.rejects(oldLogin, { code: 'session_changed' });
    assert.deepEqual(getSession(), accountB);
  } finally { env.restore(); }
});

test('aborted login cannot install delayed credentials', async () => {
  const pending = deferred(), env = browser(async () => pending.promise), controller = new AbortController();
  try {
    setSession(accountB); const signingIn = login('a@example.test', 'test-password', { signal: controller.signal });
    controller.abort(); pending.resolve(response(200, accountA));
    await assert.rejects(signingIn, { code: 'session_changed' }); assert.deepEqual(getSession(), accountB);
  } finally { env.restore(); }
});

test('aborted login cannot complete a delayed /me or install its organization', async () => {
  const pendingMe = deferred(), started = deferred(), controller = new AbortController();
  const pair = { access_token: 'login-a', refresh_token: 'login-refresh-a' };
  const env = browser(async url => {
    if (url.endsWith('/auth/login')) return response(200, pair);
    started.resolve(); return pendingMe.promise;
  });
  try {
    const signingIn = login('a@example.test', 'test-password', { signal: controller.signal }); await started.promise;
    const generation = getSessionGeneration(); controller.abort();
    pendingMe.resolve(response(200, { user: { id: 'a' }, organization: { id: 'org-a' } }));
    await assert.rejects(signingIn, { code: 'session_changed' });
    assert.deepEqual(getSession(), pair); assert.equal(getSessionGeneration(), generation);
  } finally { env.restore(); }
});
test('same-session catalogue 401 prompts explicit reauthentication without automatic retry', async () => {
  let calls = 0; const env = browser(async () => { calls++; return response(401); });
  try {
    setSession(accountA);
    await assert.rejects(createQuote({ items: [] }, 'request-a'), { status: 401 });
    assert.equal(calls, 1); assert.deepEqual(getSession(), {}); assert.deepEqual(env.events, ['alageum:session-expired']);
  } finally { env.restore(); }
});
test('pending account-A refresh cannot overwrite account B or replay A request as B', async () => {
  const refresh = deferred(), refreshStarted = deferred(), calls = [];
  const env = browser(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/refresh')) { refreshStarted.resolve(); return refresh.promise; }
    return response(401);
  });
  try {
    setSession(accountA); const read = apiFetch('/quotes?mine=true'); await refreshStarted.promise;
    setSession(accountB); refresh.resolve(response(200, { access_token: 'rotated-a', refresh_token: 'rotated-refresh-a' }));
    await assert.rejects(read, { code: 'session_changed' });
    assert.deepEqual(getSession(), accountB); assert.deepEqual(env.events, []); assert.equal(calls.length, 2);
  } finally { env.restore(); }
});
test('late failed A refresh cannot sign out B; separate B refresh never awaits A flight', async () => {
  const aRefresh = deferred(), bRefresh = deferred(), aStarted = deferred(), bStarted = deferred(), calls = [];
  const env = browser(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/refresh')) {
      if (JSON.parse(options.body).refresh_token === 'refresh-a') { aStarted.resolve(); return aRefresh.promise; }
      bStarted.resolve(); return bRefresh.promise;
    }
    return options.headers.get('Authorization') === 'Bearer rotated-b' ? response(200, { owner: 'b' }) : response(401);
  });
  try {
    setSession(accountA); const aRead = apiFetch('/quotes?mine=true'); await aStarted.promise;
    setSession(accountB); const bRead = apiFetch('/quotes?mine=true'); await bStarted.promise;
    aRefresh.resolve(response(401)); await assert.rejects(aRead, { code: 'session_changed' });
    assert.deepEqual(getSession(), accountB); assert.deepEqual(env.events, []);
    bRefresh.resolve(response(200, { access_token: 'rotated-b', refresh_token: 'rotated-refresh-b' }));
    assert.deepEqual(await bRead, { owner: 'b' });
    assert.equal(getSession().access_token, 'rotated-b'); assert.equal(getSession().organization_id, 'org-b');
    assert.equal(calls.filter(call => call.url.endsWith('/auth/refresh')).length, 2);
  } finally { env.restore(); }
});
