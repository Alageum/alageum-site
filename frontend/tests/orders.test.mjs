import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrder, getOrders } from '../lib/api/orders.js';
import { getSession, setSession } from '../lib/api/client.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
import { createOrderRead, initialOrderRead, orderReadError } from '../lib/orders/read.js';

const id = '40000000-0000-4000-8000-000000000001';
const other = '40000000-0000-4000-8000-000000000002';
const item = { id: other, description: 'Fictitious line', quantity: '999999999999999.999', unit_price: '9999999999999999.99', configuration: { voltage: 'fictitious' } };
const order = { id, external_id: null, number: 'FIXTURE-ORD-001', currency: 'KZT', amount: '9999999999999999.99', status: 'fixture', items: [item, { ...item, id: '40000000-0000-4000-8000-000000000003', quantity: '0.001', unit_price: null }] };
const page = { items: [order], page: 1, page_size: 20, total: 1 };
const session = { access_token: 'fixture-a', refresh_token: 'fixture-refresh-a', organization_id: 'fixture-org-a' };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function browser(fetcher) {
  const before = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch }, values = new Map();
  globalThis.window = { dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.fetch = fetcher;
  return () => Object.assign(globalThis, before);
}

test('order reads retain exact PostgreSQL strings and nullable prices and forward cancellation', async () => {
  const calls = [], controller = new AbortController();
  const restore = browser(async (url, options) => { calls.push({ url, options }); return response(200, url.endsWith('/orders') ? page : order); });
  try {
    setSession(session);
    assert.deepEqual(await getOrders({ signal: controller.signal }), [order]);
    assert.deepEqual(await getOrder(id, { signal: controller.signal }), order);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.options.signal, controller.signal);
      assert.equal(call.options.headers.get('X-Organization-ID'), session.organization_id);
    }
  } finally { restore(); }
});

test('malformed list envelopes and numeric coercions fail rather than become empty lists', async () => {
  for (const payload of [null, {}, [], { items: [] }, { ...page, page: 0 }, { ...page, page: 2 }, { ...page, page_size: 0 }, { ...page, total: -1 }, { ...page, total: 0 }, { ...page, items: [{ ...order, amount: 1 }] }, { ...page, items: [{ ...order, items: [{ ...item, quantity: 1 }] }] }, { ...page, items: [{ ...order, items: [{ ...item, unit_price: 1 }] }] }, { ...page, items: [{ ...order, external_id: undefined }] }]) {
    const restore = browser(async () => response(200, payload));
    try { await assert.rejects(getOrders(), { status: 502, code: 'invalid_order_response' }); } finally { restore(); }
  }
  const restore = browser(async () => response(200, { items: [], page: 1, page_size: 20, total: 0 }));
  try { assert.deepEqual(await getOrders(), []); } finally { restore(); }
});

test('detail validates requested UUID, matching response ID, shape and fixed decimal scales', async () => {
  let reads = 0;
  const restore = browser(async () => { reads++; return response(200, order); });
  try {
    for (const invalid of ['not-an-id', `${id}?private=1`, ['bad'], undefined]) await assert.rejects(getOrder(invalid), { status: 422 });
    assert.equal(reads, 0);
  } finally { restore(); }
  for (const payload of [{ ...order, id: other }, { ...order, amount: '1' }, { ...order, amount: '1.001' }, { ...order, items: null }, { ...order, items: [{ ...item, quantity: '1.00' }] }, { ...order, items: [{ ...item, unit_price: '1.000' }] }, { ...order, items: [{ ...item, configuration: [] }] }]) {
    const reset = browser(async () => response(200, payload));
    try { await assert.rejects(getOrder(id), { status: 502 }); } finally { reset(); }
  }
});

test('oversized page metadata is rejected at the frozen 100-row cap', async () => {
  const restore = browser(async () => response(200, { ...page, page_size: 101 }));
  try { await assert.rejects(getOrders(), { code: 'invalid_order_response' }); } finally { restore(); }
});

test('order list and detail retain shared login-generation protections after late success and 401', async () => {
  for (const read of [() => getOrders(), () => getOrder(id)]) for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async url => { calls.push(url); return pending.promise; });
    try {
      setSession(session); const result = read();
      setSession({ ...session, access_token: 'new-login', refresh_token: 'new-refresh' });
      pending.resolve(response(status, calls[0].endsWith('/orders') ? page : order));
      await assert.rejects(result, { code: 'session_changed' });
      assert.equal(getSession().access_token, 'new-login'); assert.equal(calls.length, 1);
    } finally { restore(); }
  }
});

test('retry resets old values/errors and discards an earlier success or failure', async () => {
  for (const rejectOld of [false, true]) {
    const older = deferred(), newer = deferred(), history = [], signals = [];
    const flow = createOrderRead({ load: ({ signal }) => { signals.push(signal); return signals.length === 1 ? older.promise : newer.promise; }, isCurrent: () => true, onChange: state => history.push(state) });
    const first = flow.reload(), second = flow.reload();
    assert.equal(signals[0].aborted, true); assert.deepEqual(history.at(-1), initialOrderRead());
    if (rejectOld) older.reject(new Error('old failure')); else older.resolve(order);
    await first; assert.equal(history.length, 2);
    newer.resolve({ ...order, id: other }); await second;
    assert.equal(history.at(-1).value.id, other); assert.equal(history.at(-1).status, 'ready');
    flow.dispose();
  }
});

test('route disposal and changed authorization suppress pending completions and further retries', async () => {
  for (const dispose of [false, true]) for (const reject of [false, true]) {
    const pending = deferred(), history = []; let current = true, calls = 0, signal;
    const flow = createOrderRead({ load: options => { signal = options.signal; calls++; return pending.promise; }, isCurrent: () => current, onChange: state => history.push(state) });
    const read = flow.reload();
    if (dispose) flow.dispose(); else current = false;
    if (reject) pending.reject(new Error('late failure')); else pending.resolve(order);
    await read; await flow.reload();
    assert.equal(history.length, dispose ? 1 : 2); assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  }
});

test('a failed read can explicitly retry successfully without carrying its old error', async () => {
  const history = []; let calls = 0;
  const flow = createOrderRead({ load: async () => { if (++calls === 1) throw new Error('failure'); return []; }, isCurrent: () => true, onChange: state => history.push(state) });
  await flow.reload(); assert.equal(history.at(-1).status, 'error');
  await flow.reload(); assert.deepEqual(history.at(-2), initialOrderRead()); assert.deepEqual(history.at(-1), { status: 'ready', value: [], error: null });
});

test('order errors are bounded UI messages; login returns accept only exact safe order paths', () => {
  assert.equal(orderReadError({ status: 404 }), 'Заказ не найден.');
  assert.equal(orderReadError({ status: 403 }), 'Нет доступа к заказам.');
  assert.equal(orderReadError({ message: 'private diagnostic' }), 'Не удалось загрузить заказы. Повторите попытку.');
  for (const path of ['/b2b/orders', `/b2b/orders/${id}`]) assert.equal(loginDestination(path), path);
  for (const path of ['//evil.invalid', `/b2b/orders/${id}/extra`, `/b2b/orders/${id}?next=bad`, '/b2b/orders?next=bad', '/b2b/orders/not-a-uuid', '/b2b/orders/../profile', `/b2b/orders/${id}#secret`]) assert.equal(loginDestination(path), '/b2b');
});
