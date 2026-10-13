import { readJointHistoricalBytes } from './helpers/joint-site-historical-bytes.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  combinedReviewDir, combinedClearancePath, combinedReportPath, combinedBaselineCommit, combinedBaselineTree,
  combinedCandidateCommit, combinedCandidateTree, combinedPredecessors, combinedBoundaries,
  combinedPriorAuthority, combinedCandidateEvidencePath, combinedFixedFilesPath,
  combinedRequiredFiles, combinedDigest as digest, readCombinedBytes as readCurrentCombinedBytes,
  verifyCombinedDependencyFiles, verifyCombinedAmendment, assertCombinedDependencies,
} from '../../scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs';
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
// Historical performance controls use exact predecessor bytes. New raw-current coverage is in joint-site-amendment.test.mjs.
const readCombinedBytes = file => readJointHistoricalBytes(file, readCurrentCombinedBytes);
const approved = 'approved-bounded-combined-eds-auth';
const required = combinedRequiredFiles();
const gates = [
  ['combined', verifyCombinedAmendment], ['backend', verifyBackendAmendment], ['KTPB', verifyKtpbAmendment],
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
  ...gates.slice(0, 8).map(([label, verify]) => [label, () => verify()]),
  ['protection', () => verifyProtectionContextDependencyAmendment(JSON.parse(readCombinedBytes(protectionContextClearancePath)))],
  ['measurement', () => verifyMeasurementColumnDependencyAmendment(JSON.parse(readCombinedBytes(measurementColumnClearancePath)))],
  ['source', () => verifySourceAssetDependencyAmendment(JSON.parse(readCombinedBytes(sourceAssetClearancePath)))],
];
// Historical combined controls use the pinned immediate predecessor. Synthetic authority is
// confined to a Map or disposable directory, never installed in the checkout.
function fixture() {
  const files = new Map(required.map(file => [file, readCombinedBytes(file)]));
  const clearance = { format: 'alageum-combined-eds-auth-clearance-v1', status: approved,
    baselineCommit: combinedBaselineCommit, baselineTree: combinedBaselineTree,
    candidateCommit: combinedCandidateCommit, candidateTree: combinedCandidateTree, priorAuthority: structuredClone(combinedPriorAuthority),
    boundaries: { ...combinedBoundaries },
    dependencies: { predecessors: { ...combinedPredecessors }, reviewedFiles: Object.fromEntries([...files].map(([file, bytes]) => [file, digest(bytes)])) },
    reviewReport: combinedReportPath };
  const report = { format: 'alageum-combined-eds-auth-independent-review-v1', status: approved,
    authorityNote: 'Synthetic unit-test authority only. This is not independent candidate or release approval.',
    baselineCommit: combinedBaselineCommit, baselineTree: combinedBaselineTree,
    candidateCommit: combinedCandidateCommit, candidateTree: combinedCandidateTree, priorAuthority: structuredClone(combinedPriorAuthority),
    boundaries: { ...combinedBoundaries }, reviewer: 'Synthetic unit-test fixture', outcome: 'Synthetic pass',
    reviewedVerifierSha256: clearance.dependencies.reviewedFiles['scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs'],
    reviewedFixedFilesSha256: clearance.dependencies.reviewedFiles[combinedFixedFilesPath] };
  const attest = () => {
    files.set(combinedReportPath, Buffer.from(JSON.stringify({ ...report, approvedDependenciesSha256: digest(JSON.stringify(clearance.dependencies)) })));
    clearance.reviewReportSha256 = digest(files.get(combinedReportPath));
    files.set(combinedClearancePath, Buffer.from(JSON.stringify(clearance)));
  };
  const protectedPaths = new Set([...required, combinedClearancePath, combinedReportPath]);
  const read = file => { if (files.has(file)) return files.get(file); assert.ok(!protectedPaths.has(file), `Missing combined fixture ${file}`); return readCombinedBytes(file); };
  attest(); return { files, clearance, report, read, attest };
}

test('historical combined authority remains separately valid and default gates require current joint approval', () => {
  const c = JSON.parse(readCombinedBytes(combinedClearancePath)); verifyCombinedDependencyFiles(c);
  assert.equal(required.length, 678); assert.equal(new Set(required).size, required.length);
  assert.equal(Object.keys(combinedPredecessors).length, 12);
  for (const [label, verify] of omittedReaderGates) {
    if (c.status === approved) assert.doesNotThrow(() => verify(), label);
    else { assert.equal(c.status, 'pending-independent-review'); assert.throws(() => verify(), /requires independent approval/, label); }
  }
});

