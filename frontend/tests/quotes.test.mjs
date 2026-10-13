import assert from 'node:assert/strict';
import test from 'node:test';
import { canReuseAttempt, decodeDraft, hasQuoteSnapshot, quotePayload, quoteTitle, quoteScope, selectionFingerprint, UUID } from '../lib/quotes/model.js';
import { normalizeApiSelection } from '../lib/catalog/apiData.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
const productA = '11111111-1111-4111-8111-111111111111', productB = '22222222-2222-4222-8222-222222222222';
const items = [{ id: 'one', databaseId: productA, quantity: 2 }, { id: 'two', databaseId: productB, quantity: 3 }];
test('RFQ sends original UUIDs, bounded quantities, comment and no client snapshots', () => {
  assert.deepEqual(quotePayload(items, ' Project '), { comment: 'Project', items: [{ product_id: productA, quantity: 2 }, { product_id: productB, quantity: 3 }] });
  assert.equal(quotePayload(items).comment, null);
  assert.throws(() => quotePayload([]));
  assert.throws(() => quotePayload([{ id: 'one', quantity: 1 }]));
  assert.throws(() => quotePayload([...items, items[0]]));
  for (const quantity of [0, -1, 1.5, 1000, NaN]) assert.throws(() => quotePayload([{ ...items[0], quantity }]));
  assert.throws(() => quotePayload(items, 'a'.repeat(4001)));
  assert.throws(() => quotePayload(Array(101).fill(items[0])));
});
test('selection preserves verified database IDs without substituting public IDs', () => {
  assert.deepEqual(normalizeApiSelection(items), items);
  assert.deepEqual(normalizeApiSelection([{ id: 'one', databaseId: 'one', quantity: 1 }]), [{ id: 'one', quantity: 1 }]);
  assert.equal(UUID.test(normalizeApiSelection([{ id: 'one', quantity: 1 }])[0].databaseId || ''), false);
});
test('same request survives order changes/reloads; edited quantity, comment, or original UUID does not reuse attempt', () => {
  const attempt = { key: productA, selection: selectionFingerprint(items), comment: 'Project', payload: quotePayload(items, 'Project'), quoteId: null };
  assert.equal(canReuseAttempt(attempt, [...items].reverse(), 'Project'), true);
  assert.equal(canReuseAttempt(attempt, [{ ...items[0], quantity: 4 }, items[1]], 'Project'), false);
  assert.equal(canReuseAttempt(attempt, items, 'Edited'), false);
  assert.equal(canReuseAttempt(attempt, [{ ...items[0], databaseId: productB }, items[1]], 'Project'), false);
  const saved = decodeDraft(JSON.stringify({ version: 1, comment: 'Project', attempt }));
  assert.deepEqual(saved.attempt, attempt);
  assert.equal(canReuseAttempt(saved.attempt, items, saved.comment), true);
});
test('drafts are user/org scoped, malformed state fails closed', () => {
  assert.equal(quoteScope({ user: { id: 'user' }, organization: { id: 'org' } }), 'org:user');
  assert.equal(quoteScope(null), null);
  assert.equal(decodeDraft('invalid').corrupt, true);
  assert.equal(decodeDraft(JSON.stringify({ version: 1, comment: '', attempt: { key: 'bad' } })).corrupt, true);
  assert.equal(decodeDraft('{}').corrupt, false);
});
test('login resumes only known internal routes, including RFQ detail and live review', () => {
  for (const value of ['/inquiry?source=api', '/b2b/quotes', `/b2b/quotes/${productA}`, '/admin/catalog']) assert.equal(loginDestination(value), value);
  for (const value of ['https://evil.test', '//evil.test', 'javascript:alert(1)', '/inquiry?source=api&next=bad', '/b2b/quotes/../../admin', '/b2b/quotes/not-an-id', null]) assert.equal(loginDestination(value), '/b2b');
});

