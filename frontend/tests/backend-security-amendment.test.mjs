import { readCombinedHistoricalBytes } from './helpers/combined-eds-auth-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  backendReviewDir, backendClearancePath, backendReportPath, backendBaselineCommit, backendBaselineTree,
  backendPredecessors, backendFixedFiles, backendRequiredFiles, backendDigest as digest, readBackendBytes as readCurrentBackendBytes,
  verifyBackendDependencyFiles, verifyBackendAmendment, assertBackendDependencies,
} from '../../scripts/catalog/backend-security-reviewed-dependencies.mjs';
import { readBackendHistoricalBytes } from './helpers/backend-security-historical-bytes.mjs';
import { verifyKtpbAmendment } from '../../scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs';
import { verifySecurityAmendment } from '../../scripts/catalog/frontend-security-reviewed-dependencies.mjs';
import { verifyCorrectionAmendment } from '../../scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs';
import { verifyPtmmQualificationAmendment } from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { verifyVisualPresentationAmendment } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { verifyBrowserAssertionAmendment } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
// Historical PR45 controls only. Current candidate coverage lives in combined-eds-auth-amendment.test.mjs.
const readBackendBytes = file => readCombinedHistoricalBytes(file, readCurrentBackendBytes);
const approved = 'approved-bounded-backend-security';
const required = backendRequiredFiles();
const gates = [
  ['backend', verifyBackendAmendment], ['KTPB', verifyKtpbAmendment], ['frontend security', verifySecurityAmendment],
  ['correction', verifyCorrectionAmendment], ['qualification', verifyPtmmQualificationAmendment],
  ['visual', verifyVisualPresentationAmendment], ['browser', verifyBrowserAssertionAmendment],
  ['protection', read => verifyProtectionContextDependencyAmendment(JSON.parse(read(protectionContextClearancePath)), read)],
  ['measurement', read => verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read)],
  ['source', read => verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read)],
];
// Synthetic authority stays in memory or an isolated disposable filesystem.
function fixture() {
  const files = new Map(required.map(file => [file, readBackendBytes(file)]));
  const clearance = { format: 'alageum-backend-security-clearance-v1', status: approved,
    baselineCommit: backendBaselineCommit, baselineTree: backendBaselineTree,
    dependencies: { predecessors: { ...backendPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) },
    reviewReport: backendReportPath };
  const report = { format: 'alageum-backend-security-independent-review-v1', status: approved,
    authorityNote: 'Synthetic unit-test authority only; not a candidate, publication or release approval.',
    baselineCommit: backendBaselineCommit, baselineTree: backendBaselineTree,
    packageSha256: backendFixedFiles['backend-node/package.json'], lockSha256: backendFixedFiles['backend-node/package-lock.json'],
    packageUpdates: { parent: '@strapi/upload', sharp: ['0.35.4', '0.35.5'], changedLockRecords: 27, strapi: '5.56.0' },
    proofSupport: { modified: 6, added: 9, predecessorPaths: 9, inheritedPaths: 598 },
    sourceUiChanges: 0, recordChanges: 0, geometryMaterialChanges: 0, pageAdapterChanges: 0, workflowChanges: 0,
    priorApprovalChanges: 0, coordinatorChanges: 0, auditGateChanges: 0, frontendDependencyChanges: 0 };
  const attest = () => {
    files.set(backendReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)) })));
    clearance.reviewReportSha256 = digest(files.get(backendReportPath));
    files.set(backendClearancePath, Buffer.from(JSON.stringify(clearance)));
  };
  const protectedPaths = new Set([...required, backendClearancePath, backendReportPath]);
  const read = file => { if (files.has(file)) return files.get(file); assert.ok(!protectedPaths.has(file), `Missing backend fixture ${file}`); return readBackendBytes(file); };
  attest(); return { files, clearance, report, read, attest };
}

test('real candidate evidence is distinct from independent approval and the exact predecessor remains accepted', () => {
  const c = JSON.parse(readBackendBytes(backendClearancePath)); verifyBackendDependencyFiles(c, readBackendBytes);
  for (const [label, verify] of gates) {
    if (c.status === approved) assert.doesNotThrow(() => verify(readBackendBytes), label);
    else { assert.equal(c.status, 'pending-independent-review'); assert.throws(() => verify(readBackendBytes), /requires independent approval/, label); }
  }
  const historical = file => readBackendHistoricalBytes(file, readBackendBytes);
  for (const [label, verify] of gates.slice(1)) assert.doesNotThrow(() => verify(historical), label);
  assert.equal(required.length, 614); assert.equal(new Set(required).size, required.length);
});

