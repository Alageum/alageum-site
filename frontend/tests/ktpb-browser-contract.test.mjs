import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import path from 'node:path';
import fixture from '../e2e/fixtures/ktpb-public-dtos.json' with { type: 'json' };
import { ktpbIds, ktpbPublicDtos, malformedKtpbDto, ktpbLegacyGeometry } from '../e2e/helpers/ktpb-source-context-fixtures.mjs';
import { measureKtpbReadability } from '../e2e/helpers/ktpb-source-context-dom.mjs';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { createSourceContextAssetVerifier, getCatalogSourceContext } from '../lib/catalog/source-context/sourceContexts.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proof = await createSourceContextAssetVerifier(asset => readFile(new URL(`../public${asset}`, import.meta.url))).verify();

test('KTPB browser fixtures preserve actual importer IDs, four raw records and separate source/geometry decisions', () => {
  assert.equal(fixture.format, 'ktpb-importer-public-dtos-v1');
  assert.equal(fixture.baseCommit, 'c3241426715e8ab556df48242e405c9b382660ee');
  assert.equal(fixture.sourceRecordsSha256, digest(officialProducts));
  assert.equal(fixture.productionDatabase, false);
  assert.deepEqual(fixture.rows.map(row => row.public_key), ktpbIds);
  assert.ok(proof);
  for (const [index, dto] of ktpbPublicDtos().entries()) {
    const product = normalizeApiProduct(dto), original = productById(dto.public_key);
    assert.deepEqual(product.technicalSpecs, original.technicalSpecs);
    assert.equal(product.databaseId, dto.id);
    assert.equal(product.price, dto.price); assert.equal(product.price_mode, dto.price_mode);
    for (const record of [product, original]) {
      const context = getCatalogSourceContext(record, proof);
      if ([0, 2].includes(index)) {
        assert.equal(context.canonicalId, dto.public_key);
        assert.equal(context.sourceHref, '/catalog/source?page=56');
        assert.equal(context.figures[0].cropPath, '/catalog-source/page-056.webp');
        assert.equal(context.figures[0].exemplarId, null);
      } else assert.equal(context, null);
      assert.equal(getEquipmentVisual(record).type, index <= 1 ? ktpbLegacyGeometry : null);
    }
  }
});

test('all API mutation controls reject context and restore exactly without mutating fixtures', () => {
  for (const id of [ktpbIds[0], ktpbIds[2]]) {
    const [original] = ktpbPublicDtos([id]), before = JSON.stringify(original);
    for (const kind of ['uuid', 'source', 'owner-edit']) {
      const edited = normalizeApiProduct(malformedKtpbDto(original, kind));
      assert.equal(getCatalogSourceContext(edited, proof), null);
      if (kind === 'owner-edit') assert.equal(edited.technicalSpecs[0].value, '999');
    }
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(ktpbPublicDtos([id]), [original]);
    assert.ok(getCatalogSourceContext(normalizeApiProduct(original), proof));
  }
  assert.throws(() => ktpbPublicDtos(['unknown']), /Unreviewed/);
  assert.throws(() => malformedKtpbDto(ktpbPublicDtos()[0], 'unknown'), /Unreviewed/);
});

