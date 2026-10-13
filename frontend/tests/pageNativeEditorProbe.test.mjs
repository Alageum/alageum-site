import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installNativePageProbe } from '../e2e/helpers/page-native-editor-probe.mjs';

// Controlled host/fiber fixtures verify instrumentation, never native Slate or
// Chromium behavior. No server, browser, credentials or external writes here.
const slug = 'page-sync-12345678-1234-4234-8234-123456789abc';
const route = 'http://127.0.0.1:1337/cms/content-manager/collection-types/api::page.page/document123?status=draft';
const blocks = text => [{ type: 'paragraph', children: [{ type: 'text', text }] }];
const plain = value => JSON.parse(JSON.stringify(value));

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of [...(listeners.get(type) ?? [])]) fn(event); },
    listenerCount() { return [...listeners.values()].reduce((total, entries) => total + entries.size, 0); },
  };
}

function node(nodeType = 1, children = [], length = 0) {
  const value = { nodeType, childNodes: children, parentNode: null, isConnected: true, length,
    contains(child) { for (let next = child; next; next = next.parentNode) if (next === this) return true; return false; } };
  for (const child of children) child.parentNode = value;
  return value;
}

function fixture({ install = true, inject = true } = {}) {
  const text = node(3, [], 8);
  const host = node(1, [node(1, [text])]);
  host.getAttribute = name => name === 'data-slate-editor' ? 'true' : null;
  const slugInput = { value: slug };
  const state = { hosts: [host], slugs: [slugInput], values: { slug, body: blocks('Original') }, reads: 0 };
  const original = function () {};
  const editor = { children: blocks('Original'), operations: [], selection: {
    anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 8 },
  }, onChange: original, apply() {} };
  const privateAncestor = { get memoizedProps() { throw new Error('Must not visit beyond native Form'); } };
  const form = { type: { displayName: 'FormProvider' }, memoizedProps: {
    getValues() { state.reads++; return state.values; },
  }, return: privateAncestor };
  const slate = { type: () => {}, memoizedProps: { editor, initialValue: blocks('Original'), onChange() {} }, return: form };
  const fiber = { stateNode: host, memoizedProps: {}, return: slate };
  const range = { startContainer: text, endContainer: text, startOffset: 0, endOffset: 8, collapsed: false };
  state.selection = { anchorNode: text, focusNode: text, anchorOffset: 0, focusOffset: 8, isCollapsed: false,
    rangeCount: 1, getRangeAt: () => range };
  const document = { ...eventTarget(), documentElement: node(),
    querySelectorAll(selector) {
      if (selector === '[data-slate-editor]') return state.hosts;
      if (selector === 'input[name="slug"]') return state.slugs;
      throw new Error('Unexpected selector');
    },
    getSelection: () => state.selection,
  };
  const window = { ...eventTarget(), location: { href: route } };
  const observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const microtasks = [];
  const queueMicrotask = fn => microtasks.push(fn);
  let now = 0;
  const context = vm.createContext({ window, document, MutationObserver, URL, queueMicrotask,
    performance: { timeOrigin: 1000, now: () => ++now } });
  const doInstall = () => vm.runInContext(`(${installNativePageProbe.toString()})()`, context);
  if (install) doInstall();
  const doInject = renderer => window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject(renderer ?? { findFiberByHostInstance: value => value === host ? fiber : null });
  if (install && inject) doInject();
  return { state, host, text, range, slugInput, editor, original, form, slate, fiber, document, window, observers, microtasks,
    install: doInstall, inject: doInject,
    attach: options => window.__alageumNativePageProbe.attach({ slug, ...options }),
    flush() { let count = 0; while (microtasks.length) { assert.ok(++count < 10000); microtasks.shift()(); } },
    mutate() { for (const observer of observers) if (observer.connected) observer.callback([]); },
    queueMicrotask,
  };
}

