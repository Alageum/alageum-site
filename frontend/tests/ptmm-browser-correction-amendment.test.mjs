import { readSecurityHistoricalBytes } from './helpers/frontend-security-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  correctionReviewDir, correctionClearancePath, correctionReportPath,
  correctionBaselineCommit, correctionBaselineTree, correctionPredecessors,
  correctionRequiredFiles, correctionDigest as digest, readCorrectionBytes,
  verifyCorrectionDependencyFiles, verifyCorrectionAmendment, assertCorrectionDependencies,
} from '../../scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs';
import { verifyPtmmQualificationAmendment } from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { verifyVisualPresentationAmendment } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { verifyBrowserAssertionAmendment } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';

const approved = 'approved-bounded-ptmm-browser-correction';
const pending = 'pending-independent-review';
const inheritedGates = [
  ['PTMM', verifyPtmmQualificationAmendment],
  ['visual', verifyVisualPresentationAmendment],
  ['browser', verifyBrowserAssertionAmendment],
  ['protection', read => verifyProtectionContextDependencyAmendment(JSON.parse(read(protectionContextClearancePath)), read)],
  ['measurement', read => verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read)],
  ['source', read => verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read)],
];
const fullChain = read => {
  verifyCorrectionAmendment(read);
  for (const [, verify] of inheritedGates) verify(read);
};

// This approval exists only in the supplied in-memory reader. No test writes an
// approval into the checkout or substitutes historical bytes in a normal gate.
function fixture() {
  const files = new Map(correctionRequiredFiles.map(file => [file, readSecurityHistoricalBytes(file, readCorrectionBytes)]));
  const fixturePaths = new Set([...correctionRequiredFiles, correctionClearancePath, correctionReportPath]);
  const clearance = {
    format: 'alageum-ptmm-browser-correction-clearance-v1', status: approved,
    baselineCommit: correctionBaselineCommit, baselineTree: correctionBaselineTree,
    dependencies: {
      predecessors: { ...correctionPredecessors },
      reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])),
    },
    reviewReport: correctionReportPath,
  };
  const report = {
    format: 'alageum-ptmm-browser-correction-independent-review-v1', status: approved,
    baselineCommit: correctionBaselineCommit, baselineTree: correctionBaselineTree,
    sourceUiChanges: 0, recordChanges: 0, geometryMaterialChanges: 0, pageChanges: 0,
    existingCatalogCases: 254, separateBrowserCases: 16, thresholdChanges: 0,
    workflowChanges: 0, priorApprovalChanges: 0,
    evidence: {
      readability: 'non-whitespace-ranges-with-bounded-geometry',
      linkFallback: 'resolved-auth-null-guard',
      console: 'unchanged-bounded-page-events',
    },
  };
  const publishClearance = () => files.set(correctionClearancePath, Buffer.from(JSON.stringify(clearance)));
  const attest = (dependencyHash = digest(JSON.stringify(clearance.dependencies))) => {
    files.set(correctionReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: dependencyHash })));
    clearance.reviewReportSha256 = digest(files.get(correctionReportPath));
    publishClearance();
  };
  const read = file => {
    if (files.has(file)) return files.get(file);
    assert.ok(!fixturePaths.has(file), `Missing correction fixture ${file}`);
    return readCorrectionBytes(file);
  };
  attest();
  return { files, clearance, report, attest, publishClearance, read };
}

test('fresh normal bytes stay rejected while pending and pass only after actual independent approval', () => {
  assert.equal(correctionBaselineCommit, '683134b3d7ef8e0424da752939308e7882a9937a');
  assert.equal(correctionBaselineTree, '620682e2539c6deee70901b44110c1702dc4bb90');
  const clearance = JSON.parse(readCorrectionBytes(correctionClearancePath));
  verifyCorrectionDependencyFiles(clearance, readCorrectionBytes);
  if (clearance.status === approved) {
    fullChain(readCorrectionBytes);
  } else {
    assert.equal(clearance.status, pending);
    assert.throws(() => verifyCorrectionAmendment(), /independent approval/);
    for (const [name, verify] of inheritedGates) {
      assert.throws(() => verify(readCorrectionBytes), /independent approval/, `${name} must reach the pending successor`);
    }
  }
});