test('synthetic exact successor reaches all eleven gates and rejects pending, missing and forged authority after same-reader success', () => {
  const before = readCombinedBytes(combinedClearancePath), f = fixture();
  for (const [label, verify] of gates) {
    assert.doesNotThrow(() => verify(f.read), label);
    f.clearance.status = 'pending-independent-review'; f.attest(); assert.throws(() => verify(f.read), /requires independent approval/, label);
    f.clearance.status = approved; f.attest();
    for (const file of [combinedClearancePath, combinedReportPath]) {
      const before = f.files.get(file); f.files.delete(file); assert.throws(() => verify(f.read), /Missing combined fixture/, label); f.files.set(file, before);
    }
    const original = f.files.get(combinedReportPath); f.files.set(combinedReportPath, Buffer.from('{}'));
    assert.throws(() => verify(f.read), /Changed independent combined report/, label); f.files.set(combinedReportPath, original);
    f.report.approvedDependenciesSha256 = 'forged';
    const forged = { ...JSON.parse(original), approvedDependenciesSha256: 'forged' };
    f.files.set(combinedReportPath, Buffer.from(JSON.stringify(forged))); f.clearance.reviewReportSha256 = digest(f.files.get(combinedReportPath));
    f.files.set(combinedClearancePath, Buffer.from(JSON.stringify(f.clearance)));
    assert.throws(() => verify(f.read), /Changed independently reviewed combined closure/, label); delete f.report.approvedDependenciesSha256; f.attest();
  }
  assertCombinedDependencies(combinedPredecessors, f.read);
  for (const file of Object.keys(combinedPredecessors)) assert.throws(() => assertCombinedDependencies({ [file]: 'wrong-prior' }, f.read), /Wrong combined predecessor/);
  assert.throws(() => assertCombinedDependencies({ 'frontend/package-lock.json': 'wrong-prior' }, f.read), /Changed unreviewed combined dependency/);
  assert.deepEqual(readCombinedBytes(combinedClearancePath), before);
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
    f => { f.report.boundaries.securityWaiver = true; },
    f => { f.report.candidateTree = 'wrong'; }, f => { f.report.reviewedVerifierSha256 = 'wrong'; },
    f => { f.report.reviewedFixedFilesSha256 = 'wrong'; }, f => { f.report.reviewer = ''; },
  ]) { const f = fixture(); mutate(f); f.attest(); assert.throws(() => verifyCombinedAmendment(f.read)); }
});

test('every declared current dependency fails closed on deletion or byte mutation', () => {
  const f = fixture();
  for (const file of required) {
    const bytes = f.files.get(file); f.files.delete(file); assert.throws(() => verifyCombinedAmendment(f.read), undefined, `missing ${file}`);
    f.files.set(file, Buffer.concat([bytes, Buffer.from('\n')])); assert.throws(() => verifyCombinedAmendment(f.read), undefined, `changed ${file}`);
    f.files.set(file, bytes);
  }
  verifyCombinedAmendment(f.read);
});

test('reattestation cannot alter fixed app, tests, evidence, source, RFQ, CMS, coordinator or historical approvals', () => {
  const fixed = JSON.parse(readCombinedBytes(combinedFixedFilesPath));
  const baseline = JSON.parse(readCombinedBytes(`${combinedReviewDir}/baseline-dependencies.json`));
  const immutable = Object.keys(baseline).filter(file => !Object.hasOwn(combinedPredecessors, file));
  // Every new/replaced file is fixed, except the verifier whose exact bytes the
  // independent report binds. Every inherited immutable path remains fixed too.
  for (const file of [...Object.keys(fixed), ...immutable]) {
    const f = fixture(); f.files.set(file, Buffer.concat([f.read(file), Buffer.from('\n')]));
    f.clearance.dependencies.reviewedFiles[file] = digest(f.read(file)); f.attest();
    assert.throws(() => verifyCombinedAmendment(f.read), /Changed immutable PR45 combined pin|Unreviewed combined replacement|Changed frozen PR45 combined baseline|Changed immutable prior combined authority/, file);
  }
  for (const [file, historical] of Object.entries(combinedPredecessors)) {
    const f = fixture(); f.clearance.dependencies.reviewedFiles[file] = historical; f.attest();
    assert.throws(() => verifyCombinedAmendment(f.read), /Mixed or unchanged combined successor/, file);
  }
});

test('stale predecessor bytes cannot substitute for the exact current successor, even after warm success', () => {
  const f = fixture(), archive = JSON.parse(readCombinedBytes(`${combinedReviewDir}/historical-test-bytes.json`));
  verifyCombinedAmendment(f.read);
  for (const [file, entry] of Object.entries(archive.files)) {
    const stale = requested => requested === file ? Buffer.from(entry.text) : f.read(requested);
    assert.throws(() => verifyCombinedAmendment(stale), /Changed combined-reviewed bytes|Changed unreviewed joint dependency|Changed joint-reviewed bytes|Joint site integration amendment requires independent approval/, file);
    verifyCombinedAmendment(f.read);
  }
  const stale = file => Object.hasOwn(archive.files, file) ? Buffer.from(archive.files[file].text) : f.read(file);
  assert.throws(() => verifyCombinedAmendment(stale), /Changed combined-reviewed bytes|Changed unreviewed joint dependency|Changed joint-reviewed bytes|Joint site integration amendment requires independent approval/);
});

