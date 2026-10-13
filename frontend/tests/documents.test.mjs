import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocuments } from '../lib/api/documents.js';
import { clearSession, getSession, setSession } from '../lib/api/client.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
import { createDocumentRead, initialDocumentRead, documentReadError } from '../lib/documents/read.js';

const id = '60000000-0000-4000-8000-000000000001';
const document = { id, number: 'FIXTURE-DOC-001', title: 'Fictitious document', external_id: 'opaque-external-id', source: 'arbitrary-source', type_code: 'arbitrary-provider-type', latest_file_id: '70000000-0000-4000-8000-000000000009' };
const page = { items: [document], page: 1, page_size: 50, total: 1 };
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
  try { await assert.rejects(getDocuments(), { status: 502, code: 'invalid_document_response' }); } finally { restore(); }
}

test('document first-page read retains exact metadata and opaque values and forwards cancellation', async () => {
  const calls = [], controller = new AbortController();
  const restore = browser(async (url, options) => { calls.push({ url, options }); return response(200, page); });
  try {
    setSession(session);
    assert.deepEqual(await getDocuments({ signal: controller.signal }), [document]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/documents`);
    assert.equal(calls[0].options.signal, controller.signal);
    assert.equal(calls[0].options.headers.get('X-Organization-ID'), session.organization_id);
    assert.equal(calls[0].options.cache, 'no-store');
  } finally { restore(); }
});

test('document nullable fields require explicit null or their declared type without coercion', async () => {
  for (const item of [{ ...document, number: null, external_id: null, latest_file_id: null }, { ...document, number: '', external_id: '', title: '', source: '', type_code: '' }]) {
    const restore = browser(async () => response(200, { ...page, items: [item] }));
    try { assert.deepEqual(await getDocuments(), [item]); } finally { restore(); }
  }
  for (const field of ['number', 'external_id']) for (const value of [1, false, [], {}, undefined]) await rejectPayload({ ...page, items: [{ ...document, [field]: value }] });
  for (const value of ['', 'file/path', '/api/v1/files/private', 'https://fixture.invalid', 1, false, [], {}, undefined]) await rejectPayload({ ...page, items: [{ ...document, latest_file_id: value }] });
});

test('document malformed success envelopes cannot become an empty list or escape the first-page cap', async () => {
  for (const payload of [null, {}, [], { items: [] }, { ...page, items: {} }, { ...page, page: 0 }, { ...page, page: 2 }, { ...page, page: '1' },
    { ...page, page_size: 0 }, { ...page, page_size: 101 }, { ...page, page_size: 1.1 }, { ...page, page_size: '50' },
    { ...page, total: -1 }, { ...page, total: 1.5 }, { ...page, total: '1' }, { ...page, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, page_size: 1, items: [document, document] }, { ...page, extra: true }]) await rejectPayload(payload);
});

test('document DTO requires exactly seven fields with UUIDs, nullable strings and opaque string metadata', async () => {
  for (const item of [null, [], {}, { ...document, id: 'not-a-uuid' }, { ...document, id: `${id}?secret=1` }, { ...document, id: 1 },
    { ...document, download_url: 'https://fixture.invalid/private' }, { ...document, file: { url: 'private' } }]) await rejectPayload({ ...page, items: [item] });
  for (const field of Object.keys(document)) {
    const item = { ...document }; delete item[field]; await rejectPayload({ ...page, items: [item] });
  }
  for (const field of ['title', 'source', 'type_code']) for (const value of [null, 1, false, [], {}, undefined]) await rejectPayload({ ...page, items: [{ ...document, [field]: value }] });
});

test('document empty pages and independently observed count/row snapshots stay successful', async () => {
  for (const [items, total] of [[[], 0], [[], 4], [[document], 0], [[document], 4]]) {
    const restore = browser(async () => response(200, { ...page, items, total }));
    try { assert.deepEqual(await getDocuments(), items); } finally { restore(); }
  }
});

test('document reads retain shared login-generation protections after late success and 401', async () => {
  for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async url => { calls.push(url); return pending.promise; });
    try {
      setSession(session); const read = getDocuments();
      setSession({ ...session, access_token: 'new-login', refresh_token: 'new-refresh' });
      pending.resolve(response(status, page));
      await assert.rejects(read, { code: 'session_changed' });
      assert.equal(getSession().access_token, 'new-login'); assert.equal(calls.length, 1);
    } finally { restore(); }
  }
});

test('document pending reads cannot restore metadata or credentials after logout', async () => {
  for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async url => { calls.push(url); return pending.promise; });
    try {
      setSession(session); const read = getDocuments(); clearSession();
      pending.resolve(response(status, page));
      await assert.rejects(read, { code: 'session_changed' });
      assert.deepEqual(getSession(), {}); assert.equal(calls.length, 1);
    } finally { restore(); }
  }
});

test('document reads cannot accept prior-organization data or expire a newly selected organization', async () => {
  for (const status of [200, 401]) {
    const pending = deferred(), calls = [], restore = browser(async (url, options) => { calls.push({ url, options }); return pending.promise; });
    try {
      setSession(session); const read = getDocuments();
      setSession({ ...session, organization_id: 'fixture-org-b' });
      pending.resolve(response(status, page));
      await assert.rejects(read, { code: 'session_changed' });
      assert.equal(getSession().organization_id, 'fixture-org-b'); assert.equal(calls.length, 1);
      assert.equal(calls[0].options.headers.get('X-Organization-ID'), session.organization_id);
    } finally { restore(); }
  }
});

test('document retry resets old values/errors and discards an earlier success or failure', async () => {
  for (const rejectOld of [false, true]) {
    const older = deferred(), newer = deferred(), history = [], signals = [];
    const flow = createDocumentRead({ load: ({ signal }) => { signals.push(signal); return signals.length === 1 ? older.promise : newer.promise; }, isCurrent: () => true, onChange: state => history.push(state) });
    const first = flow.reload(), second = flow.reload();
    assert.equal(signals[0].aborted, true); assert.deepEqual(history.at(-1), initialDocumentRead());
    if (rejectOld) older.reject(new Error('old failure')); else older.resolve([document]);
    await first; assert.equal(history.length, 2);
    newer.resolve([]); await second;
    assert.deepEqual(history.at(-1), { status: 'ready', value: [], error: null });
    flow.dispose();
  }
});

test('document route disposal and changed authorization suppress pending completions and further retries', async () => {
  for (const dispose of [false, true]) for (const reject of [false, true]) {
    const pending = deferred(), history = []; let current = true, calls = 0, signal;
    const flow = createDocumentRead({ load: options => { signal = options.signal; calls++; return pending.promise; }, isCurrent: () => current, onChange: state => history.push(state) });
    const read = flow.reload();
    if (dispose) flow.dispose(); else current = false;
    if (reject) pending.reject(new Error('late failure')); else pending.resolve([document]);
    await read; await flow.reload();
    assert.equal(history.length, dispose ? 1 : 2); assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  }
});

test('failed document reads can explicitly retry successfully without carrying old errors', async () => {
  const history = []; let calls = 0;
  const flow = createDocumentRead({ load: async () => { if (++calls === 1) throw new Error('failure'); return []; }, isCurrent: () => true, onChange: state => history.push(state) });
  await flow.reload(); assert.equal(history.at(-1).status, 'error');
  await flow.reload(); assert.deepEqual(history.at(-2), initialDocumentRead()); assert.deepEqual(history.at(-1), { status: 'ready', value: [], error: null });
});

test('document error messages expose no private diagnostics and login return accepts only exact documents path', () => {
  assert.equal(documentReadError({ status: 403 }), 'Нет доступа к документам.');
  assert.equal(documentReadError({ status: 401 }), 'Сессия завершилась. Войдите снова.');
  assert.equal(documentReadError({ code: 'invalid_document_response' }), 'Не удалось подтвердить данные документов. Повторите загрузку.');
  assert.equal(documentReadError({ message: 'private diagnostic' }), 'Не удалось загрузить документы. Повторите попытку.');
  assert.equal(loginDestination('/b2b/documents'), '/b2b/documents');
  for (const path of ['//evil.invalid', 'https://evil.invalid/b2b/documents', 'javascript:alert(1)', '/b2b/documents/', '/b2b/documents/files',
    `/b2b/documents/${id}`, '/b2b/documents?next=bad', '/b2b/documents#secret', '/b2b/documents/../profile', '/b2b%2Fdocuments', '/B2B/documents', '/b2b/documents\\evil', [' /b2b/documents']]) assert.equal(loginDestination(path), '/b2b');
});
