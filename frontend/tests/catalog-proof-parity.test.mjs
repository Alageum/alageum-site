import { readBackendHistoricalBytes } from './helpers/backend-security-historical-bytes.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ktpbReviewDir, ktpbClearancePath, ktpbReportPath, ktpbPerformanceReviewPath,
  ktpbBaselineCommit, ktpbBaselineTree, ktpbPerformanceImplementationFiles,
  ktpbPerformanceTestFiles, ktpbPerformanceObservationContract, ktpbPredecessors,
  ktpbRequiredFiles, ktpbDigest as digest, readKtpbBytes as readCurrentKtpbBytes,
} from '../../scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs';

// Synthetic approval exists only in this isolated test filesystem. It exercises
// optimized default readers; it is not an independent candidate/release review.
// Historical KTPB controls use exact PR44 bytes; backend successor coverage
// verifies the current raw-byte chain in its own amendment tests.
const readKtpbBytes = file => readBackendHistoricalBytes(file, readCurrentKtpbBytes);
const approved = 'approved-bounded-ktpb-source-context';
const required = ktpbRequiredFiles();
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

let directory, f, modules, routes;
const read = file => fs.readFileSync(path.join(directory, file));
const json = file => JSON.parse(read(file));
before(async () => {
  f = fixture(); directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-proof-parity-'));
  fs.cpSync(new URL('../../docs/catalog-transformers-2026/review/', import.meta.url), path.join(directory, 'docs/catalog-transformers-2026/review'), { recursive: true });
  for (const [file, bytes] of f.files) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  }
  // Current catalog readers import the editorial adapter. Copy its runtime
  // inputs without adding synthetic authority or changing any reviewed hash.
  // The existing verifier still decides whether those current bytes are valid.
  for (const file of ['frontend/lib/catalog/catalogEditorial.js', 'frontend/lib/catalog/catalogEditorialOverlay.json']) {
    fs.copyFileSync(new URL(`../../${file}`, import.meta.url), path.join(directory, file));
  }
  modules = {};
  for (const name of ['ktpb-source-context', 'frontend-security', 'ptmm-browser-correction', 'ptmm-qualification',
    'visual-presentation', 'catalog-browser', 'protection-context', 'measurement-column', 'source-asset', 'transformer']) {
    modules[name] = await import(pathToFileURL(path.join(directory, `scripts/catalog/${name}-reviewed-dependencies.mjs`)).href);
  }
  modules.ntmi = await import(pathToFileURL(path.join(directory, 'scripts/check-ntmi-source-previews.mjs')).href);
  modules.invocation = await import(pathToFileURL(path.join(directory, 'scripts/catalog/proof-invocation.mjs')).href);
  routes = [
    ['KTPB', modules['ktpb-source-context'].verifyKtpbAmendment],
    ['security', modules['frontend-security'].verifySecurityAmendment],
    ['correction', modules['ptmm-browser-correction'].verifyCorrectionAmendment],
    ['PTMM', modules['ptmm-qualification'].verifyPtmmQualificationAmendment],
    ['visual', modules['visual-presentation'].verifyVisualPresentationAmendment],
    ['browser', modules['catalog-browser'].verifyBrowserAssertionAmendment],
    ...[
      ['protection', 'protection-context', 'protectionContextClearancePath', 'verifyProtectionContextDependencyAmendment'],
      ['measurement', 'measurement-column', 'measurementColumnClearancePath', 'verifyMeasurementColumnDependencyAmendment'],
      ['source', 'source-asset', 'sourceAssetClearancePath', 'verifySourceAssetDependencyAmendment'],
    ].map(([label, module, clearancePath, verify]) => [label, function (reader) {
      const clearance = json(modules[module][clearancePath]);
      return arguments.length ? modules[module][verify](clearance, reader) : modules[module][verify](clearance);
    }]),
  ];
});
after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

