import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrganizationMembers } from '../lib/api/members.js';
import { getSession, setSession, clearSession } from '../lib/api/client.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
import { organizationContentBoundary, organizationDestination } from '../lib/organizations/navigation.js';
import { createMembersRead, initialMembersRead, membersDestination, membersHref, membersPage, membersReadError, MEMBERS_MAX_PAGE } from '../lib/organizations/members.js';

const id = index => `70000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const member = { membership_id: id(1), user_id: id(2), email: '', display_name: 'Синтетикалық 東京 <script>literal</script>', role_id: id(3), role_name: '' };
const page = { items: [member], page: 1, page_size: 50, total: 1 };
const session = { access_token: 'fixture-a', refresh_token: 'fixture-refresh-a', organization_id: id(4) };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function browser(fetcher) {
  const before = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch }, values = new Map();
  globalThis.window = { dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.fetch = fetcher;
  return () => Object.assign(globalThis, before);
}

test('members reads use the exact read-only path, 50-row page size and captured tenant; strings stay unchanged', async () => {
  for (const email of ['', 'ordinary text without email syntax', ' Unicode 東京 ', '<script>literal</script>']) {
    const calls = [], controller = new AbortController(), value = { ...page, items: [{ ...member, email }] };
    const restore = browser(async (url, options) => { calls.push({ url, options }); return response(200, value); });
    try {
      setSession(session);
      assert.deepEqual(await getOrganizationMembers(1, { signal: controller.signal }), value);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/organizations/members?page=1&page_size=50`);
      assert.equal(calls[0].options.signal, controller.signal);
      assert.equal(calls[0].options.headers.get('X-Organization-ID'), session.organization_id);
      assert.equal(calls[0].options.method ?? 'GET', 'GET');
      assert.equal(calls[0].options.cache, 'no-store');
    } finally { restore(); }
  }
});

test('strict ListPage metadata rejects malformed success, extra fields, coercions and oversized pages', async () => {
  for (const value of [null, {}, [], { items: [] }, { ...page, extra: true }, { ...page, page: '1' }, { ...page, page: 2 },
    { ...page, page_size: 100 }, { ...page, page_size: 101 }, { ...page, total: '1' }, { ...page, total: -1 },
    { ...page, total: Number.MAX_SAFE_INTEGER + 1 }, { ...page, items: null },
    { ...page, total: 2, items: [member, member] }, { ...page, total: 51, items: Array.from({ length: 51 }, (_, i) => ({ ...member, membership_id: id(i + 1) })) }]) {
    const restore = browser(async () => response(200, value));
    try { await assert.rejects(getOrganizationMembers(), { status: 502, code: 'invalid_members_response' }); } finally { restore(); }
  }
});

test('each member requires exactly six nonnull string fields and three valid UUIDs', async () => {
  const malformed = [null, [], {}, { ...member, private_note: 'not part of the contract' }];
  for (const key of Object.keys(member)) {
    for (const value of [undefined, null, 42, false, {}]) malformed.push({ ...member, [key]: value });
    const missing = { ...member }; delete missing[key]; malformed.push(missing);
  }
  for (const key of ['membership_id', 'user_id', 'role_id']) for (const value of ['', 'not-a-uuid', `${id(1)}?extra`]) malformed.push({ ...member, [key]: value });
  for (const value of malformed) {
    const restore = browser(async () => response(200, { ...page, items: [value] }));
    try { await assert.rejects(getOrganizationMembers(), { code: 'invalid_members_response' }); } finally { restore(); }
  }
});

test('page-two, zero-total, and out-of-range empty successes retain server totals', async () => {
  for (const value of [{ ...page, page: 2, total: 51 }, { ...page, items: [], total: 0 }, { ...page, items: [], page: 3, total: 55 }, { ...page, items: [], page: MEMBERS_MAX_PAGE, total: 1 }]) {
    const restore = browser(async () => response(200, value));
    try { assert.deepEqual(await getOrganizationMembers(value.page), value); } finally { restore(); }
  }
});

test('separate count and row reads tolerate concurrent insertion and deletion without rewriting totals', async () => {
  for (const value of [{ ...page, total: 0 }, { ...page, total: 50 }, { ...page, page: 2, total: 51, items: [] }]) {
    const restore = browser(async () => response(200, value));
    try { assert.deepEqual(await getOrganizationMembers(value.page), value); } finally { restore(); }
  }
});

test('invalid page inputs make no network request and do not accept arbitrary page sizes', async () => {
  let calls = 0; const restore = browser(async () => { calls++; return response(200, page); });
  try {
    for (const value of [0, -1, '1', 1.5, NaN, Infinity, MEMBERS_MAX_PAGE + 1, {}, []]) await assert.rejects(getOrganizationMembers(value), { status: 422, code: 'invalid_members_page' });
    assert.equal(calls, 0);
  } finally { restore(); }
});

test('pagination URLs have one bounded decimal parameter and canonical first page', () => {
  assert.equal(membersPage(), 1); assert.equal(membersPage('page=1'), 1); assert.equal(membersPage('page=9007199254740991'), MEMBERS_MAX_PAGE);
  assert.equal(membersPage('page=1000001'), 1000001);
  assert.equal(membersHref(1), '/b2b/members'); assert.equal(membersHref(2), '/b2b/members?page=2');
  for (const query of ['page=', 'page=0', 'page=-1', 'page=01', 'page=1.0', 'page=1e2', 'page=+1', 'page=9007199254740992', 'page=99999999999999999999', 'page=%32', '%70age=2', 'page=2&page=3', 'page=2&', 'page_size=100', 'page=2&next=/b2b', 'page=2#private']) assert.equal(membersPage(query), null, query);
  for (const value of [0, -1, '2', 1.5, MEMBERS_MAX_PAGE + 1]) assert.equal(membersHref(value), null);
});

