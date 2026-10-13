import { readBackendHistoricalBytes } from './helpers/backend-security-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ktpbReviewDir, ktpbClearancePath, ktpbReportPath, ktpbPerformanceReviewPath, ktpbBaselineCommit, ktpbBaselineTree,
  ktpbPerformanceImplementationFiles, ktpbPerformanceTestFiles, ktpbPerformanceObservationContract,
  ktpbPredecessors, ktpbSourceUiFiles, ktpbRequiredFiles, ktpbDigest as digest, readKtpbBytes as readCurrentKtpbBytes,
  verifyKtpbDependencyFiles, verifyKtpbAmendment, assertKtpbDependencies, preservedKtpbContextIds,
} from '../../scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs';
import { verifySecurityAmendment } from '../../scripts/catalog/frontend-security-reviewed-dependencies.mjs';
import { verifyCorrectionAmendment } from '../../scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs';
import { verifyPtmmQualificationAmendment } from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { verifyVisualPresentationAmendment } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { verifyBrowserAssertionAmendment } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
import { verifyKtpbSourceContextPreservation } from '../../scripts/check-ktpb-source-context.mjs';
// Historical KTPB controls use exact PR44 bytes; backend successor coverage
// verifies the current raw-byte chain in its own amendment tests.
const readKtpbBytes = file => readBackendHistoricalBytes(file, readCurrentKtpbBytes);
const approved = 'approved-bounded-ktpb-source-context', pending = 'pending-independent-review';
const gates = [
  ['KTPB', verifyKtpbAmendment], ['security', verifySecurityAmendment], ['correction', verifyCorrectionAmendment],
  ['PTMM', verifyPtmmQualificationAmendment], ['visual', verifyVisualPresentationAmendment], ['browser', verifyBrowserAssertionAmendment],
  ['protection', read => verifyProtectionContextDependencyAmendment(JSON.parse(read(protectionContextClearancePath)), read)],
  ['measurement', read => verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read)],
  ['source', read => verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read)],
];
const required = ktpbRequiredFiles();
// Synthetic unit-test authority only. Never write these approval documents into
// the candidate checkout; the one disk-reader control uses an isolated temp copy.
function fixture() {
  const files = new Map(required.map(file => [file, readKtpbBytes(file)]));
  const protectedPaths = new Set([...required, ktpbClearancePath, ktpbReportPath]);
  const clearance = { format: 'alageum-ktpb-source-context-clearance-v1', status: approved,
    baselineCommit: ktpbBaselineCommit, baselineTree: ktpbBaselineTree,
    dependencies: { predecessors: { ...ktpbPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) }, reviewReport: ktpbReportPath };
  const performance = { format: 'alageum-proof-invocation-performance-review-v1', status: 'approved-bounded-proof-invocation',
    baselineCommit: ktpbBaselineCommit, baselineTree: ktpbBaselineTree,
    observationContract: { ...ktpbPerformanceObservationContract }, predecessors: { ...ktpbPredecessors },
    resourceLimits: { paths: 1024, retainedBytes: 67108864, proofs: 32, inputDepth: 64, inputProperties: 65536, inputBytes: 8388608 },
    reviewedImplementationHashes: Object.fromEntries(ktpbPerformanceImplementationFiles.map(file => [file, digest(files.get(file))])),
    reviewedTestHashes: Object.fromEntries(ktpbPerformanceTestFiles.map(file => [file, digest(files.get(file))])),
    authorityNote: 'Synthetic unit-test fixture only; no candidate or independent approval authority.' };
  const report = { format: 'alageum-ktpb-source-context-independent-review-v1', status: approved,
    authorityNote: 'Synthetic unit-test fixture only; no candidate or independent approval authority.',
    baselineCommit: ktpbBaselineCommit, baselineTree: ktpbBaselineTree,
    sourceUiReviewSha256: digest(files.get(`${ktpbReviewDir}/source-ui-review.json`)), addedContextIds: ['cat-ktpb-k', 'cat-ktpb-k-v002'],
    preservedCounts: { records: 843, defaultIllustrations: 464, sourceBasedIcons: 465, choiceRows: 36, choices: 74, constructionGaps: 243, gapFamilies: 29, legacyContextRecords: 24 }, sourceContextRecords: 26,
    familyGeometryException: { id: 'cat-ktpb-k', type: 'outdoor-switchyard-substation', sourcePages: [55], confidence: 'source-matched', iconConfidence: 'source-based' },
    browserScope: { newCases: 16, existingCatalogCases: 254, existingPtmmCases: 16, workers: 2, retries: 0, jobTimeoutMinutes: 15, buildTimeoutMinutes: 5, testTimeoutMinutes: 6, permissions: { contents: 'read' } },
    recordChanges: 0, sourceAssetChanges: 0, geometryMaterialChanges: 0, defaultIconChanges: 0, confidencePromotions: 0, gapClosures: 0,
    priorApprovalChanges: 0, dependencyChanges: 0, cms15Changes: 0, existingWorkflowChanges: 0, existingBrowserCaseChanges: 0, auditGateChanges: 0, releasePathChanges: 0 };
  const attest = () => {
    files.set(ktpbReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)) })));
    clearance.reviewReportSha256 = digest(files.get(ktpbReportPath));
    files.set(ktpbClearancePath, Buffer.from(JSON.stringify(clearance)));
  };
  const attestPerformance = () => {
    files.set(ktpbPerformanceReviewPath, Buffer.from(JSON.stringify(performance)));
    clearance.dependencies.reviewedFiles[ktpbPerformanceReviewPath] = digest(files.get(ktpbPerformanceReviewPath));
    report.performanceReviewSha256 = clearance.dependencies.reviewedFiles[ktpbPerformanceReviewPath];
  };
  const read = file => { if (files.has(file)) return files.get(file); assert.ok(!protectedPaths.has(file), `Missing KTPB fixture ${file}`); return readKtpbBytes(file); };
  attestPerformance(); attest(); return { files, clearance, report, performance, attestPerformance, attest, read };
}

