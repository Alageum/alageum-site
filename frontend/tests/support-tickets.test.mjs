import assert from 'node:assert/strict';
import test from 'node:test';
import { createTicket, getTicketCategories, getTickets } from '../lib/api/support.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
import { getSession, setSession } from '../lib/api/client.js';
import { createTicketSubmission, initialTicketSubmission, supportAccess, supportReadError, validateTicket } from '../lib/support/model.js';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
const category = { id: '10000000-0000-4000-8000-000000000001', code: 'other', label: 'Fictitious category' };
const draft = { category_id: category.id, subject: ' Fictitious subject ', message: ' Fictitious message\n' };
const session = { access_token: 'fixture-a', refresh_token: 'fixture-ra', organization_id: 'fixture-organization-a' };
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness(save) {
  let state = initialTicketSubmission(), valid = true;
  const confirmations = [], history = [];
  const flow = createTicketSubmission({ save, isCurrent: () => valid, onChange: next => { state = next; history.push(next); }, onConfirmed: summary => confirmations.push(summary) });
  return { flow, confirmations, history, state: () => state, invalidate: () => { valid = false; } };
}
function browser(fetcher) {
  const old = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch }, data = new Map();
  globalThis.window = { dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  globalThis.fetch = fetcher;
  return () => { Object.assign(globalThis, old); };
}

test('support permissions independently gate read, create and navigation', () => {
  assert.deepEqual(supportAccess(), { readable: false, creatable: false, visible: false });
  assert.deepEqual(supportAccess(['ticket.read']), { readable: true, creatable: false, visible: true });
  assert.deepEqual(supportAccess(['ticket.create']), { readable: false, creatable: true, visible: true });
  assert.deepEqual(supportAccess(['ticket.read', 'ticket.create']), { readable: true, creatable: true, visible: true });
  assert.equal(supportAccess(['quote.read']).visible, false);
});

test('validation preserves whitespace and counts Unicode code points exactly as the HTTP contract', () => {
  assert.deepEqual(validateTicket(draft, [category]), {});
  assert.deepEqual(validateTicket({ ...draft, subject: ' ', message: '\n' }, [category]), {});
  assert.deepEqual(validateTicket({ ...draft, subject: '😀'.repeat(300), message: '😀'.repeat(10000) }, [category]), {});
  assert.deepEqual(Object.keys(validateTicket({ ...draft, subject: '😀'.repeat(301), message: '😀'.repeat(10001) }, [category])), ['subject', 'message']);
  assert.deepEqual(Object.keys(validateTicket({ category_id: 'unknown', subject: '', message: '' }, [category])), ['category_id', 'subject', 'message']);
});

test('invalid fields never start a write', async () => {
  let calls = 0; const { flow, state } = harness(async () => { calls++; });
  await flow.submit({ ...draft, subject: '' }, [category]);
  assert.equal(calls, 0); assert.equal(flow.isPending(), false); assert.ok(state().errors.subject);
});

test('synchronous repeated submit sends exactly one untouched payload and confirms once', async () => {
  const pending = deferred(), calls = [];
  const { flow, state, confirmations } = harness((data, options) => { calls.push({ data, options }); return pending.promise; });
  const first = flow.submit({ ...draft, unrequested: 'excluded' }, [category]);
  await flow.submit(draft, [category]); await flow.submit(draft, [category]);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].data, draft); assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(state().pending, true); assert.equal(flow.startNew(), false);
  pending.resolve({ id: 'accepted' }); await first;
  assert.deepEqual(confirmations, [{ id: 'accepted' }]); assert.equal(state().message, 'Обращение создано'); assert.equal(flow.isPending(), false);
});

test('known validation or permission rejection allows explicit corrected submission without automatic retry', async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    let calls = 0;
    const { flow, state } = harness(async () => { calls++; throw Object.assign(new Error('Fictitious rejection'), { status }); });
    await flow.submit(draft, [category]);
    assert.equal(calls, 1); assert.equal(state().uncertain, false); assert.equal(state().pending, false);
    await flow.submit(draft, [category]); assert.equal(calls, 2);
  }
});

