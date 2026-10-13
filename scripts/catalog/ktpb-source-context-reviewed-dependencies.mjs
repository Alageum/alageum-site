import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
import { combinedPredecessors, internalAssertCombinedDependencies } from './combined-eds-auth-reviewed-dependencies.mjs';
import { backendPredecessors, internalAssertBackendDependencies } from './backend-security-reviewed-dependencies.mjs';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
// Exact source-context successor to PR43. Current raw bytes only: no older
// verifier, historical-byte reader, broad hash allowance or release path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ktpbReviewDir = 'docs/catalog-transformers-2026/review/ktpb-source-context';
export const ktpbClearancePath = `${ktpbReviewDir}/clearance.json`;
export const ktpbReportPath = `${ktpbReviewDir}/independent-review.json`;
export const ktpbPerformanceReviewPath = `${ktpbReviewDir}/performance-semantics-review.json`;
export const ktpbBaselineCommit = 'c3241426715e8ab556df48242e405c9b382660ee';
export const ktpbBaselineTree = '93520988b0e0222d5a4d283ff3cc436bc8e321b3';
export const ktpbPredecessors = Object.freeze({
  "scripts/catalog/source-asset-reviewed-dependencies.mjs": "5e1f3f131a4d72bba1348a8bd4da2de8f1525d328ecfa67bbd0b3dced17be2bb",
  "scripts/catalog/measurement-column-reviewed-dependencies.mjs": "df77d0b7b9638cc0fa4700a9b937a616bc859aabe3684ff9907c30b5dbe8c76d",
  "scripts/catalog/catalog-browser-reviewed-dependencies.mjs": "952df324b4acbd63536c3e85752bf3b6f3e8f70e6349be246112fb40177294b8",
  "scripts/catalog/visual-presentation-reviewed-dependencies.mjs": "5eb73dc41decc5683afc0ce632bea873a27ffbafd1a5e81a7fd20c1c9f2b3758",
  "scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs": "768682490a120a62b027c9be790af5781ca8cec45cba7dfd89bacce06f79b4e5",
  "scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs": "f1e52c7899f13ecb4a87bd291adcc7bf2ca46d00ba82a4385ab169748f88deaa",
  "scripts/catalog/transformer-reviewed-dependencies.mjs": "126aa41598561e47d877387acb7a9b5a0369aa77f90b4bebd7d5ed40e639ba27",
  "scripts/check-ntmi-source-previews.mjs": "89d2cc91671da44808f9c9a0613eec7a3dbd80268d6e867f6395f3877a6583c7",

  "frontend/components/catalog/source-context/SourceContextImage.js": "cbea5c72c693cbe1192f1a7721f062716f9434a94a026f20770ffe519677c3d0",
  "frontend/lib/catalog/source-context/sourceContextManifest.json": "4ccb97d612b48f368a0ae298164f2ea80671fb12ce8b73724342a5747cc19ce3",
  "frontend/lib/catalog/source-context/sourceContexts.js": "5ed607db069ed54243f6a012c1a3b0941355c643a2e9ec4c1975d3bd83eec7b2",
  "frontend/tests/catalog-source-context-render.test.mjs": "c769aa9fe19dcb7eaace693efcc7b1e9d21378a5e3de9713bc354d5c4da118f6",
  "frontend/tests/catalog-source-context.test.mjs": "8921f0e96cb9f5fc4b4f4d86bd912de242769bdd97a242086f8c4fdaa2ab4e7d",
  "scripts/catalog/frontend-security-reviewed-dependencies.mjs": "7c854365c6106ba05b872a5bfce0b5587d3de123158cb1693fafc9147579dcfc",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs": "b007b1c7c9ce73769a948da44fdee31eab13e83d53f1193b3c5f5cc2508a4162",
  "scripts/check-protection-context-integration.mjs": "3ad8625f48b1fbd15f1d658459e3e854f7bca286d916a37ec220db1985da4788",
  "frontend/tests/helpers/frontend-security-historical-bytes.mjs": "811309ef9755c326ac3618284102eb9e7c4f5a88f36ace00b2bbb99a6184513e",
  "frontend/tests/frontend-security-amendment.test.mjs": "23ff789aa393343539f908fa8e6b20bb4138d745a2797efcc642d328fd9a3d07",
  "frontend/tests/protection-context-integration.test.mjs": "3f30f7a07294bb99b01cfb55bd96c40ad8dfe6b12c0be2ddce8a5a88f04a1359",
  "frontend/tests/transformer-asset-completion.test.mjs": "c048b4a21dbac150f3cce848ad4590a8264f026362a189cce57702bef5fca8b5"
});
export const ktpbSourceUiFiles = Object.freeze({
  "frontend/components/catalog/source-context/SourceContextImage.js": "53773db991258d2f99e1b581edab091a60250aa636ff130c6103441250ca291b",
  "frontend/lib/catalog/source-context/sourceContextManifest.json": "c278d91b53c742d27a2d1d9b9c8e6a24a219bb99ed6fdcb42a47ec21072061fe",
  "frontend/lib/catalog/source-context/sourceContexts.js": "7fe1aea1dfaf539ea7e8389127e8f69ca0c44da9e959a740700b56c833a5d3c4",
  "frontend/tests/catalog-source-context-render.test.mjs": "9466961a4682f514ef9509a8af78917cd833dfacdc2a78c2b7c73a9d7728515f",
  "frontend/tests/catalog-source-context.test.mjs": "d57d9c08069d72e483a6775dc68c65e4424d4c87cf72b04674d530451372c527",
  "frontend/tests/ktpb-source-context.test.mjs": "6a236e921be6c6c5275455da939bb5a43cd1762265458cb1de83a3d2bdc2369b"
});
export const ktpbNewFiles = Object.freeze([
  "scripts/catalog/proof-invocation.mjs",
  "frontend/tests/catalog-proof-invocation.test.mjs",
  "frontend/tests/catalog-proof-parity.test.mjs",
  "docs/catalog-transformers-2026/review/ktpb-source-context/performance-semantics-review.json",

  "scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs",
  "scripts/check-ktpb-source-context.mjs",
  "frontend/tests/ktpb-source-context-amendment.test.mjs",
  "frontend/tests/helpers/ktpb-source-context-historical-bytes.mjs",
  "frontend/tests/ktpb-source-context.test.mjs",
  ".github/workflows/ktpb-source-context.yml",
  "frontend/e2e/ktpb-source-context.browser.js",
  "frontend/e2e/fixtures/ktpb-public-dtos.json",
  "frontend/e2e/helpers/ktpb-source-context-fixtures.mjs",
  "frontend/e2e/helpers/ktpb-source-context-dom.mjs",
  "frontend/playwright.ktpb-source-context.config.mjs",
  "frontend/tests/ktpb-browser-contract.test.mjs",
  "docs/catalog-transformers-2026/review/ktpb-source-context/baseline-dependencies.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/historical-test-bytes.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/source-ui-manifest.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/source-ui-review.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/source-ledger.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/baseline-output-digests.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/baseline-context-outputs.json",
  "docs/catalog-transformers-2026/review/ktpb-source-context/README.md"
]);
export const ktpbPerformanceImplementationFiles = Object.freeze([
  "scripts/catalog/source-asset-reviewed-dependencies.mjs",
  "scripts/catalog/measurement-column-reviewed-dependencies.mjs",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs",
  "scripts/catalog/catalog-browser-reviewed-dependencies.mjs",
  "scripts/catalog/visual-presentation-reviewed-dependencies.mjs",
  "scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs",
  "scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs",
  "scripts/catalog/frontend-security-reviewed-dependencies.mjs",
  "scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs",
  "scripts/catalog/transformer-reviewed-dependencies.mjs",
  "scripts/check-ntmi-source-previews.mjs",
  "scripts/catalog/proof-invocation.mjs"
]);
export const ktpbPerformanceTestFiles = Object.freeze([
  "frontend/tests/catalog-proof-invocation.test.mjs",
  "frontend/tests/catalog-proof-parity.test.mjs",
  "frontend/tests/ktpb-source-context-amendment.test.mjs",
  "frontend/tests/helpers/ktpb-source-context-historical-bytes.mjs"
]);
export const ktpbPerformanceObservationContract = Object.freeze({
  "scope": "one-synchronous-public-invocation",
  "cacheAcrossInvocations": false,
  "intermediateObservationsReduced": true,
  "transientMutationRestorationDetection": "not-guaranteed",
  "atomicFilesystemSnapshot": false,
  "finalRecheck": "all-consumed-paths-fresh-raw-reader",
  "customReader": "uncached-admission-equivalent",
  "limits": "retained-bytes-and-work-not-transient-allocation",
  "callerInputs": "bounded-hook-free-plain-data-classification-retain-original-identity"
});
export const ktpbLegacyContextIds = Object.freeze([
  "cat-ptm-tded-v001",
  "cat-ptm-tded-v003",
  "cat-ptm-tded-v004",
  "cat-ptm-tded-v007",
  "cat-ptm-tded-v010",
  "cat-ptm-tded-v011",
  "cat-shnn-v001",
  "cat-shnn-v002",
  "cat-shnn-v003",
  "cat-shnn-v004",
  "cat-shnn-v005",
  "cat-shnn-v006",
  "cat-shnn-v007",
  "cat-shnn-v008",
  "cat-shnn-v009",
  "cat-shnn-v010",
  "cat-shnn-v011",
  "cat-shnn-v012",
  "cat-shnn-v013",
  "cat-shnn-v014",
  "cat-shnn-v015",
  "cat-shnn-v016",
  "cat-shnn-v017",
  "cat-shnn-v018"
]);
export const ktpbAddedContextIds = Object.freeze(['cat-ktpb-k', 'cat-ktpb-k-v002']);
const fixedEvidence = Object.freeze({
  "docs/catalog-transformers-2026/review/ktpb-source-context/baseline-output-digests.json": "4be87cd9c0cabb68aa6c34b92fcca191dc52353d2d931439ed1e23a4f4a42263",
  "docs/catalog-transformers-2026/review/ktpb-source-context/baseline-context-outputs.json": "1791e639a975d2977daeb754ca292f467086bcc9961e8e9c514657e7bb7824f9",
  "docs/catalog-transformers-2026/review/ktpb-source-context/source-ui-manifest.json": "a404b70851b8ccd6888291a6f5e49d3af4d0052b3d1e765743c2cf6e19e86576",
  "docs/catalog-transformers-2026/review/ktpb-source-context/historical-test-bytes.json": "40ef23c74f780271ced686e5ef9642047285d85d9974cef47ed23c7050811120",
  "docs/catalog-transformers-2026/review/ktpb-source-context/source-ui-review.json": "ca02eb62d85143f34359bb7af98a0f103df3f110c9caa93788aaeb13cfd12295",
  "docs/catalog-transformers-2026/review/ktpb-source-context/source-ledger.json": "26f22b4422e1438359cf8aa702d6818db678309a789911f2ce0ccb441ae31831",
  "docs/catalog-transformers-2026/review/ktpb-source-context/baseline-dependencies.json": "8ca5e7ba114c81db58c6f8e83cc2e66871a990b9f6cee6b0393592c612b17524"
});
const baselinePath = `${ktpbReviewDir}/baseline-dependencies.json`;
const sourceManifestPath = 'frontend/lib/catalog/source-context/sourceContextManifest.json';
export const ktpbDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readKtpbBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid KTPB review path');
  return fs.readFileSync(path.join(root, file));
};
export function ktpbRequiredFiles(read = readKtpbBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalKtpbRequiredFiles(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalKtpbRequiredFiles(context) {
  return evaluateProof(context, () => {
    const { bytes: read } = proofOperations(context);
    const bytes = read(baselinePath);
    assert.equal(ktpbDigest(bytes), fixedEvidence[baselinePath], 'Changed frozen PR43 KTPB baseline');
    return [...Object.keys(JSON.parse(bytes)), ...ktpbNewFiles].sort();
  });
}
export function verifyKtpbDependencyFiles(clearance, read = readKtpbBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyKtpbDependencyFiles(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyKtpbDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { json: proofJson } = proofOperations(context);

    assert.equal(clearance.format, 'alageum-ktpb-source-context-clearance-v1');
    assert.equal(clearance.baselineCommit, ktpbBaselineCommit); assert.equal(clearance.baselineTree, ktpbBaselineTree);
    assert.deepEqual(clearance.dependencies.predecessors, ktpbPredecessors, 'Changed KTPB predecessor scope or hashes');
    const reviewed = clearance.dependencies.reviewedFiles;
    assert.deepEqual(Object.keys(reviewed).sort(), internalKtpbRequiredFiles(context), 'Incomplete or overbroad KTPB dependency closure');
    for (const [file, expected] of Object.entries(proofJson(baselinePath))) {
      if (Object.hasOwn(ktpbPredecessors, file)) {
        assert.equal(ktpbPredecessors[file], expected, `Wrong PR43 KTPB predecessor ${file}`);
        assert.notEqual(reviewed[file], expected, `Mixed or unchanged KTPB successor ${file}`);
      } else assert.equal(reviewed[file], expected, `Changed immutable PR43 KTPB pin ${file}`);
    }
    for (const [file, expected] of Object.entries({ ...fixedEvidence, ...ktpbSourceUiFiles })) assert.equal(reviewed[file], expected, `Changed frozen KTPB source/UI evidence ${file}`);
    internalAssertBackendDependencies(context, reviewed);
    return clearance;
  });
}
function internalVerifyPerformanceReview(context, clearance) {
  return evaluateProof(context, () => {
    const { bytes: read } = proofOperations(context);

    const bytes = read(ktpbPerformanceReviewPath);
    assert.equal(ktpbDigest(bytes), clearance.dependencies.reviewedFiles[ktpbPerformanceReviewPath], 'Changed KTPB performance review');
    const review = JSON.parse(bytes);
    assert.equal(review.format, 'alageum-proof-invocation-performance-review-v1');
    assert.equal(review.status, 'approved-bounded-proof-invocation', 'KTPB performance semantics require independent approval');
    assert.equal(review.baselineCommit, ktpbBaselineCommit); assert.equal(review.baselineTree, ktpbBaselineTree);
    assert.deepEqual(review.observationContract, ktpbPerformanceObservationContract, 'Changed KTPB performance observation contract');
    assert.deepEqual(review.resourceLimits, { paths: 1024, retainedBytes: 67108864, proofs: 32, inputDepth: 64, inputProperties: 65536, inputBytes: 8388608 }, 'Changed KTPB performance resource limits');
    assert.deepEqual(review.predecessors, ktpbPredecessors, 'Changed KTPB performance predecessor scope');
    for (const [field, files] of [
      ['reviewedImplementationHashes', ktpbPerformanceImplementationFiles],
      ['reviewedTestHashes', ktpbPerformanceTestFiles],
    ]) {
      assert.deepEqual(Object.keys(review[field]).sort(), [...files].sort(), `Incomplete or overbroad KTPB performance ${field}`);
      for (const file of files) assert.equal(review[field][file], clearance.dependencies.reviewedFiles[file], `Changed KTPB performance reviewed hash ${file}`);
    }
  });
}
export function verifyKtpbAmendment(read = readKtpbBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalVerifyKtpbAmendment(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyKtpbAmendment(context) {
  return evaluateProof(context, () => {

    return prove(context, verifyKtpbAmendmentIdentity, 'approved', ktpbClearancePath, internalVerifyKtpbAmendmentCanonical);
  });
}
export function assertKtpbDependencies(expectedFiles, read = readKtpbBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertKtpbDependencies(context, expectedFiles));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertKtpbDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash: proofHash } = proofOperations(context);
    const changedIncludingJoint = Object.entries(expectedFiles).filter(([file, expected]) => proofHash(file) !== expected);
    const joint = changedIncludingJoint.filter(([file, expected]) => Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]);
    internalAssertJointDependencies(context, Object.fromEntries(joint));
    const changedAll = changedIncludingJoint.filter(([file, expected]) => !Object.hasOwn(jointPredecessors, file) || expected !== jointPredecessors[file]);
    if (!changedAll.length) return;
    const combined = changedAll.filter(([file, expected]) => Object.hasOwn(combinedPredecessors, file) && expected === combinedPredecessors[file]);
    internalAssertCombinedDependencies(context, Object.fromEntries(combined));
    const changed = changedAll.filter(([file, expected]) => !Object.hasOwn(combinedPredecessors, file) || expected !== combinedPredecessors[file]);
    if (!changed.length) return;
    const current = changed.filter(([file, expected]) => Object.hasOwn(backendPredecessors, file) && expected === backendPredecessors[file]);
    internalAssertBackendDependencies(context, Object.fromEntries(current));
    const prior = changed.filter(([file, expected]) => !Object.hasOwn(backendPredecessors, file) || expected !== backendPredecessors[file]);
    if (!prior.length) return;
    for (const [file, expected] of prior) {
      assert.ok(Object.hasOwn(ktpbPredecessors, file), `Changed unreviewed KTPB dependency ${file}`);
      assert.equal(expected, ktpbPredecessors[file], `Wrong KTPB predecessor ${file}`);
    }
    const clearance = internalVerifyKtpbAmendment(context);
    internalAssertBackendDependencies(context, Object.fromEntries(prior.map(([file]) => [file, clearance.dependencies.reviewedFiles[file]])));
  });
}
// Historical reports keep their exact 24 identities. New records are admitted
// separately by the new leaf; no old report is rewritten to claim 26 contexts.
export function preservedKtpbContextIds(read = readKtpbBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalPreservedKtpbContextIds(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalPreservedKtpbContextIds(context) {
  return evaluateProof(context, () => {
    const { bytes: read } = proofOperations(context);
    const bytes = read(sourceManifestPath), changed = ktpbDigest(bytes) !== ktpbPredecessors[sourceManifestPath];
    if (changed) internalAssertKtpbDependencies(context, { [sourceManifestPath]: ktpbPredecessors[sourceManifestPath] });
    const ids = Object.keys(JSON.parse(bytes).records).sort();
    assert.deepEqual(ids, [...ktpbLegacyContextIds, ...(changed ? ktpbAddedContextIds : [])].sort(), 'Unreviewed source-context identities');
    return [...ktpbLegacyContextIds];
  });
}

const verifyKtpbAmendmentIdentity = Symbol('verifyKtpbAmendment');

function internalVerifyKtpbAmendmentCanonical(context, clearance) {
  const { bytes: read } = proofOperations(context);
  assert.equal(clearance.status, 'approved-bounded-ktpb-source-context', 'KTPB source-context amendment requires independent approval');
  internalVerifyKtpbDependencyFiles(context, clearance);
  internalVerifyPerformanceReview(context, clearance);
  assert.equal(clearance.reviewReport, ktpbReportPath);
  const bytes = read(ktpbReportPath);
  assert.equal(ktpbDigest(bytes), clearance.reviewReportSha256, 'Changed independent KTPB report');
  const report = JSON.parse(bytes);
  assert.equal(report.format, 'alageum-ktpb-source-context-independent-review-v1'); assert.equal(report.status, clearance.status);
  assert.equal(report.baselineCommit, ktpbBaselineCommit); assert.equal(report.baselineTree, ktpbBaselineTree);
  assert.equal(report.approvedDependenciesSha256, ktpbDigest(JSON.stringify(clearance.dependencies)));
  assert.equal(report.sourceUiReviewSha256, fixedEvidence[`${ktpbReviewDir}/source-ui-review.json`]);
  assert.equal(report.performanceReviewSha256, clearance.dependencies.reviewedFiles[ktpbPerformanceReviewPath], 'Changed enclosing KTPB performance review binding');
  assert.deepEqual(report.addedContextIds, ktpbAddedContextIds);
  assert.deepEqual(report.preservedCounts, { records: 843, defaultIllustrations: 464, sourceBasedIcons: 465, choiceRows: 36, choices: 74, constructionGaps: 243, gapFamilies: 29, legacyContextRecords: 24 });
  assert.equal(report.sourceContextRecords, 26);
  assert.deepEqual(report.familyGeometryException, { id: 'cat-ktpb-k', type: 'outdoor-switchyard-substation', sourcePages: [55], confidence: 'source-matched', iconConfidence: 'source-based' });
  assert.deepEqual(report.browserScope, { newCases: 16, existingCatalogCases: 254, existingPtmmCases: 16, workers: 2, retries: 0, jobTimeoutMinutes: 15, buildTimeoutMinutes: 5, testTimeoutMinutes: 6, permissions: { contents: 'read' } });
  for (const field of ['recordChanges', 'sourceAssetChanges', 'geometryMaterialChanges', 'defaultIconChanges', 'confidencePromotions', 'gapClosures', 'priorApprovalChanges', 'dependencyChanges', 'cms15Changes', 'existingWorkflowChanges', 'existingBrowserCaseChanges', 'auditGateChanges', 'releasePathChanges']) assert.equal(report[field], 0, `Unapproved KTPB scope ${field}`);
  return clearance;

}