test('exact synthetic successor reaches all ten explicit-reader gates without changing checkout authority', () => {
  const before = readBackendBytes(backendClearancePath), f = fixture();
  for (const [label, verify] of gates) assert.doesNotThrow(() => verify(f.read), label);
  assertBackendDependencies(backendPredecessors, f.read);
  for (const file of Object.keys(backendPredecessors)) assert.throws(() => assertBackendDependencies({ [file]: 'wrong-prior' }, f.read), /Wrong backend security predecessor/);
  assert.throws(() => assertBackendDependencies({ 'frontend/package-lock.json': 'wrong-prior' }, f.read), /Changed unreviewed backend dependency/);
  assert.deepEqual(readBackendBytes(backendClearancePath), before);
});

test('pending and missing approvals or reports fail through every inherited gate after success', () => {
  const f = fixture();
  for (const [label, verify] of gates) {
    verify(f.read);
    f.clearance.status = 'pending-independent-review'; f.attest(); assert.throws(() => verify(f.read), /requires independent approval/, label);
    f.clearance.status = approved; f.attest();
    const c = f.files.get(backendClearancePath); f.files.delete(backendClearancePath); assert.throws(() => verify(f.read), /Missing backend fixture/, label); f.files.set(backendClearancePath, c);
    const r = f.files.get(backendReportPath); f.files.delete(backendReportPath); assert.throws(() => verify(f.read), /Missing backend fixture/, label); f.files.set(backendReportPath, r);
  }
});

test('wrong baseline identities, predecessor scope, closure membership and report bindings are rejected', () => {
  for (const field of ['baselineCommit', 'baselineTree']) {
    const f = fixture(); f.clearance[field] = 'wrong'; f.attest(); assert.throws(() => verifyBackendAmendment(f.read));
  }
  for (const mutate of [
    f => { f.clearance.dependencies.predecessors.extra = 'wrong'; },
    f => { delete f.clearance.dependencies.reviewedFiles[required[0]]; },
    f => { f.clearance.dependencies.reviewedFiles.extra = 'wrong'; },
    f => { f.clearance.dependencies.reviewedFiles['backend-node/package.json'] = 'wrong'; },
    f => { f.report.baselineTree = 'wrong'; }, f => { f.report.packageUpdates.parent = 'global'; },
    f => { f.report.proofSupport.modified = 5; }, f => { f.report.auditGateChanges = 1; },
    f => { f.report.coordinatorChanges = 1; },
  ]) { const f = fixture(); mutate(f); f.attest(); assert.throws(() => verifyBackendAmendment(f.read)); }
  const f = fixture(); f.files.set(backendReportPath, Buffer.from('{}')); assert.throws(() => verifyBackendAmendment(f.read), /Changed independent backend report/);
});

test('every required path rejects missing and changed bytes without refreshing its approved hash', () => {
  const f = fixture();
  for (const file of required) {
    const bytes = f.files.get(file); f.files.delete(file); assert.throws(() => verifyBackendAmendment(f.read), undefined, `missing ${file}`);
    f.files.set(file, Buffer.concat([bytes, Buffer.from('\n')])); assert.throws(() => verifyBackendAmendment(f.read), undefined, `changed ${file}`);
    f.files.set(file, bytes);
  }
  verifyBackendAmendment(f.read);
});

test('reattestation cannot authorize package, workflow, source, Page, coordinator or historical approval changes', () => {
  const baseline = JSON.parse(readBackendBytes(`${backendReviewDir}/baseline-dependencies.json`));
  const files = ['backend-node/package.json', 'backend-node/package-lock.json', 'scripts/catalog/proof-invocation.mjs',
    'frontend/package-lock.json', 'frontend/public/catalog-source/page-056.webp',
    'docs/catalog-transformers-2026/review/ktpb-source-context/clearance.json',
    'docs/catalog-transformers-2026/review/ktpb-source-context/performance-semantics-review.json',
    ...Object.keys(baseline).filter(file => /fixed-dependencies\.json$|^\.github\/workflows\/|page-editor|pageEditor|slate/i.test(file))];
  assert.ok(files.length > 7);
  for (const file of new Set(files)) {
    const f = fixture(); f.files.set(file, Buffer.concat([f.read(file), Buffer.from('\n')]));
    f.clearance.dependencies.reviewedFiles[file] = digest(f.read(file)); f.attest();
    assert.throws(() => verifyBackendAmendment(f.read), /Changed immutable PR44 backend pin|Unreviewed backend replacement/, file);
  }
  for (const file of Object.keys(backendPredecessors)) {
    const f = fixture(); f.files.set(file, readBackendHistoricalBytes(file, readBackendBytes));
    f.clearance.dependencies.reviewedFiles[file] = digest(f.read(file)); f.attest();
    assert.throws(() => verifyBackendAmendment(f.read), /Mixed or unchanged backend successor/, file);
  }
});

