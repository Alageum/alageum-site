import assert from 'node:assert/strict';
import test from 'node:test';
import { applyInquiryPatch, createDemoInquiry, decodeInquiries, documentNames, getWorkspaceStatus, normalizeInquiry, WORKSPACE_LIMITS, WORKSPACE_STATUSES } from '../lib/workspace/domain.js';
import { clearInquiries, loadInquiries, removeInquiry, saveInquiry, subscribeInquiries, updateInquiry, WORKSPACE_STORAGE_KEY } from '../lib/workspace/store.js';

const now = '2026-09-30T20:00:00.000Z';
const later = '2026-09-30T20:01:00.000Z';
const record = () => normalizeInquiry(createDemoInquiry(), { now, id: 'demo-001' });

test('workspace has an explicitly local five-stage demo lifecycle', () => {
  assert.deepEqual(WORKSPACE_STATUSES.map((status) => status.id), ['draft', 'submitted', 'review', 'needs-information', 'quoted']);
  assert.equal(getWorkspaceStatus('unknown').id, 'draft');
});
test('inquiry normalization allowlists fields and rejects attachments or bank fields', () => {
  const normalized = normalizeInquiry({ ...createDemoInquiry(), bankAccount: 'must-not-save', password: 'must-not-save', files: [{ bytes: 'must-not-save' }], arbitrary: 123 }, { now, id: 'local-id' });
  assert.equal(normalized.id, 'local-id');
  assert.equal(normalized.createdAt, now);
  assert.equal(normalized.bankAccount, undefined);
  assert.equal(normalized.password, undefined);
  assert.equal(normalized.files, undefined);
  assert.equal(normalized.arbitrary, undefined);
  assert.equal(normalizeInquiry(null), null);
});
test('descriptions keep inquiry export context beyond 8000 characters', () => {
  assert.equal(normalizeInquiry({ text: 'x'.repeat(19000) }).text.length, 19000);
  assert.equal(normalizeInquiry({ text: 'x'.repeat(30000) }).text.length, 24000);
});
test('documents retain only bounded deduplicated filename strings, never file objects', () => {
  assert.deepEqual(documentNames(['C:\\fakepath\\test.pdf', '/local/another.pdf', 'test.pdf', '', null, { name: 'not-a-string.pdf' }]), ['test.pdf', 'another.pdf']);
  assert.equal(documentNames(Array.from({ length: 30 }, (_, index) => `${index}.pdf`)).length, 20);
});
test('items clamp quantities and drop invalid or duplicate entries', () => {
  const normalized = normalizeInquiry({ items: [null, {}, { id: 'a', quantity: 0 }, { id: 'a', quantity: 2 }, { id: 'b', quantity: 10000 }, { id: 'c', quantity: 'bad' }, { id: 'd', quantity: 3.9 }] });
  assert.deepEqual(normalized.items.map(({ id, quantity }) => ({ id, quantity })), [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 999 }, { id: 'c', quantity: 1 }, { id: 'd', quantity: 3 }]);
});
test('decoder handles malformed storage, duplicate records and external field tampering', () => {
  assert.equal(decodeInquiries('{broken').corrupt, true);
  assert.equal(decodeInquiries('{}').corrupt, true);
  assert.deepEqual(decodeInquiries('[]'), { inquiries: [], corrupt: false });
  const decoded = decodeInquiries(JSON.stringify([null, {}, { ...record(), secret: 'bad', status: 'paid' }, record()]));
  assert.equal(decoded.inquiries.length, 1);
  assert.equal(decoded.inquiries[0].status, 'draft');
  assert.equal(decoded.inquiries[0].secret, undefined);
});
test('local lifecycle records manager and customer comments without changing identity', () => {
  let result = applyInquiryPatch(record(), { status: 'submitted', id: 'replace-id', createdAt: later }, { now: later, eventId: 'event-1' });
  assert.equal(result.id, 'demo-001');
  assert.equal(result.createdAt, now);
  assert.equal(result.status, 'submitted');
  result = applyInquiryPatch(result, { status: 'needs-information', comment: 'Учебное уточнение', role: 'manager' }, { now: later, eventId: 'event-2' });
  assert.equal(result.comments[0].role, 'manager');
  assert.equal(result.comments[0].text, 'Учебное уточнение');
  result = applyInquiryPatch(result, { status: 'review', comment: 'Учебный ответ', role: 'customer' }, { now: later, eventId: 'event-3' });
  result = applyInquiryPatch(result, { status: 'quoted', comment: 'Учебный результат, не коммерческое предложение', role: 'manager' }, { now: later, eventId: 'event-4' });
  assert.equal(result.status, 'quoted');
  assert.equal(result.comments.length, 3);
  assert.equal(result.history.length, 4);
  assert.equal(result.history[3].role, 'manager');
});
test('no-op saves do not fabricate history and content changes preserve prior comments', () => {
  const current = record();
  assert.equal(applyInquiryPatch(current, { status: 'draft', password: 'bad' }, { now: later }), current);
  const result = applyInquiryPatch(current, { text: 'Новое описание', history: [], comments: [], role: 'admin' }, { now: later, eventId: 'updated' });
  assert.equal(result.text, 'Новое описание');
  assert.equal(result.history[0].role, 'customer');
  assert.equal(result.updatedAt, later);
  assert.equal(current.text, createDemoInquiry().text);
});
test('synthetic sample has no real contact or numeric payment fields', () => {
  const sample = createDemoInquiry();
  assert.equal(sample.email, 'demo@example.invalid');
  assert.equal(sample.status, 'draft');
  assert.ok(sample.documents.every((name) => name.startsWith('DEMO_')));
  assert.ok(sample.items.every((item) => item.source === 'demo'));
  assert.equal(sample.phone, '');
});

