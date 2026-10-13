import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
// Bounded successor to exact PR45. Current raw bytes, one invocation owner.
// This leaf never imports inherited verifiers or historical test readers.
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const combinedReviewDir = 'docs/catalog-transformers-2026/review/combined-eds-auth';
export const combinedRevisionDir = `${combinedReviewDir}/revisions/test-snapshot-parity`;
export const combinedClearancePath = `${combinedRevisionDir}/clearance.json`;
export const combinedReportPath = `${combinedRevisionDir}/independent-review.json`;
export const combinedCandidateEvidencePath = `${combinedRevisionDir}/candidate-evidence.json`;
export const combinedFixedFilesPath = `${combinedRevisionDir}/fixed-candidate-files.json`;
export const combinedPriorAuthority = Object.freeze({
  "commit": "40da0115da23eb32f3692eb4cf0580b92913a2bc",
  "tree": "5eecf2cba689bb5cd2f3a4ae3714198f2324a35f",
  "applicationCommit": "7316cef4c92c084aa1b8e30756772d0b428dbc10",
  "applicationTree": "e553a93b6ef0b43682a419b98be4357de03ee77a",
  "clearancePath": "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/clearance.json",
  "files": {
    "docs/catalog-transformers-2026/review/combined-eds-auth/clearance.json": "cbde66c16dd10f4f9ac7a13eddac9df16bbb0855e517f43bb41e10063c754f53",
    "docs/catalog-transformers-2026/review/combined-eds-auth/independent-review.json": "267018dd18d2a686b0d0e08521c0946cf402948c1045b11f6432f60bf5d8360b",
    "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/clearance.json": "3c87b271a63c561aeb0a548bfdfa3b60ac90d59dfdc2117f194fef1fbf05d2cf",
    "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/independent-review.json": "29cbf4517c98855ec22a977b6f7a1a34e109d67c9fa9ea1d2d73a846f9e6f53b"
  }
});
Object.freeze(combinedPriorAuthority.files);
export const combinedBaselineCommit = 'a32f7878d25a7d4e26d063ec6914b72d2f814383';
export const combinedBaselineTree = '0cc608e2020f82aaec678032bc772ec2276c7946';
export const combinedCandidateCommit = '7316cef4c92c084aa1b8e30756772d0b428dbc10';
export const combinedCandidateTree = 'e553a93b6ef0b43682a419b98be4357de03ee77a';
export const combinedPredecessors = Object.freeze({
  "backend-node/config/middlewares.js": "c16b40d10949ef514c8656ebfbe7a5f61a5a9e615df89f55b003d155c7209aac",
  "backend-node/src/domain/auth.js": "161697f3257f0ba8fba020d9d169cae337dc214351ae50b43f4e5a4cfff2fd1c",
  "frontend/lib/api/auth.js": "ae2d87e51e4af9af61723e78a04c4b06f8ecf2ea448b1d2d6e7d1c251c5bb84b",
  "frontend/lib/api/client.js": "1427a2415d1172f03d8fcb59abc3fc85e108f61f32957d2608deb13660913471",
  "frontend/lib/api/sessionTransport.js": "4dec2b72168c9939c0af70b43a8559ef881d324072e4a5593951f036e330ec7b",
  "frontend/tests/backend-security-amendment.test.mjs": "5c32e6ac804bf68adc9f2ea10e827eeee1023e530cf50071f9a72b9cf697fac4",
  "frontend/tests/catalog-proof-parity.test.mjs": "fe584717a051da4d9387c3be91a178ced8809e577fa39757df7c6caaf34172cd",
  "frontend/tests/helpers/backend-security-historical-bytes.mjs": "9cb966a0bfd2b0e9170f17fb0c82c2e5c4ccb942bdb5cee4c07edd6973d4b3a0",
  "frontend/tests/transformer-asset-completion.test.mjs": "48d3a24da9348267a0b709731667f400636f25471d2780fe1c8bf640456ad503",
  "scripts/catalog/backend-security-reviewed-dependencies.mjs": "450cc13e228bbd99d458cb0464263ce38109fc48b162def884406a3f2964c2f3",
  "scripts/catalog/frontend-security-reviewed-dependencies.mjs": "3f90bf3ecf3f6636037e3f4572853a460c03125e155d6a02e70d8db0f79b9448",
  "scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs": "f68102e8a355401394aeaef52ce432976dcef06935befb01282340d9124c2571"
});
export const combinedNewFiles = Object.freeze([
  "backend-node/config/alageum.js",
  "backend-node/scripts/run-signing-tests.sh",
  "backend-node/src/api/compat/controllers/compat.js",
  "backend-node/src/api/compat/routes/compat.js",
  "backend-node/src/domain/document-signing-policy.js",
  "backend-node/src/domain/document-signing-schema.js",
  "backend-node/src/domain/document-signing.js",
  "backend-node/src/domain/federated-auth.js",
  "backend-node/src/domain/federated-schema.js",
  "backend-node/src/domain/google-oidc.js",
  "backend-node/src/index.js",
  "backend-node/src/middlewares/compat-errors.js",
  "backend-node/src/middlewares/safe-request-logger.js",
  "backend-node/tests/document-signing.http-signing.js",
  "backend-node/tests/document-signing.integration-signing.js",
  "backend-node/tests/document-signing.test.js",
  "backend-node/tests/documents.test.js",
  "backend-node/tests/federated-auth.http-auth.js",
  "backend-node/tests/federated-auth.integration.js",
  "backend-node/tests/google-oidc.test.js",
  "docs/auth/candidate-verification.json",
  "docs/auth/federated-registration.md",
  "docs/auth/google.env.example",
  "docs/catalog-transformers-2026/review/combined-eds-auth/README.md",
  "docs/catalog-transformers-2026/review/combined-eds-auth/baseline-dependencies.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/candidate-evidence.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/clearance.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/fixed-candidate-files.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/historical-test-bytes.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/independent-review.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/README.md",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/candidate-evidence.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/clearance.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/fixed-candidate-files.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/independent-review.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/test-snapshot-parity/README.md",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/test-snapshot-parity/candidate-evidence.json",
  "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/test-snapshot-parity/fixed-candidate-files.json",
  "docs/frontend.md",
  "docs/node-document-signing-validation.md",
  "docs/node-document-signing.md",
  "frontend/app/(site)/login/page.js",
  "frontend/components/AuthProvider.js",
  "frontend/components/FederatedSignIn.js",
  "frontend/components/documents/DocumentSigningPanel.js",
  "frontend/components/documents/DocumentsWorkspace.js",
  "frontend/components/documents/DocumentsWorkspace.module.css",
  "frontend/e2e-signing/document-signing.spec.js",
  "frontend/federated-e2e/federated-auth.spec.js",
  "frontend/lib/api/documentSigning.js",
  "frontend/lib/api/federated.js",
  "frontend/lib/documents/ncalayer.js",
  "frontend/lib/documents/signingData.js",
  "frontend/lib/documents/signingFlow.js",
  "frontend/playwright.document-signing.config.mjs",
  "frontend/playwright.federated.config.js",
  "frontend/tests/combined-eds-auth-amendment.test.mjs",
  "frontend/tests/document-signing.test.mjs",
  "frontend/tests/federated-auth.test.mjs",
  "frontend/tests/helpers/combined-eds-auth-historical-bytes.mjs",
  "scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs"
]);
export const combinedBoundaries = Object.freeze({
  historicalApprovalChanges: 0, coordinatorChanges: 0, packageChanges: 0,
  lockfileChanges: 0, workflowChanges: 0, auditGateChanges: 0,
  catalogRecordChanges: 0, catalogSourceUiChanges: 0, geometryChanges: 0,
  rfqContractChanges: 0, cmsContractChanges: 0,
  cryptographicSigning: 'unavailable', signingFlags: 'off-by-default',
  googleLiveProvider: 'not-verified', egovProvider: 'unavailable',
  releaseApproval: false, securityWaiver: false,
});
const baselinePath = `${combinedReviewDir}/baseline-dependencies.json`;
const baselineSha256 = '27a8062460bfd9bc0e8c96857913ecc3b0a7ccefb1645631ebbd0b91d119002d';
const fixedPath = combinedFixedFilesPath;
const fixedSha256 = 'e310cc5e3089f602b3921ea58dd8bda05fd97b5b8fb6bc8d4c1f2f0165ef694b';
const verifierPath = 'scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs';
export const combinedDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readCombinedBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid combined proof path');
  return fs.readFileSync(path.join(root, file));
};
export function combinedRequiredFiles(read = readCombinedBytes) {
  return runFreshProof({ root, omittedReader: arguments.length === 0, read, inputs: [] },
    context => internalCombinedRequiredFiles(context));
}
export function internalCombinedRequiredFiles(context) {
  return evaluateProof(context, () => {
    const { bytes } = proofOperations(context), baseline = bytes(baselinePath);
    assert.equal(combinedDigest(baseline), baselineSha256, 'Changed frozen PR45 combined baseline');
    const files = [...Object.keys(JSON.parse(baseline)), ...combinedNewFiles].sort();
    assert.equal(new Set(files).size, files.length, 'Duplicate combined closure path');
    return files;
  });
}
export function verifyCombinedDependencyFiles(clearance, read = readCombinedBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyCombinedDependencyFiles(context, clearance));
}
export function internalVerifyCombinedDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { json, bytes } = proofOperations(context);
    assert.equal(clearance.format, 'alageum-combined-eds-auth-clearance-v1');
    assert.equal(clearance.baselineCommit, combinedBaselineCommit); assert.equal(clearance.baselineTree, combinedBaselineTree);
    assert.equal(clearance.candidateCommit, combinedCandidateCommit); assert.equal(clearance.candidateTree, combinedCandidateTree);
    assert.deepEqual(clearance.boundaries, combinedBoundaries, 'Changed combined feature/release boundary');
    assert.deepEqual(clearance.priorAuthority, combinedPriorAuthority, 'Changed prior combined authority identity');
    assert.deepEqual(clearance.dependencies.predecessors, combinedPredecessors, 'Changed combined predecessor scope or hashes');
    const reviewed = clearance.dependencies.reviewedFiles;
    const required = internalCombinedRequiredFiles(context);
    assert.deepEqual(Object.keys(reviewed).sort(), required, 'Incomplete or overbroad combined dependency closure');
    for (const [file, expected] of Object.entries(json(baselinePath))) {
      if (Object.hasOwn(combinedPredecessors, file)) {
        assert.equal(combinedPredecessors[file], expected, `Wrong PR45 combined predecessor ${file}`);
        assert.notEqual(reviewed[file], expected, `Mixed or unchanged combined successor ${file}`);
      } else assert.equal(reviewed[file], expected, `Changed immutable PR45 combined pin ${file}`);
    }
    for (const [file, expected] of Object.entries(combinedPriorAuthority.files)) assert.equal(reviewed[file], expected, `Changed immutable prior combined authority ${file}`);
    const fixedBytes = bytes(fixedPath);
    assert.equal(combinedDigest(fixedBytes), fixedSha256, 'Changed frozen combined candidate files');
    const fixed = JSON.parse(fixedBytes);
    assert.deepEqual(Object.keys(fixed).sort(), [...Object.keys(combinedPredecessors), ...combinedNewFiles]
      .filter(file => file !== verifierPath && file !== fixedPath).sort(), 'Incomplete fixed combined candidate scope');
    for (const [file, expected] of Object.entries(fixed)) assert.equal(reviewed[file], expected, `Unreviewed combined replacement ${file}`);
    assert.equal(reviewed[fixedPath], fixedSha256, 'Unreviewed combined fixed map');
    internalAssertJointDependencies(context, reviewed);
    // Hash bindings freeze implementation, while these explicit invariants keep
    // this approval's limits legible and independent of any rollout claims.
    const evidence = json(combinedCandidateEvidencePath);
    assert.equal(evidence.candidateCommit, combinedCandidateCommit); assert.equal(evidence.candidateTree, combinedCandidateTree);
    assert.deepEqual(evidence.boundaries, combinedBoundaries);
    assert.deepEqual(evidence.priorAuthority, combinedPriorAuthority);
    return clearance;
  });
}
const verifyCombinedIdentity = Symbol('verifyCombinedAmendment');
export function verifyCombinedAmendment(read = readCombinedBytes) {
  return runFreshProof({ root, omittedReader: arguments.length === 0, read, inputs: [] },
    context => internalVerifyCombinedAmendment(context));
}
export function internalVerifyCombinedAmendment(context) {
  return evaluateProof(context, () => prove(context, verifyCombinedIdentity, 'approved', combinedClearancePath, verifyCombinedCanonical));
}
function verifyCombinedCanonical(context, clearance) {
  const { bytes } = proofOperations(context);
  assert.equal(clearance.status, 'approved-bounded-combined-eds-auth', 'Combined EDS/auth amendment requires independent approval');
  internalVerifyCombinedDependencyFiles(context, clearance);
  assert.equal(clearance.reviewReport, combinedReportPath);
  const reportBytes = bytes(combinedReportPath);
  assert.equal(combinedDigest(reportBytes), clearance.reviewReportSha256, 'Changed independent combined report');
  const report = JSON.parse(reportBytes);
  assert.equal(report.format, 'alageum-combined-eds-auth-independent-review-v1'); assert.equal(report.status, clearance.status);
  for (const field of ['baselineCommit', 'baselineTree', 'candidateCommit', 'candidateTree']) assert.equal(report[field], clearance[field]);
  assert.deepEqual(report.boundaries, combinedBoundaries);
  assert.deepEqual(report.priorAuthority, combinedPriorAuthority);
  assert.equal(report.approvedDependenciesSha256, combinedDigest(JSON.stringify(clearance.dependencies)), 'Changed independently reviewed combined closure');
  assert.equal(report.reviewedVerifierSha256, clearance.dependencies.reviewedFiles[verifierPath]);
  assert.equal(report.reviewedFixedFilesSha256, fixedSha256);
  assert.equal(typeof report.reviewer, 'string'); assert.ok(report.reviewer.trim(), 'Missing independent combined reviewer');
  assert.equal(typeof report.outcome, 'string'); assert.ok(report.outcome.trim(), 'Missing independent combined outcome');
  return clearance;
}
export function assertCombinedDependencies(expectedFiles, read = readCombinedBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertCombinedDependencies(context, expectedFiles));
}
export function internalAssertCombinedDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash } = proofOperations(context);
    const changedIncludingJoint = Object.entries(expectedFiles).filter(([file, expected]) => hash(file) !== expected);
    if (!changedIncludingJoint.length) return;
    const joint = changedIncludingJoint.filter(([file, expected]) => Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]);
    internalAssertJointDependencies(context, Object.fromEntries(joint));
    const changed = changedIncludingJoint.filter(([file, expected]) => !Object.hasOwn(jointPredecessors, file) || expected !== jointPredecessors[file]);
    if (!changed.length) return;
    for (const [file, expected] of changed) {
      assert.ok(Object.hasOwn(combinedPredecessors, file), `Changed unreviewed combined dependency ${file}`);
      assert.equal(expected, combinedPredecessors[file], `Wrong combined predecessor ${file}`);
    }
    const clearance = internalVerifyCombinedAmendment(context);
    internalAssertJointDependencies(context, Object.fromEntries(changed.map(([file]) => [file, clearance.dependencies.reviewedFiles[file]])));
  });
}
