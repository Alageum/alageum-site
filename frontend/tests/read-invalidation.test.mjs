import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvoiceRead } from '../lib/finance/read.js';
import { createDocumentRead } from '../lib/documents/read.js';
import { createOrderRead } from '../lib/orders/read.js';
import { createMembersRead } from '../lib/organizations/members.js';

const empty = { status: 'loading', value: null, error: null };
const privateRows = [{ id: 'old-scope-row' }];
function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

// The same public read contract belongs to all four scoped workspaces. Exercise
// observations and request ownership instead of duplicating each implementation.
for (const [name, createRead] of [
  ['invoice', createInvoiceRead], ['document', createDocumentRead],
  ['order', createOrderRead], ['member', createMembersRead],
]) {
  test(`${name}: an initially obsolete reader clears state without loading`, async () => {
    let calls = 0;
    const history = [];
    const reader = createRead({ load: async () => { calls++; return privateRows; }, isCurrent: () => false, onChange: state => history.push(state) });
    await reader.reload();
    assert.equal(calls, 0);
    assert.deepEqual(history, [empty]);
    reader.dispose();
  });

  test(`${name}: obsolete reload clears ready rows and errors without another request`, async () => {
    for (const fail of [false, true]) {
      const failure = new Error('old-scope failure'), history = [];
      let current = true, calls = 0, signal;
      const reader = createRead({
        load: async options => { signal = options.signal; calls++; if (fail) throw failure; return privateRows; },
        isCurrent: () => current, onChange: state => history.push(state),
      });
      await reader.reload();
      assert.deepEqual(history.at(-1), fail
        ? { status: 'error', value: null, error: failure }
        : { status: 'ready', value: privateRows, error: null });
      current = false;
      const invalidated = reader.reload();
      assert.deepEqual(history.at(-1), empty);
      assert.equal(signal.aborted, true);
      await invalidated;
      assert.equal(calls, 1);
      assert.equal(history.length, 3);
      reader.dispose();
    }
  });

  test(`${name}: invalidated pending fulfillment and rejection cannot repopulate a cleared reader`, async () => {
    for (const fail of [false, true]) {
      const pending = deferred(), history = [];
      let current = true, calls = 0, signal;
      const reader = createRead({
        load: options => { signal = options.signal; calls++; return pending.promise; },
        isCurrent: () => current, onChange: state => history.push(state),
      });
      const reading = reader.reload();
      current = false;
      await reader.reload();
      assert.equal(signal.aborted, true);
      assert.equal(calls, 1);
      assert.deepEqual(history, [empty, empty]);
      // Even a transport that ignores abort must not reclaim request ownership
      // if a later check happens to consider the captured scope current again.
      current = true;
      if (fail) pending.reject(new Error('late old-scope failure')); else pending.resolve(privateRows);
      await reading;
      assert.deepEqual(history, [empty, empty]);
      reader.dispose();
    }
  });

  test(`${name}: disposal publishes nothing for settled or pending reads and ignores reload`, async () => {
    for (const settled of [false, true]) for (const fail of [false, true]) {
      const pending = deferred(), history = [];
      let calls = 0, signal;
      const reader = createRead({
        load: options => { signal = options.signal; calls++; return pending.promise; },
        isCurrent: () => true, onChange: state => history.push(state),
      });
      const reading = reader.reload();
      const complete = () => { if (fail) pending.reject(new Error('disposed failure')); else pending.resolve(privateRows); };
      if (settled) { complete(); await reading; }
      const before = history.slice();
      reader.dispose();
      await reader.reload();
      if (!settled) { complete(); await reading; }
      assert.equal(signal.aborted, true);
      assert.equal(calls, 1);
      assert.deepEqual(history, before);
    }
  });
}
