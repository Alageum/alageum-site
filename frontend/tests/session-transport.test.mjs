import assert from 'node:assert/strict';
import test from 'node:test';
import { getSession, getSessionGeneration, setSession, subscribeSession } from '../lib/api/sessionTransport.js';

const sessionA = '10000000-0000-4000-8000-000000000001', sessionB = '10000000-0000-4000-8000-000000000002';
const orgA = '20000000-0000-4000-8000-000000000001', orgB = '20000000-0000-4000-8000-000000000002';
const account = { access_token: `browser:${sessionA}`, browser_session: sessionA, organization_id: orgA };
const key = 'alageum_session';
function browser() {
  const oldWindow = globalThis.window, oldStorage = globalThis.sessionStorage;
  const data = new Map();
  let writes = 0;
  globalThis.window = new EventTarget();
  globalThis.sessionStorage = {
    getItem: name => data.get(name) ?? null,
    setItem: (name, value) => { writes++; data.set(name, value); },
    removeItem: name => { writes++; data.delete(name); },
  };
  return {
    get writes() { return writes; },
    restore() { globalThis.window = oldWindow; globalThis.sessionStorage = oldStorage; },
  };
}
function pageshow(persisted) {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

test('persisted pageshow lets existing subscribers observe silent account, tenant and logout boundaries once', () => {
  const env = browser();
  try {
    for (const next of [
      { access_token: `browser:${sessionB}`, browser_session: sessionB, organization_id: orgB },
      { ...account, organization_id: orgB }, null,
    ]) {
      setSession(account);
      const generation = getSessionGeneration(), snapshots = [], otherSnapshots = [];
      const unsubscribe = subscribeSession(() => snapshots.push(getSessionGeneration()));
      const unsubscribeOther = subscribeSession(() => otherSnapshots.push(getSessionGeneration()));
      try {
        if (next) sessionStorage.setItem(key, JSON.stringify(next)); else sessionStorage.removeItem(key);
        const writes = env.writes;
        assert.deepEqual(snapshots, []);
        pageshow(true);
        pageshow(true);
        assert.deepEqual(snapshots, [generation + 1, generation + 1]);
        assert.deepEqual(otherSnapshots, snapshots);
        assert.deepEqual(getSession(), next ?? {});
        assert.equal(env.writes, writes);
      } finally { unsubscribe(); unsubscribeOther(); }
    }
  } finally { env.restore(); }
});

test('persisted pageshow with unchanged storage notifies without manufacturing a session boundary', () => {
  const env = browser();
  let unsubscribe;
  try {
    setSession(account);
    const generation = getSessionGeneration(), snapshots = [], writes = env.writes;
    unsubscribe = subscribeSession(() => snapshots.push(getSessionGeneration()));
    pageshow(true); pageshow(true);
    assert.deepEqual(snapshots, [generation, generation]);
    assert.deepEqual(getSession(), account);
    assert.equal(env.writes, writes);
  } finally { unsubscribe?.(); env.restore(); }
});

test('legitimate preserved-generation token rotation remains the same boundary on persisted pageshow', () => {
  const env = browser();
  let unsubscribe;
  try {
    const legacy = { access_token: 'memory-access', refresh_token: 'memory-refresh' };
    setSession(legacy);
    const generation = getSessionGeneration(), snapshots = [];
    unsubscribe = subscribeSession(() => snapshots.push(getSessionGeneration()));
    const refreshed = { ...legacy, access_token: 'rotated-a', refresh_token: 'rotated-refresh-a' };
    setSession(refreshed, { preserveGeneration: true });
    const writes = env.writes;
    pageshow(true);
    assert.deepEqual(snapshots, [generation, generation]);
    assert.deepEqual(getSession(), refreshed);
    assert.equal(env.writes, writes);
  } finally { unsubscribe?.(); env.restore(); }
});

test('ordinary nonpersisted pageshow is ignored even when storage differs', () => {
  const env = browser();
  let unsubscribe;
  try {
    setSession(account);
    const generation = getSessionGeneration(), snapshots = [];
    unsubscribe = subscribeSession(() => snapshots.push(getSessionGeneration()));
    sessionStorage.removeItem(key);
    pageshow(false);
    window.dispatchEvent(new Event('pageshow'));
    assert.deepEqual(snapshots, []);
    pageshow(true);
    assert.deepEqual(snapshots, [generation + 1]);
  } finally { unsubscribe?.(); env.restore(); }
});

test('storage and custom session notifications still use the existing snapshot fingerprint', () => {
  const env = browser();
  let unsubscribe;
  try {
    setSession(account);
    const generation = getSessionGeneration(), snapshots = [];
    unsubscribe = subscribeSession(() => snapshots.push(getSessionGeneration()));
    sessionStorage.setItem(key, JSON.stringify({ ...account, organization_id: orgB }));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('alageum:session-changed'));
    assert.deepEqual(snapshots, [generation + 1, generation + 1]);
  } finally { unsubscribe?.(); env.restore(); }
});