test('published PR44 KTPB bytes preserve their approval through every historical inherited gate', () => {
  const clearance = JSON.parse(readKtpbBytes(ktpbClearancePath));
  verifyKtpbDependencyFiles(clearance, readKtpbBytes);
  for (const [name, verify] of gates) {
    if (clearance.status === approved) verify(readKtpbBytes);
    else { assert.equal(clearance.status, pending); assert.throws(() => verify(readKtpbBytes), /independent approval/, name); }
  }
});

test('synthetic exact KTPB approval reaches all nine gates and forwards only its explicit PR43 predecessor bytes', () => {
  const before = readKtpbBytes(ktpbClearancePath), f = fixture();
  for (const [name, verify] of gates) assert.doesNotThrow(() => verify(f.read), name);
  assertKtpbDependencies(ktpbPredecessors, f.read);
  assert.equal(preservedKtpbContextIds(f.read).length, 24);
  for (const file of Object.keys(ktpbPredecessors)) assert.throws(() => assertKtpbDependencies({ [file]: 'wrong-prior' }, f.read));
  assert.throws(() => assertKtpbDependencies({ 'frontend/package-lock.json': 'wrong-prior' }, f.read));
  assert.deepEqual(readKtpbBytes(ktpbClearancePath), before);
});

test('pending, missing approval and missing report fail through every inherited gate after prior success', () => {
  const f = fixture();
  for (const [name, verify] of gates) {
    verify(f.read);
    for (const target of [ktpbClearancePath, ktpbReportPath]) {
      const bytes = f.files.get(target); f.files.delete(target);
      assert.throws(() => verify(f.read), /Missing KTPB fixture/, `${name}/${target}`); f.files.set(target, bytes);
    }
    f.clearance.status = pending; f.attest(); assert.throws(() => verify(f.read), /independent approval/, name);
    f.clearance.status = approved; f.attest();
  }
});

