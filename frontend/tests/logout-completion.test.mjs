import assert from 'node:assert/strict';
import test from 'node:test';
import { logout } from '../lib/api/auth.js';
import { getSession, setSession } from '../lib/api/client.js';
import { getSessionGeneration } from '../lib/api/sessionTransport.js';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const marker = id => ({ access_token: `browser:${id}`, browser_session: id });
const response = status => ({ status, ok: status >= 200 && status < 300, json: async () => ({ error: { code: 'authentication_required' } }) });
function browser(fetcher) {
  const original = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const values = new Map();
  globalThis.window = { location: { origin: 'http://localhost:3000' }, dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.fetch = fetcher;
  return () => { Object.assign(globalThis, original); };
}
for (const status of [204, 401]) {
  test(`logout ${status} returns the exact boundary it cleared for surviving navigation`, async () => {
    const restore = browser(async () => response(status));
    try {
      setSession(marker(first)); const before = getSessionGeneration();
      const receipt = await logout();
      assert.deepEqual(getSession(), {});
      assert.deepEqual(receipt, { cleared: true, generation: getSessionGeneration() });
      assert.notEqual(receipt.generation, before);
      setSession(marker(second));
      assert.notEqual(receipt.generation, getSessionGeneration(), 'A later login invalidates the old navigation receipt');
    } finally { restore(); }
  });
  test(`delayed logout ${status} neither clears nor issues navigation authority for a newer login`, async () => {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    const restore = browser(async () => pending);
    try {
      setSession(marker(first)); const exiting = logout();
      setSession(marker(second)); const generation = getSessionGeneration();
      complete(response(status));
      assert.deepEqual(await exiting, { cleared: false });
      assert.deepEqual(getSession(), marker(second));
      assert.equal(getSessionGeneration(), generation);
    } finally { restore(); }
  });
}