test('network and ambiguous responses lock submission until deliberate new-draft clearing', async () => {
  for (const status of [undefined, 408, 429, 500, 502]) {
    let calls = 0;
    const { flow, state } = harness(async () => { calls++; throw Object.assign(new Error('Fictitious failure'), { status }); });
    await flow.submit(draft, [category]);
    assert.equal(state().uncertain, true); assert.match(state().error, /дубликат/); assert.match(state().error, /не подтверждает/);
    await flow.submit(draft, [category]); assert.equal(flow.cancel(), false); assert.equal(calls, 1);
    assert.equal(flow.startNew(), true); assert.equal(state().uncertain, false); assert.equal(calls, 1);
  }
});

test('cancelling pending wait aborts locally and late acceptance cannot unlock or confirm', async () => {
  const pending = deferred(); let signal;
  const { flow, state, confirmations } = harness((_data, options) => { signal = options.signal; return pending.promise; });
  const first = flow.submit(draft, [category]);
  assert.equal(flow.cancel(), false); assert.equal(signal.aborted, true); assert.equal(state().uncertain, true);
  pending.resolve({ id: 'possibly-created' }); await first;
  assert.equal(state().uncertain, true); assert.deepEqual(confirmations, []);
});

test('late cancelled completion cannot clear a newer draft or its pending write', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const { flow, state, confirmations } = harness(() => ++calls === 1 ? first.promise : second.promise);
  const old = flow.submit(draft, [category]); flow.cancel(); flow.startNew();
  const newer = flow.submit({ ...draft, subject: 'New draft' }, [category]);
  first.resolve({ id: 'old' }); await old;
  assert.equal(state().pending, true); assert.deepEqual(confirmations, []);
  second.resolve({ id: 'new' }); await newer;
  assert.deepEqual(confirmations, [{ id: 'new' }]);
});

test('scope replacement and disposal suppress both late success and failure', async () => {
  for (const kind of ['scope', 'dispose']) for (const outcome of ['success', 'failure']) {
    const pending = deferred();
    const { flow, history, confirmations, invalidate } = harness(() => pending.promise);
    const saving = flow.submit(draft, [category]);
    if (kind === 'scope') invalidate(); else flow.dispose();
    if (outcome === 'success') pending.resolve({ id: 'old-private-summary' }); else pending.reject(new Error('Old private error'));
    await saving; assert.equal(history.length, 1); assert.deepEqual(confirmations, []);
  }
});

test('cancel before submit clears only local state and creates nothing', async () => {
  let calls = 0; const { flow, state } = harness(async () => { calls++; });
  assert.equal(flow.cancel(), true); assert.deepEqual(state(), initialTicketSubmission()); assert.equal(calls, 0);
});

test('support reads pass cancellation and tenant headers through the shared transport', async () => {
  const summary = { id: category.id, subject: draft.subject, category: 'other', status: 'new' };
  const calls = [], restore = browser(async (url, options) => { calls.push({ url, options }); return response(200, { items: [url.endsWith('/categories') ? category : summary], page: 1, page_size: 50, total: 1 }); });
  try {
    setSession(session); const controller = new AbortController();
    assert.deepEqual(await getTicketCategories({ signal: controller.signal }), [category]);
    assert.deepEqual(await getTickets({ signal: controller.signal }), [summary]);
    assert.deepEqual(calls.map(call => call.url), [`${apiBase}/support/categories`, `${apiBase}/support/tickets`]);
    for (const call of calls) { assert.equal(call.options.signal, controller.signal); assert.equal(call.options.headers.get('X-Organization-ID'), session.organization_id); }
  } finally { restore(); }
});