test('exact synthetic approval reaches the entire inherited chain without approving the checkout', () => {
  const before = readCorrectionBytes(correctionClearancePath);
  const f = fixture();
  verifyCorrectionDependencyFiles(f.clearance, f.read);
  fullChain(f.read);
  assertCorrectionDependencies(correctionPredecessors, f.read);
  assert.deepEqual(readCorrectionBytes(correctionClearancePath), before);
  for (const file of Object.keys(correctionPredecessors)) {
    assert.throws(() => assertCorrectionDependencies({ [file]: 'wrong-prior' }, f.read), undefined, file);
  }
  assertCorrectionDependencies({ 'frontend/e2e/catalog.spec.js': digest(f.read('frontend/e2e/catalog.spec.js')) }, f.read);
  assert.throws(() => assertCorrectionDependencies({ 'frontend/e2e/catalog.spec.js': 'wrong-prior' }, f.read));
});

test('missing clearance, report or any reviewed dependency cannot reuse synthetic approval', () => {
  const f = fixture();
  verifyCorrectionAmendment(f.read);
  for (const file of [correctionClearancePath, correctionReportPath, ...correctionRequiredFiles]) {
    const before = f.files.get(file);
    assert.ok(before, `Fixture must contain ${file}`);
    f.files.delete(file);
    assert.throws(() => verifyCorrectionAmendment(f.read), /Missing correction fixture/, file);
    f.files.set(file, before);
  }
  verifyCorrectionAmendment(f.read);
});

test('pending, wrong baseline, broadened scope and mismatched clearance hashes are rejected', () => {
  const firstPrior = Object.keys(correctionPredecessors)[0];
  const firstReviewed = correctionRequiredFiles[0];
  const mutations = [
    ['pending approval', c => { c.status = pending; }],
    ['wrong format', c => { c.format = 'alageum-ptmm-qualification-clearance-v1'; }],
    ['wrong commit', c => { c.baselineCommit = 'wrong'; }],
    ['wrong tree', c => { c.baselineTree = 'wrong'; }],
    ['missing predecessor', c => { delete c.dependencies.predecessors[firstPrior]; }],
    ['wrong predecessor hash', c => { c.dependencies.predecessors[firstPrior] = 'wrong'; }],
    ['extra predecessor', c => { c.dependencies.predecessors['unreviewed-file'] = 'wrong'; }],
    ['missing reviewed file', c => { delete c.dependencies.reviewedFiles[firstReviewed]; }],
    ['wrong reviewed hash', c => { c.dependencies.reviewedFiles[firstReviewed] = 'wrong'; }],
    ['extra reviewed file', c => { c.dependencies.reviewedFiles['unreviewed-file'] = 'wrong'; }],
    ['different report path', c => { c.reviewReport = 'unreviewed-report'; }],
  ];
  for (const [name, mutate] of mutations) {
    const f = fixture();
    mutate(f.clearance); f.attest();
    assert.throws(() => verifyCorrectionAmendment(f.read), undefined, name);
  }
  const f = fixture();
  f.clearance.reviewReportSha256 = 'wrong'; f.publishClearance();
  assert.throws(() => verifyCorrectionAmendment(f.read));
});

