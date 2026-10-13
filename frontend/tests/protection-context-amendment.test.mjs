import { readVisualPresentationHistoricalBytes } from './helpers/visual-presentation-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
import { protectionContextAmendmentFiles, protectionContextRequiredFiles, protectionContextClearancePath,
  protectionContextBaselineCommit, protectionContextBaselineTree, protectionContextReviewDir as dir,
  readProtectionContextBytes as readCurrentProtectionContextBytes, protectionContextDigest as digest, verifyProtectionContextDependencyFiles,
  verifyProtectionContextDependencyAmendment, assertProtectionContextForwardDependency, assertProtectionContextForwardDependencies, protectionContextHistoricalHash, assertProtectionContextSourceInput,
} from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';

const readProtectionContextBytes = file => readVisualPresentationHistoricalBytes(file, readCurrentProtectionContextBytes);

// Synthetic approval exists only in this in-memory reader. The checkout's
// pending candidate stays unapproved until a separate reviewer attests it.
function fixture() {
  const prior = JSON.parse(readProtectionContextBytes('docs/catalog-transformers-2026/review/measurement-column-completion/clearance.json')).dependencies.reviewedFiles;
  const baseline = JSON.parse(readProtectionContextBytes(`${dir}/baseline-dependencies.json`));
  const paths = [...new Set([...Object.keys(prior), ...protectionContextAmendmentFiles, ...protectionContextRequiredFiles])];
  const files = new Map(paths.map(file => [file, readProtectionContextBytes(file)]));
  const reviewedFiles = Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)]));
  const amendments = Object.fromEntries(protectionContextAmendmentFiles.map(file => [file, { baselineSha256: baseline[file], reviewedSha256: reviewedFiles[file] }]));
  const clearance = { format: 'alageum-protection-context-clearance-v1', status: 'approved-bounded-protection-context',
    baselineCommit: protectionContextBaselineCommit, baselineTree: protectionContextBaselineTree,
    bindingsSha256: reviewedFiles['frontend/lib/catalog/models/protectionExampleRuntimeManifest.json'],
    contextManifestSha256: reviewedFiles['frontend/lib/catalog/source-context/sourceContextManifest.json'],
    baselineOutputsSha256: reviewedFiles[`${dir}/baseline-outputs.json`],
    dependencies: { amendments, reviewedFiles }, reviewReport: `${dir}/independent-review.json` };
  const report = { format: 'alageum-protection-context-independent-review-v1', status: clearance.status,
    baselineCommit: clearance.baselineCommit, baselineTree: clearance.baselineTree,
    refinedModelIds: ['cat-ptm-tded-v012', 'cat-ptm-tded-v013'], refinedIconIds: ['cat-ptm-tded', 'cat-ptm-tded-v012', 'cat-ptm-tded-v013'],
    contextRecordIds: Object.keys(JSON.parse(files.get('frontend/lib/catalog/source-context/sourceContextManifest.json')).records).sort(),
    counts: { productBodies: 843, legacyRecords: 238, oldModelTypes: 126, oldIconTypes: 136, newModelTypes: 2, newIconTypes: 3,
      choiceRecords: 36, choices: 74, ntmiSourcePreviews: 2, sourceGroundedDefault3D: 464, sourceBasedIcons: 465,
      explicitConstructionGaps: 243, constructionGapFamilies: 29, sourceContextRecords: 24, newProducts: 0, confidencePromotions: 0, apiSummaryCorrections: 23, comparisonCellCorrections: 3 } };
  const attest = (value = clearance, review = report) => {
    files.set(value.reviewReport, Buffer.from(JSON.stringify({ ...review,
      approvedDependenciesSha256: digest(JSON.stringify(value.dependencies)), approvedBindingsSha256: value.bindingsSha256,
      approvedContextManifestSha256: value.contextManifestSha256, approvedBaselineOutputsSha256: value.baselineOutputsSha256 })));
    value.reviewReportSha256 = digest(files.get(value.reviewReport));
    files.set(protectionContextClearancePath, Buffer.from(JSON.stringify(value)));
  };
  const read = file => { assert.ok(files.has(file), `Missing synthetic source ${file}`); return files.get(file); };
  attest(); return { clearance, report, files, paths, read, attest };
}

