import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { diagnosticGroup, prepareCatalogDiagnostics, MAX_GROUP_BYTES, planMobileParts, verifyMobilePartitions, validateFullArtifact } from '../scripts/prepare-catalog-diagnostics.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const metric = Buffer.from('{ "darkPixels": 52, "width": 10, "height": 10 }\r\n');
const sha = body => createHash('sha256').update(body).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function report(attachments = [], projectName = 'catalog-desktop') {
  return { suites: [{ specs: [{ title: 'Existing catalog case', tests: [{ projectName, results: [{ status: 'failed', retry: 0, errors: [{ message: 'Existing assertion failed' }], attachments }] }] }] }], errors: [], stats: { expected: 0, unexpected: 1, flaky: 0, skipped: 0 } };
}
function fixture(t, reportValue = report()) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-diagnostic-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const sourceRoot = path.join(temp, 'frontend');
  const outputRoot = path.join(temp, 'output');
  fs.mkdirSync(sourceRoot);
  function write(relative, bytes) {
    const target = path.join(sourceRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    return target;
  }
  write('catalog-browser.log', Buffer.from('original log\r\n\x00', 'utf8'));
  write('test-results/.last-run.json', '{"status":"failed"}\n');
  if (reportValue !== null) write('playwright-report/catalog-results.json', JSON.stringify(reportValue));
  return { temp, sourceRoot, outputRoot, write, run: options => prepareCatalogDiagnostics({ sourceRoot, outputRoot, ...options }) };
}
function manifest(f, group) { return readJSON(path.join(f.outputRoot, group, 'manifest.json')); }
const fullArtifact = { id: '1234', url: 'https://github.com/test/fixture/actions/runs/1/artifacts/1234', sha256: 'a'.repeat(64), repository: 'test/fixture', runId: '1', outcome: 'success' };
function index(f) { return readJSON(path.join(f.outputRoot, 'report', 'derived/catalog-index.json')); }

function chunk(type, body) {
  const result = Buffer.alloc(body.length + 12);
  result.writeUInt32BE(body.length);
  result.write(type, 4, 'ascii');
  body.copy(result, 8);
  result.writeUInt32BE(crc32(result.subarray(4, result.length - 4)), result.length - 4);
  return result;
}
function syntheticPNG({ width = 1, height = 1, raw = Buffer.from([0, 0, 0, 0, 255]), compressed = deflateSync(raw) } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function paddedPNG(size = 6500) {
  return Buffer.concat([png.subarray(0, png.length - 12), chunk('tEXt', Buffer.alloc(size, 65)), png.subarray(png.length - 12)]);
}
function partitionFixture(t, count = 3) {
  return fixture(t, report(Array.from({ length: count }, (_, i) => ({ name: `${i}.png`, contentType: 'image/png', body: paddedPNG().toString('base64') })), 'catalog-mobile'));
}

test('mobile packing is deterministic, reserves manifest bytes and rejects overflow or collisions', () => {
  const file = (name, size) => ({ path: `derived/${name}.png`, size, sha256: 'a'.repeat(64) });
  const files = [file('d', 3000), file('b', 3000), file('a', 6000), file('c', 6000)];
  const first = planMobileParts(files, 12000);
  assert.deepEqual(first, planMobileParts([...files].reverse(), 12000));
  assert.deepEqual(first.map(part => part.files.map(value => value.path)), [['derived/a.png', 'derived/b.png'], ['derived/c.png', 'derived/d.png']]);
  assert.equal(planMobileParts([file('boundary', 9000)], 12000)[0].sourceBytes, 9000);
  assert.throws(() => planMobileParts([file('too-large', 9001)], 12000), /single file/);
  assert.equal(planMobileParts(Array.from({ length: 4 }, (_, i) => file(String(i), 9000)), 12000).length, 4);
  assert.throws(() => planMobileParts(Array.from({ length: 5 }, (_, i) => file(String(i), 9000)), 12000), /four bounded parts/);
  assert.throws(() => planMobileParts([file('same', 1), file('same', 1)], 12000), /duplicate/);
  assert.throws(() => planMobileParts([{ ...file('safe', 1), path: '../escape.png' }], 12000), /Invalid/);
});

test('mobile parts preserve all bytes and raw-report retention requires the matching full receipt', t => {
  const f = partitionFixture(t);
  const result = f.run({ fullArtifact, maxGroupBytes: 12000 });
  assert.equal(result.ok, true);
  assert.equal(result.mobilePartCount, 3);
  const master = manifest(f, 'mobile');
  assert.equal(master.status, 'complete-partitioned');
  assert.equal(master.files.length, 3);
  assert.equal(master.exportedBytes, master.sourceBytes);
  assert.equal(result.coverage.rawReport.disposition, 'full-artifact-only');
  assert.equal(result.coverage.rawReport.fullArtifact.id, '1234');
  assert.equal(result.coverage.derivedReport.status, 'complete-non-body-fields');
  for (const item of index(f).attachments) {
    assert.equal(item.exportStatus, 'complete');
    assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, item.partition, item.path)), paddedPNG());
  }
  for (const part of master.parts) assert.ok(part.rawBytes <= 12000);
  assert.deepEqual(verifyMobilePartitions(f.outputRoot, 12000), { parts: 3, files: 3, exportedBytes: paddedPNG().length * 3 });
});

