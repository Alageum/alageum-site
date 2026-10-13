import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  jointReviewDir, jointClearancePath, jointReportPath, jointBaselineCommit, jointBaselineTree,
  jointCandidateCommit, jointCandidateTree, jointPredecessors, jointBoundaries,
  jointPriorAuthority, jointCandidateEvidencePath, jointFixedFilesPath,
  jointRequiredFiles, jointDigest as digest, readJointBytes,
  verifyJointDependencyFiles, verifyJointAmendment, assertJointDependencies,
} from '../../scripts/catalog/joint-site-reviewed-dependencies.mjs';
import { verifyCombinedAmendment } from '../../scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs';
import { verifyBackendAmendment } from '../../scripts/catalog/backend-security-reviewed-dependencies.mjs';
import { verifyKtpbAmendment } from '../../scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs';
import { verifySecurityAmendment } from '../../scripts/catalog/frontend-security-reviewed-dependencies.mjs';
import { verifyCorrectionAmendment } from '../../scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs';
import { verifyPtmmQualificationAmendment } from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { verifyVisualPresentationAmendment } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { verifyBrowserAssertionAmendment } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import { protectionContextClearancePath, verifyProtectionContextDependencyAmendment } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
const approved = 'approved-bounded-joint-site';
const required = jointRequiredFiles();
const gates = [
  ['joint', verifyJointAmendment], ['combined', verifyCombinedAmendment], ['backend', verifyBackendAmendment], ['KTPB', verifyKtpbAmendment],
  ['frontend security', verifySecurityAmendment], ['correction', verifyCorrectionAmendment],
  ['qualification', verifyPtmmQualificationAmendment], ['visual', verifyVisualPresentationAmendment],
  ['browser', verifyBrowserAssertionAmendment],
  ['protection', read => verifyProtectionContextDependencyAmendment(JSON.parse(read(protectionContextClearancePath)), read)],
  ['measurement', read => verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)), read)],
  ['source', read => verifySourceAssetDependencyAmendment(JSON.parse(read(sourceAssetClearancePath)), read)],
];
// Real checkout acceptance must exercise the production-owned snapshot path.
// An explicitly supplied default reader intentionally selects legacy semantics.
const omittedReaderGates = [
  ...gates.slice(0, 9).map(([label, verify]) => [label, () => verify()]),
  ['protection', () => verifyProtectionContextDependencyAmendment(JSON.parse(readJointBytes(protectionContextClearancePath)))],
  ['measurement', () => verifyMeasurementColumnDependencyAmendment(JSON.parse(readJointBytes(measurementColumnClearancePath)))],
  ['source', () => verifySourceAssetDependencyAmendment(JSON.parse(readJointBytes(sourceAssetClearancePath)))],
];
// All dependency bytes come from this actual candidate. Synthetic authority is
// confined to a Map or disposable directory, never installed in the checkout.
function fixture() {
  const files = new Map(required.map(file => [file, readJointBytes(file)]));
  const clearance = { format: 'alageum-joint-site-clearance-v1', status: approved,
    baselineCommit: jointBaselineCommit, baselineTree: jointBaselineTree,
    candidateCommit: jointCandidateCommit, candidateTree: jointCandidateTree, priorAuthority: structuredClone(jointPriorAuthority),
    boundaries: { ...jointBoundaries },
    dependencies: { predecessors: { ...jointPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) },
    reviewReport: jointReportPath };
  const report = { format: 'alageum-joint-site-independent-review-v1', status: approved,
    authorityNote: 'Synthetic unit-test authority only. This is not independent candidate or release approval.',
    baselineCommit: jointBaselineCommit, baselineTree: jointBaselineTree,
    candidateCommit: jointCandidateCommit, candidateTree: jointCandidateTree, priorAuthority: structuredClone(jointPriorAuthority),
    boundaries: { ...jointBoundaries }, reviewer: 'Synthetic unit-test fixture', outcome: 'Synthetic pass',
    reviewedVerifierSha256: clearance.dependencies.reviewedFiles['scripts/catalog/joint-site-reviewed-dependencies.mjs'],
    reviewedFixedFilesSha256: clearance.dependencies.reviewedFiles[jointFixedFilesPath] };
  const attest = () => {
    files.set(jointReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)) })));
    clearance.reviewReportSha256 = digest(files.get(jointReportPath));
    files.set(jointClearancePath, Buffer.from(JSON.stringify(clearance)));
  };
  const protectedPaths = new Set([...required, jointClearancePath, jointReportPath]);
  const reads = { calls: 0 };
  const read = file => { reads.calls++; if (files.has(file)) return files.get(file); assert.ok(!protectedPaths.has(file), `Missing joint fixture ${file}`); return readJointBytes(file); };
  attest(); return { files, clearance, report, read, reads, attest };
}

