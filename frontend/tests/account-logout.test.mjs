import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsLogoutReceipt } from '../lib/account/logout.js';
import { createAccountOperation } from '../lib/account/model.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('logout receipt permits navigation only after its own exact session clear', () => {
  assert.equal(acceptsLogoutReceipt({ cleared: true, generation: 7 }, 7, {}), true);
  for (const receipt of [null, {}, { cleared: false }, { cleared: 'true', generation: 7 }, { cleared: true }, { cleared: true, generation: '7' }, { cleared: true, generation: NaN }]) {
    assert.equal(acceptsLogoutReceipt(receipt, 7, {}), false);
  }
});

test('an old logout cannot navigate over a newer login or a newer logged-out boundary', () => {
  const receipt = { cleared: true, generation: 7 };
  assert.equal(acceptsLogoutReceipt(receipt, 8, { access_token: 'browser:newer' }), false);
  assert.equal(acceptsLogoutReceipt(receipt, 8, {}), false);
  assert.equal(acceptsLogoutReceipt(receipt, 7, { access_token: 'browser:present' }), false);
  assert.equal(acceptsLogoutReceipt({ cleared: false }, 7, {}), false);
});

test('a surviving page operation accepts the verified receipt after its data scope changes', async () => {
  const operation = createAccountOperation(), wait = deferred();
  let generation = 6, session = { access_token: 'browser:old' }, navigations = 0;
  const pending = operation.run(() => wait.promise, receipt => {
    if (acceptsLogoutReceipt(receipt, generation, session)) navigations++;
  }, assert.fail);
  generation = 7; session = {};
  wait.resolve({ cleared: true, generation: 7 }); await pending;
  assert.equal(navigations, 1);
});

test('unmounting the whole page still cancels logout completion navigation', async () => {
  const operation = createAccountOperation(), wait = deferred();
  let navigations = 0;
  const pending = operation.run(() => wait.promise, () => navigations++, assert.fail);
  operation.dispose(); wait.resolve({ cleared: true, generation: 7 }); await pending;
  assert.equal(navigations, 0);
});