test('the derived projection preserves every non-body field and hashes supported or excluded inline bodies', t => {
  const pngBody = paddedPNG().toString('base64');
  const rawMetric = Buffer.from('{ "darkPixels": 45 }\r\n');
  const unsupported = Buffer.from('existing opaque archive bytes');
  const data = report([
    { name: 'one.png', contentType: 'image/png', body: pngBody, extraField: ['unchanged', null] },
    { name: 'two.png', contentType: 'image/png', body: pngBody },
    { name: 'three.png', contentType: 'image/png', body: pngBody },
    { name: 'opened-pixels.json', contentType: 'application/json', body: rawMetric.toString('base64') },
    { name: 'trace.zip', contentType: 'application/zip', body: unsupported.toString('base64') },
  ], 'catalog-mobile');
  data.config = { metadata: { arbitrary: [0, false, 'literal'], body: 'not an attachment body' }, projects: [{ name: 'catalog-mobile' }] };
  data.body = { kept: true };
  data.suites[0].specs[0].tests[0].results[0].duration = 133;
  data.suites[0].specs[0].tests[0].results[0].stdout = [{ text: 'raw log' }];
  data.suites[0].specs[0].tests[0].results[0].steps = [{ title: 'retained', duration: 7, body: ['unchanged'] }];
  const f = fixture(t, data);
  assert.equal(f.run({ fullArtifact, maxGroupBytes: 20000 }).ok, true);
  const derived = readJSON(path.join(f.outputRoot, 'report/derived/catalog-report.json'));
  const i = index(f);
  for (const item of i.attachments) {
    const projected = item.pointer.split('/').slice(1).reduce((value, key) => value[key], derived);
    const original = item.pointer.split('/').slice(1).reduce((value, key) => value[key], data);
    assert.deepEqual(projected.body, { diagnosticAttachmentPointer: item.pointer });
    projected.body = original.body;
    assert.equal(item.sha256, sha(Buffer.from(original.body, 'base64')));
    assert.equal(item.size, Buffer.from(original.body, 'base64').length);
  }
  assert.deepEqual(derived, data);
  assert.equal(i.attachments[4].status, 'excluded-type');
  assert.equal(i.attachments[4].partition, null);
  assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, 'report', i.attachments[3].path)), rawMetric);
  assert.equal(i.coverage.rawReport.fullArtifact.sha256, fullArtifact.sha256);
});