test('the exact independent report binds baseline, dependency bytes and all bounded evidence', () => {
  const mutations = [
    ['wrong format', r => { r.format = 'alageum-ptmm-qualification-independent-review-v1'; }],
    ['pending report', r => { r.status = pending; }],
    ['wrong commit', r => { r.baselineCommit = 'wrong'; }],
    ['wrong tree', r => { r.baselineTree = 'wrong'; }],
    ['missing evidence', r => { delete r.evidence; }],
    ['extra evidence scope', r => { r.evidence.extraScope = 'unreviewed'; }],
    ...['sourceUiChanges', 'recordChanges', 'geometryMaterialChanges', 'pageChanges', 'existingCatalogCases',
      'separateBrowserCases', 'thresholdChanges', 'workflowChanges', 'priorApprovalChanges']
      .flatMap(field => [
        [`changed ${field}`, r => { r[field] += 1; }],
        [`missing ${field}`, r => { delete r[field]; }],
      ]),
    ...['readability', 'linkFallback', 'console'].map(field => [
      `wrong ${field} evidence`, r => { r.evidence[field] = 'unreviewed'; },
    ]),
  ];
  for (const [name, mutate] of mutations) {
    const f = fixture();
    mutate(f.report); f.attest();
    assert.throws(() => verifyCorrectionAmendment(f.read), undefined, name);
  }
  const f = fixture();
  f.attest('wrong-approved-dependencies');
  assert.throws(() => verifyCorrectionAmendment(f.read));
});