test('new KTPB browser configuration owns sixteen bounded cases and independent evidence', async () => {
  const old = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  try {
    process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = 'playwright-report/catalog-results.json';
    const { default: config } = await import('../playwright.ktpb-source-context.config.mjs');
    assert.equal(config.testMatch, 'ktpb-source-context.browser.js');
    assert.equal(4 * 2 * config.projects.length, 16);
    assert.equal(config.retries, 0); assert.equal(config.workers, 2);
    assert.equal(config.timeout, 45_000); assert.equal(config.globalTimeout, 240_000);
    assert.deepEqual(config.projects.map(project => project.use.viewport), [{ width: 1024, height: 768 }, { width: 390, height: 844 }]);
    assert.match(config.outputDir, /ktpb-source-context-evidence[/\\]test-results$/);
    assert.equal(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, path.join(path.dirname(config.outputDir), 'results.json'));
    assert.equal(config.use.trace, 'off'); assert.equal(config.use.screenshot, 'only-on-failure');
    assert.ok(config.webServer.command.startsWith('npm run start'));
  } finally {
    if (old === undefined) delete process.env.PLAYWRIGHT_JSON_OUTPUT_FILE; else process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = old;
  }
  const spec = await readFile(new URL('../e2e/ktpb-source-context.browser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(spec, /test\.skip|test\.only|waitForTimeout|test\.setTimeout/);
  assert.match(spec, /capturePtmmBrowserEvents\(page, testInfo\)/);
  assert.match(spec, /events\.capture\.pageErrorCount/);
  assert.match(spec, /events\.capture\.droppedEvents/);
  assert.match(spec, /events\.events\.filter/);
  assert.match(spec, /node\.evaluate\(measureKtpbReadability/);
  assert.match(spec, /state\.rows = \[\]/);
  assert.match(spec, /page\.waitForEvent\('popup'\)/);
  assert.match(spec, /page\.unroute/);
  assert.match(spec, /256 \* 1024/); assert.match(spec, /2 \* 1024 \* 1024/);
  assert.match(spec, /pixels\.changedPixels/);
  const workflow = await readFile(new URL('../../.github/workflows/ktpb-source-context.yml', import.meta.url), 'utf8');
  assert.equal((workflow.match(/^  [a-z0-9-]+-browser:$/gm) || []).length, 1);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /timeout-minutes: 15/); assert.match(workflow, /timeout-minutes: 5/); assert.match(workflow, /timeout-minutes: 6/);
  assert.match(workflow, /trap cleanup EXIT/); assert.match(workflow, /SECONDS \+ 90/);
  assert.match(workflow, /playwright.ktpb-source-context.config.mjs/);
  assert.match(workflow, /if: always\(\)/); assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /path: ktpb-source-context-evidence\//);
  assert.doesNotMatch(workflow, /secrets\.|deploy|continue-on-error|npm audit|frontend\/test-results|prepare-catalog-diagnostics/);
});

test('the unchanged general Playwright configuration cannot collect the dedicated KTPB harness', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
    'test', '--config=playwright.config.js', '--list', '--reporter=list'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
  });
  assert.doesNotMatch(output, /ktpb-source-context\.(?:spec|browser)\.js/);
  assert.match(output, /Total: 170 tests in 7 files/);
});
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
  scrollY = 0, ancestor, rootStyle = {}, intermediate = false, hiddenDescendant = false, requireTargetInViewport = false } = {}) {
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
      ...textRanges(() => fragments),
      createTreeWalker: target => {
        let seen = false;
        const parent = hiddenDescendant ? node(cellRect, { parentElement: target, style: { ...target.style, opacity: '0' } }) : target;
        return { nextNode: () => { if (seen) return null; seen = true; return { data: 'glyphs', parentElement: parent }; } };
      } } };
  // This is the exact exported function passed to locator.evaluate in the spec.
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${measureKtpbReadability.toString()})(element, options)`, context)));
}

test('actual KTPB DOM predicate rejects hidden descendants, ancestor clipping and unreadable offscreen links', () => {
  assert.equal(measure().readable, true);
  assert.ok(measure({ hiddenDescendant: true }).violations.includes('hidden-descendant-text'));
  const clipped = measure({ ancestor: { rect: box(16, 200, 90, 240), style: { overflowX: 'hidden' } }, intermediate: true });
  assert.ok(clipped.violations.includes('ancestor-horizontal-clipping'));
  assert.equal(measure({ rootStyle: { visibility: 'hidden' } }).readable, false);
  assert.equal(measure({ rootStyle: { opacity: '0' } }).readable, false);
  assert.equal(measure({ cellRect: box(16, 350, 900, 1100), fragments: [box(20, 340, 950, 970)], requireTargetInViewport: true }).readable, false);
  assert.equal(measure({ cellRect: box(16, 350, -200, 1000), scrollHeight: 1200, fragments: [box(20, 340, -190, 980)], scrollY: 200 }).readable, true);
  assert.equal(measure({ cellRect: box(16, 350, 100, 140), scrollHeight: 140, fragments: [box(20, 340, 220, 240)] }).readable, false);
});