test('missing, mismatched or failed upload provenance cannot approve omitted raw report retention', t => {
  for (const receipt of [undefined, {}, { ...fullArtifact, outcome: 'failure' }, { ...fullArtifact, id: '5678' }, { ...fullArtifact, runId: '2' }, { ...fullArtifact, sha256: 'not-a-digest' }, { ...fullArtifact, url: `${fullArtifact.url}?alternate=1` }]) {
    const f = partitionFixture(t);
    const result = f.run({ fullArtifact: receipt, maxGroupBytes: 12000 });
    assert.equal(result.ok, false);
    assert.equal(result.coverage.rawReport.fullArtifact, null);
    assert.match(manifest(f, 'report').issues.join('\n'), /provenance|receipt/);
  }
  assert.equal(validateFullArtifact(fullArtifact).url, fullArtifact.url);
});

test('mobile overflow and a manifest that itself exceeds the cap fail without changing original evidence', t => {
  const f = partitionFixture(t, 5);
  const result = f.run({ fullArtifact, maxGroupBytes: 12000 });
  assert.equal(result.ok, false);
  assert.equal(result.mobilePartCount, 0);
  assert.equal(manifest(f, 'mobile').files.length, 5);
  assert.equal(manifest(f, 'mobile').exportedBytes, 0);
  assert.ok(manifest(f, 'mobile').files.every(file => file.partition === null));
  const many = fixture(t, report(Array.from({ length: 100 }, (_, i) => ({ name: `${i}.png`, contentType: 'image/png', body: png.toString('base64') })), 'catalog-mobile'));
  const original = fs.readFileSync(path.join(many.sourceRoot, 'playwright-report/catalog-results.json'));
  assert.throws(() => many.run({ fullArtifact, maxGroupBytes: 12000 }), /Manifest.*cap|Manifest.*limit/);
  assert.deepEqual(fs.readFileSync(path.join(many.sourceRoot, 'playwright-report/catalog-results.json')), original);
});

test('mobile verification rejects missing parts, changed bytes, manifest tampering and extra parts', t => {
  const mutations = [
    f => fs.rmSync(path.join(f.outputRoot, 'mobile-part-002'), { recursive: true }),
    f => fs.appendFileSync(path.join(f.outputRoot, manifest(f, 'mobile').files[0].partition, manifest(f, 'mobile').files[0].path), 'tampered'),
    f => fs.appendFileSync(path.join(f.outputRoot, 'mobile-part-001/manifest.json'), ' '),
    f => fs.mkdirSync(path.join(f.outputRoot, 'mobile-part-004')),
    f => fs.writeFileSync(path.join(f.outputRoot, 'mobile-part-001/unlisted.bin'), 'unaccounted'),
    f => fs.symlinkSync('/does-not-exist', path.join(f.outputRoot, 'mobile-part-001/link')),
    f => { const m = manifest(f, 'mobile'); m.files[1].path = m.files[0].path; fs.writeFileSync(path.join(f.outputRoot, 'mobile/manifest.json'), JSON.stringify(m)); },
    f => { const m = manifest(f, 'mobile'); m.files[0].partition = 'mobile-part-002'; fs.writeFileSync(path.join(f.outputRoot, 'mobile/manifest.json'), JSON.stringify(m)); },
  ];
  for (const mutate of mutations) {
    const f = partitionFixture(t);
    assert.equal(f.run({ fullArtifact, maxGroupBytes: 12000 }).ok, true);
    mutate(f);
    assert.throws(() => verifyMobilePartitions(f.outputRoot, 12000));
  }
});