test('serialized init script retains only the finder and collects nothing before attachment', () => {
  const f = fixture({ inject: false });
  const renderer = { findFiberByHostInstance: value => value === f.host ? f.fiber : null };
  Object.defineProperty(renderer, 'privateRendererState', { get() { throw new Error('private'); } });
  f.inject(renderer);
  assert.equal(f.state.reads, 0);
  assert.equal(f.document.listenerCount(), 0);
  assert.equal(f.window.listenerCount(), 0);
  assert.deepEqual(Object.keys(f.window.__alageumNativePageProbe), ['attach']);
  assert.deepEqual(Object.keys(f.window.__REACT_DEVTOOLS_GLOBAL_HOOK__), ['supportsFiber', 'inject', 'onCommitFiberUnmount']);
  const handle = f.attach();
  const report = plain(handle.stop());
  assert.equal(report.events.length, 1);
  assert.equal(report.events[0].type, 'attach');
  assert.equal(report.diagnosticOnly, true);
  assert.match(report.schedulingCaveat, /may affect scheduling/);
});

test('preserves a pre-existing DevTools hook and refuses installation explicitly', () => {
  const f = fixture({ install: false });
  const previous = { supportsFiber: true, unrelated: 'keep' };
  f.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = previous;
  assert.throws(f.install, /PAGE_NATIVE_PROBE:EXISTING_DEVTOOLS_HOOK/);
  assert.equal(f.window.__REACT_DEVTOOLS_GLOBAL_HOOK__, previous);
  assert.equal('__alageumNativePageProbe' in f.window, false);
});

test('requires an injected, compatible, unambiguous renderer', () => {
  const missing = fixture({ inject: false });
  assert.throws(() => missing.attach(), /MISSING_RENDERER/);
  missing.inject({ findFiberByHostInstance: null });
  assert.throws(() => missing.attach(), /INCOMPATIBLE_RENDERER/);
  const ambiguous = fixture();
  ambiguous.inject();
  assert.throws(() => ambiguous.attach(), /AMBIGUOUS_RENDERER/);
  const wrong = fixture({ inject: false });
  wrong.inject({ findFiberByHostInstance: () => ({ stateNode: {}, return: wrong.slate }) });
  assert.throws(() => wrong.attach(), /MISSING_HOST_FIBER/);
  const thrown = fixture({ inject: false });
  thrown.inject({ findFiberByHostInstance() { throw new Error('private-renderer-error'); } });
  assert.throws(() => thrown.attach(), error => error.message === 'PAGE_NATIVE_PROBE:ATTACH_READ_FAILED');
});

test('requires the exact local Page route, expected UUID slug and one editor/input', () => {
  for (const href of [
    route.replace('/cms/', '/admin/'), route.replace('page.page', 'article.article'),
    route.replace('/document123', '/document123/actions/publish'), route.replace('/document123', ''),
    route.replace('127.0.0.1', 'example.com'), route.replace('http:', 'https:'),
  ]) {
    const f = fixture();
    f.window.location.href = href;
    assert.throws(() => f.attach(), /INVALID_PAGE_ROUTE/);
    assert.equal(f.state.reads, 0);
  }
  for (const value of ['page-sync-real-document', 'other-12345678-1234-4234-8234-123456789abc', `${slug}/extra`]) {
    assert.throws(() => fixture().attach({ slug: value }), /INVALID_FIXTURE_SLUG/);
  }
  for (const count of [0, 2]) {
    const f = fixture();
    f.state.hosts = Array(count).fill(f.host);
    assert.throws(() => f.attach(), /EDITOR_HOST_COUNT/);
    assert.equal(f.state.reads, 0);
  }
  const f = fixture();
  f.slugInput.value = 'page-sync-87654321-4321-4321-8321-cba987654321';
  assert.throws(() => f.attach(), /DOM_SLUG_MISMATCH/);
  assert.equal(f.state.reads, 0);
  f.slugInput.value = slug;
  f.state.values.slug = 'other';
  assert.throws(() => f.attach(), /FORM_SLUG_CHANGED/);
  assert.equal(f.editor.onChange, f.original);
  const duplicate = fixture();
  duplicate.state.slugs.push({ value: slug });
  assert.throws(() => duplicate.attach(), /DOM_SLUG_MISMATCH/);
});