test('unsubscribe removes pageshow, storage and custom listeners without removing another subscriber', () => {
  const env = browser();
  let unsubscribe, unsubscribeOther;
  try {
    const events = [], otherEvents = [];
    unsubscribe = subscribeSession(event => events.push(event.type));
    unsubscribeOther = subscribeSession(event => otherEvents.push(event.type));
    pageshow(true);
    assert.deepEqual(events, ['pageshow']);
    unsubscribe();
    pageshow(true);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('alageum:session-changed'));
    assert.deepEqual(events, ['pageshow']);
    assert.deepEqual(otherEvents, ['pageshow', 'pageshow', 'storage', 'alageum:session-changed']);
  } finally { unsubscribe?.(); unsubscribeOther?.(); env.restore(); }
});

test('legacy bearer credentials are document-local and never persisted or restored', async () => {
  const env = browser();
  try {
    setSession({ access_token: 'private-access', refresh_token: 'private-refresh' });
    assert.equal(sessionStorage.getItem(key), null);
    assert.equal(getSession().access_token, 'private-access');
    sessionStorage.setItem(key, JSON.stringify({ access_token: 'old-dev-access', refresh_token: 'old-dev-refresh' }));
    const fresh = await import(`../lib/api/sessionTransport.js?fresh=${Date.now()}`);
    assert.deepEqual(fresh.getSession(), {});
  } finally { env.restore(); }
});
test('browser storage retains only public session boundary and valid organization', () => {
  const env = browser();
  try {
    setSession({ ...account, access_token: 'secret-bearer', refresh_token: 'secret-refresh', password: 'never-store', unrelated: true });
    assert.deepEqual(JSON.parse(sessionStorage.getItem(key)), account);
    assert.deepEqual(getSession(), account);
  } finally { env.restore(); }
});

test('empty pending and restored sessions keep storage absent without changing boundary semantics', () => {
  const env = browser();
  try {
    setSession(account);
    const generation = getSessionGeneration();
    setSession({}, { pendingFederated: true });
    assert.equal(sessionStorage.getItem(key), null);
    assert.deepEqual(getSession(), { federated_pending: true });
    assert.equal(getSessionGeneration(), generation + 1);
    setSession({}, { preserveGeneration: true });
    assert.equal(sessionStorage.getItem(key), null);
    assert.deepEqual(getSession(), {});
    assert.equal(getSessionGeneration(), generation + 1);
  } finally { env.restore(); }
});

test('invalid public boundaries never leave a persistent session marker', () => {
  const env = browser();
  try {
    setSession(account);
    setSession({ browser_session: 'invalid-boundary', access_token: 'never-persist' });
    assert.equal(sessionStorage.getItem(key), null);
    assert.deepEqual(getSession(), {});
  } finally { env.restore(); }
});