test('CRC corruption and invalid compressed PNG data fail without replacing valid later evidence', t => {
  const badCRC = Buffer.from(png); badCRC[52] ^= 1;
  const badZlib = Buffer.from(png); badZlib[41] = 0;
  badZlib.writeUInt32BE(crc32(badZlib.subarray(37, 52)), 52);
  const f = fixture(t, report([badCRC, badZlib, png].map((body, i) => ({ name: `${i}.png`, contentType: 'image/png', body: body.toString('base64') }))));
  const original = fs.readFileSync(path.join(f.sourceRoot, 'playwright-report/catalog-results.json'));
  assert.equal(f.run().ok, false);
  const items = index(f).attachments;
  assert.deepEqual(items.map(item => item.status), ['invalid', 'invalid', 'decoded']);
  assert.match(items[0].reason, /CRC/);
  assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, 'desktop', items[2].path)), png);
  assert.equal(items[2].pngValidation.validation, 'chunk-crc-zlib-scanlines');
  assert.deepEqual(fs.readFileSync(path.join(f.sourceRoot, 'playwright-report/catalog-results.json')), original);
});

test('non-ASCII PNG chunk-type bytes cannot alias IDAT even with a corrected CRC', t => {
  const invalid = Buffer.from(png);
  invalid[37] = 0xc9; // Raw chunk bytes C9 44 41 54 must not become ASCII IDAT.
  invalid.writeUInt32BE(crc32(invalid.subarray(37, 52)), 52);
  const f = fixture(t, report([invalid, png].map((body, i) => ({ name: `${i}.png`, contentType: 'image/png', body: body.toString('base64') }))));
  assert.equal(f.run().ok, false);
  const items = index(f).attachments;
  assert.deepEqual(items.map(item => item.status), ['invalid', 'decoded']);
  assert.match(items[0].reason, /chunk framing/);
  assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, 'desktop', items[1].path)), png);
});