test('approval identity, closure, exact source UI, family exception and browser bounds cannot expand', () => {
  const first = Object.keys(ktpbPredecessors)[0];
  for (const mutate of [c => { c.format = 'wrong'; }, c => { c.baselineCommit = 'wrong'; }, c => { c.baselineTree = 'wrong'; },
    c => { delete c.dependencies.predecessors[first]; }, c => { c.dependencies.predecessors[first] = 'wrong'; }, c => { c.dependencies.predecessors.extra = 'wrong'; },
    c => { delete c.dependencies.reviewedFiles[first]; }, c => { c.dependencies.reviewedFiles.extra = 'wrong'; }, c => { c.reviewReport = 'other'; }]) {
    const f = fixture(); mutate(f.clearance); f.attest(); assert.throws(() => verifyKtpbAmendment(f.read));
  }
  for (const field of ['status', 'format', 'baselineCommit', 'baselineTree', 'sourceUiReviewSha256', 'performanceReviewSha256', 'addedContextIds', 'preservedCounts', 'sourceContextRecords', 'familyGeometryException', 'browserScope',
    'recordChanges', 'sourceAssetChanges', 'geometryMaterialChanges', 'defaultIconChanges', 'confidencePromotions', 'gapClosures', 'priorApprovalChanges', 'dependencyChanges', 'cms15Changes', 'existingWorkflowChanges', 'existingBrowserCaseChanges', 'auditGateChanges', 'releasePathChanges']) {
    const f = fixture(); f.report[field] = 'wrong'; f.attest(); assert.throws(() => verifyKtpbAmendment(f.read), undefined, field);
  }
  for (const mutate of [r => { r.familyGeometryException.id = 'cat-ktpb-k-v002'; }, r => { r.familyGeometryException.sourcePages = [56]; },
    r => { r.addedContextIds.push('cat-ktpb-k-v003'); }, r => { r.preservedCounts.constructionGaps = 242; },
    r => { r.browserScope.testTimeoutMinutes = 7; }, r => { r.browserScope.permissions.contents = 'write'; }]) {
    const f = fixture(); mutate(f.report); f.attest(); assert.throws(() => verifyKtpbAmendment(f.read));
  }
  const f = fixture(); f.clearance.reviewReportSha256 = 'wrong'; f.files.set(ktpbClearancePath, Buffer.from(JSON.stringify(f.clearance))); assert.throws(() => verifyKtpbAmendment(f.read));
});

