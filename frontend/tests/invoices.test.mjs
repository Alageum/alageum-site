import assert from 'node:assert/strict';
import test from 'node:test';
import { getInvoices } from '../lib/api/finance.js';
import { getSession, setSession } from '../lib/api/client.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
import { createInvoiceRead, initialInvoiceRead, invoiceReadError } from '../lib/finance/read.js';

const id = '60000000-0000-4000-8000-000000000001';
const invoice = { id, number: 'FIXTURE-INV-001', amount: '9999999999999999.99', currency: 'KZT', status: 'arbitrary-provider-state', source: 'arbitrary-source' };
const page = { items: [invoice], page: 1, page_size: 50, total: 1 };
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
async function rejectPayload(payload) {
  const restore = browser(async () => response(200, payload));
  try { await assert.rejects(getInvoices(), { status: 502, code: 'invalid_invoice_response' }); } finally { restore(); }
}

test('invoice first-page read retains precise decimal strings and opaque values and forwards cancellation', async () => {
  const calls = [], controller = new AbortController();
  const restore = browser(async (url, options) => { calls.push({ url, options }); return response(200, page); });
  try {
    setSession(session);
    assert.deepEqual(await getInvoices({ signal: controller.signal }), [invoice]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/finance/invoices`);
    assert.equal(calls[0].options.signal, controller.signal);
    assert.equal(calls[0].options.headers.get('X-Organization-ID'), session.organization_id);
    assert.equal(calls[0].options.cache, 'no-store');
  } finally { restore(); }
});

test('invoice nullable strings accept null and the frozen omitted-field defaults without coercing other values', async () => {
  for (const item of [{ ...invoice, number: null, status: null }, { id, amount: '0.00', currency: '', source: '' }]) {
    const restore = browser(async () => response(200, { ...page, items: [item] }));
    try { assert.deepEqual(await getInvoices(), [{ ...item, number: null, status: null }]); } finally { restore(); }
  }
  for (const field of ['number', 'status']) for (const value of [1, false, [], {}, undefined]) await rejectPayload({ ...page, items: [{ ...invoice, [field]: value }] });
});

test('invoice malformed success envelopes cannot become an empty list or escape the first-page cap', async () => {
  for (const payload of [null, {}, [], { items: [] }, { ...page, items: {} }, { ...page, page: 0 }, { ...page, page: 2 }, { ...page, page: '1' },
    { ...page, page_size: 0 }, { ...page, page_size: 101 }, { ...page, page_size: 1.1 }, { ...page, page_size: '50' },
    { ...page, total: -1 }, { ...page, total: 1.5 }, { ...page, total: '1' }, { ...page, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, page_size: 1, items: [invoice, invoice] }, { ...page, extra: true }]) await rejectPayload(payload);
});

test('invoice DTO rejects malformed UUIDs, missing required fields and extra fields', async () => {
  for (const item of [null, [], {}, { ...invoice, id: 'not-a-uuid' }, { ...invoice, id: `${id}?secret=1` }, { ...invoice, id: 1 },
    { ...invoice, currency: null }, { ...invoice, source: null }, { ...invoice, currency: 1 }, { ...invoice, source: {} },
    { ...invoice, download_url: 'https://fixture.invalid/private' }]) await rejectPayload({ ...page, items: [item] });
  for (const field of ['id', 'amount', 'currency', 'source']) {
    const item = { ...invoice }; delete item[field]; await rejectPayload({ ...page, items: [item] });
  }
});

test('invoice amounts enforce exact nonnegative PostgreSQL numeric18,2 strings without numeric conversion', async () => {
  for (const amount of [1, null, '1', '1.0', '1.000', '-1.00', '01.00', '1e2', 'NaN', 'Infinity', '10000000000000000.00', ' 1.00', '1.00 ']) await rejectPayload({ ...page, items: [{ ...invoice, amount }] });
  for (const amount of ['0.00', '0.01', '12.30', '9999999999999999.99']) {
    const restore = browser(async () => response(200, { ...page, items: [{ ...invoice, amount }] }));
    try { assert.equal((await getInvoices())[0].amount, amount); } finally { restore(); }
  }
});

test('invoice empty pages and independently observed count/row snapshots stay successful', async () => {
  for (const [items, total] of [[[], 0], [[], 4], [[invoice], 0], [[invoice], 4]]) {
    const restore = browser(async () => response(200, { ...page, items, total }));
    try { assert.deepEqual(await getInvoices(), items); } finally { restore(); }
  }
});

test('invoice reads retain shared login-generation protections after late success and 401', async () => {
  for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async url => { calls.push(url); return pending.promise; });
    try {
      setSession(session); const read = getInvoices();
      setSession({ ...session, access_token: 'new-login', refresh_token: 'new-refresh' });
      pending.resolve(response(status, page));
      await assert.rejects(read, { code: 'session_changed' });
      assert.equal(getSession().access_token, 'new-login'); assert.equal(calls.length, 1);
    } finally { restore(); }
  }
});

test('invoice reads cannot accept prior-organization data or expire a newly selected organization', async () => {
  for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async (url, options) => { calls.push({ url, options }); return pending.promise; });
    try {
      setSession(session); const read = getInvoices();
      setSession({ ...session, organization_id: 'fixture-org-b' });
      pending.resolve(response(status, page));
      await assert.rejects(read, { code: 'session_changed' });
      assert.equal(getSession().organization_id, 'fixture-org-b'); assert.equal(calls.length, 1);
      assert.equal(calls[0].options.headers.get('X-Organization-ID'), session.organization_id);
    } finally { restore(); }
  }
});

test('invoice retry resets old values/errors and discards an earlier success or failure', async () => {
  for (const rejectOld of [false, true]) {
    const older = deferred(), newer = deferred(), history = [], signals = [];
    const flow = createInvoiceRead({ load: ({ signal }) => { signals.push(signal); return signals.length === 1 ? older.promise : newer.promise; }, isCurrent: () => true, onChange: state => history.push(state) });
    const first = flow.reload(), second = flow.reload();
    assert.equal(signals[0].aborted, true); assert.deepEqual(history.at(-1), initialInvoiceRead());
    if (rejectOld) older.reject(new Error('old failure')); else older.resolve([invoice]);
    await first; assert.equal(history.length, 2);
    newer.resolve([]); await second;
    assert.deepEqual(history.at(-1), { status: 'ready', value: [], error: null });
    flow.dispose();
  }
});

test('invoice route disposal and changed authorization suppress pending completions and further retries', async () => {
  for (const dispose of [false, true]) for (const reject of [false, true]) {
    const pending = deferred(), history = []; let current = true, calls = 0, signal;
    const flow = createInvoiceRead({ load: options => { signal = options.signal; calls++; return pending.promise; }, isCurrent: () => current, onChange: state => history.push(state) });
    const read = flow.reload();
    if (dispose) flow.dispose(); else current = false;
    if (reject) pending.reject(new Error('late failure')); else pending.resolve([invoice]);
    await read; await flow.reload();
    assert.equal(history.length, dispose ? 1 : 2); assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  }
});

test('failed invoice reads can explicitly retry successfully without carrying old errors', async () => {
  const history = []; let calls = 0;
  const flow = createInvoiceRead({ load: async () => { if (++calls === 1) throw new Error('failure'); return []; }, isCurrent: () => true, onChange: state => history.push(state) });
  await flow.reload(); assert.equal(history.at(-1).status, 'error');
  await flow.reload(); assert.deepEqual(history.at(-2), initialInvoiceRead()); assert.deepEqual(history.at(-1), { status: 'ready', value: [], error: null });
});

test('invoice error messages expose no private diagnostics and login return accepts only exact finance path', () => {
  assert.equal(invoiceReadError({ status: 403 }), 'Нет доступа к счетам.');
  assert.equal(invoiceReadError({ status: 401 }), 'Сессия завершилась. Войдите снова.');
  assert.equal(invoiceReadError({ code: 'invalid_invoice_response' }), 'Не удалось подтвердить данные счетов. Повторите загрузку.');
  assert.equal(invoiceReadError({ message: 'private diagnostic' }), 'Не удалось загрузить счета. Повторите попытку.');
  assert.equal(loginDestination('/b2b/finance'), '/b2b/finance');
  for (const path of ['//evil.invalid', 'https://evil.invalid/b2b/finance', 'javascript:alert(1)', '/b2b/finance/', '/b2b/finance/invoices',
    `/b2b/finance/${id}`, '/b2b/finance?next=bad', '/b2b/finance#secret', '/b2b/finance/../profile', '/b2b%2Ffinance', '/B2B/finance', '/b2b/finance\\evil', [' /b2b/finance']]) assert.equal(loginDestination(path), '/b2b');
});