test('production verifier imports never consume a historical archive or an inherited verifier', () => {
  const source = readBackendBytes('scripts/catalog/backend-security-reviewed-dependencies.mjs').toString();
  for (const line of source.split('\n').filter(line => /^import /.test(line))) {
    assert.doesNotMatch(line, /historical|reviewed-dependencies|\/tests\//);
  }
  for (const file of required.filter(file => file.startsWith('scripts/') && file.endsWith('.mjs'))) {
    assert.doesNotMatch(readBackendBytes(file).toString(), /from ['"][^'"]*historical[^'"]*['"]/, file);
  }
});

test('the current combined disk stack uses default readers, final rereads, and rejects persistent corruption after warm success', async () => {
  const f = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-proof-final-'));
  try {
    // Existing inherited gates also bind review documents outside their declared
    // dependency maps. Preserve the established isolated-fixture provisioning.
    fs.cpSync(new URL('../../docs/catalog-transformers-2026/review/', import.meta.url), path.join(directory, 'docs/catalog-transformers-2026/review'), { recursive: true });
    for (const [file, bytes] of f.files) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    const modules = {};
    for (const name of ['backend-security', 'ktpb-source-context', 'frontend-security', 'ptmm-browser-correction', 'ptmm-qualification', 'visual-presentation', 'catalog-browser', 'protection-context', 'measurement-column', 'source-asset', 'transformer']) {
      modules[name] = await import(pathToFileURL(path.join(directory, `scripts/catalog/${name}-reviewed-dependencies.mjs`)).href);
    }
    const json = file => JSON.parse(fs.readFileSync(path.join(directory, file)));
    const routes = [modules['backend-security'].verifyBackendAmendment, modules['ktpb-source-context'].verifyKtpbAmendment,
      modules['frontend-security'].verifySecurityAmendment, modules['ptmm-browser-correction'].verifyCorrectionAmendment,
      modules['ptmm-qualification'].verifyPtmmQualificationAmendment, modules['visual-presentation'].verifyVisualPresentationAmendment,
      modules['catalog-browser'].verifyBrowserAssertionAmendment,
      () => modules['protection-context'].verifyProtectionContextDependencyAmendment(json(protectionContextClearancePath)),
      () => modules['measurement-column'].verifyMeasurementColumnDependencyAmendment(json(measurementColumnClearancePath)),
      () => modules['source-asset'].verifySourceAssetDependencyAmendment(json(sourceAssetClearancePath))];
    for (const verify of routes) verify();
    const original = fs.readFileSync, counts = new Map();
    fs.readFileSync = function (file, ...args) { const bytes = original.call(this, file, ...args); if (typeof file === 'string' && file.startsWith(directory + path.sep)) { const relative = path.relative(directory, file); counts.set(relative, (counts.get(relative) || 0) + 1); } return bytes; };
    try { modules['backend-security'].verifyBackendAmendment(); } finally { fs.readFileSync = original; }
    assert.equal(counts.size, required.length + 2); for (const [file, count] of counts) assert.equal(count, 2, file);
    const ntmi = await import(pathToFileURL(path.join(directory, 'scripts/check-ntmi-source-previews.mjs')).href);
    assert.deepEqual(ntmi.verifyNtmiSourcePreviewClearance(), json(ntmi.ntmiPreviewClearancePath).counts);
    const prior = json('docs/catalog-transformers-2026/review/asset-completion/clearance.json');
    const file = 'frontend/lib/catalog/models/visualMap.js';
    modules.transformer.assertReviewedTransformerDependency(file, prior.dependencies.reviewedFileHashes[file], prior);
    for (const targetFile of ['backend-node/package.json', 'scripts/catalog/backend-security-reviewed-dependencies.mjs', 'scripts/catalog/proof-invocation.mjs', backendReportPath]) {
      const target = path.join(directory, targetFile), before = fs.readFileSync(target), stat = fs.statSync(target), changed = Buffer.from(before); changed[0] ^= 1;
      fs.writeFileSync(target, changed); fs.utimesSync(target, stat.atime, stat.mtime);
      for (const verify of routes) assert.throws(() => verify(), undefined, targetFile);
      fs.writeFileSync(target, before); fs.utimesSync(target, stat.atime, stat.mtime);
    }
    const authority = path.join(directory, backendClearancePath), before = fs.readFileSync(authority), pending = JSON.parse(before); pending.status = 'pending-independent-review'; fs.writeFileSync(authority, JSON.stringify(pending));
    for (const verify of routes) assert.throws(() => verify(), /requires independent approval/);
    fs.writeFileSync(authority, before); for (const verify of routes) verify();
    for (const [name, value] of Object.entries(modules['backend-security'])) if (name.startsWith('internal') && typeof value === 'function') assert.throws(() => value({}), /Invalid or closed proof invocation context/, name);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
