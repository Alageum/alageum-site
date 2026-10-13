import { readPtmmHistoricalBytes } from './helpers/ptmm-qualification-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { visualBaselineCommit, visualBaselineTree, visualClearancePath, visualReportPath, visualRequiredFiles,
  visualPredecessors, visualDigest as digest, readVisualBytes as readCurrentVisualBytes, verifyVisualPresentationAmendment, assertVisualPresentationDependencies,
} from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';

const readVisualBytes = file => readPtmmHistoricalBytes(file, readCurrentVisualBytes);

// Only this in-memory reader receives synthetic new approval. Historical
// approvals and every ordinary dependency are their real checkout bytes.
function fixture() {
  const files = new Map(visualRequiredFiles.map(file => [file, readVisualBytes(file)]));
  const clearance = { format: 'alageum-visual-presentation-clearance-v1', status: 'approved-bounded-visual-presentation', baselineCommit: visualBaselineCommit, baselineTree: visualBaselineTree,
    dependencies: { predecessors: { ...visualPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) }, reviewReport: visualReportPath };
  const report = { format: 'alageum-visual-presentation-independent-review-v1', status: clearance.status, baselineCommit: visualBaselineCommit, baselineTree: visualBaselineTree,
    modelTypes: ['source69-ptm-u1-example', 'source69-tde9-u3-example'], exposure: { reviewedTypes: 1, otherTypes: 1.45 },
    sourceImageMaxHeight: 'min(39rem, max(1rem, calc(100svh - 96px - 3rem)))', hostedCaseCount: 254, thresholdChanges: 0, geometryMaterialChanges: 0, recordChanges: 0, pageChanges: 0 };
  const attest = () => {
    files.set(visualReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)) })));
    clearance.reviewReportSha256 = digest(files.get(visualReportPath)); files.set(visualClearancePath, Buffer.from(JSON.stringify(clearance)));
  };
  const read = file => { if (files.has(file)) return files.get(file); assert.ok(![visualClearancePath, visualReportPath].includes(file), `Missing visual amendment ${file}`); return readVisualBytes(file); };
  attest(); return { files, clearance, report, read, attest };
}
const runtimeFiles = ['frontend/components/catalog/models/createEquipmentViewer.js', 'frontend/components/catalog/source-context/CatalogSourceContext.module.css'];
const protection = JSON.parse(readVisualBytes(protectionContextClearancePath));
const verify = read => verifyProtectionContextDependencyAmendment(protection, read);

test('exact current presentation succeeds through all inherited approval layers and binds prior hashes', () => {
  const { read } = fixture(); verifyVisualPresentationAmendment(read); verify(read);
  verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read);
  verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read);
  assertVisualPresentationDependencies(visualPredecessors, read);
  for (const file of Object.keys(visualPredecessors)) assert.throws(() => assertVisualPresentationDependencies({ [file]: 'wrong-prior' }, read), /Wrong visual presentation predecessor/);
  assert.throws(() => assertVisualPresentationDependencies({ 'frontend/e2e/catalog.spec.js': 'wrong' }, read), /Changed unreviewed/);
});