test('malformed successful support reads fail instead of inventing an empty state', async () => {
  for (const body of [{}, null, { items: [] }, { items: {}, page: 1, page_size: 50, total: 0 },
    { items: [category], page: 0, page_size: 50, total: 1 }, { items: [category], page: 1, page_size: 50, total: -1 },
    { items: [{ ...category, id: 'invalid' }], page: 1, page_size: 50, total: 1 },
    { items: [{ ...category, label: 42 }], page: 1, page_size: 50, total: 1 }]) {
    const restore = browser(async () => response(200, body));
    try { setSession(session); await assert.rejects(getTicketCategories(), { code: 'invalid_support_page' }); }
    finally { restore(); }
  }
  const restore = browser(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Fictitious truncated JSON'); } }));
  try { setSession(session); await assert.rejects(getTickets(), { code: 'invalid_support_page' }); }
  finally { restore(); }
});

test('valid empty pages and legacy empty string fields remain representable', async () => {
  for (const [read, item] of [[getTicketCategories, { id: category.id, code: '', label: '' }], [getTickets, { id: category.id, subject: '', category: '', status: '' }]]) {
    for (const items of [[], [item]]) {
      const restore = browser(async () => response(200, { items, page: 1, page_size: 50, total: items.length }));
      try { setSession(session); assert.deepEqual(await read(), items); }
      finally { restore(); }
    }
  }
});

test('count and rows may reflect a concurrent committed create under read committed isolation', async () => {
  const restore = browser(async () => response(200, { items: [category], page: 1, page_size: 50, total: 0 }));
  try { setSession(session); assert.deepEqual(await getTicketCategories(), [category]); }
  finally { restore(); }
});

test('support POST never refreshes or replays after 401', async () => {
  const calls = [], restore = browser(async (url, options) => { calls.push({ url, options }); return response(401); });
  try {
    setSession(session); await assert.rejects(createTicket(draft), { status: 401 });
    assert.equal(calls.length, 1); assert.equal(calls[0].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].options.body), draft); assert.deepEqual(getSession(), {});
  } finally { restore(); }
});

test('a malformed or missing successful receipt stays uncertain, preserves the attempt and never replays', async () => {
  for (const reply of [response(201, {}), response(204), response(201, { id: category.id, subject: 'wrong subject', category: 'other', status: 'new' }),
    { status: 201, ok: true, json: async () => { throw new SyntaxError('Fictitious truncated JSON'); } }]) {
    let calls = 0;
    const restore = browser(async () => { calls++; return reply; });
    try {
      setSession(session); const { flow, state, confirmations } = harness(createTicket);
      await flow.submit(draft, [category]);
      assert.equal(state().uncertain, true); assert.deepEqual(confirmations, []);
      await flow.submit(draft, [category]); assert.equal(calls, 1);
    } finally { restore(); }
  }
});

test('a valid ticket receipt confirms the exact preserved subject', async () => {
  const summary = { id: category.id, subject: draft.subject, category: 'other', status: 'new' };
  const restore = browser(async () => response(201, summary));
  try { setSession(session); assert.deepEqual(await createTicket(draft), summary); }
  finally { restore(); }
});

for (const kind of ['organization', 'new-login', 'same-login']) test(`support reads and writes reject late replies after ${kind} changes`, async () => {
  for (const call of [getTickets, getTicketCategories, () => createTicket(draft)]) {
    const pending = deferred(), restore = browser(async () => pending.promise);
    try {
      setSession(session); const waiting = call();
      setSession(kind === 'organization' ? { ...session, organization_id: 'fixture-b' } : kind === 'new-login' ? { ...session, access_token: 'new', refresh_token: 'new-r' } : session);
      pending.resolve(response(200, { items: [category], id: 'old' }));
      await assert.rejects(waiting, { code: 'session_changed' });
    } finally { restore(); }
  }
});

test('support errors identify the failed permitted resource without presenting it as empty', () => {
  assert.match(supportReadError({ status: 403 }, 'categories'), /категориям/);
  assert.match(supportReadError({ status: 403 }, 'tickets'), /списку/);
  assert.match(supportReadError(new Error('offline'), 'categories'), /Не удалось загрузить/);
  assert.match(supportReadError({ status: 401 }, 'tickets'), /Войдите снова/);
});

test('login resumes the exact existing support path from the decoded next parameter', () => {
  assert.equal(loginDestination('/b2b/support'), '/b2b/support');
  const next = new URLSearchParams('next=%2Fb2b%2Fsupport').get('next');
  assert.equal(loginDestination(next), '/b2b/support');
});

test('support login return allowlist still rejects external, modified and unknown destinations', () => {
  for (const value of [
    'https://example.invalid/b2b/support', '//example.invalid/b2b/support', 'javascript:alert(1)',
    '/b2b/support?next=https://example.invalid', '/b2b/support?anything=1', '/b2b/support#anything',
    '/b2b/support/', '/b2b/support/tickets', `/b2b/support/${category.id}`, '/b2b/support/../quotes',
    '/b2b/unknown', '/B2B/SUPPORT', '%2Fb2b%2Fsupport', '/b2b%2Fsupport',
    ' /b2b/support', '/b2b/support ', '/b2b/support\\example.invalid', null, undefined, [], {},
  ]) assert.equal(loginDestination(value), '/b2b');
});