test('performance approval is required, independently bound, and exact about code, tests and changed observations', () => {
  for (const [name, verify] of gates) {
    const f = fixture(); verify(f.read);
    const bytes = f.files.get(ktpbPerformanceReviewPath); f.files.delete(ktpbPerformanceReviewPath);
    assert.throws(() => verify(f.read), /Missing KTPB fixture/, `${name}/missing-performance-review`);
    f.files.set(ktpbPerformanceReviewPath, bytes); f.performance.status = pending; f.attestPerformance(); f.attest();
    assert.throws(() => verify(f.read), /performance semantics require independent approval/, `${name}/pending-performance-review`);
  }
  for (const field of ['format', 'status', 'baselineCommit', 'baselineTree']) {
    const f = fixture(); f.performance[field] = 'wrong'; f.attestPerformance(); f.attest();
    assert.throws(() => verifyKtpbAmendment(f.read), undefined, `performance/${field}`);
  }
  for (const field of Object.keys(ktpbPerformanceObservationContract)) {
    const f = fixture(); f.performance.observationContract[field] = 'changed'; f.attestPerformance(); f.attest();
    assert.throws(() => verifyKtpbAmendment(f.read), /observation contract/, field);
  }
  for (const field of ['paths', 'retainedBytes', 'proofs', 'inputDepth', 'inputProperties', 'inputBytes']) {
    const f = fixture(); f.performance.resourceLimits[field]++; f.attestPerformance(); f.attest();
    assert.throws(() => verifyKtpbAmendment(f.read), /resource limits/, field);
  }
  for (const mutate of [p => { delete p.observationContract; }, p => { p.observationContract.extra = true; },
    p => { delete p.predecessors[Object.keys(ktpbPredecessors)[0]]; }, p => { p.predecessors.extra = 'wrong'; },
    p => { p.predecessors[Object.keys(ktpbPredecessors)[0]] = 'wrong'; },
    p => { delete p.resourceLimits; }, p => { p.resourceLimits.extra = 1; }]) {
    const f = fixture(); mutate(f.performance); f.attestPerformance(); f.attest(); assert.throws(() => verifyKtpbAmendment(f.read));
  }
  for (const field of ['reviewedImplementationHashes', 'reviewedTestHashes']) {
    const f = fixture(); const keys = Object.keys(f.performance[field]);
    assert.equal(keys.length, field === 'reviewedImplementationHashes' ? 12 : 4);
    assert.ok(!keys.some(file => [ktpbPerformanceReviewPath, ktpbClearancePath, ktpbReportPath].includes(file)));
    for (const file of keys) {
      for (const mutate of [p => { delete p[field][file]; }, p => { p[field][file] = 'wrong'; }]) {
        const f = fixture(); mutate(f.performance); f.attestPerformance(); f.attest();
        assert.throws(() => verifyKtpbAmendment(f.read), undefined, `${field}/${file}`);
      }
    }
    const extra = fixture(); extra.performance[field][ktpbPerformanceReviewPath] = 'self-reference'; extra.attestPerformance(); extra.attest();
    assert.throws(() => verifyKtpbAmendment(extra.read), /Incomplete or overbroad/);
  }
  const stale = fixture(), oldReviewHash = stale.report.performanceReviewSha256;
  stale.performance.authorityNote += ' Changed fixture bytes.'; stale.attestPerformance();
  stale.report.performanceReviewSha256 = oldReviewHash; stale.attest();
  assert.throws(() => verifyKtpbAmendment(stale.read), /enclosing KTPB performance review binding/);
  const sourceOnly = fixture(); delete sourceOnly.report.performanceReviewSha256; sourceOnly.attest();
  assert.throws(() => verifyKtpbAmendment(sourceOnly.read), /enclosing KTPB performance review binding/);
});

test('pending candidate reviews contain no carried-forward independent approval claims', () => {
  const clearance = JSON.parse(readKtpbBytes(ktpbClearancePath));
  const report = JSON.parse(readKtpbBytes(ktpbReportPath));
  const performance = JSON.parse(readKtpbBytes(ktpbPerformanceReviewPath));
  if (clearance.status === approved) { verifyKtpbAmendment(readKtpbBytes); return; }
  for (const document of [clearance, report, performance]) assert.equal(document.status, pending);
  for (const field of ['reviewedAt', 'reviewerRole', 'findings', 'artifactSha256', 'builderEvidenceSha256']) assert.ok(!Object.hasOwn(report, field), field);
  assert.equal(report.approvedDependenciesSha256, null);
});