test('traverses ancestors only and refuses missing, ambiguous or incompatible Slate/Form references', () => {
  const missing = fixture();
  missing.slate.return = null;
  assert.throws(() => missing.attach(), /MISSING_FORM/);
  const cycle = fixture();
  cycle.slate.return = cycle.fiber;
  assert.throws(() => cycle.attach(), /ANCESTOR_LIMIT/);
  const ambiguous = fixture();
  ambiguous.slate.return = { ...ambiguous.slate, return: ambiguous.form };
  assert.throws(() => ambiguous.attach(), /INCOMPATIBLE_SLATE/);
  const incompatible = fixture();
  delete incompatible.slate.memoizedProps.initialValue;
  assert.throws(() => incompatible.attach(), /INCOMPATIBLE_SLATE/);
  const form = fixture();
  form.form.memoizedProps.getValues = 'wrong';
  assert.throws(() => form.attach(), /INCOMPATIBLE_FORM/);
  const accessor = fixture();
  Object.defineProperty(accessor.slate.memoizedProps, 'editor', { get() { throw new Error('secret'); } });
  assert.throws(() => accessor.attach(), error => error.message === 'PAGE_NATIVE_PROBE:ATTACH_READ_FAILED');
  const readonly = fixture();
  Object.defineProperty(readonly.editor, 'onChange', { writable: false });
  assert.throws(() => readonly.attach(), /CALLBACK_NOT_WRITABLE/);
});

test('forwards callback this, arguments, return identity and form commitment exactly', () => {
  const f = fixture();
  const receiver = { nativeThis: true };
  const firstArg = { private: 'do-not-copy-args' };
  const secondArg = Symbol('identity');
  const result = Promise.resolve('native-return');
  let calls = 0;
  const native = function (...args) {
    calls++;
    assert.equal(this, receiver);
    assert.deepEqual(args, [firstArg, secondArg]);
    f.state.values.body = null;
    return result;
  };
  f.editor.onChange = native;
  const handle = f.attach();
  f.editor.children = blocks('');
  f.editor.operations = [{ type: 'remove_text', text: 'do-not-copy-operation-text' }];
  assert.equal(Reflect.apply(f.editor.onChange, receiver, [firstArg, secondArg]), result);
  assert.equal(calls, 1);
  const report = plain(handle.stop());
  const [before, after] = report.events.filter(event => event.type === 'onChange');
  assert.deepEqual(before.form.body.value, blocks('Original'));
  assert.equal(after.form.body.status, 'null');
  assert.equal(after.form.body.value, null);
  assert.deepEqual(before.editor.body.value, blocks(''));
  assert.deepEqual(before.editor.operationTypes, ['remove_text']);
  assert.equal(f.editor.onChange, native);
  assert.doesNotMatch(JSON.stringify(report), /do-not-copy/);
});

test('distinguishes an unset create Form body, null clear and empty Blocks array', () => {
  const f = fixture();
  f.window.location.href = route.replace('/document123', '/create');
  delete f.state.values.body;
  const handle = f.attach();
  assert.deepEqual(plain(handle.snapshot()).events[0].form.body, { status: 'unset', value: null });
  f.state.values.body = null;
  f.document.dispatch('selectionchange');
  f.state.values.body = [];
  f.document.dispatch('selectionchange');
  const report = plain(handle.stop());
  assert.deepEqual(report.events.map(event => event.form.body), [
    { status: 'unset', value: null }, { status: 'null', value: null }, { status: 'value', value: [] },
  ]);
  assert.deepEqual(report.errors, []);
});