test('PNG inflation bounds, scanline integrity and trailing compressed input are enforced', t => {
  const bodies = [
    syntheticPNG(),
    syntheticPNG({ width: 100_000, height: 100_000 }),
    syntheticPNG({ raw: Buffer.from([0, 0, 0, 0]) }),
    syntheticPNG({ raw: Buffer.from([5, 0, 0, 0, 0]) }),
    syntheticPNG({ compressed: Buffer.concat([deflateSync(Buffer.from([0, 0, 0, 0, 255])), Buffer.from([0])]) }),
    syntheticPNG({ raw: Buffer.alloc(1024 * 1024) }),
  ];
  const f = fixture(t, report(bodies.map((body, i) => ({ name: `${i}.png`, contentType: 'image/png', body: body.toString('base64') }))));
  assert.equal(f.run().ok, false);
  const items = index(f).attachments;
  assert.deepEqual(items.map(item => item.status), ['decoded', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
  assert.match(items[1].reason, /inflation budget/);
  assert.match(items[3].reason, /filter/);
  assert.match(items[4].reason, /compressed stream/);
});

test('corrupt PNG file evidence is reported and never copied as complete', t => {
  const f = fixture(t);
  const bad = Buffer.from(png); bad[52] ^= 1;
  f.write('test-results/case-catalog-desktop/corrupt.png', bad);
  assert.equal(f.run().ok, false);
  assert.equal(manifest(f, 'desktop').status, 'failed');
  assert.equal(manifest(f, 'desktop').exportedBytes, 0);
  assert.match(manifest(f, 'desktop').issues.join('\n'), /CRC/);
  assert.deepEqual(fs.readFileSync(path.join(f.sourceRoot, 'test-results/case-catalog-desktop/corrupt.png')), bad);
});

test('malformed attachments retain their own pointers and do not abort later attachments or tests', t => {
  const good = { name: 'valid.png', contentType: 'image/png', body: png.toString('base64') };
  const data = report([null, 4, [], { name: 7, contentType: 'image/png' }, good]);
  data.suites[0].specs[0].tests.push({ projectName: 'catalog-mobile', results: [{ status: 'passed', retry: 0, errors: [], attachments: [good] }] });
  data.stats.expected = 1;
  const f = fixture(t, data);
  assert.equal(f.run().ok, false);
  const items = index(f).attachments;
  assert.deepEqual(items.map(item => item.status), ['invalid', 'invalid', 'invalid', 'invalid', 'decoded', 'decoded']);
  assert.equal(items[0].pointer, '/suites/0/specs/0/tests/0/results/0/attachments/0');
  assert.equal(items[5].group, 'mobile');
  assert.equal(index(f).tests.length, 2);
});

test('empty or malformed results remain visible and do not suppress later test evidence', t => {
  const data = report([]);
  data.suites[0].specs[0].tests.unshift({ projectName: 'catalog-mobile', results: [] }, null, { projectName: 'catalog-mobile', results: [null] });
  data.stats.unexpected = 4;
  const f = fixture(t, data);
  assert.equal(f.run().ok, false);
  const i = index(f);
  assert.equal(i.tests.length, 4);
  assert.equal(i.tests[0].disposition, 'missing-results');
  assert.equal(i.tests[1].disposition, 'invalid');
  assert.equal(i.results[0].disposition, 'invalid');
  assert.equal(i.results[1].status, 'failed');
  assert.match(i.issues.join('\n'), /No result/);
});

test('explicit skips and source counters are represented without inventing execution', t => {
  const data = report([]);
  data.suites[0].specs[0].tests.push({ projectName: 'catalog-mobile', status: 'skipped', expectedStatus: 'skipped', results: [] });
  data.stats.skipped = 1;
  const f = fixture(t, data);
  assert.equal(f.run().ok, true);
  const i = index(f);
  assert.deepEqual(i.stats, data.stats);
  assert.equal(i.tests[1].disposition, 'explicitly-skipped-without-result');
  assert.equal(i.tests[1].resultCount, 0);
  assert.equal(i.results.length, 1);
  assert.equal(i.observedTestCount, 2);
  assert.equal(i.sourceStatsTotal, 2);
});

test('malformed or inconsistent source stats fail while preserving later useful evidence', t => {
  for (const stats of [true, [], { expected: -1, unexpected: 1, flaky: 0, skipped: 0 }, { expected: 0, unexpected: 2, flaky: 0, skipped: 0 }]) {
    const data = report([{ name: 'valid.png', contentType: 'image/png', body: png.toString('base64') }]);
    data.stats = stats;
    const f = fixture(t, data);
    assert.equal(f.run().ok, false);
    assert.deepEqual(index(f).stats, stats);
    assert.equal(index(f).attachments[0].status, 'decoded');
    assert.match(index(f).issues.join('\n'), /\/stats/);
  }
});

test('selects only known reports, metrics, context and PNG evidence', () => {
  assert.equal(diagnosticGroup('catalog-browser.log'), 'report');
  assert.equal(diagnosticGroup('test-results/.last-run.json'), 'report');
  assert.equal(diagnosticGroup('test-results/case-catalog-desktop/attachments/view-pixels-a1b2.json'), 'report');
  assert.equal(diagnosticGroup('test-results/case-catalog-desktop/error-context.md'), 'report');
  for (const name of ['trace.zip', 'video.webm', 'network.json', 'network.png', 'random.json', 'trace/resources/page.png']) {
    assert.equal(diagnosticGroup(`test-results/case-catalog-desktop/${name}`), null, name);
  }
  for (const name of ['../test-results/x.png', 'test-results/../x.png', '/test-results/x.png', 'test-results\\x.png', 'other/x.png']) assert.equal(diagnosticGroup(name), null);
});

test('preserves exact file bytes and paths, both projects and retry screenshots', t => {
  const f = fixture(t);
  const names = ['test-results/case-catalog-desktop/test-failed-1.png', 'test-results/case-catalog-mobile-retry1/test-failed-1.png', 'playwright-report/data/unclassified.png'];
  for (const name of names) f.write(name, png);
  f.write('test-results/case-catalog-desktop/trace.zip', 'keep original archive');
  const result = f.run();
  assert.equal(result.ok, true);
  for (const [i, group] of ['desktop', 'mobile', 'shared'].entries()) {
    const m = manifest(f, group);
    assert.equal(m.files[0].path, `frontend/${names[i]}`);
    assert.equal(m.files[0].sha256, sha(png));
    assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, m.files[0].partition || group, 'frontend', names[i])), png);
  }
  for (const name of ['catalog-browser.log', 'playwright-report/catalog-results.json', 'test-results/.last-run.json']) {
    assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, 'report/frontend', name)), fs.readFileSync(path.join(f.sourceRoot, name)));
  }
  assert.match(manifest(f, 'report').excluded[0].path, /trace.zip$/);
  assert.equal(fs.readFileSync(path.join(f.sourceRoot, 'test-results/case-catalog-desktop/trace.zip'), 'utf8'), 'keep original archive');
});

