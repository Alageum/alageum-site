import { readCorrectionHistoricalBytes } from './helpers/ptmm-browser-correction-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ptmmReviewDir, ptmmBaselineCommit, ptmmBaselineTree, ptmmClearancePath, ptmmReportPath, ptmmRequiredFiles, ptmmPredecessors, ptmmSourceUiFiles, ptmmAffectedIds,
  ptmmDigest as digest, readPtmmBytes as readCurrentPtmmBytes, verifyPtmmQualificationDependencyFiles, verifyPtmmQualificationAmendment, assertPtmmQualificationDependencies,
} from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { verifyVisualPresentationAmendment } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { verifyBrowserAssertionAmendment } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';

const readPtmmBytes = file => readCorrectionHistoricalBytes(file, readCurrentPtmmBytes);

// Synthetic new approval is confined to this in-memory test reader. It never
// creates a report or authorizes the checkout; default readers stay pending.
function fixture() {
  const files = new Map(ptmmRequiredFiles.map(file => [file, readPtmmBytes(file)]));
  const clearance = { format: 'alageum-ptmm-qualification-clearance-v1', status: 'approved-bounded-ptmm-qualification', baselineCommit: ptmmBaselineCommit, baselineTree: ptmmBaselineTree,
    dependencies: { predecessors: { ...ptmmPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) }, reviewReport: ptmmReportPath };
  const report = { format: 'alageum-ptmm-qualification-independent-review-v1', status: clearance.status, baselineCommit: ptmmBaselineCommit, baselineTree: ptmmBaselineTree,
    browserEvidence: { readability: 'cell-and-ancestor-bounds', units: 'rendered-dom', console: 'bounded-per-case-page-events' },
    sourceUiReviewSha256: '4fc8d837f2ceb97dca1cbb6fa66f6490db2de97d9753654fbb0c895e32e23fa3', affectedIds: [...ptmmAffectedIds], dimensionCellsPerMode: 6, otherRecordsUnchanged: 840, rawRecordsPreserved: 843,
    sourceUnitWording: 'В исходной строке единица измерения не указана; обозначение „мм“ требует подтверждения.', separateBrowserCases: 16, existingCatalogCases: 254, existingCatalogJobTimeoutMinutes: 25, existingCatalogStepTimeoutMinutes: 18, qualificationJobTimeoutMinutes: 15, qualificationStepTimeoutMinutes: 6, existingSuiteChanges: 0, thresholdChanges: 0, geometryMaterialChanges: 0, recordChanges: 0, pageChanges: 0 };
  const attest = () => { files.set(ptmmReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)) })));
    clearance.reviewReportSha256 = digest(files.get(ptmmReportPath)); files.set(ptmmClearancePath, Buffer.from(JSON.stringify(clearance))); };
  const read = file => { if (files.has(file)) return files.get(file); assert.ok(![ptmmClearancePath, ptmmReportPath].includes(file), `Missing PTMM amendment ${file}`); return readPtmmBytes(file); };
  attest(); return { files, clearance, report, attest, read };
}
const fullChain = read => {
  verifyPtmmQualificationAmendment(read); verifyVisualPresentationAmendment(read); verifyBrowserAssertionAmendment(read);
  verifyProtectionContextDependencyAmendment(JSON.parse(read(protectionContextClearancePath)), read);
  verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read);
  verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read);
};

test('normal reader keeps the real checkout pending until its independent successor is approved', () => {
  const clearance = JSON.parse(readCurrentPtmmBytes(ptmmClearancePath));
  verifyPtmmQualificationDependencyFiles(clearance);
  if (clearance.status === 'approved-bounded-ptmm-qualification') fullChain(readCurrentPtmmBytes);
  else assert.throws(() => verifyPtmmQualificationAmendment(), /requires independent approval/);
});

test('exact synthetic PTMM successor reaches every inherited layer with the full closure and source/UI freeze', () => {
  const f = fixture(); verifyPtmmQualificationDependencyFiles(f.clearance, f.read); fullChain(f.read);
  assertPtmmQualificationDependencies(ptmmPredecessors, f.read);
  for (const file of Object.keys(ptmmPredecessors)) assert.throws(() => assertPtmmQualificationDependencies({ [file]: 'wrong-prior' }, f.read), /Wrong PTMM predecessor/);
  assert.throws(() => assertPtmmQualificationDependencies({ 'frontend/e2e/catalog.spec.js': 'wrong' }, f.read), /Changed unreviewed PTMM dependency/);
});