test('exact candidate dependency evidence is separate from independent approval and binds all current bytes', () => {
  const c = JSON.parse(readJointBytes(jointClearancePath)); verifyJointDependencyFiles(c);
  assert.equal(required.length, 775); assert.equal(new Set(required).size, required.length);
  assert.equal(Object.keys(jointPredecessors).length, 16);
  for (const [label, verify] of omittedReaderGates) {
    if (c.status === approved) assert.doesNotThrow(() => verify(), label);
    else { assert.equal(c.status, 'pending-independent-review'); assert.throws(() => verify(), /requires independent approval/, label); }
  }
});

test('synthetic exact successor reaches all twelve gates and rejects pending, missing and forged authority after same-reader success', t => {
  const before = readJointBytes(jointClearancePath), f = fixture();
  for (const [label, verify] of gates) {
    const started = performance.now(), beforeReads = f.reads.calls;
    assert.doesNotThrow(() => verify(f.read), label);
    f.clearance.status = 'pending-independent-review'; f.attest(); assert.throws(() => verify(f.read), /requires independent approval/, label);
    f.clearance.status = approved; f.attest();
    for (const file of [jointClearancePath, jointReportPath]) {
      const before = f.files.get(file); f.files.delete(file); assert.throws(() => verify(f.read), /Missing joint fixture/, label); f.files.set(file, before);
    }
    const original = f.files.get(jointReportPath); f.files.set(jointReportPath, Buffer.from('{}'));
    assert.throws(() => verify(f.read), /Changed independent joint report/, label); f.files.set(jointReportPath, original);
    f.report.approvedDependenciesSha256 = 'forged';
    const forged = { ...JSON.parse(original), approvedDependenciesSha256: 'forged' };
    f.files.set(jointReportPath, Buffer.from(JSON.stringify(forged))); f.clearance.reviewReportSha256 = digest(f.files.get(jointReportPath));
    f.files.set(jointClearancePath, Buffer.from(JSON.stringify(f.clearance)));
    assert.throws(() => verify(f.read), /Changed independently reviewed joint closure/, label); delete f.report.approvedDependenciesSha256; f.attest();
    t.diagnostic(`${label}: explicit same-reader success/refusals ${(performance.now() - started).toFixed(1)} ms, ${f.reads.calls - beforeReads} reader calls`);
  }
  assertJointDependencies(jointPredecessors, f.read);
  for (const file of Object.keys(jointPredecessors)) assert.throws(() => assertJointDependencies({ [file]: 'wrong-prior' }, f.read), /Wrong joint predecessor/);
  assert.throws(() => assertJointDependencies({ 'frontend/package-lock.json': 'wrong-prior' }, f.read), /Changed unreviewed joint dependency/);
  assert.deepEqual(readJointBytes(jointClearancePath), before);
});