test('forwards the original error unchanged without exposing its fields', () => {
  const f = fixture();
  const thrown = { message: 'private error message', stack: 'private stack', credential: 'private value' };
  f.editor.onChange = () => { throw thrown; };
  const handle = f.attach();
  assert.throws(() => f.editor.onChange(), caught => caught === thrown);
  const report = plain(handle.stop());
  assert.deepEqual(report.events.filter(event => event.type === 'onChange').map(event => event.phase), ['before', 'throw']);
  assert.ok(report.errors.includes('NATIVE_ONCHANGE_THROW'));
  assert.doesNotMatch(JSON.stringify(report), /private|credential|stack/);
});

test('nested microtasks distinguish AST mutation from native onChange/Form commitment', () => {
  const f = fixture();
  f.editor.onChange = () => { f.state.values.body = null; };
  const handle = f.attach();
  const event = { target: f.text, inputType: 'deleteContentBackward', isComposing: false, defaultPrevented: false };
  f.document.dispatch('beforeinput', event);
  f.editor.children = blocks('');
  f.editor.selection = null;
  f.editor.operations = [{ type: 'remove_text' }];
  event.defaultPrevented = true;
  f.queueMicrotask(() => { f.editor.onChange(); f.editor.operations = []; });
  f.flush();
  const report = plain(handle.stop());
  assert.deepEqual(report.events.map(value => `${value.type}:${value.phase}`), [
    'attach:setup', 'beforeinput:capture', 'beforeinput:microtask-1', 'onChange:before', 'onChange:after', 'beforeinput:microtask-2',
  ]);
  const [capture, first, second] = report.events.filter(value => value.type === 'beforeinput');
  assert.equal(capture.defaultPrevented, false);
  assert.equal(first.defaultPrevented, true);
  assert.equal(second.defaultPrevented, true);
  assert.equal(first.inputType, 'deleteContentBackward');
  assert.deepEqual(first.editor.body.value, blocks(''));
  assert.deepEqual(first.form.body.value, blocks('Original'));
  assert.deepEqual(first.editor.selection, { isNull: true, anchor: null, focus: null });
  assert.equal(second.form.body.value, null);
  assert.deepEqual(second.editor.operationTypes, []);
});

test('normalizes DOM and Slate range endpoints without copying DOM text or unrelated selection', () => {
  const f = fixture();
  const handle = f.attach();
  f.document.dispatch('selectionchange');
  const report = plain(handle.snapshot());
  assert.deepEqual(report.events[1].editor.selection, { isNull: false, anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 8 }, collapsed: false });
  assert.deepEqual(report.events[1].dom.range, { start: { insideEditor: true, path: [0, 0], nodeType: 3, offset: 0 }, end: { insideEditor: true, path: [0, 0], nodeType: 3, offset: 8 }, collapsed: false });
  assert.ok(report.events[1].atMs > report.events[0].atMs);
  const external = node(3, [], 200);
  Object.defineProperty(external, 'textContent', { get() { throw new Error('private selection'); } });
  f.state.selection.anchorNode = f.state.selection.focusNode = external;
  f.range.startContainer = f.range.endContainer = external;
  f.document.dispatch('selectionchange');
  const outside = plain(handle.stop()).events.at(-1).dom;
  assert.deepEqual(outside.anchor, { insideEditor: false });
  assert.deepEqual(outside.range.end, { insideEditor: false });
});

test('rejects invalid paths and offsets without copying unsafe selection fields', () => {
  for (const point of [
    { path: [-1, 0], offset: 0 }, { path: [0, 0.5], offset: 0 }, { path: [9, 0], offset: 0 },
    { path: ['private-path'], offset: 0 }, { path: [0, 0], offset: 9 },
    { path: [0, 0], offset: Infinity }, { path: [], offset: 0 }, { path: Array(33).fill(0), offset: 0 },
  ]) {
    const f = fixture();
    f.editor.selection.anchor = point;
    const report = plain(f.attach().stop());
    assert.ok(report.errors.includes('SLATE_SELECTION_INVALID'));
    assert.equal(report.events[0].editor.selection.invalid, true);
    assert.doesNotMatch(JSON.stringify(report), /private-path/);
  }
  const f = fixture();
  f.state.selection.anchorOffset = 9;
  const report = plain(f.attach().stop());
  assert.ok(report.errors.includes('DOM_SELECTION_INVALID'));
});