test('superseded approval cannot authorize corrected bytes and retained prior authority is immutable', () => {
  const f = fixture(), previousPath = combinedPriorAuthority.clearancePath, previous = f.read(previousPath);
  const stale = file => file === combinedClearancePath ? previous : f.read(file);
  assert.throws(() => verifyCombinedAmendment(stale));
  assert.deepEqual(JSON.parse(previous).candidateCommit, combinedPriorAuthority.applicationCommit);
  for (const [file, expected] of Object.entries(combinedPriorAuthority.files)) {
    assert.equal(digest(readCombinedBytes(file)), expected);
    const bytes = f.files.get(file); f.files.set(file, Buffer.concat([bytes, Buffer.from('\n')]));
    f.clearance.dependencies.reviewedFiles[file] = digest(f.read(file)); f.attest();
    assert.throws(() => verifyCombinedAmendment(f.read), /Changed immutable prior combined authority/, file);
    f.files.set(file, bytes); f.clearance.dependencies.reviewedFiles[file] = expected; f.attest();
  }
  verifyCombinedAmendment(f.read);
});

test('production imports cannot consume historical archive bytes and current tests use actual candidate input', () => {
  const source = readCombinedBytes('scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs').toString();
  for (const line of source.split('\n').filter(line => /^import /.test(line))) assert.doesNotMatch(line, /historical|reviewed-dependencies|\/tests\//);
  for (const file of required.filter(file => file.startsWith('scripts/') && file.endsWith('.mjs'))) {
    assert.doesNotMatch(readCombinedBytes(file).toString(), /from ['"][^'"]*historical[^'"]*['"]/, file);
  }
  const archive = JSON.parse(readCombinedBytes(`${combinedReviewDir}/historical-test-bytes.json`));
  assert.equal(archive.baseCommit, combinedBaselineCommit); assert.equal(archive.baseTree, combinedBaselineTree);
  assert.deepEqual(Object.keys(archive.files).sort(), Object.keys(combinedPredecessors).sort());
  for (const [file, entry] of Object.entries(archive.files)) {
    assert.equal(digest(Buffer.from(entry.text)), combinedPredecessors[file]);
    assert.notEqual(digest(readCombinedBytes(file)), entry.sha256, file);
  }
});

test('current disk stack finalizes one closure, rejects persistent and mid-invocation tampering, and isolates readers', async () => {
  const f = fixture(), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'combined-proof-final-'));
  try {
    fs.cpSync(new URL('../../docs/catalog-transformers-2026/review/', import.meta.url), path.join(directory, 'docs/catalog-transformers-2026/review'), { recursive: true });
    for (const [file, bytes] of f.files) { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes); }
    const modules = {};
    for (const name of ['combined-eds-auth', 'backend-security', 'ktpb-source-context', 'frontend-security', 'ptmm-browser-correction', 'ptmm-qualification', 'visual-presentation', 'catalog-browser', 'protection-context', 'measurement-column', 'source-asset']) {
      modules[name] = await import(pathToFileURL(path.join(directory, `scripts/catalog/${name}-reviewed-dependencies.mjs`)).href);
    }
    const read = file => fs.readFileSync(path.join(directory, file)), json = file => JSON.parse(read(file));
    const routes = [modules['combined-eds-auth'].verifyCombinedAmendment, modules['backend-security'].verifyBackendAmendment,
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
      const outside = index === 8 ? protectionContextClearancePath : index === 9 ? measurementColumnClearancePath : index === 10 ? sourceAssetClearancePath : null;
      assert.equal(counts.size, required.length + 2, `route ${index}`);
      for (const [file, count] of counts) assert.equal(count, 2 + (file === outside ? 1 : 0), `route ${index}/${file}`);
    }
    const targets = ['backend-node/config/middlewares.js', 'backend-node/src/domain/auth.js', 'frontend/lib/api/sessionTransport.js',
      'backend-node/src/domain/document-signing.js', 'backend-node/src/domain/google-oidc.js',
      'scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs', 'scripts/catalog/proof-invocation.mjs',
      combinedCandidateEvidencePath, combinedFixedFilesPath, combinedClearancePath, combinedReportPath];
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
    for (const file of ['backend-node/src/domain/auth.js', combinedClearancePath, combinedReportPath]) {
      const target = path.join(directory, file), before = read(file), changed = Buffer.from(before); changed[0] ^= 1;
      for (const verify of routes) {
        let seen = 0;
        fs.readFileSync = function (name, ...args) { const bytes = original.call(this, name, ...args); if (name === target && ++seen === 1) fs.writeFileSync(target, changed); return bytes; };
        try { assert.throws(() => verify(), /Changed proof input during invocation/, file); }
        finally { fs.readFileSync = original; fs.writeFileSync(target, before); }
        assert.equal(seen, 2, file);
      }
    }
    const before = read(combinedClearancePath), pending = JSON.parse(before); pending.status = 'pending-independent-review'; fs.writeFileSync(path.join(directory, combinedClearancePath), JSON.stringify(pending));
    for (const verify of routes) assert.throws(() => verify(), /requires independent approval/);
    fs.writeFileSync(path.join(directory, combinedClearancePath), before); for (const verify of routes) verify();
    for (const [name, value] of Object.entries(modules['combined-eds-auth'])) if (name.startsWith('internal') && typeof value === 'function') assert.throws(() => value({}), /Invalid or closed proof invocation context/, name);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
