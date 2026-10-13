import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { historicalReviewedBytes } from './helpers/historical-reviewed-bytes.mjs';
import { measurementColumnAmendmentFiles, measurementColumnRequiredFiles, measurementColumnClearancePath,
  measurementColumnBaselineCommit, measurementColumnBaselineTree, measurementColumnExactIds,
  verifyMeasurementColumnDependencyFiles, verifyMeasurementColumnDependencyAmendment,
  assertMeasurementColumnForwardDependency } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const reviewDir = 'docs/catalog-transformers-2026/review/measurement-column-completion';
const manifestPath = 'frontend/lib/catalog/models/measurementColumn2026CompletionManifest.json';
const historicalCheckpoint = '5de8251ffd15d8799c8f187cf445107c295811e4';
const historicalBytes = file => historicalReviewedBytes(historicalCheckpoint, file);

// Approved statuses are synthetic in-memory fixtures only. No approval is written
// to a checkout, and no production candidate can use this injected reader.
function fixture() {
  const historical = JSON.parse(historicalBytes('docs/catalog-transformers-2026/review/source-asset-completion/clearance.json'));
  const paths = [...new Set([...Object.keys(historical.dependencies.reviewedFiles), ...measurementColumnRequiredFiles])];
  // Test the historical amendment against its frozen checkpoint. Current
  // successor bytes require their own real independent approval.
  const files = new Map(paths.map(file => [file, historicalBytes(file)]));
  const reviewedFiles = Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)]));
  const amendments = Object.fromEntries(measurementColumnAmendmentFiles.map(file => [file, {
    baselineSha256: historical.dependencies.reviewedFiles[file], reviewedSha256: reviewedFiles[file],
  }]));
  const clearance = { format: 'alageum-measurement-column-completion-clearance-v1', status: 'approved-bounded-measurement-columns',
    baselineCommit: measurementColumnBaselineCommit, baselineTree: measurementColumnBaselineTree,
    bindingsSha256: reviewedFiles[manifestPath], baselineOutputsSha256: reviewedFiles[`${reviewDir}/baseline-outputs.json`],
    dependencies: { amendments, reviewedFiles }, reviewReport: `${reviewDir}/independent-review.json` };
  const report = { format: 'alageum-measurement-column-completion-independent-review-v1', status: clearance.status,
    baselineCommit: clearance.baselineCommit, baselineTree: clearance.baselineTree,
    approvedRecordIds: [...measurementColumnExactIds], counts: { addedBindings: 3, newModelTypes: 1, newIconTypes: 1, newProducts: 0 },
    unchangedCounts: { productBodies: 843, unaffectedRecords: 840, legacyRecords: 238,
      choiceRecords: 36, choices: 74, sourcePreviews: 2, oldModelTypes: 125, oldIconTypes: 135 } };
  const attest = (value = clearance, review = report) => {
    files.set(value.reviewReport, Buffer.from(JSON.stringify({ ...review,
      approvedDependenciesSha256: digest(JSON.stringify(value.dependencies)), approvedBindingsSha256: value.bindingsSha256,
      approvedBaselineOutputsSha256: value.baselineOutputsSha256 })));
    value.reviewReportSha256 = digest(files.get(value.reviewReport));
    files.set(measurementColumnClearancePath, Buffer.from(JSON.stringify(value)));
    return value;
  };
  const read = file => { assert.ok(files.has(file), `Missing in-memory measurement-column fixture ${file}`); return files.get(file); };
  attest();
  return { clearance, report, files, paths, read, attest };
}

test('candidate evidence is separate from release approval; exact independent forward amendment is accepted', () => {
  const { clearance, read, attest } = fixture();
  const pending = { ...clearance, status: 'pending-independent-review' };
  verifyMeasurementColumnDependencyFiles(pending, read);
  assert.throws(() => verifyMeasurementColumnDependencyAmendment(pending, read), /requires independent approval/);
  attest(pending);
  assert.throws(() => assertMeasurementColumnForwardDependency(measurementColumnAmendmentFiles[0], clearance.dependencies.amendments[measurementColumnAmendmentFiles[0]].baselineSha256, read), /requires independent approval/);
  attest(clearance);
  verifyMeasurementColumnDependencyAmendment(clearance, read);
  for (const file of measurementColumnAmendmentFiles) {
    assertMeasurementColumnForwardDependency(file, clearance.dependencies.amendments[file].baselineSha256, read);
    assert.throws(() => assertMeasurementColumnForwardDependency(file, 'wrong-prior-digest', read), /Wrong historical forward-amendment dependency/);
  }
  assert.throws(() => assertMeasurementColumnForwardDependency('frontend/lib/catalog/models/transformer2026Shape.js', 'wrong-prior-digest', read), /Changed unreviewed protection\/context dependency/);
});

test('forward amendment rejects missing self pins, missing amendments, wrong digests and expanded scope even with matching synthetic report hashes', () => {
  const { clearance, report, read, attest } = fixture();
  for (const mutate of [
    value => { delete value.dependencies.reviewedFiles['scripts/catalog/measurement-column-reviewed-dependencies.mjs']; },
    value => { delete value.dependencies.amendments[measurementColumnAmendmentFiles[0]]; },
    value => { value.dependencies.amendments[measurementColumnAmendmentFiles[0]].baselineSha256 = 'wrong'; },
    value => { value.dependencies.amendments[measurementColumnAmendmentFiles[0]].reviewedSha256 = 'wrong'; },
    value => { value.dependencies.reviewedFiles[measurementColumnAmendmentFiles[0]] = 'wrong'; },
    value => { value.dependencies.amendments['frontend/lib/catalog/models/transformer2026Shape.js'] = { baselineSha256: 'wrong', reviewedSha256: 'wrong' }; },
    value => { value.dependencies.reviewedFiles['unreviewed-extra-file.js'] = 'wrong'; },
    value => { value.baselineCommit = 'wrong'; },
    value => { value.baselineTree = 'wrong'; },
    value => { value.bindingsSha256 = 'wrong'; },
    value => { value.baselineOutputsSha256 = 'wrong'; },
  ]) {
    const changed = structuredClone(clearance); mutate(changed); attest(changed);
    assert.throws(() => verifyMeasurementColumnDependencyAmendment(changed, read));
  }
  for (const mutate of [
    value => { value.status = 'pending-independent-review'; },
    value => { value.approvedRecordIds.push('unreviewed-record'); },
    value => { value.counts.newModelTypes = 2; },
    value => { value.unchangedCounts.unaffectedRecords = 839; },
  ]) {
    const changed = structuredClone(report); mutate(changed); attest(clearance, changed);
    assert.throws(() => verifyMeasurementColumnDependencyAmendment(clearance, read));
  }
  attest(clearance);
  assert.throws(() => verifyMeasurementColumnDependencyAmendment({ ...clearance, reviewReportSha256: 'wrong' }, read), /Changed independent measurement-column review/);
});

test('every pinned file and the independent report fail closed after a single-byte change, including old approvals and the verifier itself', () => {
  const { clearance, files, paths, read } = fixture();
  for (const file of [...paths, clearance.reviewReport]) {
    const bytes = files.get(file); files.set(file, Buffer.concat([bytes, Buffer.from('\n')]));
    assert.throws(() => verifyMeasurementColumnDependencyAmendment(clearance, read), undefined, file);
    files.set(file, bytes);
  }
});