test('bounds records, body text/nodes and operation types; reports are independent clones', () => {
  const f = fixture();
  f.editor.children = blocks('x'.repeat(9000));
  f.editor.operations = Array.from({ length: 100 }, () => ({ type: 'insert_text', text: 'private operation' }));
  const handle = f.attach({ maxRecords: 4 });
  for (let i = 0; i < 20; i++) f.document.dispatch('selectionchange');
  const report = plain(handle.snapshot());
  assert.equal(report.events.length, 4);
  assert.equal(report.droppedRecords, 17);
  assert.equal(report.truncated, true);
  assert.equal(report.events[0].editor.body.value[0].children[0].text.length, 8192);
  assert.equal(report.events[0].editor.operationTypes.length, 64);
  report.events[0].form.body.value[0].children[0].text = 'changed clone';
  assert.equal(handle.snapshot().events[0].form.body.value[0].children[0].text, 'Original');
  f.state.values.body[0].children[0].text = 'changed source';
  assert.equal(handle.stop().events[0].form.body.value[0].children[0].text, 'Original');
  assert.doesNotMatch(JSON.stringify(report), /private operation/);
  const many = fixture();
  many.editor.children = Array.from({ length: 150 }, () => blocks('node')[0]);
  const limited = plain(many.attach().stop()).events[0].editor.body;
  assert.equal(limited.status, 'truncated');
  assert.ok(limited.value.length <= 48);
});

test('never reads or leaks unrelated props, renderer state, form values, operation payloads or event data', () => {
  const f = fixture();
  const deny = object => Object.defineProperty(object, 'privateData', { enumerable: true, get() { throw new Error('PRIVATE_SENTINEL'); } });
  [f.state.values, f.fiber.memoizedProps, f.slate.memoizedProps, f.form.memoizedProps, f.editor,
    f.editor.children[0], f.editor.children[0].children[0]].forEach(deny);
  f.state.values.token = 'PRIVATE_SENTINEL';
  f.editor.operations = [{ type: 'set_selection', properties: { token: 'PRIVATE_SENTINEL' } }, { type: 'PRIVATE_SENTINEL' }];
  f.editor.selection.private = 'PRIVATE_SENTINEL';
  Object.defineProperty(f.fiber, 'child', { get() { throw new Error('PRIVATE_SENTINEL'); } });
  Object.defineProperty(f.fiber, 'sibling', { get() { throw new Error('PRIVATE_SENTINEL'); } });
  const handle = f.attach();
  const event = { target: f.host, inputType: 'PRIVATE_SENTINEL', isComposing: true, defaultPrevented: false };
  Object.defineProperty(event, 'data', { get() { throw new Error('PRIVATE_SENTINEL'); } });
  Object.defineProperty(event, 'dataTransfer', { get() { throw new Error('PRIVATE_SENTINEL'); } });
  f.document.dispatch('beforeinput', event);
  f.flush();
  const report = plain(handle.stop());
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_SENTINEL|token|privateData/);
  assert.deepEqual(report.events[0].editor.operationTypes, ['set_selection', 'unknown']);
  assert.equal(report.events[1].inputType, 'unknown');
  assert.equal(report.events[1].isComposing, true);
});

