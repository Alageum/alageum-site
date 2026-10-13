import assert from 'node:assert/strict';
import test from 'node:test';
import { apiFetch, clearSession, getSession, setSession } from '../lib/api/client.js';
import { createQuote } from '../lib/api/quotes.js';
import { completeQuoteAttempt, prepareQuoteAttempt, resetQuoteDraft, saveQuoteComment } from '../lib/quotes/store.js';
import { createQuoteContinuation } from '../lib/quotes/continuation.js';
import { organizationProfileScope } from '../lib/organizations/profile.js';
import { getSessionGeneration } from '../lib/api/sessionTransport.js';
const organizationA = '10000000-0000-4000-8000-000000000001', organizationB = '10000000-0000-4000-8000-000000000002';
const productId = '10000000-0000-4000-8000-000000000003', quoteId = '10000000-0000-4000-8000-000000000004';
const sessionA = { access_token: 'fixture-a', refresh_token: 'fixture-refresh-a', organization_id: organizationA };
const sessionB = { access_token: 'fixture-b', refresh_token: 'fixture-refresh-b', organization_id: organizationA };
const items = [{ id: 'fixture-product', databaseId: productId, quantity: 1 }];
const prefix = 'alageum.quote.draft.v1:';
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function browser(fetcher) {
  const previous = { window: globalThis.window, storage: globalThis.sessionStorage, fetch: globalThis.fetch }, data = new Map();
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  globalThis.window = { sessionStorage: storage, dispatchEvent() {} };
  globalThis.sessionStorage = storage; globalThis.fetch = fetcher;
  return { data, draft: scope => JSON.parse(data.get(prefix + scope)), restore() { globalThis.window = previous.window; globalThis.sessionStorage = previous.storage; globalThis.fetch = previous.fetch; } };
}
function begin(scope, comment) { saveQuoteComment(scope, comment); return prepareQuoteAttempt(scope, items); }
function submit(scope, attempt, receiptArguments = []) {
  // This is the same fixed original-owner binding used by LiveInquiry.
  return createQuote(attempt.payload, attempt.key, (...args) => {
    receiptArguments.push(args); completeQuoteAttempt(scope, attempt.key, args[0]);
  });
}

for (const boundary of ['account', 'organization', 'logout']) test(`accepted quote receipt survives ${boundary} change only in its original scoped attempt`, async () => {
  const pending = deferred(), calls = [], received = [];
  const env = browser(async (url, options) => { calls.push({ url, options }); return pending.promise; });
  const original = `${organizationA}:user-a`;
  const current = boundary === 'organization' ? `${organizationB}:user-a` : `${organizationA}:user-b`;
  let continuations = 0;
  try {
    setSession(sessionA); const attempt = begin(original, 'Original private message');
    const sending = submit(original, attempt, received).then(() => { continuations++; });
    if (boundary === 'logout') clearSession();
    else setSession(boundary === 'organization' ? { ...sessionA, organization_id: organizationB } : sessionB);
    begin(current, 'New owner draft'); const currentDraft = env.data.get(prefix + current);
    pending.resolve(response(201, { id: quoteId, comment: 'Old private server body', organization_id: organizationA }));
    await assert.rejects(sending, { code: 'session_changed' });
    assert.equal(env.draft(original).attempt.quoteId, quoteId);
    assert.equal(env.data.get(prefix + current), currentDraft);
    assert.deepEqual(received, [[quoteId]]); assert.equal(continuations, 0);
    assert.equal(calls.length, 1); assert.equal(calls[0].options.headers.get('X-Organization-ID'), organizationA);
    assert.equal(calls[0].options.headers.get('Idempotency-Key'), attempt.key);
    assert.deepEqual(getSession(), boundary === 'logout' ? {} : boundary === 'organization' ? { ...sessionA, organization_id: organizationB } : sessionB);
  } finally { env.restore(); }
});