test('decodes existing inline PNG and JSON bodies losslessly with pointers and safe names', t => {
  const data = report([
    { name: '../../not-a-path.png', contentType: 'image/png', body: png.toString('base64') },
    { name: 'opened-pixels.json', contentType: 'application/json', body: metric.toString('base64') },
    { name: 'trace.zip', contentType: 'application/zip', body: 'YWJj' },
    { name: 'failure.png', contentType: 'image/png', path: 'test-results/case-catalog-mobile/test-failed-1.png' },
  ], 'catalog-mobile');
  const f = fixture(t, data);
  f.write('test-results/case-catalog-mobile/test-failed-1.png', png);
  assert.equal(f.run({ fullArtifact }).ok, true);
  const i = index(f);
  assert.equal(i.sourceSha256, sha(Buffer.from(JSON.stringify(data))));
  assert.equal(i.attachments[0].pointer, '/suites/0/specs/0/tests/0/results/0/attachments/0');
  assert.equal(i.attachments[0].group, 'mobile');
  assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, i.attachments[0].partition, i.attachments[0].path)), png);
  assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, 'report', i.attachments[1].path)), metric);
  assert.equal(i.attachments[1].sha256, sha(metric));
  assert.equal(i.attachments[2].status, 'excluded-type');
  assert.equal(i.attachments[3].status, 'file-reference');
  assert.equal(fs.existsSync(path.join(f.outputRoot, 'report/frontend/playwright-report/catalog-results.json')), false);
  assert.match(manifest(f, 'report').excluded.find(file => file.path.endsWith('catalog-results.json')).reason, /excluded or invalid/);
  assert.equal(fs.existsSync(path.join(f.temp, 'not-a-path.png')), false);
});

test('nested suites, retries, duplicate names and unknown projects have distinct provenance', t => {
  const attachment = { name: 'same.png', contentType: 'image/png', body: png.toString('base64') };
  const data = report([attachment]);
  data.suites[0].suites = report([attachment], 'toString').suites;
  data.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1, errors: [], attachments: [attachment] });
  data.stats.unexpected = 2;
  const f = fixture(t, data);
  assert.equal(f.run().ok, true);
  const items = index(f).attachments;
  assert.equal(new Set(items.map(item => item.path)).size, 3);
  assert.equal(items[2].group, 'shared');
  assert.match(items[2].pointer, /\/suites\/0\/suites\/0\//);
});

test('large valid base64 stays lossless without regex recursion and invalid padding bits fail', t => {
  const body = Buffer.from(JSON.stringify({ values: 'x'.repeat(1024 * 1024) }));
  const f = fixture(t, report([
    { name: 'large-pixels.json', contentType: 'application/json', body: body.toString('base64') },
    { name: 'invalid-pixels.json', contentType: 'application/json', body: 'Zh==' },
  ]));
  assert.equal(f.run().ok, false);
  const attachments = index(f).attachments;
  assert.deepEqual(fs.readFileSync(path.join(f.outputRoot, 'report', attachments[0].path)), body);
  assert.equal(attachments[1].status, 'invalid');
  assert.match(attachments[1].reason, /padding bits/);
});

