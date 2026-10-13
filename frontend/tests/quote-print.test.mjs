import assert from 'node:assert/strict';
import test from 'node:test';
import { quotePrintDate, quotePrintItem, validPrintableQuote } from '../lib/quotes/print.js';
import { loginDestination } from '../lib/api/loginRedirect.js';
import { createQuotePrintSession } from '../lib/quotes/printSession.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profile = { user: { id: 'buyer' }, organization: { id: 'org' }, permissions: ['quote.read'] };
const item = { id: itemId, product_id: itemId, quantity: '999999999999999.999', product_snapshot: { translations: { ru: { name: 'Сохранённое\nназвание' } }, sku: 'OLD-SKU', version: 7, price_mode: 'fixed', price: '9999999999999999.99', currency: 'KZT' } };
const quote = { id, status: 'submitted', created_at: '2026-10-01T00:00:00Z', comment: 'Строка 1\nСтрока 2', items: [item] };
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture(options = {}) {
  let current = true, paper = false, state, session;
  const calls = [], states = [];
  session = createQuotePrintSession({
    id, userId: 'buyer', organizationId: 'org', isCurrent: () => current,
    readProfile: async signal => { calls.push(['me', signal]); return options.readProfile ? options.readProfile(signal) : profile; },
    readQuote: async (quoteId, signal) => { calls.push(['quote', quoteId, signal]); return options.readQuote ? options.readQuote(quoteId, signal) : quote; },
    onChange: (value, immediate) => { state = value; states.push({ value, immediate }); },
    showPaper: () => { paper = true; calls.push(['show']); },
    hidePaper: () => { paper = false; calls.push(['hide']); },
    print: async () => { calls.push(['print']); if (options.print) return options.print(session); session.beforePrint(); session.afterPrint(); },
  });
  return { session, calls, states, get state() { return state; }, get paper() { return paper; }, setCurrent: value => { current = value; } };
}
const accesses = f => f.calls.filter(call => ['me', 'quote', 'print', 'show'].includes(call[0])).map(call => call[0]);