test('same-account relogin and newer attempt cannot be overwritten by an accepted older receipt', async () => {
  const pending = deferred(), env = browser(async () => pending.promise), scope = `${organizationA}:user-a`;
  let continuations = 0;
  try {
    setSession(sessionA); const old = begin(scope, 'Old attempt');
    const sending = submit(scope, old).then(() => { continuations++; });
    setSession(sessionA); const newer = begin(scope, 'New login draft');
    assert.notEqual(newer.key, old.key); const before = env.data.get(prefix + scope);
    pending.resolve(response(201, { id: quoteId, comment: 'Old response' }));
    await assert.rejects(sending, { code: 'session_changed' });
    assert.equal(env.data.get(prefix + scope), before); assert.equal(env.draft(scope).attempt.quoteId, null);
    assert.equal(continuations, 0); assert.deepEqual(getSession(), sessionA);
  } finally { env.restore(); }
});

test('same-account relogin suppresses old UI errors before unmount while keeping a newer attempt intact', async () => {
  const pending = deferred(), env = browser(async () => pending.promise), scope = `${organizationA}:user-a`;
  const profile = { user: { id: 'user-a' }, organization: { id: organizationA } };
  const liveScope = () => organizationProfileScope(profile, 1, getSessionGeneration());
  const paintedErrors = [];
  try {
    setSession(sessionA); const flow = createQuoteContinuation(liveScope(), candidate => candidate === liveScope());
    const old = begin(scope, 'Old sent attempt');
    const sending = submit(scope, old).catch(error => { if (flow.isCurrent()) paintedErrors.push(error.message); throw error; });
    setSession(sessionA); begin(scope, 'New login draft'); const before = env.data.get(prefix + scope);
    assert.equal(flow.isCurrent(), false); // Deliberately do not call dispose yet.
    pending.resolve(response(201, { id: quoteId })); await assert.rejects(sending, { code: 'session_changed' });
    assert.deepEqual(paintedErrors, []); assert.equal(env.data.get(prefix + scope), before);
    const next = createQuoteContinuation(liveScope(), candidate => candidate === liveScope());
    assert.equal(next.isCurrent(), true); flow.dispose(); next.dispose();
  } finally { env.restore(); }
});

test('ordinary refresh keeps a current RFQ UI continuation but navigation disposal ends it', () => {
  const env = browser(async () => response(200)), profile = { user: { id: 'user-a' }, organization: { id: organizationA } };
  const liveScope = () => organizationProfileScope(profile, 1, getSessionGeneration());
  try {
    setSession(sessionA); const flow = createQuoteContinuation(liveScope(), candidate => candidate === liveScope());
    setSession({ ...sessionA, access_token: 'rotated-fixture', refresh_token: 'rotated-refresh' }, { preserveGeneration: true });
    assert.equal(flow.isCurrent(), true);
    flow.dispose(); assert.equal(flow.isCurrent(), false);
  } finally { env.restore(); }
});

test('disposing an RFQ UI flow preserves its accepted receipt without a navigation continuation', async () => {
  const pending = deferred(), env = browser(async () => pending.promise), scope = `${organizationA}:user-a`;
  let navigations = 0;
  try {
    setSession(sessionA); const flow = createQuoteContinuation('current-login', () => true);
    const attempt = begin(scope, 'Sent before navigation');
    const sending = submit(scope, attempt).then(value => { if (flow.isCurrent()) navigations++; return value; });
    flow.dispose(); pending.resolve(response(201, { id: quoteId })); await sending;
    assert.equal(env.draft(scope).attempt.quoteId, quoteId); assert.equal(navigations, 0);
  } finally { env.restore(); }
});

test('resetting an original attempt prevents a late receipt from recreating it', async () => {
  const pending = deferred(), env = browser(async () => pending.promise), scope = `${organizationA}:user-a`;
  try {
    setSession(sessionA); const attempt = begin(scope, 'Old attempt'); const sending = submit(scope, attempt);
    resetQuoteDraft(scope); setSession(sessionB); const before = env.data.get(prefix + scope);
    pending.resolve(response(201, { id: quoteId })); await assert.rejects(sending, { code: 'session_changed' });
    assert.equal(env.data.get(prefix + scope), before); assert.equal(env.draft(scope).attempt, null);
  } finally { env.restore(); }
});