test('invalid base64, PNG signatures, UTF-8 and JSON fail explicitly without changing the source', t => {
  const bad = [
    { name: 'bad.png', contentType: 'image/png', body: 'not base64!' },
    { name: 'bad.png', contentType: 'image/png', body: 'eA==' },
    { name: 'truncated.png', contentType: 'image/png', body: png.subarray(0, 35).toString('base64') },
    { name: 'bad-pixels.json', contentType: 'application/json', body: Buffer.from('{no}').toString('base64') },
    { name: 'bad-pixels.json', contentType: 'application/json', body: Buffer.from([255]).toString('base64') },
    { name: 'bad.png', contentType: 'image/png', body: png.toString('base64'), path: '../escape.png' },
  ];
  const f = fixture(t, report(bad));
  const before = fs.readFileSync(path.join(f.sourceRoot, 'playwright-report/catalog-results.json'));
  assert.equal(f.run().ok, false);
  assert.deepEqual(index(f).attachments.map(item => item.status), bad.map(() => 'invalid'));
  assert.deepEqual(fs.readFileSync(path.join(f.sourceRoot, 'playwright-report/catalog-results.json')), before);
});

test('attachment path escapes and missing references are reported without reading their targets', t => {
  const f = fixture(t, report([
    { name: 'outside.png', contentType: 'image/png', path: '../outside.png' },
    { name: 'missing.png', contentType: 'image/png', path: 'test-results/case-catalog-desktop/missing.png' },
  ]));
  fs.writeFileSync(path.join(f.temp, 'outside.png'), png);
  assert.equal(f.run().ok, false);
  assert.deepEqual(index(f).attachments.map(item => item.status), ['missing-or-excluded-file-reference', 'missing-or-excluded-file-reference']);
  assert.equal(manifest(f, 'desktop').exportedBytes, 0);
});

test('a copy failure removes partial group copies and keeps original evidence', t => {
  const f = fixture(t);
  f.write('test-results/case-catalog-desktop/one.png', png);
  f.write('test-results/case-catalog-desktop/two.png', png);
  const originalWrite = fs.writeFileSync;
  let imageWrites = 0;
  fs.writeFileSync = function (target, ...args) {
    if (typeof target === 'number' && ++imageWrites === 2) throw new Error('Simulated output write failure');
    return originalWrite.call(this, target, ...args);
  };
  let result;
  try { result = f.run(); } finally { fs.writeFileSync = originalWrite; }
  assert.equal(result.ok, false);
  assert.ok(result.results.some(group => group.status === 'failed'));
  for (const group of result.results.filter(group => group.status === 'failed')) {
    assert.deepEqual(fs.readdirSync(path.join(f.outputRoot, group.group)), ['manifest.json']);
    assert.equal(group.exportedBytes, 0);
  }
  assert.deepEqual(fs.readFileSync(path.join(f.sourceRoot, 'test-results/case-catalog-desktop/two.png')), png);
});

test('oversize screenshot group exports only an explicit failure manifest, other groups survive', t => {
  const f = fixture(t);
  f.write('test-results/case-catalog-desktop/large.png', Buffer.alloc(20_000));
  f.write('test-results/case-catalog-mobile/small.png', png);
  const result = f.run({ maxGroupBytes: 12_000 });
  assert.equal(result.ok, false);
  assert.equal(manifest(f, 'desktop').status, 'oversize');
  assert.equal(manifest(f, 'desktop').exportedBytes, 0);
  assert.equal(manifest(f, 'desktop').files[0].sha256, sha(Buffer.alloc(20_000)));
  assert.equal(manifest(f, 'mobile').status, 'complete-partitioned');
  for (const group of result.results) assert.ok(group.rawBytes <= 12_000);
});