function observe(run) {
  const original = fs.readFileSync, calls = [], lengths = new Map();
  fs.readFileSync = function (file, ...args) {
    const value = original.call(this, file, ...args);
    const filename = typeof file === 'string' ? file : file instanceof URL ? file.pathname : '';
    if (filename.startsWith(directory + path.sep)) {
      const relative = path.relative(directory, filename); calls.push(relative);
      lengths.set(relative, Buffer.byteLength(value));
    }
    return value;
  };
  try { return { result: run(), calls, lengths }; } finally { fs.readFileSync = original; }
}
const verdict = run => { try { return { accepted: true, value: run() }; } catch (error) { return { accepted: false, name: error.name, code: error.code }; } };
function mutate(file, bytes, run) {
  const target = path.join(directory, file), previous = fs.readFileSync(target);
  try { if (bytes === null) fs.unlinkSync(target); else fs.writeFileSync(target, bytes); return run(); }
  finally { fs.writeFileSync(target, previous); }
}

test('all nine same-admission disk routes match the explicit uncached reader and final-read their complete closure', () => {
  for (const [label, verify] of routes) {
    const optimized = observe(() => verify());
    const uncached = observe(() => verify(read));
    assert.deepEqual(optimized.result, uncached.result, label);
    const counts = new Map(); for (const file of optimized.calls) counts.set(file, (counts.get(file) || 0) + 1);
    // Three supplied-clearance routes read their top input outside the owner.
    const outside = label === 'source' ? modules['source-asset'].sourceAssetClearancePath
      : label === 'measurement' ? modules['measurement-column'].measurementColumnClearancePath
      : label === 'protection' ? modules['protection-context'].protectionContextClearancePath : null;
    for (const [file, count] of counts) assert.equal(count, 2 + (file === outside ? 1 : 0), `${label}/${file}`);
    assert.ok(counts.has(ktpbPerformanceReviewPath), label);
    assert.ok(counts.has(`${ktpbReviewDir}/baseline-dependencies.json`), label);
    if (label === 'source') assert.ok(uncached.calls.length > optimized.calls.length, label);
  }
});

test('stable corruption, deletion and pending authority reject identically after previous success', () => {
  const ktpb = modules['ktpb-source-context'];
  for (const file of [ktpbReportPath, ktpbPerformanceReviewPath, `${ktpbReviewDir}/baseline-dependencies.json`,
    'scripts/catalog/proof-invocation.mjs', 'frontend/public/catalog-source/page-056.webp']) {
    ktpb.verifyKtpbAmendment();
    for (const changed of [null, Buffer.concat([read(file), Buffer.from('x')])]) mutate(file, changed, () => {
      const a = verdict(() => ktpb.verifyKtpbAmendment());
      const b = verdict(() => ktpb.verifyKtpbAmendment(read));
      assert.equal(a.accepted, false, file); assert.deepEqual(a, b, file);
    });
    ktpb.verifyKtpbAmendment();
  }
  const pending = { ...json(ktpbClearancePath), status: 'pending-independent-review' };
  mutate(ktpbClearancePath, Buffer.from(JSON.stringify(pending)), () => {
    for (const [label, verify] of routes) {
      const a = verdict(() => verify()), b = verdict(() => verify(read));
      assert.equal(a.accepted, false, label); assert.deepEqual(a, b, label);
    }
  });
});

test('every consumed proof input is freshly reread after successful evaluation, including scope-only and cached inputs', () => {
  const verify = modules['ktpb-source-context'].verifyKtpbAmendment;
  const baseline = observe(() => verify());
  const targets = [...new Set(baseline.calls)];
  // Persistently mutate each target immediately after its first raw read. The
  // snapshot predicates see captured bytes; the final pass must see corruption.
  for (const target of targets) {
    const original = fs.readFileSync, absolute = path.join(directory, target);
    const unchanged = original(absolute); let seen = 0;
    fs.readFileSync = function (file, ...args) {
      const value = original.call(this, file, ...args);
      if (file === absolute && ++seen === 1) {
        const changed = Buffer.from(value); changed[0] ^= 1; fs.writeFileSync(absolute, changed);
      }
      return value;
    };
    try { assert.throws(() => verify(), /Changed proof input during invocation/, target); }
    finally { fs.readFileSync = original; fs.writeFileSync(absolute, unchanged); }
    assert.equal(seen, 2, target);
  }
});