test('candidate byte evidence does not confer independent release authority; exact reviewed successor forwards only its predecessor hashes', () => {
  const { clearance, read, attest } = fixture();
  const pending = { ...clearance, status: 'pending-independent-review' };
  verifyProtectionContextDependencyFiles(pending, read);
  assert.throws(() => verifyProtectionContextDependencyAmendment(pending, read), /requires independent approval/);
  attest(pending);
  const file = protectionContextAmendmentFiles[0], priorHash = clearance.dependencies.amendments[file].baselineSha256;
  assert.throws(() => assertProtectionContextForwardDependency(file, priorHash, read), /requires independent approval/);
  assert.throws(() => protectionContextHistoricalHash(file, read), /requires independent approval/);
  attest(clearance); verifyProtectionContextDependencyAmendment(clearance, read);
  for (const file of protectionContextAmendmentFiles) {
    assertProtectionContextForwardDependency(file, clearance.dependencies.amendments[file].baselineSha256, read);
    assert.equal(protectionContextHistoricalHash(file, read), clearance.dependencies.amendments[file].baselineSha256);
    assert.throws(() => assertProtectionContextForwardDependency(file, 'unrelated-prior-hash', read), /Wrong historical/);
  }
  assert.throws(() => assertProtectionContextForwardDependency('frontend/lib/catalog/models/transformer2026Shape.js', 'unrelated', read), /Changed unreviewed/);
  for (const file of ['frontend/components/catalog/ProductVisual.js', 'frontend/lib/catalog/apiData.js']) {
    assertProtectionContextSourceInput(file, clearance.dependencies.amendments[file].baselineSha256, read);
    assert.throws(() => assertProtectionContextSourceInput(file, 'wrong-prior', read), /Wrong historical/);
  }
  assert.throws(() => assertProtectionContextSourceInput('frontend/lib/catalog/models/geometry.js', 'wrong', read), /Changed immutable source input/);
});

test('successor rejects overbroad scope, missing self pins, altered baseline and changed independent approval content', () => {
  const { clearance, report, read, attest } = fixture();
  for (const mutate of [
    value => { delete value.dependencies.reviewedFiles['scripts/catalog/protection-context-reviewed-dependencies.mjs']; },
    value => { delete value.dependencies.amendments[protectionContextAmendmentFiles[0]]; },
    value => { value.dependencies.amendments[protectionContextAmendmentFiles[0]].baselineSha256 = 'wrong'; },
    value => { value.dependencies.amendments[protectionContextAmendmentFiles[0]].reviewedSha256 = 'wrong'; },
    value => { value.dependencies.amendments['frontend/lib/catalog/models/transformer2026Shape.js'] = { baselineSha256: 'wrong', reviewedSha256: 'wrong' }; },
    value => { value.dependencies.reviewedFiles['unreviewed-extra-file.js'] = 'wrong'; },
    value => { value.baselineCommit = 'wrong'; }, value => { value.baselineTree = 'wrong'; },
    value => { value.bindingsSha256 = 'wrong'; }, value => { value.contextManifestSha256 = 'wrong'; }, value => { value.baselineOutputsSha256 = 'wrong'; },
  ]) {
    const changed = structuredClone(clearance); mutate(changed); attest(changed);
    assert.throws(() => verifyProtectionContextDependencyAmendment(changed, read));
  }
  for (const mutate of [
    value => { value.status = 'pending-independent-review'; }, value => { value.refinedModelIds.push('cat-ptm-tded-v001'); },
    value => { value.refinedIconIds.push('cat-ptm-tded-v002'); }, value => { value.contextRecordIds.pop(); },
    value => { value.counts.sourceGroundedDefault3D = 488; }, value => { value.counts.newProducts = 1; },
  ]) {
    const changed = structuredClone(report); mutate(changed); attest(clearance, changed);
    assert.throws(() => verifyProtectionContextDependencyAmendment(clearance, read));
  }
});

test('every raw-byte dependency including old approvals, source assets, snapshots and the leaf verifier rejects a one-byte mutation', () => {
  const { clearance, files, paths, read } = fixture();
  for (const file of [...paths, clearance.reviewReport]) {
    const original = files.get(file); files.set(file, Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(() => verifyProtectionContextDependencyAmendment(clearance, read), undefined, file);
    files.set(file, original);
  }
});


test('batched historical chain rechecks warm authority after same-size changes with restored timestamps, then accepts restored bytes', () => {
  const { clearance, files, read } = fixture();
  const prior = JSON.parse(files.get('docs/catalog-transformers-2026/review/source-asset-completion/clearance.json'));
  const expected = Object.fromEntries(protectionContextAmendmentFiles.map(file => [file, clearance.dependencies.amendments[file].baselineSha256]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'protection-byte-freshness-'));
  try {
    for (const changedFile of ['scripts/catalog/protection-context-reviewed-dependencies.mjs', 'frontend/scripts/verify-source-context-build.mjs', 'frontend/public/catalog-source-context/source-tde.png']) {
      const target = path.join(directory, 'protected-file'), original = files.get(changedFile);
      fs.writeFileSync(target, original); const stamp = fs.statSync(target);
      const currentRead = file => file === changedFile ? fs.readFileSync(target) : read(file);
      assertProtectionContextForwardDependencies(expected, currentRead);
      verifySourceAssetDependencyAmendment(prior, currentRead);
      const corrupted = Buffer.from(original); corrupted[Math.floor(corrupted.length / 2)] ^= 1;
      fs.writeFileSync(target, corrupted); fs.utimesSync(target, stamp.atime, stamp.mtime);
      assert.equal(fs.statSync(target).size, original.length);
      assert.throws(() => assertProtectionContextForwardDependencies(expected, currentRead), undefined, changedFile);
      assert.throws(() => verifySourceAssetDependencyAmendment(prior, currentRead), undefined, changedFile);
      fs.writeFileSync(target, original); fs.utimesSync(target, stamp.atime, stamp.mtime);
      assertProtectionContextForwardDependencies(expected, currentRead);
      verifySourceAssetDependencyAmendment(prior, currentRead);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