test('stops without further values when route, DOM slug, host or Form slug leaves scope', () => {
  const cases = [
    ['ROUTE_CHANGED', f => { f.window.location.href = route.replace('document123', 'different123'); }],
    ['DOM_SLUG_CHANGED', f => { f.slugInput.value = 'another-document'; }],
    ['FORM_SLUG_CHANGED', f => { f.state.values = { slug: 'another-document', get body() { throw new Error('private body'); } }; }],
    ['EDITOR_HOST_CHANGED', f => { f.state.hosts = [f.host, node()]; }],
    ['EDITOR_UNMOUNTED', f => { f.host.isConnected = false; }],
    ['DEVTOOLS_HOOK_CHANGED', f => { f.window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {}; }],
  ];
  for (const [code, change] of cases) {
    const f = fixture();
    const handle = f.attach();
    change(f);
    f.document.dispatch('selectionchange');
    const report = plain(handle.stop());
    assert.equal(report.stoppedReason, code);
    assert.ok(report.errors.includes(code));
    assert.equal(report.events.length, 1);
    assert.equal(f.editor.onChange, f.original);
    assert.equal(f.document.listenerCount(), 0);
    assert.equal(f.window.listenerCount(), 0);
    assert.equal(f.observers[0].connected, false);
  }
});

test('unmount, navigation and manual stop clean up; a retained wrapper still forwards', () => {
  for (const end of [
    f => f.window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberUnmount(1, f.fiber),
    f => { f.host.isConnected = false; f.mutate(); },
    f => f.window.dispatch('pagehide'),
    f => { f.window.location.href = route.replace('document123', 'other'); f.window.dispatch('popstate'); },
    (_f, handle) => handle.stop(),
  ]) {
    const f = fixture();
    let calls = 0;
    const native = () => ++calls;
    f.editor.onChange = native;
    const handle = f.attach();
    const retained = f.editor.onChange;
    f.document.dispatch('beforeinput', { target: f.host, inputType: 'insertText' });
    const count = handle.snapshot().events.length;
    end(f, handle);
    f.flush();
    assert.equal(handle.snapshot().events.length, count);
    assert.equal(handle.snapshot().stopped, true);
    assert.equal(f.editor.onChange, native);
    assert.equal(retained(), 1);
    assert.equal(handle.snapshot().events.length, count);
    assert.equal(f.document.listenerCount(), 0);
    assert.equal(f.window.listenerCount(), 0);
  }
});

test('does not replace a newer callback during stop; supports a fresh attachment after stop', () => {
  const f = fixture();
  const handle = f.attach();
  assert.throws(() => f.attach(), /ALREADY_ATTACHED/);
  const replacement = () => 'newer callback';
  f.editor.onChange = replacement;
  handle.stop();
  assert.equal(f.editor.onChange, replacement);
  assert.equal(f.attach().stop().events.length, 1);
  assert.equal(f.editor.onChange, replacement);
});

test('unmount during the native callback preserves its result and clears attached references', () => {
  const f = fixture();
  const result = { returned: true };
  const native = () => { f.window.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberUnmount(1, f.fiber); return result; };
  f.editor.onChange = native;
  const handle = f.attach();
  assert.equal(f.editor.onChange(), result);
  assert.equal(handle.snapshot().stoppedReason, 'EDITOR_UNMOUNTED');
  assert.equal(f.editor.onChange, native);
  assert.deepEqual(plain(handle.stop()).events.map(event => event.phase), ['setup', 'before']);
});

test('a scope-read failure before onChange cannot suppress the real callback or leak the failure', () => {
  const f = fixture();
  let calls = 0;
  const result = { nativeResult: true };
  const native = () => { calls++; return result; };
  f.editor.onChange = native;
  const handle = f.attach();
  Object.defineProperty(f.state.values, 'slug', { get() { throw new Error('PRIVATE_SCOPE_ERROR'); } });
  assert.equal(f.editor.onChange(), result);
  assert.equal(calls, 1);
  assert.equal(f.editor.onChange, native);
  const report = plain(handle.stop());
  assert.equal(report.stoppedReason, 'SCOPE_READ_FAILED');
  assert.equal(report.events.length, 1);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_SCOPE_ERROR/);
});
