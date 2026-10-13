import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fixture from '../e2e/fixtures/ptmm-public-dtos.json' with { type: 'json' };
import { ptmmIds, ptmmPublicDtos, malformedPtmmDto, dimensionLabels, ptmmUnitCaveat } from '../e2e/helpers/ptmm-qualification-fixtures.mjs';
import { officialProducts, productById } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getPtmmDimensionQualification } from '../lib/catalog/ptmmDimensionQualification.js';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('separate API browser fixtures retain actual importer records, UUID guards, raw dimensions and units', () => {
  assert.equal(fixture.format, 'ptmm-importer-public-dtos-v1');
  assert.equal(fixture.sourceRecordsSha256, digest(officialProducts));
  assert.equal(fixture.productionDatabase, false);
  assert.deepEqual(fixture.rows.map(row => row.public_key), ['cat-ptm-tded-v001', ...ptmmIds]);
  for (const dto of fixture.rows) {
    const live = normalizeApiProduct(dto), source = productById(dto.public_key);
    assert.deepEqual(live.technicalSpecs, source.technicalSpecs);
    for (const spec of live.technicalSpecs.filter(spec => dimensionLabels.includes(spec.label))) {
      const qualification = getPtmmDimensionQualification(live, spec);
      if (ptmmIds.includes(live.id)) assert.ok(qualification?.note.includes(ptmmUnitCaveat));
      else assert.equal(qualification, null);
    }
    assert.equal(live.databaseId, dto.id); assert.equal(live.price, dto.price); assert.equal(live.price_mode, dto.price_mode);
  }
});

test('each malformed API scenario fails closed and fixture reuse restores the exact reviewed source row', () => {
  for (const original of ptmmPublicDtos()) {
    const before = JSON.stringify(original);
    for (const kind of ['dimension', 'uuid', 'source']) {
      const changed = normalizeApiProduct(malformedPtmmDto(original, kind));
      for (const spec of changed.technicalSpecs.filter(spec => dimensionLabels.includes(spec.label))) assert.equal(getPtmmDimensionQualification(changed, spec), null);
      if (kind === 'dimension') assert.ok(changed.technicalSpecs.some(spec => spec.value === '111×222×333'));
    }
    assert.equal(JSON.stringify(original), before);
    assert.deepEqual(ptmmPublicDtos([original.public_key]), [original]);
  }
  assert.throws(() => ptmmPublicDtos(['unreviewed-id']), /Unreviewed/);
});

test('qualification browser configuration owns separate output, sixteen cases and bounded timing without altering catalog configuration', async () => {
  const old = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = 'playwright-report/catalog-results.json';
  try {
    const { default: config } = await import('../playwright.ptmm-qualification.config.mjs');
    assert.equal(config.testMatch, 'ptmm-qualification.spec.js'); assert.equal(config.projects.length, 2);
    assert.equal(2 * (ptmmIds.length + 1) * config.projects.length, 16);
    assert.equal(config.retries, 0); assert.equal(config.workers, 2); assert.equal(config.timeout, 45_000); assert.equal(config.globalTimeout, 240_000);
    assert.deepEqual(config.projects.map(project => project.use.viewport), [{ width: 1024, height: 768 }, { width: 390, height: 844 }]);
    assert.match(config.outputDir, /ptmm-qualification-evidence[/\\]test-results$/);
    assert.equal(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE, path.join(path.dirname(config.outputDir), 'results.json'));
    assert.ok(!config.outputDir.includes('frontend/test-results'));
    assert.equal(config.webServer?.command.startsWith('npm run start'), true);
  } finally {
    if (old === undefined) delete process.env.PLAYWRIGHT_JSON_OUTPUT_FILE; else process.env.PLAYWRIGHT_JSON_OUTPUT_FILE = old;
  }
  const catalog = await readFile(new URL('../playwright.catalog.config.js', import.meta.url), 'utf8');
  assert.match(catalog, /testMatch: "catalog.spec.js"/);
  const spec = await readFile(new URL('../e2e/ptmm-qualification.spec.js', import.meta.url), 'utf8');
  assert.doesNotMatch(spec, /test\.skip|test\.only|waitForTimeout|test\.setTimeout/);
  assert.match(spec, /page\.goBack\(\)/); assert.match(spec, /malformedPtmmDto/); assert.match(spec, /differences\.check\(\)/);
});

test('PR40 workflow stays an exact prefix and the qualification job owns bounded complete evidence', async () => {
  const archive = JSON.parse(await readFile(new URL('../../docs/catalog-transformers-2026/review/ptmm-dimension-qualification/historical-test-bytes.json', import.meta.url)));
  assert.equal(archive.baseCommit, '27e143efa1e0cbe850887a6807b17ea29a2877da');
  const before = archive.files['.github/workflows/ci.yml'].text;
  const after = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.ok(after.startsWith(before), 'No prior job, artifact, receipt or budget may change');
  const added = after.slice(before.length);
  assert.deepEqual(added.match(/^  [a-z0-9-]+:$/gm), ['  ptmm-qualification-browser:']);
  assert.match(before, /transformer-source-browser:[\s\S]*?timeout-minutes: 25/);
  assert.match(before, /Verify new source assets and old catalog regressions on desktop and mobile\n        timeout-minutes: 18/);
  assert.match(added, /timeout-minutes: 15/); assert.match(added, /timeout-minutes: 5/); assert.match(added, /timeout-minutes: 6/);
  assert.match(added, /SECONDS \+ 90/); assert.match(added, /trap cleanup EXIT/);
  assert.match(added, /npx playwright test --config=playwright.ptmm-qualification.config.mjs/);
  assert.match(added, /tee \.\.\/ptmm-qualification-evidence\/runner-console\.log/);
  assert.match(added, /if: always\(\)/); assert.match(added, /path: ptmm-qualification-evidence\//);
  assert.match(added, /include-hidden-files: true/); assert.match(added, /if-no-files-found: error/); assert.match(added, /retention-days: 7/);
  assert.doesNotMatch(added, /npm run test:e2e:catalog|frontend\/test-results\/|frontend\/playwright-report\/|prepare-catalog-diagnostics/);
});