test('historical bulk preserves aliases, duplicates, per-edge expectations and raw hashes', () => {
  const source = modules['source-asset'], ktpb = modules['ktpb-source-context'];
  const stable = 'frontend/public/catalog-source/page-056.webp';
  const files = [stable, './' + stable, stable, 'scripts/check-ntmi-source-previews.mjs'];
  assert.throws(() => source.historicalDependencyHash(''), /Invalid protection\/context review path/);
  assert.throws(() => source.historicalDependencyHashes(['']), /Invalid protection\/context review path/);
  const result = source.historicalDependencyHashes(files);
  assert.deepEqual(result.map(entry => entry.file), files);
  assert.equal(result[0].hash, result[1].hash); assert.deepEqual(result[0], result[2]);
  for (const { file, hash } of result) assert.equal(source.historicalDependencyHash(file), hash);
  assert.equal(source.rawFileHash('scripts/check-ntmi-source-previews.mjs'), digest(read('scripts/check-ntmi-source-previews.mjs')));
  for (const value of [new Array(1), new Proxy([], {}), Object.assign([], { extra: true }), [42], Array(1025).fill(stable),
    Object.defineProperty([], '0', { get() { throw Error('accessor must not execute'); } })]) {
    assert.throws(() => source.historicalDependencyHashes(value), /Invalid historical path list/);
  }
  const file = Object.keys(ktpbPredecessors)[0];
  ktpb.assertKtpbDependencies({ [file]: ktpbPredecessors[file] });
  assert.throws(() => ktpb.assertKtpbDependencies({ [file]: 'different-predecessor' }), /Wrong KTPB predecessor/);
  ktpb.assertKtpbDependencies({ [file]: ktpbPredecessors[file] });
});

test('public supplied readers including explicit defaults and undefined never join the snapshot path', () => {
  const ktpb = modules['ktpb-source-context'];
  const defaultTrace = observe(() => ktpb.verifyKtpbAmendment());
  const explicit = observe(() => ktpb.verifyKtpbAmendment(ktpb.readKtpbBytes));
  const undefinedTrace = observe(() => ktpb.verifyKtpbAmendment(undefined));
  const supplied = observe(() => ktpb.verifyKtpbAmendment(read));
  assert.deepEqual(explicit.calls, supplied.calls); assert.deepEqual(undefinedTrace.calls, supplied.calls);
  assert.notDeepEqual(defaultTrace.calls, supplied.calls);
  let count = 0;
  const reader = file => { if (++count === 5) throw new Error('fifth read'); return read(file); };
  assert.throws(() => ktpb.verifyKtpbAmendment(reader), /fifth read/); assert.equal(count, 5);
  const readAgain = observe(() => ktpb.verifyKtpbAmendment(read));
  assert.deepEqual(readAgain.calls, supplied.calls);
  const strictTrace = [];
  function strictReader(file) {
    assert.equal(this, undefined, 'A supplied reader must not receive the private owner');
    strictTrace.push(file); return read(file);
  }
  ktpb.verifyKtpbAmendment(strictReader);
  assert.deepEqual(strictTrace, supplied.calls);
  let reentered = false;
  function reentrantReader(file) {
    assert.equal(this, undefined);
    if (!reentered) { reentered = true; ktpb.verifyKtpbAmendment(); }
    return read(file);
  }
  ktpb.verifyKtpbAmendment(reentrantReader);
  assert.equal(reentered, true);

});