const { completeQuoteAttempt, prepareQuoteAttempt, resetQuoteDraft, saveQuoteComment } = await import('../lib/quotes/store.js');
function browserStore() {
  const data = new Map(), previous = globalThis.window;
  let denied = false, quota = false;
  globalThis.window = {
    sessionStorage: { get length() { return data.size; }, key: index => [...data.keys()][index], getItem(key) { if (denied) throw new Error('blocked'); return data.get(key) || null; }, setItem(key, value) { if (denied || quota) throw new Error('full'); data.set(key, value); } },
    dispatchEvent() {},
  };
  return { data, deny() { denied = true; }, quota() { quota = true; }, restore() { globalThis.window = previous; } };
}
test('durable attempt is reused across reloads, completion; each edit rotates it', () => {
  const browser = browserStore();
  try {
    saveQuoteComment('org:user', 'Project');
    const first = prepareQuoteAttempt('org:user', items);
    assert.deepEqual(prepareQuoteAttempt('org:user', items), first);
    assert.equal(JSON.parse(browser.data.get('alageum.quote.draft.v1:org:user')).attempt.key, first.key);
    completeQuoteAttempt('org:user', first.key, productB);
    assert.equal(prepareQuoteAttempt('org:user', items).quoteId, productB);
    saveQuoteComment('org:user', 'Edited');
    const second = prepareQuoteAttempt('org:user', items);
    assert.notEqual(second.key, first.key);
    const third = prepareQuoteAttempt('org:user', [{ ...items[0], quantity: 4 }, items[1]]);
    assert.notEqual(third.key, second.key);
    assert.equal(third.quoteId, null);
  } finally { browser.restore(); }
});
test('different user or organization never reuses draft, idempotency key or completion', () => {
  const browser = browserStore();
  try {
    saveQuoteComment('org:user1', 'Private project');
    const first = prepareQuoteAttempt('org:user1', items);
    for (const scope of ['org:user2', 'other-org:user1']) {
      const other = prepareQuoteAttempt(scope, items);
      assert.notEqual(other.key, first.key); assert.equal(other.comment, ''); assert.equal(other.quoteId, null);
    }
    assert.equal(prepareQuoteAttempt('org:user1', items).comment, 'Private project');
  } finally { browser.restore(); }
});
test('storage denial/quota aborts before a new submission attempt can be returned', () => {
  for (const mode of ['deny', 'quota']) {
    const browser = browserStore();
    try { browser[mode](); assert.throws(() => prepareQuoteAttempt('org:user', items), /хранилищ|сохран/); assert.equal(browser.data.size, 0); }
    finally { browser.restore(); }
  }
});
test('corrupt idempotency state is not silently discarded and overwritten', () => {
  const browser = browserStore();
  try {
    browser.data.set('alageum.quote.draft.v1:org:user', '{broken');
    assert.throws(() => prepareQuoteAttempt('org:user', items), /повреждён/);
    assert.equal(browser.data.get('alageum.quote.draft.v1:org:user'), '{broken');
    resetQuoteDraft('org:user');
    assert.ok(prepareQuoteAttempt('org:user', items).key);
  } finally { browser.restore(); }
});

test('valid JSON with a mismatching saved payload fails closed before network submission', () => {
  const browser = browserStore();
  try {
    const first = prepareQuoteAttempt('org:user', items);
    const key = 'alageum.quote.draft.v1:org:user';
    const value = JSON.parse(browser.data.get(key));
    value.attempt.payload.items[0].quantity = 98;
    browser.data.set(key, JSON.stringify(value));
    assert.throws(() => prepareQuoteAttempt('org:user', items), /повреждён/);
    assert.equal(JSON.parse(browser.data.get(key)).attempt.key, first.key);
  } finally { browser.restore(); }
});
test('no-op selection and reverted unsent edits preserve an uncertain attempt', () => {
  const browser = browserStore();
  try {
    saveQuoteComment('org:user', 'original');
    const first = prepareQuoteAttempt('org:user', items);
    saveQuoteComment('org:user', 'edited');
    saveQuoteComment('org:user', 'original');
    assert.equal(prepareQuoteAttempt('org:user', items).key, first.key);
    assert.equal(prepareQuoteAttempt('org:user', [...items].reverse()).key, first.key);
  } finally { browser.restore(); }
});

test('legacy generic/AI items with empty snapshots never imply a historical catalogue copy', () => {
  for (const product_snapshot of [undefined, null, {}, []]) {
    const item = { quantity: '2', product_snapshot };
    assert.equal(hasQuoteSnapshot(item), false);
    assert.equal(quoteTitle(item), 'Позиция запроса');
  }
  assert.equal(hasQuoteSnapshot({ product_snapshot: { public_key: 'one', version: 1, price_mode: 'on_request' } }), true);
  assert.equal(hasQuoteSnapshot({ product_snapshot: { translations: { ru: { name: 'Сохранённое название' } } } }), true);
});
