import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getDocumentSigning, createDocumentSigningIntent, submitDocumentSignature, cancelDocumentSigningIntent, reverifyDocumentSignature } from '../lib/api/documentSigning.js';
import { setSession, clearSession } from '../lib/api/client.js';
import { signWithNCALayer, NCALAYER_ENDPOINT } from '../lib/documents/ncalayer.js';
import { verifyIntentBytes, validBase64, MAX_DOCUMENT_BYTES, MAX_SIGNATURE_BYTES } from '../lib/documents/signingData.js';
import { createDocumentSigningFlow, signingError } from '../lib/documents/signingFlow.js';

const id = '60000000-0000-4000-8000-000000000001';
const versionId = '70000000-0000-4000-8000-000000000001';
const intentId = '80000000-0000-4000-8000-000000000001';
const bytes = Buffer.from('%PDF-1.7\nFICTITIOUS UNIT TEST ONLY\n%%EOF');
const content = bytes.toString('base64');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const cms = Buffer.from('Fictitious CMS transport result, not a real signature').toString('base64');
const version = { id: versionId, number: 9, sha256, size_bytes: bytes.length, media_type: 'application/pdf' };
const metadata = { enabled: true, signing_allowed: true, reason: null, document_id: id, version, signature: null };
const intent = { id: intentId, document_id: id, version_id: versionId, sha256, expires_at: '2099-01-01T00:00:00.000Z', content_base64: content };
const signature = { id: '90000000-0000-4000-8000-000000000001', status: 'pending_verification', version_id: versionId, sha256, delivery_status: 'not_configured', created_at: '2026-10-12T12:00:00.000Z' };
const session = { access_token: 'unit-fixture', refresh_token: 'unit-refresh', organization_id: 'unit-org' };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function browser(fetcher) {
  const before = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch }, values = new Map();
  globalThis.window = { dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.fetch = fetcher;
  return () => Object.assign(globalThis, before);
}
function websocket() {
  const instances = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; this.closed = false; instances.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.closed = true; }
    open() { this.onopen?.(); }
    message(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
  }
  return { FakeSocket, instances };
}
function fixture(overrides = {}) {
  const history = [], calls = { prepare: [], sign: [], submit: [], cancel: [], load: [], verifySignature: [] };
  let active = true;
  const flow = createDocumentSigningFlow({
    load: async options => { calls.load.push(options); return metadata; },
    prepare: async (...args) => { calls.prepare.push(args); return intent; },
    sign: async (...args) => { calls.sign.push(args); return cms; },
    submit: async (...args) => { calls.submit.push(args); return signature; },
    cancel: async (...args) => { calls.cancel.push(args); },
    verifySignature: async (...args) => { calls.verifySignature.push(args); return { ...signature, status: 'verified' }; },
    isCurrent: () => active, onChange: value => history.push(value), verify: (value, selected) => verifyIntentBytes(value, selected, { subtle: webcrypto.subtle }),
    ...overrides,
  });
  return { flow, history, calls, invalidate() { active = false; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('signing API validates separate strict contracts while leaving seven-field documents DTO untouched', async () => {
  const calls = [], controller = new AbortController(); let payload = metadata, status = 200;
  const restore = browser(async (url, options) => { calls.push({ url, options }); return response(status, payload); });
  try {
    setSession(session);
    assert.deepEqual(await getDocumentSigning(id, { signal: controller.signal }), metadata);
    payload = intent; assert.deepEqual(await createDocumentSigningIntent(id, versionId, { signal: controller.signal }), intent);
    payload = signature; assert.deepEqual(await submitDocumentSignature(id, intentId, cms, { signal: controller.signal }), signature);
    status = 204; payload = null; await cancelDocumentSigningIntent(id, intentId, { signal: controller.signal });
    assert.deepEqual(calls.map(call => call.options.method || 'GET'), ['GET', 'POST', 'POST', 'POST']);
    assert.deepEqual(JSON.parse(calls[1].options.body), { version_id: versionId });
    assert.deepEqual(JSON.parse(calls[2].options.body), { signature_base64: cms });
    for (const call of calls) {
      assert.equal(call.options.signal, controller.signal);
      assert.equal(call.options.cache, 'no-store');
      assert.equal(call.options.headers.get('X-Organization-ID'), session.organization_id);
    }
    assert.ok(calls[2].url.endsWith(`/documents/${id}/signing/intents/${intentId}`));
    assert.ok(calls[3].url.endsWith(`/documents/${id}/signing/intents/${intentId}/cancel`));
    assert.deepEqual(JSON.parse(calls[3].options.body), {});
  } finally { restore(); }
});

test('malformed signing metadata, version/signature binding, nullable fields and unexpected fields fail closed', async () => {
  const bad = [null, {}, [], { ...metadata, enabled: 'true' }, { ...metadata, signing_allowed: true, reason: 'disabled' },
    { ...metadata, enabled: false }, { ...metadata, version: null }, { ...metadata, reason: 'unknown' }, { ...metadata, document_id: intentId },
    { ...metadata, source_path: 'private' }, { ...metadata, version: { ...version, size_bytes: MAX_DOCUMENT_BYTES + 1 } },
    { ...metadata, version: { ...version, number: 0 } }, { ...metadata, version: { ...version, media_type: 'text/html' } },
    { ...metadata, version: { ...version, sha256: 'oops' } }, { ...metadata, signature: { ...signature, version_id: intentId } },
    { ...metadata, signature: { ...signature, sha256: 'f'.repeat(64) } }, { ...metadata, signature: { ...signature, status: 'signed' } },
    { ...metadata, signature: { ...signature, delivery_status: 'sent' } }, { ...metadata, signature: { ...signature, created_at: 'tomorrow' } }];
  for (const key of Object.keys(metadata)) { const value = { ...metadata }; delete value[key]; bad.push(value); }
  for (const value of bad) {
    const restore = browser(async () => response(200, value));
    try { await assert.rejects(getDocumentSigning(id), { code: 'invalid_signing_response' }); } finally { restore(); }
  }
  for (const value of [{ ...metadata, enabled: false, signing_allowed: false, reason: 'disabled', version: null },
    { ...metadata, signing_allowed: false, reason: 'verifier_unavailable' }, { ...metadata, signature }]) {
    const restore = browser(async () => response(200, value));
    try { assert.deepEqual(await getDocumentSigning(id), value); } finally { restore(); }
  }
});

test('intent and signature endpoints reject malformed success, invalid path IDs and malformed signatures before request', async () => {
  for (const value of [null, { ...intent, content_base64: 'bad' }, { ...intent, version_id: intentId }, { ...intent, document_id: intentId },
    { ...intent, expires_at: 'bad' }, { ...intent, id: null }, { ...intent, extra: true }]) {
    const restore = browser(async () => response(200, value));
    try { await assert.rejects(createDocumentSigningIntent(id, versionId), { code: 'invalid_signing_response' }); } finally { restore(); }
  }
  let calls = 0; const restore = browser(async () => { calls++; return response(200, {}); });
  try {
    await assert.rejects(getDocumentSigning(`${id}?unsafe`));
    await assert.rejects(createDocumentSigningIntent(id, 'bad'));
    await assert.rejects(submitDocumentSignature(id, intentId, 'bad'));
    await assert.rejects(cancelDocumentSigningIntent(id, 'bad'));
    assert.equal(calls, 0);
    await assert.rejects(submitDocumentSignature(id, intentId, cms), { code: 'invalid_signing_response' });
  } finally { restore(); }
});

test('mutation 401 does not refresh/replay and late results cannot survive logout, new login or organization changes', async () => {
  for (const change of [() => clearSession(), () => setSession({ ...session, access_token: 'new-login' }), () => setSession({ ...session, organization_id: 'new-org' })]) {
    const pending = deferred(); let calls = 0; const restore = browser(async () => { calls++; return pending.promise; });
    try {
      setSession(session); const request = createDocumentSigningIntent(id, versionId); change(); pending.resolve(response(200, intent));
      await assert.rejects(request, { code: 'session_changed' }); assert.equal(calls, 1);
    } finally { restore(); }
  }
  let calls = 0; const restore = browser(async () => { calls++; return response(401, { error: { code: 'unauthorized' } }); });
  try { setSession(session); await assert.rejects(submitDocumentSignature(id, intentId, cms), { status: 401 }); assert.equal(calls, 1); } finally { restore(); }
});

test('exact bytes, size, immutable version and browser SHA-256 all agree before signing', async () => {
  await verifyIntentBytes(intent, version, { subtle: webcrypto.subtle });
  for (const [value, selected] of [[{ ...intent, content_base64: Buffer.from('other').toString('base64') }, version],
    [{ ...intent, version_id: intentId }, version], [{ ...intent, sha256: 'f'.repeat(64) }, version], [intent, { ...version, size_bytes: 1 }],
    [{ ...intent, content_base64: Buffer.from('x'.repeat(bytes.length)).toString('base64') }, version]]) {
    await assert.rejects(verifyIntentBytes(value, selected, { subtle: webcrypto.subtle }));
  }
  await assert.rejects(verifyIntentBytes(intent, version, { subtle: null }));
  for (const bad of ['', 'bad', 'AA', 'AB==', 'YQ==\n', ' YQ==', 'YQ--', 1]) assert.equal(validBase64(bad, MAX_SIGNATURE_BYTES), false);
  assert.equal(validBase64(Buffer.alloc(MAX_SIGNATURE_BYTES).toString('base64'), MAX_SIGNATURE_BYTES), true);
  assert.equal(validBase64(Buffer.alloc(MAX_SIGNATURE_BYTES + 1).toString('base64'), MAX_SIGNATURE_BYTES), false);
  assert.equal(validBase64(Buffer.alloc(MAX_DOCUMENT_BYTES).toString('base64'), MAX_DOCUMENT_BYTES), true);
});

test('NCALayer sends one official detached CMS request to fixed loopback endpoint only on socket open', async () => {
  for (const result of [cms, [cms]]) {
    const { FakeSocket, instances } = websocket();
    const pending = signWithNCALayer(content, { WebSocketImpl: FakeSocket });
    const socket = instances[0]; assert.equal(socket.url, NCALAYER_ENDPOINT); assert.equal(socket.sent.length, 0);
    socket.open(); socket.open();
    assert.deepEqual(socket.sent, [{ module: 'kz.gov.pki.knca.basics', method: 'sign', args: { format: 'cms', data: content,
      signingParams: { decode: true, encapsulate: false, digested: false }, signerParams: { extKeyUsageOids: ['1.3.6.1.5.5.7.3.4'] }, locale: 'ru' } }]);
    socket.message({ status: true, body: { result } });
    assert.equal(await pending, cms); assert.equal(socket.closed, true);
    for (const event of ['onopen', 'onmessage', 'onclose', 'onerror']) assert.equal(socket[event], null);
  }
});

test('NCALayer malformed and unconfirmed responses never succeed or retry', async () => {
  for (const value of ['not-json', { status: true }, { status: 'true', body: { result: cms } }, { status: true, body: { result: [cms, cms] } },
    { status: true, body: { result: [] } }, { status: true, body: { result: { cms } } }, { status: true, body: { result: 'bad' } },
    { result: { version: '1.0' } }, { status: true, body: { result: 'A'.repeat(400000) } }]) {
    const { FakeSocket, instances } = websocket(); const pending = signWithNCALayer(content, { WebSocketImpl: FakeSocket });
    const socket = instances[0]; socket.open(); socket.message(value);
    await assert.rejects(pending, { code: 'ncalayer_invalid_response' }); assert.equal(instances.length, 1); assert.equal(socket.closed, true);
  }
  const { FakeSocket, instances } = websocket(); const pending = signWithNCALayer(content, { WebSocketImpl: FakeSocket });
  instances[0].open(); instances[0].message({ status: false, code: 'untrusted-external-description' });
  await assert.rejects(pending, { code: 'ncalayer_declined' });
});

test('NCALayer handles abort before/during connect, timeout, socket failure/disconnect and failed constructor', async () => {
  const initial = new AbortController(); initial.abort(); const fake = websocket();
  await assert.rejects(signWithNCALayer(content, { signal: initial.signal, WebSocketImpl: fake.FakeSocket }), { code: 'signing_cancelled' });
  assert.equal(fake.instances.length, 0);
  for (const kind of ['abortConnecting', 'abortOpen', 'error', 'close', 'timeout']) {
    const { FakeSocket, instances } = websocket(), controller = new AbortController();
    const pending = signWithNCALayer(content, { signal: controller.signal, WebSocketImpl: FakeSocket, timeoutMs: 5 });
    const socket = instances[0]; if (kind !== 'abortConnecting') socket.open();
    if (kind.startsWith('abort')) controller.abort();
    if (kind === 'error') socket.onerror(); if (kind === 'close') socket.onclose();
    await assert.rejects(pending, { code: kind.startsWith('abort') ? 'signing_cancelled' : kind === 'error' ? 'ncalayer_unavailable' : kind === 'close' ? 'ncalayer_disconnected' : 'ncalayer_timeout' });
    assert.equal(socket.closed, true); assert.equal(instances.length, 1);
  }
  await assert.rejects(signWithNCALayer(content, { WebSocketImpl: class { constructor() { throw new Error('private'); } } }), { code: 'ncalayer_unavailable' });
  await assert.rejects(signWithNCALayer(content, { WebSocketImpl: null }), { code: 'ncalayer_unavailable' });
});

test('preview loading never opens NCALayer; verifier unavailable and verified/pending signatures cannot sign', async () => {
  for (const value of [{ ...metadata, signing_allowed: false, reason: 'verifier_unavailable' },
    { ...metadata, signature }, { ...metadata, signature: { ...signature, status: 'verified' } }]) {
    const { flow, calls, history } = fixture({ load: async () => value });
    await flow.reload(); assert.equal(history.at(-1).status, 'ready'); await flow.start();
    assert.equal(calls.prepare.length + calls.sign.length + calls.submit.length, 0); flow.dispose();
  }
});

test('explicit signing verifies frozen preview, signs once and preserves server verification status honestly', async () => {
  for (const status of ['pending_verification', 'verified', 'rejected']) {
    const { flow, history, calls } = fixture({ submit: async () => ({ ...signature, status }) });
    await flow.reload(); assert.equal(Object.isFrozen(history.at(-1).value.version), true);
    assert.equal(calls.sign.length, 0); await flow.start();
    assert.deepEqual(history.map(value => value.status), ['loading', 'ready', 'preparing', 'signing', 'submitting', 'complete']);
    assert.equal(history.at(-1).signature.status, status); assert.equal(history.at(-1).signature.delivery_status, 'not_configured');
    assert.equal(calls.prepare.length, 1); assert.equal(calls.sign.length, 1);
    flow.dispose(); assert.equal(calls.cancel.length, 0);
  }
});

test('hash mismatch/expired content never reaches NCALayer or server submit', async () => {
  for (const value of [{ ...intent, sha256: 'f'.repeat(64) }, { ...intent, expires_at: '2020-01-01T00:00:00.000Z' }]) {
    const { flow, calls, history } = fixture({ prepare: async () => value });
    await flow.reload(); await flow.start(); await tick();
    assert.equal(calls.sign.length + calls.submit.length, 0); assert.equal(calls.cancel.length, 1);
    assert.equal(history.at(-1).status, 'ready'); assert.ok(history.at(-1).error); flow.dispose();
  }
});

test('lost submit response retries exact intent/signature only after explicit action and never opens NCALayer twice', async () => {
  const submissions = []; let fail = true;
  const { flow, calls, history } = fixture({ submit: async (...args) => { submissions.push(args); if (fail) throw new Error('lost response'); return signature; } });
  await flow.reload(); await flow.start(); assert.equal(history.at(-1).status, 'retryable');
  await flow.start(); await flow.reload(); assert.equal(submissions.length, 1); assert.equal(calls.sign.length, 1);
  fail = false; await flow.retrySubmit(); assert.equal(history.at(-1).status, 'complete');
  assert.deepEqual(submissions.map(args => args.slice(0, 2)), [[intentId, cms], [intentId, cms]]);
  assert.equal(calls.prepare.length, 1); assert.equal(calls.sign.length, 1); assert.equal(calls.cancel.length, 0); flow.dispose();
});

test('flow cancellation and context loss suppress stale prepare, hash, sign and submit completions', async () => {
  for (const stage of ['prepare', 'verify', 'sign', 'submit']) for (const action of ['close', 'dispose', 'scope']) for (const reject of [false, true]) {
    const held = deferred(), started = deferred(); let heldSignal;
    const options = { [stage]: (...args) => { heldSignal = args.at(-1)?.signal; started.resolve(); return held.promise; } };
    const { flow, history, calls, invalidate } = fixture(options);
    await flow.reload(); const pending = flow.start(); await started.promise;
    const count = history.length;
    if (action === 'scope') { invalidate(); flow.dispose(); } else flow[action]();
    if (heldSignal) assert.equal(heldSignal.aborted, true);
    if (reject) held.reject(new Error('late private failure'));
    else held.resolve(stage === 'prepare' ? intent : stage === 'sign' ? cms : stage === 'submit' ? signature : undefined);
    await pending; await flow.start(); await flow.retrySubmit(); await tick();
    assert.equal(history.length, count, `${stage}/${action}/${reject}`);
    if (stage !== 'submit') assert.equal(calls.submit.length, 0);
    if (stage === 'prepare' || stage === 'verify') assert.equal(calls.sign.length, 0);
    if (action === 'scope') assert.equal(calls.cancel.length, 0, 'Never cancel in a new session/organization');
  }
});

test('repeated clicks while prepare, sign or submit is pending cannot duplicate operations', async () => {
  for (const stage of ['prepare', 'sign', 'submit']) {
    const held = deferred(), started = deferred(); let count = 0;
    const { flow } = fixture({ [stage]: () => { count++; started.resolve(); return held.promise; } });
    await flow.reload(); const first = flow.start(); await started.promise;
    await flow.start(); await flow.start(); await flow.retrySubmit(); await flow.reload();
    assert.equal(count, 1); held.resolve(stage === 'prepare' ? intent : stage === 'sign' ? cms : signature);
    await first; assert.equal(count, 1); flow.dispose();
  }
});

test('expired intent after NCALayer confirmation is never submitted and mismatched receipt never claims success', async () => {
  let now = 0;
  const first = fixture({ now: () => now, sign: async () => { now = Date.parse(intent.expires_at) + 1; return cms; } });
  await first.flow.reload(); await first.flow.start(); assert.equal(first.calls.submit.length, 0); first.flow.dispose();
  const second = fixture({ submit: async () => ({ ...signature, version_id: intentId }) });
  await second.flow.reload(); await second.flow.start(); assert.equal(second.history.at(-1).status, 'retryable');
  assert.equal(second.history.at(-1).signature, null); second.flow.dispose();
});

test('UI gate is default-off and private diagnostics never appear in mapped messages', async () => {
  const source = await readFile(new URL('../components/documents/DocumentsWorkspace.js', import.meta.url), 'utf8');
  assert.ok(source.includes("process.env.NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED === '1'"));
  assert.ok(source.includes("hasPermission('document.read')")); assert.ok(source.includes("hasPermission('document.sign')"));
  assert.ok(!signingError({ message: 'private-key-or-cms-secret' }).includes('private-key-or-cms-secret'));
  assert.ok(signingError({ code: 'ncalayer_unavailable' }).includes('вручную'));
});


test('pending server signature can be explicitly verified again after reload without NCALayer or stored client CMS', async () => {
  const { flow, calls, history } = fixture({ load: async () => ({ ...metadata, signature }) });
  await flow.reload(); assert.equal(calls.verifySignature.length, 0);
  await flow.retryVerification();
  assert.equal(calls.verifySignature.length, 1); assert.equal(calls.verifySignature[0][0], signature.id);
  assert.equal(calls.prepare.length + calls.sign.length + calls.submit.length, 0);
  assert.equal(history.at(-1).signature.status, 'verified');
  await flow.retryVerification(); assert.equal(calls.verifySignature.length, 1); flow.dispose();
});

test('server re-verification failures can explicitly retry, and repeated clicks or stale responses cannot repaint', async () => {
  for (const action of ['close', 'scope', 'success', 'error']) {
    const held = deferred(); let count = 0;
    const { flow, history, invalidate } = fixture({ load: async () => ({ ...metadata, signature }), verifySignature: () => { count++; return held.promise; } });
    await flow.reload(); const pending = flow.retryVerification(); await flow.retryVerification(); await flow.start();
    assert.equal(count, 1); const length = history.length;
    if (action === 'close') flow.close(); if (action === 'scope') { invalidate(); flow.dispose(); }
    if (action === 'error') held.reject(new Error('private verifier failure')); else held.resolve({ ...signature, status: 'verified' });
    await pending;
    if (action === 'close' || action === 'scope') assert.equal(history.length, length);
    else { assert.equal(history.at(-1).status, 'complete'); assert.equal(history.at(-1).signature.status, action === 'error' ? 'pending_verification' : 'verified'); }
    flow.dispose();
  }
});

test('re-verification API uses POST with only stored signature ID and rejects a replaced receipt', async () => {
  const calls = []; let payload = signature;
  const restore = browser(async (url, options) => { calls.push({ url, options }); return response(200, payload); });
  try {
    await reverifyDocumentSignature(id, signature.id);
    assert.ok(calls[0].url.endsWith(`/documents/${id}/signing/signatures/${signature.id}/verify`));
    assert.equal(calls[0].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].options.body), {});
    payload = { ...signature, id: intentId }; await assert.rejects(reverifyDocumentSignature(id, signature.id), { code: 'invalid_signing_response' });
  } finally { restore(); }
});


test('synchronous dismissal while publishing a phase cannot initiate a subsequent signing operation', async () => {
  for (const phase of ['preparing', 'signing', 'submitting']) {
    let flow; const history = [];
    const value = fixture({ onChange: state => { history.push(state); if (state.status === phase) flow.close(); } });
    flow = value.flow; await flow.reload(); await flow.start(); await tick();
    if (phase === 'preparing') assert.equal(value.calls.prepare.length, 0);
    if (phase !== 'submitting') assert.equal(value.calls.sign.length, 0);
    assert.equal(value.calls.submit.length, 0);
  }
});