test('caller-owned clearances keep exact identity on ordinary and opaque fallback paths', () => {
  const ktpb = modules['ktpb-source-context'], plain = json(ktpbClearancePath);
  assert.equal(ktpb.verifyKtpbDependencyFiles(plain), plain);
  let thenReads = 0;
  const proxy = new Proxy(plain, { get(target, key, receiver) { if (key === 'then') { thenReads++; throw new Error('then must not be read'); } return Reflect.get(target, key, receiver); } });
  assert.equal(ktpb.verifyKtpbDependencyFiles(proxy), proxy); assert.equal(thenReads, 0);
  const accessor = Object.assign({}, plain); Object.defineProperty(accessor, 'then', { get() { throw new Error('then getter must not run'); } });
  assert.equal(ktpb.verifyKtpbDependencyFiles(accessor), accessor);
  const callable = { ...plain, then() { throw new Error('then function must not run'); } };
  assert.equal(ktpb.verifyKtpbDependencyFiles(callable), callable);
  const promise = Object.assign(Promise.resolve(), plain);
  assert.equal(ktpb.verifyKtpbDependencyFiles(promise), promise);
  const hooked = { ...plain, toJSON() { throw new Error('unused caller toJSON must not run'); } };
  assert.equal(ktpb.verifyKtpbDependencyFiles(hooked), hooked);
});

test('NTMI Scope, Files and Clearance share one owner and retain supplied nested counts identity', () => {
  const ntmi = modules.ntmi, clearance = json(ntmi.ntmiPreviewClearancePath);
  assert.deepEqual(ntmi.verifyNtmiSourcePreviewScope(), clearance.counts);
  assert.equal(ntmi.verifyNtmiSourcePreviewFiles(clearance), clearance.counts);
  const measured = observe(() => ntmi.verifyNtmiSourcePreviewClearance(clearance));
  assert.equal(measured.result, clearance.counts);
  const counts = new Map(); for (const file of measured.calls) counts.set(file, (counts.get(file) || 0) + 1);
  for (const [file, count] of counts) assert.equal(count, 2, file);
  assert.deepEqual(ntmi.verifyNtmiSourcePreviewClearance(), clearance.counts);
  const wrong = structuredClone(clearance); wrong.reviewReportSha256 = 'changed';
  assert.throws(() => ntmi.verifyNtmiSourcePreviewClearance(wrong), /Changed independent NTMI review/);
});


test('json copies and serialization collisions never supply canonical proof authority', () => {
  const { runFreshProof, proofOperations } = modules.invocation;
  const ktpb = modules['ktpb-source-context'];
  runFreshProof({ root: directory, omittedReader: true, read, inputs: [] }, context => {
    const first = ktpb.internalVerifyKtpbAmendment(context);
    first.dependencies.predecessors.extra = 'mutation'; first.status = 'mutated copy';
    const second = ktpb.internalVerifyKtpbAmendment(context);
    assert.equal(second.status, approved); assert.ok(!Object.hasOwn(second.dependencies.predecessors, 'extra'));
  });
  assert.throws(() => runFreshProof({ root: directory, omittedReader: true, read, inputs: [] }, context => {
    ktpb.internalVerifyKtpbAmendment(context);
    const changed = proofOperations(context).json(ktpbClearancePath);
    const originalSerialization = JSON.stringify(changed);
    changed.dependencies.predecessors = Object.assign(Object.create(null), changed.dependencies.predecessors);
    assert.equal(JSON.stringify(changed), originalSerialization);
    ktpb.internalVerifyKtpbDependencyFiles(context, changed);
  }), /Changed KTPB predecessor scope or hashes/);
  const clearance = json(modules.ntmi.ntmiPreviewClearancePath), serialized = JSON.stringify(clearance);
  clearance.counts.newProducts = -0;
  assert.equal(JSON.stringify(clearance), serialized);
  assert.throws(() => modules.ntmi.verifyNtmiSourcePreviewFiles(clearance));
});