test('every reviewed file is freshly read after success; reattesting frozen source, security, approvals, assets or old workflows cannot broaden scope', () => {
  const f = fixture(); verifyKtpbAmendment(f.read);
  for (const file of [...required, ktpbReportPath]) {
    const bytes = f.read(file); f.files.delete(file); assert.throws(() => verifyKtpbAmendment(f.read), /Missing KTPB fixture/, file);
    f.files.set(file, Buffer.concat([bytes, Buffer.from('\n')])); assert.throws(() => verifyKtpbAmendment(f.read), undefined, file); f.files.set(file, bytes);
  }
  for (const file of [...Object.keys(ktpbSourceUiFiles), 'frontend/package-lock.json', 'backend-node/package-lock.json',
    'backend-node/data/compatibility/native-page-editor.json', '.github/workflows/ci.yml', 'frontend/e2e/catalog.spec.js', 'frontend/e2e/ptmm-qualification.spec.js',
    'frontend/public/catalog-source/page-056.webp', 'docs/catalog-transformers-2026/review/frontend-dependency-security/clearance.json',
    'docs/catalog-transformers-2026/review/frontend-dependency-security/independent-review.json']) {
    const f = fixture(); const bytes = Buffer.concat([f.read(file), Buffer.from('\n')]); f.files.set(file, bytes);
    f.clearance.dependencies.reviewedFiles[file] = digest(bytes); f.attest(); assert.throws(() => verifyKtpbAmendment(f.read), undefined, file);
  }
});

test('every old/new predecessor mixture fails, including a newly attested mixed hash', () => {
  const archive = JSON.parse(readKtpbBytes(`${ktpbReviewDir}/historical-test-bytes.json`));
  assert.equal(Object.keys(ktpbPredecessors).length, 20); assert.equal(required.length, 595);
  assert.equal(archive.baseCommit, ktpbBaselineCommit); assert.deepEqual(Object.keys(archive.files).sort(), Object.keys(ktpbPredecessors).sort());
  for (const [file, expected] of Object.entries(ktpbPredecessors)) {
    const f = fixture(), old = Buffer.from(archive.files[file].text); assert.equal(digest(old), expected); assert.notEqual(digest(f.read(file)), expected);
    f.files.set(file, old); assert.throws(() => verifyKtpbAmendment(f.read), undefined, file);
    f.clearance.dependencies.reviewedFiles[file] = expected; f.attest(); assert.throws(() => verifyKtpbAmendment(f.read), undefined, file);
  }
});

test('isolated PR44 default disk readers reject warm same-size timestamp-restored mutations without read-time substitution', async () => {
  const f = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ktpb-default-reader-'));
  try {
    for (const [file, bytes] of f.files) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    const { verifyKtpbAmendment: verify } = await import(pathToFileURL(path.join(directory, 'scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs')).href);
    const { verifySecurityAmendment: verifySecurity } = await import(pathToFileURL(path.join(directory, 'scripts/catalog/frontend-security-reviewed-dependencies.mjs')).href);
    for (const file of ['scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs', 'scripts/catalog/frontend-security-reviewed-dependencies.mjs',
      'frontend/lib/catalog/source-context/sourceContextManifest.json', 'frontend/public/catalog-source/page-056.webp', 'frontend/package-lock.json',
      'frontend/e2e/ktpb-source-context.browser.js', 'frontend/e2e/catalog.spec.js', 'frontend/e2e/ptmm-qualification.spec.js', ktpbReportPath]) {
      verify(); verifySecurity(); const target = path.join(directory, file), bytes = fs.readFileSync(target), stamp = fs.statSync(target);
      const changed = Buffer.from(bytes); changed[Math.floor(changed.length / 2)] ^= 1; fs.writeFileSync(target, changed); fs.utimesSync(target, stamp.atime, stamp.mtime);
      assert.equal(fs.statSync(target).size, bytes.length); assert.ok(Math.abs(fs.statSync(target).mtimeMs - stamp.mtimeMs) < 1);
      assert.throws(() => verify(), undefined, file); assert.throws(() => verifySecurity(), undefined, file);
      fs.writeFileSync(target, bytes); fs.utimesSync(target, stamp.atime, stamp.mtime); verify(); verifySecurity();
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('PR43 outputs and old 24 contexts remain exact while only the family retains its existing page-55 geometry', async () => {
  const { counts, legacySourceContexts } = await verifyKtpbSourceContextPreservation();
  assert.equal(Object.keys(legacySourceContexts).length, 24); assert.equal(counts.sourceContextRecords, 26); assert.equal(counts.constructionGaps, 243);
});