function mockBrowser() {
  const data = new Map();
  const listeners = new Map();
  let blocked = false;
  let quota = false;
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem(key) { if (blocked) throw new Error('denied'); return data.get(key) || null; },
      setItem(key, value) { if (blocked || quota) throw new Error('denied'); data.set(key, value); },
    },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    dispatchEvent(event) { listeners.get(event.type)?.forEach((handler) => handler(event)); return true; },
  };
  return { data, block() { blocked = true; }, quota() { quota = true; }, restore() { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; } };
}
test('store saves, reloads, updates by ID, subscribes and removes records', () => {
  const browser = mockBrowser();
  try {
    let events = 0;
    const unsubscribe = subscribeInquiries(() => events++);
    const id = saveInquiry(createDemoInquiry());
    assert.ok(id);
    assert.equal(loadInquiries().length, 1);
    assert.equal(JSON.parse(browser.data.get(WORKSPACE_STORAGE_KEY))[0].id, id);
    assert.equal(saveInquiry({ ...createDemoInquiry(), id, subject: 'Обновлённая тема' }), id);
    assert.equal(loadInquiries().length, 1);
    assert.equal(loadInquiries()[0].subject, 'Обновлённая тема');
    updateInquiry(id, { status: 'submitted' });
    assert.equal(loadInquiries()[0].status, 'submitted');
    assert.equal(events, 3);
    removeInquiry(id);
    assert.equal(loadInquiries().length, 0);
    unsubscribe();
    clearInquiries();
    assert.equal(events, 4);
    assert.throws(() => updateInquiry(id, { status: 'review' }), /не найден/);
  } finally { browser.restore(); }
});
test('storage denial and quota failure throw instead of falsely returning a saved ID', () => {
  for (const mode of ['block', 'quota']) {
    const browser = mockBrowser();
    try { clearInquiries(); browser[mode](); assert.throws(() => saveInquiry(createDemoInquiry()), /не сохранены/); assert.equal(browser.data.get(WORKSPACE_STORAGE_KEY), '[]'); }
    finally { browser.restore(); }
  }
});
test('corrupt storage needs explicit reset and does not get silently overwritten', () => {
  const browser = mockBrowser();
  try {
    browser.data.set(WORKSPACE_STORAGE_KEY, '{broken');
    assert.throws(() => saveInquiry(createDemoInquiry()), /повреждены/);
    assert.equal(browser.data.get(WORKSPACE_STORAGE_KEY), '{broken');
    clearInquiries();
    assert.ok(saveInquiry(createDemoInquiry()));
  } finally { browser.restore(); }
});
test('record limit rejects new records instead of silently deleting older ones', () => {
  const browser = mockBrowser();
  try {
    browser.data.set(WORKSPACE_STORAGE_KEY, JSON.stringify(Array.from({ length: WORKSPACE_LIMITS.records }, (_, index) => ({ ...record(), id: `existing-${index}` }))));
    assert.throws(() => saveInquiry(createDemoInquiry()), /до 50/);
    assert.equal(loadInquiries().length, 50);
  } finally { browser.restore(); }
});
test('external localStorage clearing is reflected without resurrecting cached records', () => {
  const browser = mockBrowser();
  try { saveInquiry(createDemoInquiry()); browser.data.delete(WORKSPACE_STORAGE_KEY); assert.deepEqual(loadInquiries(), []); }
  finally { browser.restore(); }
});