test('internal consumers stay bounded and every exported internal evaluator rejects forged owners', () => {
  // The frozen PR44 performance review remains unchanged. The backend leaf
  // combined EDS/auth and joint site leaves add exact bounded consumers under separate amendments.
  const allowed = new Set([...ktpbPerformanceImplementationFiles, ...ktpbPerformanceTestFiles,
    'scripts/catalog/backend-security-reviewed-dependencies.mjs',
    'scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs',
    'scripts/catalog/joint-site-reviewed-dependencies.mjs']);
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const visit = relative => {
    for (const entry of fs.readdirSync(path.join(repo, relative), { withFileTypes: true })) {
      if (['node_modules', '.next', '.git', 'dist', 'build', 'test-results'].includes(entry.name)) continue;
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.(?:m?js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const text = fs.readFileSync(path.join(repo, file), 'utf8');
      const imports = [...text.matchAll(/(?:import|export)\s+(?:\{([^}]+)\}|[^;]+?)\s+from\s+['"]([^'"]+)['"]/g)];
      for (const match of imports) {
        if (match[2].endsWith('/proof-invocation.mjs') || /\binternal[A-Z]/.test(match[1] || '')) {
          assert.ok(allowed.has(file), `Unsupported internal consumer ${file}`);
          assert.ok(!match[0].startsWith('export'), `Unsupported internal re-export ${file}`);
        }
      }
    }
  };
  for (const folder of ['scripts', 'frontend', 'backend-node/src']) visit(folder);
  for (const guardModule of Object.values(modules)) for (const [name, value] of Object.entries(guardModule)) {
    if (name.startsWith('internal') && typeof value === 'function') {
      assert.throws(() => value(Object.freeze({})), /Invalid or closed proof invocation context/, name);
    }
  }
  assert.equal(modules.ntmi.verifyNtmiSourcePreviewScope.length, 0);
  assert.equal(modules.ntmi.verifyNtmiSourcePreviewClearance.length, 0);
  assert.equal(modules.ntmi.verifyNtmiSourcePreviewFiles.length, 1);
  assert.equal(modules['source-asset'].verifySourceAssetDependencyAmendment.length, 1);
  assert.equal(modules['source-asset'].historicalDependencyHash.length, 1);
  assert.equal(modules['transformer'].assertReviewedTransformerDependency.length, 3);
});

test('explicit invalid readers preserve no-read success and legacy predicate/read failure order', () => {
  const adapters = [
    modules['ktpb-source-context'].assertKtpbDependencies,
    modules['frontend-security'].assertSecurityDependencies,
    modules['ptmm-browser-correction'].assertCorrectionDependencies,
    modules['ptmm-qualification'].assertPtmmQualificationDependencies,
    modules['visual-presentation'].assertVisualPresentationDependencies,
    modules['catalog-browser'].assertBrowserAssertionDependencies,
    modules['protection-context'].assertProtectionContextForwardDependencies,
    modules['protection-context'].assertProtectionContextSourceInputs,
    modules['measurement-column'].assertMeasurementColumnForwardDependencies,
  ];
  const ktpb = modules['ktpb-source-context'], source = modules['source-asset'];
  for (const invalidReader of [null, 0, false, 'not a reader', {}]) {
    for (const verify of adapters) assert.equal(verify({}, invalidReader), undefined, verify.name);
    assert.throws(() => ktpb.verifyKtpbDependencyFiles({ format: 'wrong' }, invalidReader), {
      code: 'ERR_ASSERTION', actual: 'wrong', expected: 'alageum-ktpb-source-context-clearance-v1',
    });
    assert.throws(() => source.verifySourceAssetDependencyAmendment({ format: 'wrong', status: 'wrong' }, invalidReader), {
      code: 'ERR_ASSERTION', actual: 'wrong', expected: 'alageum-source-asset-completion-clearance-v1',
    });
    assert.throws(() => source.verifySourceAssetDependencyAmendment({ format: 'alageum-source-asset-completion-clearance-v1', status: 'pending' }, invalidReader), /Source asset integration still requires independent approval/);
    assert.throws(() => ktpb.verifyKtpbDependencyFiles(null, invalidReader), /Cannot read properties of null.*format/);
    assert.throws(() => ktpb.assertKtpbDependencies({ 'frontend/public/catalog-source/page-056.webp': 'wrong' }, invalidReader), TypeError);
    assert.throws(() => ktpb.verifyKtpbAmendment(invalidReader), TypeError);
  }
});