test('missing, pending, mismatched and broadened approval cannot pass any current chain', () => {
  for (const missing of [ptmmClearancePath, ptmmReportPath]) { const f = fixture(); f.files.delete(missing); assert.throws(() => fullChain(f.read), /Missing PTMM amendment/); }
  for (const mutate of [
    c => { c.status = 'pending-independent-review'; }, c => { c.baselineCommit = 'wrong'; }, c => { c.baselineTree = 'wrong'; },
    c => { delete c.dependencies.predecessors[Object.keys(ptmmPredecessors)[0]]; }, c => { c.dependencies.predecessors[Object.keys(ptmmPredecessors)[0]] = 'wrong'; },
    c => { c.dependencies.predecessors['frontend/e2e/catalog.spec.js'] = 'wrong'; }, c => { delete c.dependencies.reviewedFiles[ptmmRequiredFiles.at(-1)]; },
    c => { c.dependencies.reviewedFiles['unreviewed-file'] = 'wrong'; }, c => { c.reviewReport = 'unreviewed-report'; },
  ]) { const f = fixture(); mutate(f.clearance); f.attest(); assert.throws(() => fullChain(f.read)); }
  for (const mutate of [r => { r.status = 'pending'; }, r => { r.browserEvidence.console = 'runner-only'; }, r => { r.browserEvidence.units = 'fixture-only'; }, r => { r.affectedIds.push('cat-ptm-tded-v006'); }, r => { r.dimensionCellsPerMode = 8; }, r => { r.rawRecordsPreserved = 842; }, r => { r.sourceUiReviewSha256 = 'wrong'; }, r => { r.sourceUnitWording = 'millimetres'; }, r => { r.separateBrowserCases = 254; }, r => { r.existingCatalogStepTimeoutMinutes = 12; }, r => { r.qualificationStepTimeoutMinutes = 18; }, r => { r.existingSuiteChanges = 1; }, r => { r.thresholdChanges = 1; }, r => { r.geometryMaterialChanges = 1; }, r => { r.recordChanges = 1; }, r => { r.pageChanges = 1; }]) {
    const f = fixture(); mutate(f.report); f.attest(); assert.throws(() => fullChain(f.read));
  }
  const f = fixture(); f.clearance.reviewReportSha256 = 'wrong'; f.files.set(ptmmClearancePath, Buffer.from(JSON.stringify(f.clearance))); assert.throws(() => fullChain(f.read));
});

test('warm verification rejects every changed consumer, test, source, bridge and approval byte', () => {
  const f = fixture(); fullChain(f.read);
  for (const file of [...ptmmRequiredFiles, ptmmReportPath, protectionContextClearancePath]) {
    const before = f.read(file); f.files.set(file, Buffer.concat([before, Buffer.from('\n')]));
    assert.throws(() => fullChain(f.read), undefined, file); f.files.set(file, before); fullChain(f.read);
  }
});

test('old/new source/UI or bridge mixtures and re-attested source edits cannot reuse approval', () => {
  const archive = JSON.parse(readPtmmBytes(`${ptmmReviewDir}/historical-test-bytes.json`));
  for (const file of Object.keys(ptmmPredecessors)) {
    const f = fixture(); f.files.set(file, Buffer.from(archive.files[file].text)); assert.throws(() => fullChain(f.read), undefined, file);
  }
  for (const file of [...Object.keys(ptmmSourceUiFiles), 'frontend/public/catalog-source/page-068.webp', 'frontend/e2e/catalog.spec.js']) {
    const f = fixture(), edited = Buffer.concat([f.read(file), Buffer.from('\n')]);
    f.files.set(file, edited); f.clearance.dependencies.reviewedFiles[file] = digest(edited); f.attest();
    assert.throws(() => fullChain(f.read), undefined, `Re-attested source/scope mutation ${file}`);
  }
});

test('same-size timestamp-restored disk edits are rejected after warm success', () => {
  const f = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ptmm-current-bytes-'));
  try {
    for (const file of ['frontend/lib/catalog/ptmmDimensionQualification.js', 'frontend/e2e/ptmm-qualification.spec.js', 'scripts/catalog/protection-context-reviewed-dependencies.mjs']) {
      const target = path.join(directory, 'protected'), original = f.read(file); fs.writeFileSync(target, original); const stamp = fs.statSync(target);
      const read = candidate => candidate === file ? fs.readFileSync(target) : f.read(candidate); fullChain(read);
      const changed = Buffer.from(original); changed[Math.floor(changed.length / 2)] ^= 1; fs.writeFileSync(target, changed); fs.utimesSync(target, stamp.atime, stamp.mtime);
      assert.equal(fs.statSync(target).size, original.length); assert.throws(() => fullChain(read));
      fs.writeFileSync(target, original); fs.utimesSync(target, stamp.atime, stamp.mtime); fullChain(read);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