test('oversize non-body projection fails explicitly while the complete original remains intact', t => {
  const data = report([{ name: 'opened-pixels.json', contentType: 'application/json', body: metric.toString('base64') }]);
  data.largeUnusedField = 'x'.repeat(20_000);
  const f = fixture(t, data);
  assert.equal(f.run({ maxGroupBytes: 12_000 }).ok, false);
  assert.equal(manifest(f, 'report').status, 'oversize');
  const original = manifest(f, 'report').excluded.find(file => file.status === 'oversize-retained-in-full-artifact');
  assert.equal(original.sha256, sha(Buffer.from(JSON.stringify(data))));
  assert.equal(manifest(f, 'report').exportedBytes, 0);
  assert.equal(fs.readFileSync(path.join(f.sourceRoot, 'playwright-report/catalog-results.json'), 'utf8'), JSON.stringify(data));
});

test('symlink files, directories and entire roots never enter the compact export', t => {
  const f = fixture(t);
  const outside = path.join(f.temp, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'secret.png'), png);
  fs.symlinkSync(path.join(outside, 'secret.png'), path.join(f.sourceRoot, 'test-results/escape.png'));
  fs.symlinkSync(outside, path.join(f.sourceRoot, 'test-results/escape-directory'));
  assert.equal(f.run().ok, false);
  assert.equal(manifest(f, 'shared').files.length, 0);
  assert.equal(manifest(f, 'report').excluded.filter(file => file.status === 'excluded-unsafe').length, 2);
  const rootAlias = path.join(f.temp, 'alias');
  fs.symlinkSync(f.sourceRoot, rootAlias);
  assert.throws(() => prepareCatalogDiagnostics({ sourceRoot: rootAlias, outputRoot: path.join(f.temp, 'another') }), /symlink/);
});

test('refuses output nested in evidence through an aliased parent and preserves existing destinations', t => {
  const f = fixture(t);
  const alias = path.join(f.temp, 'alias');
  fs.symlinkSync(path.join(f.sourceRoot, 'test-results'), alias);
  assert.throws(() => f.run({ outputRoot: path.join(alias, 'export') }), /overlaps/);
  fs.mkdirSync(f.outputRoot);
  fs.writeFileSync(path.join(f.outputRoot, 'keep.txt'), 'unchanged');
  assert.throws(() => f.run(), /EEXIST/);
  assert.equal(fs.readFileSync(path.join(f.outputRoot, 'keep.txt'), 'utf8'), 'unchanged');
});

test('missing outputs and truncated/invalid report structure are explicit failures', t => {
  const missing = fixture(t, null);
  assert.equal(missing.run().ok, false);
  assert.ok(manifest(missing, 'report').missing.includes('frontend/playwright-report/catalog-results.json'));
  const invalid = fixture(t);
  invalid.write('playwright-report/catalog-results.json', '{"suites":');
  assert.equal(invalid.run().ok, false);
  assert.match(index(invalid).issues.join('\n'), /Invalid or incomplete/);
  const incomplete = fixture(t, { suites: [] });
  assert.equal(incomplete.run().ok, false);
  assert.match(index(incomplete).issues.join('\n'), /Expected nonnegative integer/);
});

test('counts the generated manifest toward the hard cap and rejects unsafe limit overrides', t => {
  const f = fixture(t);
  f.write('test-results/case-catalog-desktop/almost-full.png', Buffer.alloc(12_000 - 20));
  const result = f.run({ maxGroupBytes: 12_000 });
  assert.equal(manifest(f, 'desktop').status, 'oversize');
  for (const item of result.results) assert.ok(item.rawBytes <= 12_000);
  for (const limit of [0, -1, Infinity, MAX_GROUP_BYTES + 1]) assert.throws(() => f.run({ maxGroupBytes: limit }), /Invalid diagnostic byte limit/);
});

test('CLI failures exit nonzero and do not report successful export', () => {
  const script = fileURLToPath(new URL('../scripts/prepare-catalog-diagnostics.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Catalog diagnostic preparation failed/);
});
