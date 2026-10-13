import { readVisualPresentationHistoricalBytes } from './helpers/visual-presentation-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  browserBaselineCommit, browserBaselineTree, browserClearancePath, browserReportPath,
  browserCorrections, browserPredecessors, browserRequiredFiles, browserTestPath,
  browserDigest as digest, readBrowserBytes as readCurrentBrowserBytes, verifyBrowserAssertionAmendment, assertBrowserAssertionDependencies,
} from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';

const readBrowserBytes = file => readVisualPresentationHistoricalBytes(file, readCurrentBrowserBytes);

// Clearly synthetic approval, confined to this in-memory reader. It cannot
// approve the checkout; the real default gate needs the independent report.
function fixture() {
  const files = new Map(browserRequiredFiles.map(file => [file, readBrowserBytes(file)]));
  const clearance = { format: 'alageum-catalog-browser-clearance-v1', status: 'approved-three-browser-assertions',
    baselineCommit: browserBaselineCommit, baselineTree: browserBaselineTree,
    dependencies: { predecessors: { ...browserPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) },
    reviewReport: browserReportPath };
  const report = { format: 'alageum-catalog-browser-independent-review-v1', status: clearance.status,
    baselineCommit: browserBaselineCommit, baselineTree: browserBaselineTree, corrections: [...browserCorrections],
    hostedCaseCount: 254, runtimeChanges: 0, pixelOrLayoutRelaxations: 0 };
  const attest = (value = clearance, review = report) => {
    files.set(browserReportPath, Buffer.from(JSON.stringify({ ...review, approvedDependenciesSha256: digest(JSON.stringify(value.dependencies)) })));
    value.reviewReportSha256 = digest(files.get(browserReportPath));
    files.set(browserClearancePath, Buffer.from(JSON.stringify(value)));
  };
  const read = file => {
    if (files.has(file)) return files.get(file);
    assert.ok(file !== browserClearancePath && file !== browserReportPath, `Missing browser amendment ${file}`);
    return readBrowserBytes(file);
  };
  attest(); return { files, clearance, report, read, attest };
}

const oldClearance = JSON.parse(readBrowserBytes(protectionContextClearancePath));
test('exact browser amendment preserves the full historical gate and prior hashes', () => {
  const { read } = fixture();
  verifyBrowserAssertionAmendment(read);
  assertBrowserAssertionDependencies(browserPredecessors, read);
  verifyProtectionContextDependencyAmendment(oldClearance, read);
  assert.throws(() => assertBrowserAssertionDependencies({ [browserTestPath]: 'wrong-prior-hash' }, read), /Wrong browser predecessor/);
  assert.throws(() => assertBrowserAssertionDependencies({ 'frontend/components/catalog/ProductVisual.js': 'wrong' }, read), /Changed unreviewed browser dependency/);
});

test('missing, pending, mismatched or broadened approval cannot admit the corrected assertions', () => {
  for (const missing of [browserClearancePath, browserReportPath]) {
    const { files, read } = fixture(); files.delete(missing);
    assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, read), /Missing browser amendment/);
  }
  for (const mutate of [
    value => { value.status = 'pending-independent-review'; },
    value => { value.baselineCommit = 'wrong'; }, value => { value.baselineTree = 'wrong'; },
    value => { delete value.dependencies.predecessors[browserTestPath]; },
    value => { value.dependencies.predecessors[browserTestPath] = 'wrong'; },
    value => { value.dependencies.predecessors['frontend/next.config.mjs'] = 'wrong'; },
    value => { delete value.dependencies.reviewedFiles[browserRequiredFiles.at(-1)]; },
    value => { value.dependencies.reviewedFiles['frontend/next.config.mjs'] = digest(readBrowserBytes('frontend/next.config.mjs')); },
    value => { value.dependencies.reviewedFiles[browserTestPath] = 'wrong'; },
  ]) {
    const { clearance, read, attest } = fixture(); mutate(clearance); attest();
    assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, read));
  }
  for (const mutate of [
    value => { value.status = 'pending-independent-review'; }, value => { value.baselineCommit = 'wrong'; },
    value => { value.corrections.push('canvas-threshold'); }, value => { value.hostedCaseCount = 252; },
    value => { value.runtimeChanges = 1; }, value => { value.pixelOrLayoutRelaxations = 1; },
  ]) {
    const { clearance, report, read, attest } = fixture(); mutate(report); attest(clearance, report);
    assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, read));
  }
  for (const mutate of [value => { value.reviewReportSha256 = 'wrong'; }, value => { value.dependencies.reviewedFiles[browserRequiredFiles.at(-1)] = 'wrong'; }]) {
    const { files, clearance, read } = fixture(); mutate(clearance);
    files.set(browserClearancePath, Buffer.from(JSON.stringify(clearance)));
    assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, read));
  }
});

test('all new dependencies, historical approvals and threshold changes fail after warm success', () => {
  const { files, read } = fixture();
  for (const file of [...browserRequiredFiles, browserReportPath, protectionContextClearancePath, oldClearance.reviewReport]) {
    verifyProtectionContextDependencyAmendment(oldClearance, read);
    const original = read(file); files.set(file, Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, read), undefined, file);
    files.set(file, original); verifyProtectionContextDependencyAmendment(oldClearance, read);
  }
  const original = files.get(browserTestPath);
  const changed = original.toString().replace('minimumInkRatio = 0.01', 'minimumInkRatio = 0.00');
  assert.notEqual(changed, original.toString()); files.set(browserTestPath, Buffer.from(changed));
  assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, read), /Changed browser amendment dependency/);
  // Even a freshly attested synthetic map cannot extend the fixed E2E hash.
  const relaxed = fixture(); relaxed.files.set(browserTestPath, Buffer.from(changed));
  relaxed.clearance.dependencies.reviewedFiles[browserTestPath] = digest(changed); relaxed.attest();
  assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, relaxed.read), /Unapproved browser assertion bytes/);
});

test('same-size timestamp-restored test mutations cannot reuse warmed approval', () => {
  const { read } = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-assertion-freshness-'));
  try {
    const target = path.join(directory, 'catalog.spec.js'), original = read(browserTestPath);
    fs.writeFileSync(target, original); const stamp = fs.statSync(target);
    const currentRead = file => file === browserTestPath ? fs.readFileSync(target) : read(file);
    verifyProtectionContextDependencyAmendment(oldClearance, currentRead);
    const changed = Buffer.from(original); changed[Math.floor(changed.length / 2)] ^= 1;
    fs.writeFileSync(target, changed); fs.utimesSync(target, stamp.atime, stamp.mtime);
    assert.equal(fs.statSync(target).size, original.length);
    assert.throws(() => verifyProtectionContextDependencyAmendment(oldClearance, currentRead), /Changed browser amendment dependency/);
    fs.writeFileSync(target, original); fs.utimesSync(target, stamp.atime, stamp.mtime);
    verifyProtectionContextDependencyAmendment(oldClearance, currentRead);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
