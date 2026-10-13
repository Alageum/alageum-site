import assert from 'node:assert/strict';
import test from 'node:test';
import { initialInquiry, validateInquiry, normalizeInquiry, inquiryItems, documentNames, inquirySubject, buildInquiryText, buildEmailDraft, SALES_EMAIL } from '../lib/inquiry/model.js';
const valid = { ...initialInquiry(), contactName: 'Тестовый покупатель', email: 'buyer@example.com', description: 'Нужно подобрать оборудование для нового объекта.' };

test('query intent is allowlisted and solution is bounded to plain text', () => {
  assert.equal(initialInquiry({ intent: 'selection' }).intent, 'selection');
  assert.equal(initialInquiry({ intent: 'arbitrary' }).intent, 'quote');
  assert.equal(initialInquiry({ solution: ['Энергетика\nОбъект', 'ignore'] }).solution, 'Энергетика Объект');
  assert.equal(initialInquiry({ solution: 'а'.repeat(500) }).solution.length, 180);
});
test('empty form identifies description, name and contact errors', () => {
  assert.deepEqual(Object.keys(validateInquiry()).sort(), ['contactName', 'description', 'email']);
});
test('valid request needs no selected equipment and email or phone is sufficient', () => {
  assert.deepEqual(validateInquiry(valid), {});
  assert.deepEqual(validateInquiry({ ...valid, email: '', phone: '+7 (771) 123-45-67' }), {});
  assert.ok(validateInquiry({ ...valid, email: '', phone: '123' }).phone);
  assert.ok(validateInquiry({ ...valid, email: 'broken@' }).email);
});
test('malformed optional contact values fail even when another contact works', () => {
  assert.ok(validateInquiry({ ...valid, phone: 'call me' }).phone);
  assert.ok(validateInquiry({ ...valid, phone: '+1234567890123456' }).phone);
  assert.ok(validateInquiry({ ...valid, description: 'a'.repeat(4001) }).description);
});
test('normalization removes control characters and keeps multiline task', () => {
  const values = normalizeInquiry({ ...valid, contactName: '  Test\r\nName ', description: 'Line one\r\nLine two\u0000' });
  assert.equal(values.contactName, 'Test Name');
  assert.equal(values.description, 'Line one\nLine two');
});
test('equipment resolves known products, deduplicates, clamps and labels data provenance', () => {
  assert.deepEqual(inquiryItems([{ id: 'a', quantity: 2000 }, { id: 'a', quantity: 1 }, { id: 'b', quantity: 0 }, { id: 'missing' }], [{ id: 'a', name: 'Series', source: 'official' }, { id: 'b', name: 'Demo', source: 'demo' }]), [
    { id: 'a', sku: 'a', name: 'Series', quantity: 999, source: 'official' },
    { id: 'b', sku: 'b', name: 'Demo', quantity: 1, source: 'demo' },
  ]);
});
test('document metadata contains only normalized unique filenames, at most ten', () => {
  assert.deepEqual(documentNames([{ name: 'specification.pdf', contents: 'not included' }, 'C:\\private\\details.xlsx', 'specification.pdf', null]), ['specification.pdf', 'details.xlsx']);
  assert.equal(documentNames(Array.from({ length: 15 }, (_, i) => `${i}.pdf`)).length, 10);
});
test('export accurately distinguishes public families, demo examples, and missing attachments', () => {
  const text = buildInquiryText(valid, [{ name: 'Series', sku: 'S1', quantity: 2, source: 'official' }, { name: 'Demo', sku: 'DEMO-1', quantity: 1, source: 'demo' }], ['spec.pdf']);
  assert.match(text, /Series \(S1\) — 2 шт/);
  assert.match(text, /публичная серия/);
  assert.match(text, /СИНТЕТИЧЕСКИЙ ДЕМО-ПРИМЕР/);
  assert.match(text, /Сами файлы не приложены/);
  assert.match(text, /не является заказом/);
});
test('export without selection requests help and includes contact details', () => {
  const text = buildInquiryText(valid);
  assert.match(text, /Нужна помощь с подбором/);
  assert.match(text, /buyer@example.com/);
  assert.match(text, /Тестовый покупатель/);
});
test('mailto is fixed to verified sales address and encodes subject/body safely', () => {
  const values = { ...valid, project: 'A&B?bcc=other@example.com\r\nX' };
  const draft = buildEmailDraft(values, 'Short body');
  const url = new URL(draft.href);
  assert.equal(url.pathname, SALES_EMAIL);
  assert.equal(url.searchParams.get('subject'), inquirySubject(values));
  assert.equal(url.searchParams.get('body'), 'Short body');
  assert.equal(url.searchParams.has('bcc'), false);
  assert.equal(draft.includesBody, true);
});
test('long mailto falls back to subject-only rather than silently truncating request', () => {
  const draft = buildEmailDraft(valid, 'я'.repeat(4000));
  assert.equal(draft.includesBody, false);
  assert.equal(new URL(draft.href).searchParams.has('body'), false);
});