test('login and organization destinations allow only the exact member route and safe page parameter', () => {
  for (const read of [membersDestination, loginDestination, organizationDestination]) {
    assert.equal(read('/b2b/members'), '/b2b/members');
    assert.equal(read('/b2b/members?page=1'), '/b2b/members');
    assert.equal(read('/b2b/members?page=2'), '/b2b/members?page=2');
    assert.equal(read('/b2b/members?page=9007199254740991'), '/b2b/members?page=9007199254740991');
    for (const path of ['/b2b/members?', '/b2b/members/', '/b2b/members/child', '/b2b/members#hash', '/b2b/members?page=2&next=bad', '/b2b/members?page=02', '/b2b/members?page=9007199254740992', '/b2b/members?page=%32', '/b2b/members?%70age=2', '/b2b/members?page=2&page=3', '/b2b/%6dembers', '//evil.invalid/b2b/members', 'https://evil.invalid/b2b/members', '/b2b/members/../profile']) assert.equal(read(path), read === membersDestination ? null : '/b2b', path);
  }
  assert.equal(loginDestination('/b2b/profile?next=members'), '/b2b');
  assert.equal(organizationDestination('/b2b/orders/old'), '/b2b/orders');
  assert.equal(loginDestination('/inquiry?source=api'), '/inquiry?source=api');
  const old = { key: 'old', sessionGeneration: 1, blockedPath: null };
  assert.equal(organizationContentBoundary(old, 'new', 2, '/b2b/members').blockedPath, null);
});

test('late read success and 401 after tenant switch, logout or new same-tenant login cannot replace the session', async () => {
  for (const change of ['tenant', 'logout', 'login']) for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async url => { calls.push(url); return pending.promise; });
    try {
      setSession(session); const reading = getOrganizationMembers();
      if (change === 'logout') clearSession();
      else setSession({ ...session, access_token: 'new-login', refresh_token: 'new-refresh', organization_id: change === 'tenant' ? id(5) : session.organization_id });
      const expected = getSession();
      pending.resolve(response(status, page));
      await assert.rejects(reading, { code: 'session_changed' });
      assert.deepEqual(getSession(), expected); assert.equal(calls.length, 1);
    } finally { restore(); }
  }
});

test('aborted read never retries a 401 or publishes a late successful response', async () => {
  for (const status of [200, 401]) {
    const pending = deferred(), calls = [], controller = new AbortController(), restore = browser(async url => { calls.push(url); return pending.promise; });
    try {
      setSession(session); const reading = getOrganizationMembers(1, { signal: controller.signal });
      controller.abort(); pending.resolve(response(status, page));
      // A current aborted 401 can finish a token rotation, but can never replay
      // the data request. The refresh response in this fixture is not valid.
      await assert.rejects(reading);
      assert.equal(calls.filter(url => url.includes('/organizations/members')).length, 1);
    } finally { restore(); }
  }
});

test('newer retries and page disposal abort old requests and discard both late successes and failures', async () => {
  for (const fail of [false, true]) {
    const older = deferred(), newer = deferred(), history = [], signals = [];
    const flow = createMembersRead({ load: ({ signal }) => { signals.push(signal); return signals.length === 1 ? older.promise : newer.promise; }, isCurrent: () => true, onChange: state => history.push(state) });
    const first = flow.reload(), second = flow.reload();
    assert.equal(signals[0].aborted, true); assert.deepEqual(history, [initialMembersRead(), initialMembersRead()]);
    newer.resolve({ ...page, page: 2 }); await second;
    if (fail) older.reject(new Error('old private failure')); else older.resolve(page);
    await first; assert.equal(history.length, 3); assert.equal(history.at(-1).value.page, 2);
    flow.dispose(); await flow.reload(); assert.equal(signals.length, 2);
  }
});

test('disposed pages and lost permission scopes cannot publish or retry pending reads', async () => {
  for (const dispose of [false, true]) for (const fail of [false, true]) {
    const pending = deferred(), history = []; let current = true, calls = 0, signal;
    const flow = createMembersRead({ load: options => { signal = options.signal; calls++; return pending.promise; }, isCurrent: () => current, onChange: state => history.push(state) });
    const reading = flow.reload();
    if (dispose) flow.dispose(); else current = false;
    if (fail) pending.reject(new Error('late error')); else pending.resolve(page);
    await reading; await flow.reload(); assert.equal(history.length, dispose ? 1 : 2); assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  }
});

test('explicit retry clears old errors and values; errors never expose backend diagnostic text', async () => {
  let calls = 0; const history = [];
  const flow = createMembersRead({ load: async () => { if (++calls === 1) throw new Error('private failure'); return page; }, isCurrent: () => true, onChange: value => history.push(value) });
  await flow.reload(); assert.equal(history.at(-1).status, 'error');
  await flow.reload(); assert.deepEqual(history.at(-2), initialMembersRead()); assert.equal(history.at(-1).value, page);
  assert.equal(membersReadError({ status: 403 }), 'Нет доступа к участникам организации.');
  assert.equal(membersReadError({ message: 'private failure' }), 'Не удалось загрузить участников. Повторите попытку.');
});