test('wrong identities, extra or incomplete closure, and broadened runtime/release scope reject reattestation', () => {
  for (const mutate of [
    f => { f.clearance.priorAuthority.commit = 'wrong'; }, f => { f.clearance.baselineCommit = 'wrong'; }, f => { f.clearance.baselineTree = 'wrong'; },
    f => { f.clearance.candidateCommit = 'wrong'; }, f => { f.clearance.candidateTree = 'wrong'; },
    f => { f.clearance.dependencies.predecessors.extra = 'wrong'; },
    f => { delete f.clearance.dependencies.reviewedFiles[required[0]]; },
    f => { f.clearance.dependencies.reviewedFiles.extra = 'wrong'; },
    f => { f.clearance.boundaries.cryptographicSigning = 'available'; },
    f => { f.clearance.boundaries.egovProvider = 'available'; },
    f => { f.clearance.boundaries.releaseApproval = true; },
    f => { f.clearance.boundaries.catalogSourceUiChanges = 0; },
    f => { f.clearance.boundaries.photographicAssets = 999; },
    f => { f.clearance.boundaries.photoPublicationRights = 'cleared'; },
    f => { f.report.boundaries.securityWaiver = true; },
    f => { f.report.candidateTree = 'wrong'; }, f => { f.report.reviewedVerifierSha256 = 'wrong'; },
    f => { f.report.reviewedFixedFilesSha256 = 'wrong'; }, f => { f.report.reviewer = ''; },
  ]) { const f = fixture(); mutate(f); f.attest(); assert.throws(() => verifyJointAmendment(f.read)); }
});

test('every declared current dependency fails closed on deletion or byte mutation', () => {
  const f = fixture();
  for (const file of required) {
    const bytes = f.files.get(file); f.files.delete(file); assert.throws(() => verifyJointAmendment(f.read), undefined, `missing ${file}`);
    f.files.set(file, Buffer.concat([bytes, Buffer.from('\n')])); assert.throws(() => verifyJointAmendment(f.read), undefined, `changed ${file}`);
    f.files.set(file, bytes);
  }
  verifyJointAmendment(f.read);
});

test('reattestation cannot alter fixed app, tests, evidence, source, RFQ, CMS, coordinator or historical approvals', () => {
  const fixed = JSON.parse(readJointBytes(jointFixedFilesPath));
  const baseline = JSON.parse(readJointBytes(`${jointReviewDir}/baseline-dependencies.json`));
  const immutable = Object.keys(baseline).filter(file => !Object.hasOwn(jointPredecessors, file));
  // Every new/replaced file is fixed, except the verifier whose exact bytes the
  // independent report binds. Every inherited immutable path remains fixed too.
  for (const file of [...Object.keys(fixed), ...immutable]) {
    const f = fixture(); f.files.set(file, Buffer.concat([f.read(file), Buffer.from('\n')]));
    f.clearance.dependencies.reviewedFiles[file] = digest(f.read(file)); f.attest();
    assert.throws(() => verifyJointAmendment(f.read), /Changed immutable prior joint pin|Unreviewed joint replacement|Changed frozen prior joint baseline|Changed immutable prior joint authority/, file);
  }
  for (const [file, historical] of Object.entries(jointPredecessors)) {
    const f = fixture(); f.clearance.dependencies.reviewedFiles[file] = historical; f.attest();
    assert.throws(() => verifyJointAmendment(f.read), /Mixed or unchanged joint successor/, file);
  }
});

test('stale predecessor bytes cannot substitute for the exact current successor, even after warm success', () => {
  const f = fixture(), archive = JSON.parse(readJointBytes(`${jointReviewDir}/historical-test-bytes.json`));
  verifyJointAmendment(f.read);
  for (const [file, entry] of Object.entries(archive.files)) {
    const stale = requested => requested === file ? Buffer.from(entry.text) : f.read(requested);
    assert.throws(() => verifyJointAmendment(stale), /Changed joint-reviewed bytes/, file);
    verifyJointAmendment(f.read);
  }
  const stale = file => Object.hasOwn(archive.files, file) ? Buffer.from(archive.files[file].text) : f.read(file);
  assert.throws(() => verifyJointAmendment(stale), /Changed joint-reviewed bytes/);
});

