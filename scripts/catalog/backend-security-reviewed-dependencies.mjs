import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
import { combinedPredecessors, internalAssertCombinedDependencies } from './combined-eds-auth-reviewed-dependencies.mjs';
// Exact PR44 successor. Current raw bytes only; no inherited verifier calls,
// historical-reader substitution, cross-invocation cache or security waiver.
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const backendReviewDir = 'docs/catalog-transformers-2026/review/backend-dependency-security';
export const backendClearancePath = `${backendReviewDir}/clearance.json`;
export const backendReportPath = `${backendReviewDir}/independent-review.json`;
export const backendBaselineCommit = '9dc634a9cc8f1f3341baca3d553703a71cb33d6d';
export const backendBaselineTree = '2cd6d6ad48632334f3409a2bf43578111cc81164';
export const backendPredecessors = Object.freeze({
  "backend-node/package.json": "a995e6d55d972ed6cc2ae1167c8a4a4a6556b8ad4e095d66eb2fec240bd85b7e",
  "backend-node/package-lock.json": "eae762a9730dba640590de7b4fbeb2ec515e6c434f6ea0d0377a0204730c6159",
  "backend-node/tests/cms-catalog.integration-support.js": "a1a54104d2e7abdbc154bc9bf24459edcafd157e60fdda2f775157a35a795ac9",
  "scripts/catalog/frontend-security-reviewed-dependencies.mjs": "a4c8efd7f2a25235b1c16be466b7fedf2bc2e96f586cd8b8c32f3e4892e28676",
  "scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs": "f0b30d5b050f62f5022acc984d6e2d127f818a57552394494f39d8dc0b8fe06c",
  "frontend/tests/helpers/ktpb-source-context-historical-bytes.mjs": "9fcdf3b59f98f248655509091c17a8c16b3c67837bc0a744a2939f07911cf875",
  "frontend/tests/ktpb-source-context-amendment.test.mjs": "2a9f0bc1245158c61fc98e4757cf2dad2cd5c2935c596b1698cdc48f9f94dfc1",
  "frontend/tests/transformer-asset-completion.test.mjs": "d774a768c59b928a0f74806a80a06fc953e92a9cab43f74c09ca5acf53452167",
  "frontend/tests/catalog-proof-parity.test.mjs": "23801d58e967dcbd1371705231ed58248895fd2c874a7c1aa04265e1869578a7"
});
export const backendNewFiles = Object.freeze([
  "backend-node/docs/native-upload-sharp-independent-review.json",
  "backend-node/docs/native-upload-sharp-regression-results.json",
  "backend-node/docs/native-upload-sharp-regressions.md",
  "backend-node/tests/cms-upload-safety.test.js",
  "backend-node/tests/cms-upload.integration-support.js",
  "backend-node/tests/helpers/upload-image-fixtures.js",
  "backend-node/tests/helpers/upload-quiescence.js",
  "backend-node/tests/upload-image.test.js",
  "backend-node/tests/upload-quiescence.test.js",
  "scripts/catalog/backend-security-reviewed-dependencies.mjs",
  "frontend/tests/backend-security-amendment.test.mjs",
  "frontend/tests/helpers/backend-security-historical-bytes.mjs",
  "docs/catalog-transformers-2026/review/backend-dependency-security/baseline-dependencies.json",
  "docs/catalog-transformers-2026/review/backend-dependency-security/historical-test-bytes.json",
  "docs/catalog-transformers-2026/review/backend-dependency-security/lock-package-diff.json",
  "docs/catalog-transformers-2026/review/backend-dependency-security/README.md"
]);
export const backendFixedFiles = Object.freeze({
  "backend-node/docs/native-upload-sharp-independent-review.json": "bdc4feea530e231b59b1810be73e6c3f6823e4aa2b141fd9db031efd4fa898c8",
  "backend-node/docs/native-upload-sharp-regression-results.json": "9d9a01befd4b1363d289d137dbba2b60574ca5cc5fd9dd9957030e8139b60e86",
  "backend-node/docs/native-upload-sharp-regressions.md": "60bb2954e52606ce5bb51f01a9e52a18b4262e77ea9a95d5fb1b18d4f4c09d6c",
  "backend-node/package-lock.json": "720b62d6df31f9594667617758247d090ca6888241b871575dcb31746d421035",
  "backend-node/package.json": "00c062b825c058fe9adf424e9c7ae814fa6ba9e33f3f21de8e48a22b8f2dd097",
  "backend-node/tests/cms-catalog.integration-support.js": "692525322c98f272b9837bccb1f1c49c4bea81ae2014b468f8880a3049e434c7",
  "backend-node/tests/cms-upload-safety.test.js": "5db8b13ff0345a289d23721c05ecf38086f5a6e6bc4bb95bfc55378bfe0e45be",
  "backend-node/tests/cms-upload.integration-support.js": "eb7b12d37cc5100830ad97e41531fbf6f2ab71e09c5778878391ea100691abd2",
  "backend-node/tests/helpers/upload-image-fixtures.js": "3d9b518a58004c397843a44140d9f49de9e0de380e6773a8f08b84cf66849d85",
  "backend-node/tests/helpers/upload-quiescence.js": "a889581c98881d37df06c24ba96740ee7b2ceda2b23e4edb1f4e24f322cb5ab3",
  "backend-node/tests/upload-image.test.js": "a48c67e90355834f50318f289ed64ba5b1f2538c6cd66dc9a48bcf680c80da06",
  "backend-node/tests/upload-quiescence.test.js": "39c173d8f3f1d219027f7b8bb3630646d56c7601fbfb1d4e26ea5dd13e1bf648",
  "docs/catalog-transformers-2026/review/backend-dependency-security/baseline-dependencies.json": "267ae049632c1c49181c30ea4b31714378ba8c11a6a7c3555e5ca1d1a158fd2b",
  "docs/catalog-transformers-2026/review/backend-dependency-security/historical-test-bytes.json": "afedbb8983fe8f9db4895450cee7d54bab01a303bb8cc1c0675090eea4c6ac54",
  "docs/catalog-transformers-2026/review/backend-dependency-security/lock-package-diff.json": "72c1b6fc064fc80d417658a69b8bf3a166fd8473137e5c035cfe2eac9defcf3b"
});
const baselinePath = `${backendReviewDir}/baseline-dependencies.json`;
export const backendDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readBackendBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid backend security path');
  return fs.readFileSync(path.join(root, file));
};
export function backendRequiredFiles(read = readBackendBytes) {
  return runFreshProof({ root, omittedReader: arguments.length === 0, read, inputs: [] },
    context => internalBackendRequiredFiles(context));
}
export function internalBackendRequiredFiles(context) {
  return evaluateProof(context, () => {
    const { bytes } = proofOperations(context), baseline = bytes(baselinePath);
    assert.equal(backendDigest(baseline), backendFixedFiles[baselinePath], 'Changed frozen PR44 backend baseline');
    return [...Object.keys(JSON.parse(baseline)), ...backendNewFiles].sort();
  });
}
export function verifyBackendDependencyFiles(clearance, read = readBackendBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyBackendDependencyFiles(context, clearance));
}
export function internalVerifyBackendDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { json } = proofOperations(context);
    assert.equal(clearance.format, 'alageum-backend-security-clearance-v1');
    assert.equal(clearance.baselineCommit, backendBaselineCommit); assert.equal(clearance.baselineTree, backendBaselineTree);
    assert.deepEqual(clearance.dependencies.predecessors, backendPredecessors, 'Changed backend predecessor scope or hashes');
    const reviewed = clearance.dependencies.reviewedFiles;
    assert.deepEqual(Object.keys(reviewed).sort(), internalBackendRequiredFiles(context), 'Incomplete or overbroad backend dependency closure');
    for (const [file, expected] of Object.entries(json(baselinePath))) {
      if (Object.hasOwn(backendPredecessors, file)) {
        assert.equal(backendPredecessors[file], expected, `Wrong PR44 backend predecessor ${file}`);
        assert.notEqual(reviewed[file], expected, `Mixed or unchanged backend successor ${file}`);
      } else assert.equal(reviewed[file], expected, `Changed immutable PR44 backend pin ${file}`);
    }
    for (const [file, expected] of Object.entries(backendFixedFiles)) assert.equal(reviewed[file], expected, `Unreviewed backend replacement ${file}`);
    internalAssertCombinedDependencies(context, reviewed);
    const pkg = json('backend-node/package.json');
    assert.deepEqual(pkg.overrides['@strapi/upload'], { sharp: '0.35.5' }, 'Unscoped backend sharp override');
    assert.equal(pkg.dependencies['@strapi/strapi'], '5.56.0');
    assert.equal(pkg.dependencies['@strapi/plugin-users-permissions'], '5.56.0');
    assert.equal(json('backend-node/package-lock.json').packages['node_modules/sharp'].version, '0.35.5');
    assert.equal(json(`${backendReviewDir}/lock-package-diff.json`).length, 27, 'Changed backend lock scope');
    return clearance;
  });
}
const verifyBackendIdentity = Symbol('verifyBackendAmendment');
export function verifyBackendAmendment(read = readBackendBytes) {
  return runFreshProof({ root, omittedReader: arguments.length === 0, read, inputs: [] },
    context => internalVerifyBackendAmendment(context));
}
export function internalVerifyBackendAmendment(context) {
  return evaluateProof(context, () => prove(context, verifyBackendIdentity, 'approved', backendClearancePath, verifyBackendCanonical));
}
function verifyBackendCanonical(context, clearance) {
  const { bytes } = proofOperations(context);
  assert.equal(clearance.status, 'approved-bounded-backend-security', 'Backend security amendment requires independent approval');
  internalVerifyBackendDependencyFiles(context, clearance);
  assert.equal(clearance.reviewReport, backendReportPath);
  const reportBytes = bytes(backendReportPath);
  assert.equal(backendDigest(reportBytes), clearance.reviewReportSha256, 'Changed independent backend report');
  const report = JSON.parse(reportBytes);
  assert.equal(report.format, 'alageum-backend-security-independent-review-v1'); assert.equal(report.status, clearance.status);
  assert.equal(report.baselineCommit, backendBaselineCommit); assert.equal(report.baselineTree, backendBaselineTree);
  assert.equal(report.approvedDependenciesSha256, backendDigest(JSON.stringify(clearance.dependencies)));
  assert.equal(report.packageSha256, backendFixedFiles['backend-node/package.json']);
  assert.equal(report.lockSha256, backendFixedFiles['backend-node/package-lock.json']);
  assert.deepEqual(report.packageUpdates, { parent: '@strapi/upload', sharp: ['0.35.4', '0.35.5'], changedLockRecords: 27, strapi: '5.56.0' });
  assert.deepEqual(report.proofSupport, { modified: 6, added: 9, predecessorPaths: 9, inheritedPaths: 598 });
  for (const field of ['sourceUiChanges', 'recordChanges', 'geometryMaterialChanges', 'pageAdapterChanges', 'workflowChanges', 'priorApprovalChanges', 'coordinatorChanges', 'auditGateChanges', 'frontendDependencyChanges']) assert.equal(report[field], 0, `Unapproved backend scope ${field}`);
  return clearance;
}
export function assertBackendDependencies(expectedFiles, read = readBackendBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertBackendDependencies(context, expectedFiles));
}
export function internalAssertBackendDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash } = proofOperations(context);
    const changedIncludingJoint = Object.entries(expectedFiles).filter(([file, expected]) => hash(file) !== expected);
    const joint = changedIncludingJoint.filter(([file, expected]) => Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]);
    internalAssertJointDependencies(context, Object.fromEntries(joint));
    const changedAll = changedIncludingJoint.filter(([file, expected]) => !Object.hasOwn(jointPredecessors, file) || expected !== jointPredecessors[file]);
    if (!changedAll.length) return;
    const latest = changedAll.filter(([file, expected]) => Object.hasOwn(combinedPredecessors, file) && expected === combinedPredecessors[file]);
    internalAssertCombinedDependencies(context, Object.fromEntries(latest));
    const changed = changedAll.filter(([file, expected]) => !Object.hasOwn(combinedPredecessors, file) || expected !== combinedPredecessors[file]);
    if (!changed.length) return;
    for (const [file, expected] of changed) {
      assert.ok(Object.hasOwn(backendPredecessors, file), `Changed unreviewed backend dependency ${file}`);
      assert.equal(expected, backendPredecessors[file], `Wrong backend security predecessor ${file}`);
    }
    const clearance = internalVerifyBackendAmendment(context);
    internalAssertCombinedDependencies(context, Object.fromEntries(changed.map(([file]) => [file, clearance.dependencies.reviewedFiles[file]])));
  });
}
