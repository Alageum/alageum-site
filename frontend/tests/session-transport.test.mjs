import assert from 'node:assert/strict';
import test from 'node:test';
import { getSession, getSessionGeneration, setSession, subscribeSession } from '../lib/api/sessionTransport.js';

const account = { access_token: 'access-a', refresh_token: 'refresh-a', organization_id: 'org-a' };
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
      { access_token: 'access-b', refresh_token: 'refresh-b', organization_id: 'org-b' },
      { ...account, organization_id: 'org-b' }, null,
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
    setSession(account);
    const generation = getSessionGeneration(), snapshots = [];
    unsubscribe = subscribeSession(() => snapshots.push(getSessionGeneration()));
    const refreshed = { ...account, access_token: 'rotated-a', refresh_token: 'rotated-refresh-a' };
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
    sessionStorage.setItem(key, JSON.stringify({ ...account, organization_id: 'org-b' }));
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