test('missing, pending, mismatched or widened presentation approval cannot pass the historical gate', () => {
  for (const missing of [visualClearancePath, visualReportPath]) { const f = fixture(); f.files.delete(missing); assert.throws(() => verify(f.read), /Missing visual amendment/); }
  for (const mutate of [
    c => { c.status = 'pending-independent-review'; }, c => { c.baselineCommit = 'wrong'; }, c => { c.baselineTree = 'wrong'; },
    c => { delete c.dependencies.predecessors[Object.keys(visualPredecessors)[0]]; }, c => { c.dependencies.predecessors[Object.keys(visualPredecessors)[0]] = 'wrong'; },
    c => { c.dependencies.predecessors['frontend/e2e/catalog.spec.js'] = 'wrong'; }, c => { delete c.dependencies.reviewedFiles[visualRequiredFiles.at(-1)]; },
    c => { c.dependencies.reviewedFiles['frontend/e2e/catalog.spec.js'] = digest(readVisualBytes('frontend/e2e/catalog.spec.js')); },
    c => { c.dependencies.reviewedFiles[Object.keys(visualPredecessors)[0]] = 'wrong'; },
  ]) { const f = fixture(); mutate(f.clearance); f.attest(); assert.throws(() => verify(f.read)); }
  for (const mutate of [r => { r.status = 'pending'; }, r => { r.modelTypes.push('protection-cabinet'); }, r => { r.exposure.otherTypes = 1; }, r => { r.hostedCaseCount = 252; }, r => { r.thresholdChanges = 1; }, r => { r.geometryMaterialChanges = 1; }, r => { r.recordChanges = 1; }, r => { r.pageChanges = 1; }]) {
    const f = fixture(); mutate(f.report); f.attest(); assert.throws(() => verify(f.read));
  }
  const f = fixture(); f.clearance.reviewReportSha256 = 'wrong'; f.files.set(visualClearancePath, Buffer.from(JSON.stringify(f.clearance))); assert.throws(() => verify(f.read));
});

test('warm gate rejects dependency/source/threshold mutations and mixed old/new runtime bytes, then accepts restoration', () => {
  const f = fixture();
  const paths = [...visualRequiredFiles, visualReportPath, 'frontend/e2e/catalog.spec.js', 'frontend/lib/catalog/models/protectionExampleGeometry.js', 'frontend/lib/catalog/models/protectionExampleTypes.js',
    'frontend/public/catalog-source-context/source-tde.png', 'frontend/next.config.mjs', protectionContextClearancePath, protection.reviewReport,
    'docs/catalog-transformers-2026/review/catalog-browser-assertions/clearance.json'];
  for (const file of paths) { verify(f.read); const original = f.read(file); f.files.set(file, Buffer.concat([original, Buffer.from('\n')])); assert.throws(() => verify(f.read), undefined, file); f.files.set(file, original); verify(f.read); }
  const archive = JSON.parse(readVisualBytes('docs/catalog-transformers-2026/review/catalog-visual-presentation/historical-test-bytes.json'));
  const runtime = runtimeFiles;
  for (const subset of [[runtime[0]], [runtime[1]], runtime]) {
    const f = fixture(); subset.forEach(file => f.files.set(file, Buffer.from(archive.files[file].text))); assert.throws(() => verify(f.read));
  }
  for (const file of runtime.concat('docs/catalog-transformers-2026/review/catalog-visual-presentation/historical-test-bytes.json')) {
    const updated = fixture(), bytes = Buffer.concat([updated.read(file), Buffer.from('\n')]);
    updated.files.set(file, bytes); updated.clearance.dependencies.reviewedFiles[file] = digest(bytes); updated.attest();
    assert.throws(() => verify(updated.read), undefined, `Re-attested changed bytes: ${file}`);
  }
  const file = 'frontend/e2e/catalog.spec.js', old = f.read(file), changed = old.toString().replace('minimumInkRatio = 0.01', 'minimumInkRatio = 0.00');
  assert.notEqual(changed, old.toString()); f.files.set(file, Buffer.from(changed)); assert.throws(() => verify(f.read));
});

test('current disk bytes are rechecked after a same-size timestamp-restored mutation', () => {
  const f = fixture(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-byte-freshness-'));
  try {
    for (const file of runtimeFiles) {
      const target = path.join(dir, 'protected'), original = f.read(file); fs.writeFileSync(target, original); const stamp = fs.statSync(target);
      const read = candidate => candidate === file ? fs.readFileSync(target) : f.read(candidate); verify(read);
      const changed = Buffer.from(original); changed[Math.floor(changed.length / 2)] ^= 1; fs.writeFileSync(target, changed); fs.utimesSync(target, stamp.atime, stamp.mtime);
      assert.equal(fs.statSync(target).size, original.length); assert.throws(() => verify(read));
      fs.writeFileSync(target, original); fs.utimesSync(target, stamp.atime, stamp.mtime); verify(read);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