test('print values preserve exact saved decimal and multiline strings without totals or live enrichments', () => {
  assert.deepEqual(quotePrintItem(item), { id: itemId, productId: itemId, quantity: '999999999999999.999', title: 'Сохранённое\nназвание', sku: 'OLD-SKU', price: '9999999999999999.99 KZT', version: '7', missingSnapshot: false, missingName: false });
  assert.equal(validPrintableQuote(quote, id), true);
  assert.match(quotePrintDate(quote.created_at), /UTC$/);
});
test('empty legacy snapshot never guesses title, money, version or company data', () => {
  for (const product_snapshot of [null, undefined, {}, []]) {
    const line = quotePrintItem({ ...item, product_snapshot, product: { name: 'LIVE', price: '1' } });
    assert.equal(line.title, 'Позиция запроса'); assert.equal(line.price, 'Не сохранена');
    assert.equal(line.version, 'Не сохранена'); assert.equal(line.sku, 'Не сохранён');
    assert.equal(line.missingSnapshot, true); assert.equal(line.quantity, item.quantity);
  }
});
test('partial snapshot distinguishes unsaved price mode, missing fixed price/currency and explicit on-request', () => {
  const line = product_snapshot => quotePrintItem({ ...item, product_snapshot });
  assert.equal(line({ sku: 'OLD' }).price, 'Не сохранена');
  assert.equal(line({ price_mode: 'fixed', price: null }).price, 'Не сохранена');
  assert.equal(line({ price_mode: 'fixed', price: '0.00' }).price, '0.00 (валюта не сохранена)');
  assert.equal(line({ price_mode: 'on_request', price: '999' }).price, 'По запросу');
  assert.equal(line({ sku: 'OLD' }).missingName, true);
});
test('invalid detail, rounded numeric quantity, different record and malformed date fail closed', () => {
  for (const value of [{ ...quote, id: itemId }, { ...quote, items: [] }, { ...quote, items: [{ ...item, quantity: Number(item.quantity) }] }, { ...quote, created_at: 'bad' }]) assert.equal(validPrintableQuote(value, id), false);
});
test('screen preview verifies current profile then own quote; explicit print repeats both reads', async () => {
  const f = fixture(); await f.session.load(); assert.equal(f.state.data, quote); assert.equal(f.paper, false);
  await f.session.print();
  assert.deepEqual(accesses(f), ['me', 'quote', 'me', 'quote', 'print', 'show']);
  assert.equal(f.states.find(s => s.value.status === 'printing').immediate, true);
  assert.equal(f.state.data, null); assert.equal(f.paper, false);
});
test('missing quote.read, other owner identity or tenant aborts before quote read', async () => {
  for (const value of [{ ...profile, permissions: [] }, { ...profile, permissions: 'quote.read' }, { ...profile, user: { id: 'other' } }, { ...profile, organization: { id: 'other' } }]) {
    const f = fixture({ readProfile: () => value }); await f.session.print();
    assert.deepEqual(accesses(f), ['me']); assert.equal(f.state.status, 'error'); assert.equal(f.paper, false);
  }
});
test('owner/tenant 404, permission denial, expiry and network failures never print prior preview', async () => {
  for (const status of [401, 403, 404, 500]) {
    let denied = false;
    const f = fixture({ readQuote: () => { if (denied) throw Object.assign(new Error('denied'), { status }); return quote; } });
    await f.session.load(); denied = true; await f.session.print();
    assert.equal(f.state.data, null); assert.equal(f.state.status, 'error'); assert.equal(f.paper, false);
    assert.equal(accesses(f).includes('print'), false); f.session.beforePrint(); assert.equal(f.paper, false);
  }
});
test('print clears old private data before a pending refresh and ignores repeated clicks', async () => {
  const gate = deferred(); let hold = false;
  const f = fixture({ readProfile: () => hold ? gate.promise : profile });
  await f.session.load(); hold = true; const pending = f.session.print();
  assert.equal(f.state.data, null); assert.equal(f.paper, false);
  await f.session.print(); assert.equal(accesses(f).filter(v => v === 'me').length, 2);
  gate.resolve(profile); await pending; assert.equal(accesses(f).filter(v => v === 'print').length, 1);
});
test('logout/relogin or switch while current read is pending blocks late private results', async () => {
  for (const stage of ['me', 'quote']) {
    const gate = deferred();
    const f = fixture(stage === 'me' ? { readProfile: () => gate.promise } : { readQuote: () => gate.promise });
    const pending = f.session.print(); await Promise.resolve(); await Promise.resolve();
    f.setCurrent(false); f.session.sessionChanged(); assert.equal(f.paper, false);
    gate.resolve(stage === 'me' ? profile : quote); await pending;
    assert.equal(accesses(f).includes('print'), false);
    assert.ok(f.calls.find(c => c[0] === stage)[stage === 'me' ? 1 : 2].aborted);
  }
});
test('native beforeprint without a fresh explicit grant fails closed, even after preview load', async () => {
  const f = fixture(); await f.session.load(); f.session.beforePrint();
  assert.equal(f.paper, false); assert.equal(f.state.data, null); assert.equal(accesses(f).includes('show'), false);
});
test('one-use grant rejects a repeated native invocation inside an active print call', async () => {
  let f; f = fixture({ print: session => { session.beforePrint(); assert.equal(f.paper, true); session.beforePrint(); assert.equal(f.paper, false); } });
  await f.session.print(); assert.equal(f.state.data, null);
});
test('return without beforeprint and delayed beforeprint cannot expose paper', async () => {
  const f = fixture({ print: () => {} }); await f.session.print();
  assert.equal(f.paper, false); assert.equal(f.state.data, null); f.session.beforePrint(); assert.equal(f.paper, false);
});
test('print return clears paper when afterprint is missing; throwing print also clears', async () => {
  for (const throws of [false, true]) {
    let f; f = fixture({ print: session => { session.beforePrint(); assert.equal(f.paper, true); if (throws) throw new Error('print unavailable'); } });
    await f.session.print(); assert.equal(f.paper, false); assert.equal(f.state.data, null);
  }
});
test('session event synchronously revokes paper while browser print call is still pending', async () => {
  const gate = deferred(); let entered; const ready = new Promise(resolve => { entered = resolve; });
  const f = fixture({ print: session => { session.beforePrint(); entered(); return gate.promise; } });
  const pending = f.session.print(); await ready; assert.equal(f.paper, true);
  f.setCurrent(false); f.session.sessionChanged(); assert.equal(f.paper, false);
  gate.resolve(); await pending; f.session.beforePrint(); assert.equal(f.paper, false);
});
test('cancellation/afterprint allows another fresh read-only print and clears every cycle', async () => {
  const f = fixture(); await f.session.print(); await f.session.print();
  assert.deepEqual(accesses(f), ['me', 'quote', 'print', 'show', 'me', 'quote', 'print', 'show']);
  assert.equal(f.state.data, null); assert.equal(f.paper, false);
});
test('close/back/pagehide and unmount invalidate ignored-abort late reads', async () => {
  for (const action of ['clear', 'dispose']) {
    const gate = deferred(); const f = fixture({ readQuote: () => gate.promise });
    const pending = f.session.print(); await Promise.resolve(); await Promise.resolve();
    f.session[action](); gate.resolve(quote); await pending;
    assert.equal(accesses(f).includes('print'), false); assert.equal(f.paper, false);
  }
});

test('login return allows only the exact persisted print route, without arbitrary suffixes or queries', () => {
  assert.equal(loginDestination(`/b2b/quotes/${id}/print`), `/b2b/quotes/${id}/print`);
  for (const value of [`/b2b/quotes/${id}/print/evil`, `/b2b/quotes/${id}/print?next=https://evil.example`, '//evil.example/print', '/b2b/quotes/not-a-uuid/print']) assert.equal(loginDestination(value), '/b2b');
});

test('same-login token refresh keeps a pending print check while the auth scope remains current', async () => {
  const gate = deferred(); const f = fixture({ readProfile: () => gate.promise });
  const pending = f.session.print(); f.session.sessionChanged();
  assert.equal(f.calls.find(call => call[0] === 'me')[1].aborted, false);
  gate.resolve(profile); await pending;
  assert.deepEqual(accesses(f), ['me', 'quote', 'print', 'show']);
  assert.equal(f.paper, false);
});
