import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { measurePtmmReadability, measurePtmmRenderedUnit } from '../e2e/helpers/ptmm-qualification-dom.mjs';
import { capturePtmmBrowserEvents, browserEventLimits } from '../e2e/helpers/ptmm-browser-events.mjs';

const box = (left, right, top, bottom) => ({ left, right, top, bottom, width: right - left, height: bottom - top });
function node(rect, extra = {}) {
  return { parentElement: null, getBoundingClientRect: () => rect,
    clientWidth: rect.width, clientHeight: rect.height, scrollWidth: rect.width, scrollHeight: rect.height,
    offsetWidth: rect.width, offsetHeight: rect.height, clientLeft: 0, clientTop: 0, scrollTop: 0,
    style: { display: 'block', visibility: 'visible', contentVisibility: 'visible', opacity: '1', overflowX: 'visible', overflowY: 'visible', clip: 'auto', clipPath: 'none', contain: 'none' }, ...extra };
}
// A text-node-aware Range double: existing clipping/visibility controls keep
// their geometry and assertions, now exercising the same word-range DOM API.
function textRanges(rectangles) {
  return {
    createTreeWalker: target => {
      let visited = false;
      return { nextNode: () => { if (visited) return null; visited = true; return { data: 'glyphs', parentElement: target }; } };
    },
    createRange: () => {
      let selected;
      return { selectNodeContents(target) { selected = target; }, setStart(text) { selected = text.parentElement; }, setEnd() {},
        getClientRects: () => rectangles(selected) };
    },
  };
}
function measure({ cellRect = box(16, 350, 100, 200), fragments = [box(20, 340, 110, 130)], scrollHeight,
  scrollY = 0, ancestor, rootStyle = {}, intermediate = false, requireTargetInViewport = false } = {}) {
  const root = node(box(0, 390, -scrollY, 1600 - scrollY), { clientHeight: 844, scrollHeight: 1600, scrollTop: scrollY });
  root.style = { ...root.style, ...rootStyle };
  const cell = node(cellRect, { scrollHeight: scrollHeight ?? cellRect.height });
  if (ancestor) {
    const parent = node(ancestor.rect, { ...ancestor, style: { ...root.style, ...ancestor.style } });
    parent.parentElement = root; cell.parentElement = parent;
    if (intermediate) { const inner = node(cellRect); inner.parentElement = parent; cell.parentElement = inner; }
  } else cell.parentElement = root;
  const element = node(cellRect); element.parentElement = cell; element.closest = () => cell;
  const context = { element, options: { requireTargetInViewport }, window: { innerWidth: 390, innerHeight: 844, scrollY },
    getComputedStyle: current => current.style,
    document: { scrollingElement: root, documentElement: root,
      ...textRanges(() => fragments) } };
  // This is the exact exported function passed to locator.evaluate in the spec.
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${measurePtmmReadability.toString()})(element, options)`, context)));
}

test('the actual browser predicate rejects both independent clipping counterexamples', () => {
  const vertical = measure({ cellRect: box(16, 350, 100, 140), scrollHeight: 140,
    fragments: [box(20, 340, 100, 120), box(20, 340, 220, 240)] });
  assert.equal(vertical.readable, false); assert.ok(vertical.violations.includes('cell-vertical-overflow'));
  const horizontal = measure({ cellRect: box(0, 390, 100, 200), fragments: [box(3, 387, 100, 120)],
    ancestor: { rect: box(16, 374, 90, 220), style: { overflowX: 'hidden' } }, intermediate: true });
  assert.equal(horizontal.readable, false); assert.ok(horizontal.violations.includes('ancestor-horizontal-clipping'));
});

test('the same predicate rejects distant vertical clipping and paint clipping, without requiring tall text to fit the viewport', () => {
  const clipped = measure({ cellRect: box(16, 350, 100, 240), fragments: [box(20, 340, 210, 230)],
    ancestor: { rect: box(16, 350, 100, 140), style: { overflowY: 'hidden' } }, intermediate: true });
  assert.equal(clipped.readable, false); assert.ok(clipped.violations.includes('ancestor-vertical-clipping'));
  const paint = measure({ cellRect: box(16, 350, 100, 240), fragments: [box(20, 340, 210, 230)],
    ancestor: { rect: box(16, 350, 100, 140), style: { contain: 'paint' } } });
  assert.equal(paint.readable, false);
  const tall = measure({ cellRect: box(16, 350, -200, 1000), scrollHeight: 1200,
    fragments: [box(20, 340, -190, 980)], scrollY: 200 });
  assert.equal(tall.readable, true);
  assert.equal(measure({ cellRect: box(16, 350, -200, 1000), scrollHeight: 1200, fragments: [box(20, 340, -190, 980)], scrollY: 200, rootStyle: { overflowY: 'auto' } }).readable, true);
  assert.equal(measure({ cellRect: box(16, 350, -200, 1000), scrollHeight: 1200, fragments: [box(20, 340, -190, 980)], scrollY: 200, rootStyle: { overflowY: 'hidden' } }).readable, false);
  assert.equal(measure().readable, true);
});

test('ordinary vertical scrolling keeps all text reachable and brings the link into the actual visible scrollport', () => {
  const layout = { cellRect: box(16, 350, 100, 240), fragments: [box(20, 340, 210, 230)],
    ancestor: { rect: box(16, 350, 100, 140), scrollHeight: 140, style: { overflowY: 'auto' } } };
  assert.equal(measure(layout).readable, true);
  const hiddenLink = measure({ ...layout, requireTargetInViewport: true });
  assert.equal(hiddenLink.readable, false); assert.ok(hiddenLink.violations.includes('target-outside-ancestor-scroll-viewport'));
  assert.equal(measure({ ...layout, cellRect: box(16, 350, 0, 140), fragments: [box(20, 340, 110, 130)],
    ancestor: { ...layout.ancestor, scrollTop: 100 }, requireTargetInViewport: true }).readable, true);
  assert.equal(measure({ cellRect: box(16, 350, 900, 1100), fragments: [box(20, 340, 950, 970)], requireTargetInViewport: true }).readable, false);
  assert.equal(measure({ cellRect: box(16, 350, 300, 500), fragments: [box(20, 340, 350, 370)], scrollY: 600, requireTargetInViewport: true }).readable, true);
});

test('rendered-unit predicate cannot pass using the fixture or the мм inside the caveat', () => {
  const options = { mode: 'static', label: 'Габаритные размеры В×Ш×Г', value: '800×600×380', family: 'ПТМ' };
  const detail = unit => ({ textContent: 'caveat: мм requires confirmation', closest: selector => selector === 'dd' ? {
    parentElement: { querySelector: () => ({ childNodes: [{ nodeType: 3, textContent: unit }, { nodeType: 1, textContent: 'стр. 68 мм' }] }) },
  } : null });
  assert.equal(measurePtmmRenderedUnit(detail('мм'), options).valid, true);
  assert.equal(measurePtmmRenderedUnit(detail(''), options).valid, false);
  assert.equal(measurePtmmRenderedUnit(detail('см'), options).valid, false);
  const comparison = (value, heading) => ({ textContent: 'caveat: мм requires confirmation', firstElementChild: { textContent: value },
    closest: selector => selector === 'tr' ? { querySelector: () => ({ textContent: heading }) } : null });
  assert.equal(measurePtmmRenderedUnit(comparison('ПТМ в таблице источника: 800×600×380.', ''), options).valid, false);
  assert.equal(measurePtmmRenderedUnit(comparison('ПТМ в таблице источника: 800×600×380 мм.', ''), options).valid, true);
  assert.equal(measurePtmmRenderedUnit(comparison('', `${options.label}, см`), { ...options, mode: 'api' }).valid, false);
  assert.equal(measurePtmmRenderedUnit(comparison('', `${options.label}, мм`), { ...options, mode: 'api' }).valid, true);
});

function eventFixture({ writeFails = false, attachFails = false, pathFails = false, limits } = {}) {
  const page = new EventEmitter(); page.viewportSize = () => ({ width: 390, height: 844 });
  const files = new Map(), attachments = [];
  const info = { testId: 'case-v002-api', title: 'API PTMM source caveat', project: { name: 'ptmm-mobile' }, retry: 0, workerIndex: 1,
    status: 'failed', expectedStatus: 'passed', outputPath: name => { if (pathFails) throw new Error('output path unavailable'); return `/evidence/case-v002-api/${name}`; },
    attach: async (name, value) => { if (attachFails) throw new Error('attachment storage unavailable'); attachments.push({ name, ...value }); } };
  const io = { mkdir: async () => {}, writeFile: async (file, bytes) => { if (writeFails) throw new Error('output storage unavailable'); files.set(file, Buffer.from(bytes)); },
    rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    readFile: async file => { if (!files.has(file)) throw new Error('missing evidence file'); return files.get(file); },
    rm: async file => { files.delete(file); },
  };
  const recorder = capturePtmmBrowserEvents(page, info, { io, ...(limits ? { limits } : {}) });
  const log = text => page.emit('console', { type: () => 'warning', text: () => text, location: () => ({ url: 'http://127.0.0.1:3118/catalog', lineNumber: 3, columnNumber: 2 }) });
  return { page, info, files, attachments, recorder, log };
}

test('real page console/pageerror listeners retain failed-case identity, viewport, events and final status', async () => {
  const f = eventFixture(); f.log('Actual browser console warning'); f.page.emit('pageerror', new Error('Actual uncaught page exception'));
  const result = await f.recorder.finish();
  assert.equal(result.capture.status, 'complete'); assert.equal(result.capture.consoleCount, 1); assert.equal(result.capture.pageErrorCount, 1);
  assert.deepEqual(result.events.map(event => event.kind), ['console', 'pageerror']);
  assert.match(result.events[1].message, /Actual uncaught page exception/);
  assert.equal(result.identity.testId, 'case-v002-api'); assert.equal(result.identity.project, 'ptmm-mobile');
  assert.deepEqual(result.identity.viewport, { width: 390, height: 844 }); assert.equal(result.outcome.statusAtCaptureFinish, 'failed');
  const file = JSON.parse([...f.files.values()][0]); assert.equal(file.retention.file, 'written'); assert.equal(file.retention.attachment, 'attached');
  assert.equal(f.attachments.length, 1); assert.equal(f.page.listenerCount('console'), 0); assert.equal(f.page.listenerCount('pageerror'), 0);
});

test('UTF-8 logs, event count and artifact size are bounded and truncation remains explicit', async () => {
  const f = eventFixture({ limits: { maxEvents: 3, maxEventBytes: 900, maxTextBytes: 100 } });
  for (let index = 0; index < 100; index++) f.log('😀'.repeat(1000));
  f.page.emit('pageerror', new Error('late error still counted beyond the event cap'));
  const result = await f.recorder.finish();
  assert.ok(result.capture.eventCount <= 3); assert.ok(result.capture.eventBytes <= 900);
  assert.equal(result.capture.status, 'truncated'); assert.ok(result.capture.droppedEvents > 0); assert.ok(result.capture.truncatedEvents > 0);
  assert.equal(result.capture.consoleCount, 100); assert.equal(result.capture.pageErrorCount, 1);
  for (const event of result.events) assert.ok(Buffer.byteLength(event.message) <= 100);
  for (const bytes of f.files.values()) assert.ok(bytes.length <= browserEventLimits.maxArtifactBytes);
  for (const attachment of f.attachments) assert.ok(attachment.body.length <= browserEventLimits.maxArtifactBytes);
});

test('capture/read and persistence errors are explicit, with independent attachment/file fallbacks', async () => {
  const read = eventFixture(); read.page.emit('console', { type: () => 'error', text: () => 'unreadable', location() { throw new Error('location unavailable'); } });
  const readResult = await read.recorder.finish(); assert.equal(readResult.capture.status, 'partial-error'); assert.equal(readResult.capture.errors[0].stage, 'read-console');
  const fileOnly = eventFixture({ attachFails: true }); fileOnly.log('retained in standalone artifact');
  const fileResult = await fileOnly.recorder.finish(); assert.equal(fileResult.retention.saved, true); assert.equal(fileResult.retention.attachment, 'error');
  assert.ok(JSON.parse([...fileOnly.files.values()][0]).capture.errors.some(error => error.stage === 'attach'));
  const attachmentOnly = eventFixture({ writeFails: true }); attachmentOnly.log('retained in attachment');
  const attachmentResult = await attachmentOnly.recorder.finish(); assert.equal(attachmentResult.retention.saved, true); assert.equal(attachmentResult.retention.file, 'error');
  assert.equal(attachmentOnly.attachments.length, 1); assert.ok(JSON.parse(attachmentOnly.attachments[0].body).capture.errors.some(error => error.stage === 'write-file'));
  const badPath = eventFixture({ pathFails: true }); badPath.log('still attached without a file path');
  const pathResult = await badPath.recorder.finish(); assert.equal(pathResult.retention.saved, true); assert.equal(pathResult.retention.attachment, 'attached');
  assert.ok(pathResult.capture.errors.some(error => error.stage === 'resolve-output-path'));
  const neither = eventFixture({ writeFails: true, attachFails: true }); await assert.rejects(neither.recorder.finish(), /could not be retained/);
});

test('the sixteen-case spec uses the tested DOM predicates and unconditional afterEach evidence finalization', async () => {
  const source = await readFile(new URL('../e2e/ptmm-qualification.spec.js', import.meta.url), 'utf8');
  assert.match(source, /node\.evaluate\(measurePtmmReadability\)/);
  assert.match(source, /expectReadableNode\(value, 'Source value'\)/);
  assert.match(source, /expectReadableNode\(warning, 'Applicability and unit caveat'\)/);
  assert.match(source, /expectReadableNode\(unit, 'Rendered unit'\)/);
  assert.match(source, /link\.evaluate\(measurePtmmReadability, \{ requireTargetInViewport: true \}\)/);
  assert.match(source, /context\.evaluate\(measurePtmmRenderedUnit/);
  assert.match(source, /test\.afterEach[\s\S]*?await recorder\.finish\(\)/);
  assert.match(source, /capture\.pageErrorCount/); assert.doesNotMatch(source, /errors\.push|expect\(spec\.unit\)/);
});

test('serialized readability checks reject hidden/clipped frozen children and every unit-bearing node', () => {
  const roles = ['value', 'warning', 'detail-unit', 'static-unit-value', 'api-unit-header'];
  for (const role of roles) for (const state of ['visible', 'hidden', 'transparent', 'clipped']) {
    const root = node(box(0, 390, 0, 1600), { clientHeight: 844, scrollHeight: 1600 });
    const row = node(box(16, 374, 100, 260)); row.parentElement = root;
    const cell = node(box(16, 374, 100, 260)); cell.parentElement = row;
    const context = node(box(20, 370, 110, 250)); context.parentElement = cell;
    const target = node(box(20, 370, 130, 230)); target.parentElement = context;
    if (role === 'detail-unit') target.parentElement = row;
    if (role === 'api-unit-header') target.parentElement = row;
    target.closest = selector => selector === 'td, dd, th' ? role === 'detail-unit' ? null : role === 'api-unit-header' ? target : cell
      : selector === '.technical-specs > div' && role === 'detail-unit' ? row : null;
    if (state === 'hidden') target.style.visibility = 'hidden';
    if (state === 'transparent') target.style.opacity = '0';
    if (state === 'clipped') { target.style.overflowY = 'hidden'; target.clientHeight = 5; }
    const checked = [];
    const result = vm.runInNewContext(`(${measurePtmmReadability.toString()})(element)`, {
      element: target, window: { innerWidth: 390, innerHeight: 844, scrollY: 0 },
      document: { scrollingElement: root, documentElement: root, ...textRanges(() => [box(22, 368, 135, 225)]) },
      getComputedStyle: current => { checked.push(current); return current.style; },
    });
    assert.equal(result.readable, state === 'visible', `${role}/${state}`);
    assert.ok(checked.includes(target), `${role}: the actual node, not only its wrapper, must be measured`);
  }
});

async function runExactEvidenceHooks({ finalTempWriteFails = false, destructiveFinalRename = false, allWritesFail = false, attachFails = false } = {}) {
  const source = (await readFile(new URL('../e2e/ptmm-qualification.spec.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const hooks = {}, files = new Map(), attachments = []; let writes = 0, renames = 0;
  const io = {
    mkdir: async () => {},
    writeFile: async (file, body) => {
      writes++;
      if (allWritesFail || finalTempWriteFails && writes === 2) { files.set(file, Buffer.from('{')); throw new Error('simulated partial write after truncation'); }
      files.set(file, Buffer.from(body));
    },
    rename: async (from, to) => {
      renames++;
      if (destructiveFinalRename && renames === 2) { files.set(to, Buffer.from('{')); throw new Error('simulated retained-file corruption during rename'); }
      files.set(to, files.get(from)); files.delete(from);
    },
    readFile: async file => { if (!files.has(file)) throw new Error('missing evidence'); return files.get(file); },
    rm: async file => { files.delete(file); },
  };
  const test = () => {}; test.beforeEach = callback => { hooks.before = callback; }; test.afterEach = callback => { hooks.after = callback; };
  const expect = (value, message) => ({ toBe: expected => assert.equal(value, expected, message), toEqual: expected => assert.equal(JSON.stringify(value), JSON.stringify(expected), message) });
  vm.runInNewContext(source, { test, expect, ptmmIds: ['v002', 'v005', 'v008'], capturePtmmBrowserEvents: (page, info) => capturePtmmBrowserEvents(page, info, { io }) });
  const page = new EventEmitter(); page.viewportSize = () => ({ width: 390, height: 844 });
  const info = { testId: 'atomic-case', title: 'atomic evidence control', project: { name: 'ptmm-mobile' }, retry: 0, workerIndex: 0,
    status: 'passed', expectedStatus: 'passed', annotations: [], outputPath: () => '/fake/browser-events.json',
    attach: async (name, attachment) => { if (attachFails) throw new Error('attachment unavailable'); attachments.push(Buffer.from(attachment.body)); },
  };
  await hooks.before({ page }, info);
  page.emit('console', { type: () => 'warning', text: () => 'actual observed event', location: () => ({ url: 'http://127.0.0.1:3118/catalog', lineNumber: 1, columnNumber: 2 }) });
  let afterEachError = null;
  try { await hooks.after({ page }, info); } catch (error) { afterEachError = error.message; }
  const valid = body => { try { return JSON.parse(body).events?.[0]?.message === 'actual observed event'; } catch { return false; } };
  return { afterEachError, info, files, attachments, validFiles: [...files.values()].filter(valid).length, validAttachments: attachments.filter(valid).length };
}

test('exact afterEach preserves the first valid file when attachment and final temp write fail', async () => {
  const result = await runExactEvidenceHooks({ attachFails: true, finalTempWriteFails: true });
  assert.equal(result.afterEachError, null); assert.equal(result.validFiles, 1); assert.equal(result.validAttachments, 0);
  const status = JSON.parse(result.info.annotations[0].description);
  assert.equal(status.retention.file, 'preserved'); assert.equal(status.retention.saved, true);
  assert.equal(result.files.has('/fake/browser-events.json.pending'), false);
});

test('exact afterEach cannot pass from stale saved=true when the retained file is actually destroyed', async () => {
  const result = await runExactEvidenceHooks({ attachFails: true, destructiveFinalRename: true });
  assert.equal(result.validFiles, 0); assert.equal(result.validAttachments, 0);
  assert.match(result.afterEachError, /could not be retained/);
  const neither = await runExactEvidenceHooks({ attachFails: true, allWritesFail: true });
  assert.equal(neither.validFiles, 0); assert.equal(neither.validAttachments, 0); assert.match(neither.afterEachError, /could not be retained/);
});

test('exact afterEach still accepts the independently valid attachment after standalone corruption', async () => {
  const result = await runExactEvidenceHooks({ destructiveFinalRename: true });
  assert.equal(result.afterEachError, null); assert.equal(result.validFiles, 0); assert.equal(result.validAttachments, 1);
  const status = JSON.parse(result.info.annotations[0].description);
  assert.equal(status.retention.file, 'error'); assert.equal(status.retention.attachment, 'attached'); assert.equal(status.retention.saved, true);
});

test('exact spec readability flow measures each frozen value, warning and external unit target', async () => {
  const source = (await readFile(new URL('../e2e/ptmm-qualification.spec.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  for (const mode of ['detail', 'static', 'api']) for (const hidden of [null, 'value', 'warning', 'unit']) {
    const root = node(box(0, 390, 0, 1600), { clientHeight: 844, scrollHeight: 1600 });
    const row = node(box(16, 374, 100, 260)); row.parentElement = root;
    const cell = node(box(16, 374, 100, 260)); cell.parentElement = row;
    const context = node(box(20, 370, 110, 250)); context.parentElement = cell;
    const value = node(box(20, 370, 110, 130)); value.parentElement = context;
    const warning = node(box(20, 370, 140, 220)); warning.parentElement = context;
    const externalUnit = node(box(20, 370, 225, 240)); externalUnit.parentElement = row;
    const link = node(box(20, 150, 242, 255)); link.parentElement = context;
    const unit = mode === 'static' ? value : externalUnit;
    const targets = { context, value, warning, unit, link, row, cell };
    if (hidden) targets[hidden].style.visibility = 'hidden';
    const measured = [];
    for (const target of new Set(Object.values(targets))) target.closest = selector => selector === 'td, dd, th'
      ? target === externalUnit ? mode === 'api' ? externalUnit : null : cell
      : selector === '.technical-specs > div' && target === externalUnit && mode === 'detail' ? row : null;
    const globals = { window: { innerWidth: 390, innerHeight: 844, scrollY: 0 },
      getComputedStyle: target => target.style,
      document: { scrollingElement: root, documentElement: root, ...textRanges(target => [target.getBoundingClientRect()]) },
    };
    const makeLocator = key => ({
      key, count: async () => key === 'detail' ? mode === 'detail' ? 1 : 0 : 1,
      scrollIntoViewIfNeeded: async () => {}, click: async () => {},
      evaluate: async (predicate, options) => {
        measured.push(key);
        return vm.runInNewContext(`(${predicate.toString()})(element, options)`, { ...globals, element: targets[key], options });
      },
      locator: selector => selector === ':scope > span' ? makeLocator('value') : selector === ':scope > strong' ? makeLocator('warning')
        : selector === 'xpath=ancestor::dd[1]' ? makeLocator('detail') : selector === 'xpath=..' ? makeLocator('row')
          : selector === 'xpath=ancestor::tr[1]' ? makeLocator('row') : makeLocator('unit'),
      getByRole: () => makeLocator('link'),
    });
    const test = () => {}; test.beforeEach = () => {}; test.afterEach = () => {};
    // Visibility is decided by the serialized predicate here, so these controls
    // cannot pass merely because a mocked Playwright assertion rejects early.
    const expect = value => ({ toHaveCount: async count => assert.equal(await value.count(), count), toBeVisible: async () => {},
      toEqual: expected => assert.equal(JSON.stringify(value), JSON.stringify(expected)) });
    const runtime = { test, expect, ptmmIds: [], measurePtmmReadability };
    vm.runInNewContext(`${source}\nglobalThis.readable = expectReadable;`, runtime);
    let failure = null; try { await runtime.readable(makeLocator('context'), mode === 'detail' ? 'api' : mode); } catch (error) { failure = error; }
    assert.equal(Boolean(failure), hidden !== null, `${mode}/${hidden || 'visible'}`);
    if (!hidden) { assert.ok(measured.includes('value')); assert.ok(measured.includes('warning')); assert.ok(measured.includes(mode === 'static' ? 'value' : 'unit')); }
  }
});

test('native atomic filesystem write preserves parseable evidence after a partial final temporary write', async () => {
  const native = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { default: path } = await import('node:path');
  const directory = await native.mkdtemp(path.join(tmpdir(), 'ptmm-atomic-events-'));
  let writes = 0;
  try {
    const page = new EventEmitter(); page.viewportSize = () => ({ width: 390, height: 844 });
    const info = { testId: 'native-atomic', title: 'native atomic regression', project: { name: 'ptmm-mobile' }, retry: 0, workerIndex: 0,
      status: 'failed', expectedStatus: 'passed', outputPath: name => path.join(directory, name), attach: async () => { throw new Error('attachment failed'); } };
    const recorder = capturePtmmBrowserEvents(page, info, { io: { ...native, writeFile: async (file, body) => {
      if (++writes === 2) { await native.writeFile(file, '{'); throw new Error('partial final temp write'); }
      await native.writeFile(file, body);
    } } });
    page.emit('console', { type: () => 'warning', text: () => 'native retained event', location: () => ({}) });
    const result = await recorder.finish(); assert.equal(result.retention.saved, true); assert.equal(result.retention.file, 'preserved');
    const retained = JSON.parse(await native.readFile(path.join(directory, 'browser-events.json'), 'utf8'));
    assert.equal(retained.events[0].message, 'native retained event');
    assert.deepEqual(await native.readdir(directory), ['browser-events.json']);
  } finally { await native.rm(directory, { recursive: true, force: true }); }
});

function measureWordLayout({ text = 'Размеры не подтверждены. ', fullRight = 352.5, visibleRight = 350, ancestorClip = false, hidden = false, missingWord = null, middleFragmentOutside = false } = {}) {
  const root = node(box(0, 390, 0, 1600), { clientHeight: 844, scrollHeight: 1600 });
  const cell = node(box(16, 350, 100, 200)); cell.parentElement = root;
  const target = node(box(20, 350, 110, 130)); target.parentElement = cell; target.closest = () => cell;
  target.style.whiteSpace = 'pre-wrap';
  if (hidden) target.style.visibility = 'hidden';
  if (ancestorClip) { const ancestor = node(box(16, 340, 100, 200)); ancestor.style.overflowX = 'hidden'; ancestor.parentElement = root; cell.parentElement = ancestor; }
  const textNode = { data: text, parentElement: target }, selected = [];
  const document = {
    scrollingElement: root, documentElement: root,
    createTreeWalker: () => { let seen = false; return { nextNode: () => { if (seen) return null; seen = true; return textNode; } }; },
    createRange: () => {
      let start = 0, end = text.length, full = true;
      return {
        selectNodeContents() { full = true; }, setStart(node, offset) { assert.equal(node, textNode); start = offset; full = false; },
        setEnd(node, offset) { assert.equal(node, textNode); end = offset; },
        getClientRects() {
          if (full) return [box(20, fullRight, 110, 130)];
          const word = text.slice(start, end); selected.push(word);
          if (word === missingWord) return [];
          return middleFragmentOutside ? [box(20, 100, 110, 130), box(20, visibleRight, 130, 150), box(20, 100, 150, 170)] : [box(20, visibleRight, 110, 130)];
        },
      };
    },
  };
  const measured = JSON.parse(JSON.stringify(vm.runInNewContext(`(${measurePtmmReadability.toString()})(element)`, {
    element: target, document, window: { innerWidth: 390, innerHeight: 844, scrollY: 0 }, getComputedStyle: current => current.style,
  })));
  return { measured, selected };
}

test('hanging pre-wrap spaces do not masquerade as visible glyph overflow, with exact bounded diagnostic coordinates', () => {
  const { measured, selected } = measureWordLayout();
  assert.deepEqual(selected, ['Размеры', 'не', 'подтверждены.']);
  assert.equal(measured.readable, true);
  assert.equal(measured.diagnostics.tolerance, 1);
  assert.equal(measured.diagnostics.whiteSpace, 'pre-wrap');
  assert.equal(measured.diagnostics.rawCellWidthOverflow, 1);
  assert.equal(measured.diagnostics.rawOutsideCell[0].right, 352.5);
  assert.equal(measured.diagnostics.cell.right, 350);
  // This precise full-text Range exceeds the previous unchanged 1px test.
  assert.ok(measured.diagnostics.rawOutsideCell[0].right > measured.diagnostics.cell.right + 1);
  assert.equal(measured.diagnostics.offending.length, 0);
  assert.equal(measured.diagnostics.wordBounds.right, 350);
  assert.equal(measureWordLayout({ fullRight: 350 }).measured.readable, true);
});

test('actual visible word overflow, clipping and hidden targets still fail with the same bounds', () => {
  const overflow = measureWordLayout({ visibleRight: 352.5 }).measured;
  assert.equal(overflow.readable, false);
  assert.ok(overflow.violations.includes('text-outside-cell-width'));
  const offending = overflow.diagnostics.offending.find(item => item.code === 'text-outside-cell-width');
  assert.equal(offending.rect.right, 352.5); assert.equal(offending.boundary.right, 350);
  assert.equal(offending.word, 'Размеры');
  assert.equal(offending.start, 0); assert.equal(offending.end, 7);
  assert.ok(measureWordLayout({ missingWord: 'не' }).measured.violations.includes('missing-word-geometry'));
  assert.ok(measureWordLayout({ visibleRight: 352.5, middleFragmentOutside: true }).measured.violations.includes('text-outside-cell-width'));
  const clipped = measureWordLayout({ ancestorClip: true }).measured;
  assert.equal(clipped.readable, false); assert.ok(clipped.violations.includes('ancestor-horizontal-clipping'));
  const hidden = measureWordLayout({ hidden: true }).measured;
  assert.equal(hidden.readable, false); assert.ok(hidden.violations.includes('hidden-content'));
  assert.ok(measureWordLayout({ text: ' \t\r\n' }).measured.violations.includes('missing-text'));
});

test('word traversal and failure geometry remain bounded and reject over-budget text', () => {
  const tooMany = measureWordLayout({ text: 'слово '.repeat(300), visibleRight: 352.5 }).measured;
  assert.equal(tooMany.readable, false); assert.ok(tooMany.violations.includes('word-limit') || tooMany.violations.includes('fragment-limit'));
  assert.ok(tooMany.fragments <= 256); assert.ok(tooMany.diagnostics.offending.length <= 8); assert.ok(tooMany.diagnostics.omittedDiagnostics > 0);
  assert.ok(JSON.stringify(tooMany.diagnostics).length < 4096);
  const tooLong = measureWordLayout({ text: 'а'.repeat(8193) }).measured;
  assert.equal(tooLong.readable, false); assert.ok(tooLong.violations.includes('text-character-limit'));
});

test('exact spec retains six successful Range-difference witnesses and exposes failure geometry without broadening case limits', async () => {
  const source = (await readFile(new URL('../e2e/ptmm-qualification.spec.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const annotations = [], test = () => {}; test.beforeEach = () => {}; test.afterEach = () => {}; test.info = () => ({ annotations });
  const runtime = { test, ptmmIds: [] };
  vm.runInNewContext(`${source}\nglobalThis.retain = retainReadabilityGeometry;`, runtime);
  const pass = measureWordLayout().measured;
  for (let i = 0; i < 20; i++) runtime.retain(pass, 'Applicability and unit caveat');
  assert.equal(annotations.filter(item => item.type === 'readability-range-geometry').length, 6);
  assert.equal(annotations.filter(item => item.type === 'readability-range-geometry-truncated').length, 1);
  assert.ok(annotations.every(item => item.description.length < 4096));
  runtime.retain(measureWordLayout({ visibleRight: 352.5 }).measured, 'Overflow'); assert.equal(annotations.length, 7);
  assert.match(source, /geometry=\$\{JSON\.stringify\(measured\.diagnostics\)\}/);
  assert.match(source, /geometry=\$\{JSON\.stringify\(linkMeasured\.diagnostics\)\}/);
});
