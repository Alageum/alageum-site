import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocuments, getDocumentTypes, uploadDocument } from '../lib/api/documents.js';
import { downloadDocumentFile, setSession, clearSession } from '../lib/api/client.js';
import { fileLabels, fileError } from '../lib/documents/fileLabels.js';
const id = '60000000-0000-4000-8000-000000000001';
const dto = { id, number: null, title: 'Example', external_id: null, source: 'manual', type_code: 'manual_attachment', latest_file_id: '70000000-0000-4000-8000-000000000001' };
const session = { access_token: 'fixture', refresh_token: 'refresh', organization_id: 'org-a' };
function browser(fetcher) {
  const before = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch };
  const data = new Map(); globalThis.window = { dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
  globalThis.fetch = fetcher; setSession(session); return () => Object.assign(globalThis, before);
}
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const pdf = () => new Response('%PDF-1.7\n%%EOF\n', { headers: { 'content-type': 'application/pdf' } });
const input = () => ({ title: ' Example ', number: '', typeCode: 'manual_attachment', file: new File(['%PDF-1.7\n%%EOF\n'], 'example.pdf', { type: 'application/pdf' }) });

test('upload uses authenticated multipart without JSON header and validates seven-field receipt', async () => {
  let calls = 0; const abort = new AbortController();
  const restore = browser(async (path, options) => { calls++; assert.equal(path.endsWith('/documents'), true); assert.equal(options.method, 'POST'); assert.equal(options.headers.has('Content-Type'), false); assert.equal(options.headers.get('X-Organization-ID'), 'org-a'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.signal, abort.signal); assert.equal(options.body.get('title'), 'Example'); assert.equal(options.body.has('number'), false); return json(dto); });
  try { assert.deepEqual(await uploadDocument(input(), { signal: abort.signal }), dto); assert.equal(calls, 1); } finally { restore(); }
});

test('upload refuses invalid metadata, empty/oversize files and mismatched extension or MIME before network', async () => {
  let calls = 0; const restore = browser(async () => { calls++; return json(dto); });
  try {
    for (const change of [{ title: '' }, { title: 'x\ny' }, { number: 'x'.repeat(121) }, { typeCode: '' }, { file: new File([], 'x.pdf', { type: 'application/pdf' }) }, { file: new File(['x'], 'x.html', { type: 'application/pdf' }) }, { file: new File(['x'], 'x.pdf', { type: 'image/png' }) }, { file: new File([new Uint8Array(1048577)], 'x.pdf', { type: 'application/pdf' }) }]) await assert.rejects(uploadDocument({ ...input(), ...change }), { status: 422 });
    assert.equal(calls, 0);
  } finally { restore(); }
});

test('mutation is never replayed after 401 and opaque download paths cannot be supplied', async () => {
  let calls = 0; const restore = browser(async () => { calls++; return new Response('{}', { status: 401 }); });
  try { await assert.rejects(uploadDocument(input()), { status: 401 }); assert.equal(calls, 1); assert.throws(() => downloadDocumentFile(`${id}/../../secret`), { status: 400 }); } finally { restore(); }
});

test('private download returns only bounded allowed MIME and retains auth headers', async () => {
  const restore = browser(async (path, options) => { assert.equal(path.endsWith(`/documents/${id}/download`), true); assert.equal(options.headers.get('Authorization'), 'Bearer fixture'); return pdf(); });
  try { const result = await downloadDocumentFile(id); assert.equal(result.contentType, 'application/pdf'); assert.equal(await result.blob.text(), '%PDF-1.7\n%%EOF\n'); } finally { restore(); }
  for (const response of [new Response('<html>', { headers: { 'content-type': 'text/html' } }), new Response('', { headers: { 'content-type': 'application/pdf' } }), new Response(new Uint8Array(1048577), { headers: { 'content-type': 'application/pdf' } }), new Response('x', { headers: { 'content-type': 'application/pdf', 'content-length': '1048577' } })]) {
    const undo = browser(async () => response); try { await assert.rejects(downloadDocumentFile(id), { code: 'invalid_document_file' }); } finally { undo(); }
  }
});

test('download and upload late success never expose bytes or receipt after logout, organization switch, cancel', async () => {
  for (const operation of ['download', 'upload']) for (const change of ['logout', 'organization', 'abort']) {
    let resolve; const pending = new Promise(done => { resolve = done; }); const controller = new AbortController();
    const restore = browser(async () => pending);
    try {
      const promise = operation === 'download' ? downloadDocumentFile(id, { signal: controller.signal }) : uploadDocument(input(), { signal: controller.signal });
      if (change === 'logout') clearSession(); else if (change === 'organization') setSession({ ...session, organization_id: 'org-b' }); else controller.abort();
      resolve(operation === 'download' ? pdf() : json(dto));
      await assert.rejects(promise, { code: 'session_changed' });
    } finally { restore(); }
  }
});

test('document types validate unique bounded codes, never allow opaque URLs from malformed response', async () => {
  for (const value of [[], {}, { items: [{ code: '', name: 'Bad' }] }, { items: [{ code: 'x', name: 'A' }, { code: 'x', name: 'B' }] }, { items: [{ code: 'x', name: 'A', url: 'secret' }] }]) {
    const restore = browser(async () => json(value)); try { await assert.rejects(getDocumentTypes(), { code: 'invalid_document_response' }); } finally { restore(); }
  }
  const restore = browser(async () => json({ items: [{ code: 'manual_attachment', name: 'Файл' }] })); try { assert.equal((await getDocumentTypes())[0].code, 'manual_attachment'); } finally { restore(); }
});

test('documents follow all valid pages and refuse repeated page IDs', async () => {
  let calls = 0; const other = { ...dto, id: '60000000-0000-4000-8000-000000000002' };
  const restore = browser(async path => { calls++; assert.equal(path.endsWith(calls === 1 ? '/documents' : '/documents?page=2'), true); return json({ items: [calls === 1 ? dto : other], page: calls, page_size: 1, total: 2 }); });
  try { assert.deepEqual(await getDocuments(), [dto, other]); } finally { restore(); }
  calls = 0; const undo = browser(async () => json({ items: [dto], page: ++calls, page_size: 1, total: 2 }));
  try { await assert.rejects(getDocuments(), { code: 'invalid_document_response' }); } finally { undo(); }
});

test('all file UI languages share complete labels and hide server diagnostics', () => {
  for (const labels of Object.values(fileLabels)) { assert.deepEqual(Object.keys(labels), Object.keys(fileLabels.ru)); assert.equal(fileError({ message: 'secret filesystem path' }, labels), labels.failed); }
});