test('each inherited gate rejects a missing or pending successor and changed bytes after warm success', () => {
  const f = fixture();
  const changedFile = 'frontend/e2e/helpers/ptmm-qualification-dom.mjs';
  assert.ok(correctionRequiredFiles.includes(changedFile));
  const original = f.read(changedFile);
  for (const [name, verify] of inheritedGates) {
    verify(f.read);
    const clearance = f.files.get(correctionClearancePath);
    f.files.delete(correctionClearancePath);
    assert.throws(() => verify(f.read), /Missing correction fixture/, `${name}: missing successor`);
    f.files.set(correctionClearancePath, clearance);
    f.clearance.status = pending; f.attest();
    assert.throws(() => verify(f.read), /independent approval/, `${name}: pending successor`);
    f.clearance.status = approved; f.attest();
    f.files.set(changedFile, Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(() => verify(f.read), undefined, `${name}: post-warm changed bytes`);
    f.files.set(changedFile, original);
  }
});

test('every reviewed byte and the report are freshly hashed after a successful leaf verification', () => {
  const f = fixture();
  verifyCorrectionAmendment(f.read);
  for (const file of [...correctionRequiredFiles, correctionReportPath]) {
    const before = f.read(file);
    f.files.set(file, Buffer.concat([before, Buffer.from('\n')]));
    assert.throws(() => verifyCorrectionAmendment(f.read), undefined, file);
    f.files.set(file, before);
  }
  verifyCorrectionAmendment(f.read);
});

test('PR41/current helper and bridge byte mixtures cannot inherit a new approval', () => {
  const archive = JSON.parse(readCorrectionBytes(`${correctionReviewDir}/historical-test-bytes.json`));
  assert.equal(archive.baseCommit, correctionBaselineCommit);
  assert.deepEqual(Object.keys(archive.files).sort(), Object.keys(correctionPredecessors).sort());
  const f = fixture();
  verifyCorrectionAmendment(f.read);
  for (const [file, expected] of Object.entries(correctionPredecessors)) {
    const old = Buffer.from(archive.files[file].text);
    assert.equal(digest(old), expected, `PR41 archive hash ${file}`);
    assert.equal(archive.files[file].sha256, expected);
    const current = f.read(file);
    assert.notEqual(digest(current), expected, `The successor must change ${file}`);
    f.files.set(file, old);
    assert.throws(() => verifyCorrectionAmendment(f.read), undefined, `Old/current mix ${file}`);
    f.clearance.dependencies.reviewedFiles[file] = expected;
    f.attest();
    assert.throws(() => verifyCorrectionAmendment(f.read), undefined, `Re-attested PR41/current mix ${file}`);
    f.files.set(file, current);
    f.clearance.dependencies.reviewedFiles[file] = digest(current);
    f.attest();
  }
  const helper = 'frontend/e2e/helpers/ptmm-qualification-dom.mjs';
  assert.ok(archive.files[helper]);
  f.files.set(helper, Buffer.from(archive.files[helper].text));
  for (const [name, verify] of inheritedGates) {
    assert.throws(() => verify(f.read), undefined, `${name}: PR41/current mix`);
  }
});

test('re-attesting frozen UI, source, CMS, geometry, old suite, workflow or prior approvals does not authorize edits', () => {
  const frozen = [
    'frontend/components/catalog/CatalogSpecValue.js',
    'frontend/components/catalog/Comparison.js',
    'frontend/lib/catalog/ptmmDimensionQualification.js',
    'frontend/lib/catalog/source.js',
    'frontend/public/catalog-source/page-068.webp',
    'frontend/public/catalog-source/page-069.webp',
    'backend-node/src/domain/catalog.js',
    'backend-node/src/domain/catalog-source.js',
    'docs/catalog-import/products.json',
    'backend-node/data/catalog-import/products.json',
    'frontend/lib/catalog/models/protectionExampleGeometry.js',
    'frontend/e2e/catalog.spec.js',
    '.github/workflows/ci.yml',
    'docs/catalog-transformers-2026/review/ptmm-dimension-qualification/source-evidence.json',
    'docs/catalog-transformers-2026/review/ptmm-dimension-qualification/source-ui-review.json',
    `${correctionReviewDir}/fixed-dependencies.json`,
    ...['ptmm-dimension-qualification', 'catalog-visual-presentation', 'catalog-browser-assertions', 'protection-context-integration',
      'measurement-column-completion', 'source-asset-completion']
      .flatMap(review => ['clearance.json', 'independent-review.json'].map(file => `docs/catalog-transformers-2026/review/${review}/${file}`)),
  ];
  for (const file of frozen) {
    const f = fixture();
    assert.ok(correctionRequiredFiles.includes(file), `Frozen path is inside the review closure: ${file}`);
    assert.ok(!Object.hasOwn(correctionPredecessors, file), `Frozen path cannot be a successor change: ${file}`);
    const changed = Buffer.concat([f.read(file), Buffer.from('\n')]);
    f.files.set(file, changed);
    f.clearance.dependencies.reviewedFiles[file] = digest(changed);
    f.attest();
    assert.throws(() => verifyCorrectionDependencyFiles(f.clearance, f.read), undefined, `Re-attested frozen bytes ${file}`);
  }
});

test('same-size timestamp-restored disk changes cannot reuse a warm approval', () => {
  const f = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ptmm-correction-current-bytes-'));
  try {
    for (const file of [
      'frontend/e2e/helpers/ptmm-qualification-dom.mjs',
      'frontend/e2e/ptmm-qualification.spec.js',
      'scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs',
    ]) {
      assert.ok(correctionRequiredFiles.includes(file));
      const target = path.join(directory, 'reviewed-file');
      const original = f.read(file);
      fs.writeFileSync(target, original);
      const stamp = fs.statSync(target);
      const read = candidate => candidate === file ? fs.readFileSync(target) : f.read(candidate);
      verifyCorrectionAmendment(read);
      const changed = Buffer.from(original);
      changed[Math.floor(changed.length / 2)] ^= 1;
      fs.writeFileSync(target, changed);
      fs.utimesSync(target, stamp.atime, stamp.mtime);
      assert.equal(fs.statSync(target).size, original.length);
      assert.ok(Math.abs(fs.statSync(target).mtimeMs - stamp.mtimeMs) < 1, 'Original modification time restored');
      assert.throws(() => verifyCorrectionAmendment(read), undefined, file);
      fs.writeFileSync(target, original);
      fs.utimesSync(target, stamp.atime, stamp.mtime);
      verifyCorrectionAmendment(read);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