test('receipt persistence preserves a newer unsent comment while completing only the exact old attempt', async () => {
  const pending = deferred(), env = browser(async () => pending.promise), scope = `${organizationA}:user-a`;
  try {
    setSession(sessionA); const attempt = begin(scope, 'Sent comment'); const sending = submit(scope, attempt);
    saveQuoteComment(scope, 'New unsent comment'); setSession(sessionB);
    pending.resolve(response(201, { id: quoteId })); await assert.rejects(sending, { code: 'session_changed' });
    assert.equal(env.draft(scope).comment, 'New unsent comment');
    assert.equal(env.draft(scope).attempt.comment, 'Sent comment'); assert.equal(env.draft(scope).attempt.quoteId, quoteId);
  } finally { env.restore(); }
});

test('created and replayed quote responses persist a minimal receipt and complete normally once', async () => {
  for (const status of [200, 201]) {
    const body = { id: quoteId, comment: 'Authorized current body' }, env = browser(async () => response(status, body));
    const scope = `${organizationA}:user-a`, received = [];
    try {
      setSession(sessionA); const attempt = begin(scope, 'Current draft');
      assert.deepEqual(await submit(scope, attempt, received), body);
      assert.equal(env.draft(scope).attempt.quoteId, quoteId); assert.deepEqual(received, [[quoteId]]);
    } finally { env.restore(); }
  }
});

test('receipt storage failure retains accepted response semantics without refreshing or replaying', async () => {
  let calls = 0; const env = browser(async () => { calls++; return response(201, { id: quoteId }); });
  try {
    setSession(sessionA);
    assert.deepEqual(await createQuote({ items: [] }, productId, () => { throw new Error('Storage quota'); }), { id: quoteId });
    assert.equal(calls, 1); assert.deepEqual(getSession(), sessionA);
  } finally { env.restore(); }
});

test('401 and other failed mutations never invoke an accepted-receipt writer or replay', async () => {
  for (const status of [401, 403, 409, 422, 500]) {
    let calls = 0, receipts = 0;
    const env = browser(async () => { calls++; return response(status, { id: quoteId }); });
    try {
      setSession(sessionA); await assert.rejects(createQuote({ items: [] }, productId, () => { receipts++; }), { status });
      assert.equal(calls, 1); assert.equal(receipts, 0);
    } finally { env.restore(); }
  }
});

test('malformed successful quote IDs fail closed without marking the attempt complete', async () => {
  for (const body of [{}, { id: 42 }, { id: 'not-a-uuid', comment: 'Never a receipt' }]) {
    let receipts = 0; const env = browser(async () => response(201, body));
    try {
      setSession(sessionA); await assert.rejects(createQuote({ items: [] }, productId, () => { receipts++; }), { code: 'invalid_quote_receipt' });
      assert.equal(receipts, 0); assert.deepEqual(getSession(), sessionA);
    } finally { env.restore(); }
  }
});

test('202 and other unexpected success statuses do not confirm a persisted quote receipt', async () => {
  for (const status of [202, 203, 204, 206]) {
    let receipts = 0; const env = browser(async () => response(status, { id: quoteId }));
    try {
      setSession(sessionA); await assert.rejects(createQuote({ items: [] }, productId, () => { receipts++; }), { code: 'invalid_quote_receipt' });
      assert.equal(receipts, 0); assert.deepEqual(getSession(), sessionA);
      // The dedicated receipt rule does not change ordinary API handling.
      assert.deepEqual(await apiFetch('/ordinary-resource'), status === 204 ? null : { id: quoteId });
    } finally { env.restore(); }
  }
});

test('ordinary API mutations still reject their full stale response without any receipt exception', async () => {
  const pending = deferred(), env = browser(async () => pending.promise); let continuations = 0;
  try {
    setSession(sessionA); const sending = apiFetch('/quotes/catalog', { method: 'POST', body: '{}' }).then(() => { continuations++; });
    setSession(sessionB); pending.resolve(response(201, { id: quoteId, comment: 'Private old response' }));
    await assert.rejects(sending, { code: 'session_changed' }); assert.equal(continuations, 0);
  } finally { env.restore(); }
});