test('superseded approval cannot authorize corrected bytes and retained prior authority is immutable', () => {
  const f = fixture(), previousPath = jointPriorAuthority.clearancePath, previous = f.read(previousPath);
  const stale = file => file === jointClearancePath ? previous : f.read(file);
  assert.throws(() => verifyJointAmendment(stale));
  assert.deepEqual(JSON.parse(previous).candidateCommit, jointPriorAuthority.applicationCommit);
  for (const [file, expected] of Object.entries(jointPriorAuthority.files)) {
    assert.equal(digest(readJointBytes(file)), expected);
    const bytes = f.files.get(file); f.files.set(file, Buffer.concat([bytes, Buffer.from('\n')]));
    f.clearance.dependencies.reviewedFiles[file] = digest(f.read(file)); f.attest();
    assert.throws(() => verifyJointAmendment(f.read), /Changed immutable prior joint authority|Changed immutable prior joint pin/, file);
    f.files.set(file, bytes); f.clearance.dependencies.reviewedFiles[file] = expected; f.attest();
  }
  verifyJointAmendment(f.read);
});

test('production imports cannot consume historical archive bytes and current tests use actual candidate input', () => {
  const source = readJointBytes('scripts/catalog/joint-site-reviewed-dependencies.mjs').toString();
  for (const line of source.split('\n').filter(line => /^import /.test(line))) assert.doesNotMatch(line, /historical|reviewed-dependencies|\/tests\//);
  for (const file of required.filter(file => file.startsWith('scripts/') && file.endsWith('.mjs'))) {
    assert.doesNotMatch(readJointBytes(file).toString(), /from ['"][^'"]*historical[^'"]*['"]/, file);
  }
  const archive = JSON.parse(readJointBytes(`${jointReviewDir}/historical-test-bytes.json`));
  assert.equal(archive.baseCommit, jointBaselineCommit); assert.equal(archive.baseTree, jointBaselineTree);
  assert.deepEqual(Object.keys(archive.files).sort(), Object.keys(jointPredecessors).sort());
  for (const [file, entry] of Object.entries(archive.files)) {
    assert.equal(digest(Buffer.from(entry.text)), jointPredecessors[file]);
    assert.notEqual(digest(readJointBytes(file)), entry.sha256, file);
  }
});

test('current disk stack finalizes one closure, rejects persistent and mid-invocation tampering, and isolates readers', async () => {
  const f = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-proof-final-'));
  try {
    fs.cpSync(new URL('../../docs/catalog-transformers-2026/review/', import.meta.url), path.join(directory, 'docs/catalog-transformers-2026/review'), { recursive: true });
    for (const [file, bytes] of f.files) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    const modules = {};
    for (const name of ['joint-site', 'combined-eds-auth', 'backend-security', 'ktpb-source-context', 'frontend-security', 'ptmm-browser-correction', 'ptmm-qualification', 'visual-presentation', 'catalog-browser', 'protection-context', 'measurement-column', 'source-asset']) {
      modules[name] = await import(pathToFileURL(path.join(directory, `scripts/catalog/${name}-reviewed-dependencies.mjs`)).href);
    }
    const read = file => fs.readFileSync(path.join(directory, file)), json = file => JSON.parse(read(file));
    const routes = [modules['joint-site'].verifyJointAmendment, modules['combined-eds-auth'].verifyCombinedAmendment, modules['backend-security'].verifyBackendAmendment,
      modules['ktpb-source-context'].verifyKtpbAmendment, modules['frontend-security'].verifySecurityAmendment,
      modules['ptmm-browser-correction'].verifyCorrectionAmendment, modules['ptmm-qualification'].verifyPtmmQualificationAmendment,
      modules['visual-presentation'].verifyVisualPresentationAmendment, modules['catalog-browser'].verifyBrowserAssertionAmendment,
      () => modules['protection-context'].verifyProtectionContextDependencyAmendment(json(protectionContextClearancePath)),
      () => modules['measurement-column'].verifyMeasurementColumnDependencyAmendment(json(measurementColumnClearancePath)),
      () => modules['source-asset'].verifySourceAssetDependencyAmendment(json(sourceAssetClearancePath))];
    for (const verify of routes) verify();
    const original = fs.readFileSync;
    for (const [index, verify] of routes.entries()) {
      const counts = new Map();
      fs.readFileSync = function (file, ...args) { const bytes = original.call(this, file, ...args); if (typeof file === 'string' && file.startsWith(directory + path.sep)) { const relative = path.relative(directory, file); counts.set(relative, (counts.get(relative) || 0) + 1); } return bytes; };
      try { verify(); } finally { fs.readFileSync = original; }
      const outside = index === 9 ? protectionContextClearancePath : index === 10 ? measurementColumnClearancePath : index === 11 ? sourceAssetClearancePath : null;
      assert.equal(counts.size, required.length + 2, `route ${index}`);
      for (const [file, count] of counts) assert.equal(count, 2 + (file === outside ? 1 : 0), `route ${index}/${file}`);
    }
    const targets = ['frontend/components/catalog/Catalog.js', 'frontend/components/catalog/LiveCatalog.js', 'frontend/components/catalog/ProductDetails.js', 'frontend/public/photography/equipment/tm-series.webp', 'frontend/app/site-shell.css', 'backend-node/config/middlewares.js', 'backend-node/src/domain/auth.js', 'frontend/lib/api/sessionTransport.js',
      'backend-node/src/domain/document-signing.js', 'backend-node/src/domain/google-oidc.js',
      'scripts/catalog/joint-site-reviewed-dependencies.mjs', 'scripts/catalog/proof-invocation.mjs',
      jointCandidateEvidencePath, jointFixedFilesPath, jointClearancePath, jointReportPath];
    for (const file of targets) {
      const target = path.join(directory, file), before = read(file), stat = fs.statSync(target), changed = Buffer.from(before); changed[0] ^= 1;
      fs.writeFileSync(target, changed); fs.utimesSync(target, stat.atime, stat.mtime);
      for (const verify of routes) assert.throws(() => verify(), undefined, file);
      // A successful explicit reader cannot warm authority for a different reader.
      routes[0](f.read); assert.throws(() => routes[0](), undefined, file);
      fs.writeFileSync(target, before); fs.utimesSync(target, stat.atime, stat.mtime);
      let seen = 0;
      fs.readFileSync = function (name, ...args) { const bytes = original.call(this, name, ...args); if (name === target && ++seen === 1) fs.writeFileSync(target, changed); return bytes; };
      try { assert.throws(() => routes[0](), /Changed proof input during invocation/, file); }
      finally { fs.readFileSync = original; fs.writeFileSync(target, before); }
      assert.equal(seen, 2, file);
    }
    for (const file of ['frontend/public/photography/equipment/tm-series.webp', 'backend-node/src/domain/auth.js', jointClearancePath, jointReportPath]) {
      const target = path.join(directory, file), before = read(file), changed = Buffer.from(before); changed[0] ^= 1;
      for (const verify of routes) {
        let seen = 0;
        fs.readFileSync = function (name, ...args) { const bytes = original.call(this, name, ...args); if (name === target && ++seen === 1) fs.writeFileSync(target, changed); return bytes; };
        try { assert.throws(() => verify(), /Changed proof input during invocation/, file); }
        finally { fs.readFileSync = original; fs.writeFileSync(target, before); }
        assert.equal(seen, 2, file);
      }
    }
    const before = read(jointClearancePath), pending = JSON.parse(before); pending.status = 'pending-independent-review'; fs.writeFileSync(path.join(directory, jointClearancePath), JSON.stringify(pending));
    for (const verify of routes) assert.throws(() => verify(), /requires independent approval/);
    fs.writeFileSync(path.join(directory, jointClearancePath), before); for (const verify of routes) verify();
    for (const [name, value] of Object.entries(modules['joint-site'])) if (name.startsWith('internal') && typeof value === 'function') assert.throws(() => value({}), /Invalid or closed proof invocation context/, name);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
