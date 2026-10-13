import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
import { combinedPredecessors, internalAssertCombinedDependencies } from './combined-eds-auth-reviewed-dependencies.mjs';
import { backendPredecessors, internalAssertBackendDependencies } from './backend-security-reviewed-dependencies.mjs';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import { ktpbPredecessors, internalAssertKtpbDependencies } from './ktpb-source-context-reviewed-dependencies.mjs';
// A bounded PR42 dependency successor. Reads current bytes only; no predecessor
// verifier, historical-byte substitution, cross-invocation cache or hash refresh.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const securityReviewDir = 'docs/catalog-transformers-2026/review/frontend-dependency-security';
export const securityClearancePath = `${securityReviewDir}/clearance.json`;
export const securityReportPath = `${securityReviewDir}/independent-review.json`;
export const securityBaselineCommit = '47db11d6052e82455577f3d9190230d241c5b4c2';
export const securityBaselineTree = 'c02884c801b0599778dcd9d67d3aaf693619e905';
export const securityPredecessors = Object.freeze({
  "frontend/package-lock.json": "94b8443256140215757801375e4d5d46d32bd3a343308b3b6100a6731f579ba2",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs": "2ea8130a63c43e0ce0cf14f8db3c03dac581461c1b6659ddff487f72c109763d",
  "scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs": "33b738f5cbf26e2caa7648500546ce464c5d4bdaea90d683b4a4b8fd0e3ba863",
  "scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs": "544c7b01bee7126da375c1f299765eb27e9c9f732cb17a8ddd84563e6d17567a",
  "frontend/tests/helpers/ptmm-browser-correction-historical-bytes.mjs": "6341e54ad21eaa1873da9c28047b7cd00e175c6efc9321b70b5c427caf50c1b7",
  "frontend/tests/ptmm-browser-correction-amendment.test.mjs": "08600bb08062a67f0dcaab4bd5113362a7995edc6f058314a959cad40c8d2a92",
  "frontend/tests/transformer-asset-completion.test.mjs": "d8e4bbfc4c8fa3f51241cafb5b343eed056322670fd36d305f295a2024653485"
});
const baselinePath = `${securityReviewDir}/baseline-dependencies.json`;
const baselineHash = 'b62c97b5e0ba04537000b653fb855a6ff26eb8fec54267bd7007bce0b7d725c6';
const fixedLockHash = 'd62f0226785ad9bc22c460c9e43a4125f06183c5a5691fd125e760d75d3a4d17';
export const securityNewFiles = Object.freeze([
  'scripts/catalog/frontend-security-reviewed-dependencies.mjs',
  'frontend/tests/frontend-security-amendment.test.mjs',
  'frontend/tests/helpers/frontend-security-historical-bytes.mjs',
  `${securityReviewDir}/baseline-dependencies.json`,
  `${securityReviewDir}/historical-test-bytes.json`,
  `${securityReviewDir}/lock-package-diff.json`,
  `${securityReviewDir}/README.md`,
]);
export const securityDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readSecurityBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid security amendment path');
  return fs.readFileSync(path.join(root, file));
};
export function securityRequiredFiles(read = readSecurityBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalSecurityRequiredFiles(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalSecurityRequiredFiles(context) {
  return evaluateProof(context, () => {
    const { bytes: read } = proofOperations(context);
    const bytes = read(baselinePath);
    assert.equal(securityDigest(bytes), baselineHash, 'Changed frozen PR42 security baseline');
    return [...Object.keys(JSON.parse(bytes)), ...securityNewFiles].sort();
  });
}
export function verifySecurityDependencyFiles(clearance, read = readSecurityBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifySecurityDependencyFiles(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifySecurityDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { json: proofJson } = proofOperations(context);

    assert.equal(clearance.format, 'alageum-frontend-security-clearance-v1');
    assert.equal(clearance.baselineCommit, securityBaselineCommit); assert.equal(clearance.baselineTree, securityBaselineTree);
    assert.deepEqual(clearance.dependencies.predecessors, securityPredecessors, 'Changed security predecessor scope or hashes');
    const reviewed = clearance.dependencies.reviewedFiles;
    assert.deepEqual(Object.keys(reviewed).sort(), internalSecurityRequiredFiles(context), 'Incomplete or overbroad security dependency closure');
    const baseline = proofJson(baselinePath);
    for (const [file, expected] of Object.entries(baseline)) {
      if (Object.hasOwn(securityPredecessors, file)) {
        assert.equal(securityPredecessors[file], expected, `Wrong PR42 security predecessor ${file}`);
        assert.notEqual(reviewed[file], expected, `Mixed or unchanged security successor ${file}`);
      } else assert.equal(reviewed[file], expected, `Changed immutable PR42 security pin ${file}`);
    }
    assert.equal(reviewed['frontend/package-lock.json'], fixedLockHash, 'Unreviewed dependency resolution');
    internalAssertKtpbDependencies(context, reviewed);
    return clearance;
  });
}
export function verifySecurityAmendment(read = readSecurityBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalVerifySecurityAmendment(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifySecurityAmendment(context) {
  return evaluateProof(context, () => {

    return prove(context, verifySecurityAmendmentIdentity, 'approved', securityClearancePath, internalVerifySecurityAmendmentCanonical);
  });
}
export function assertSecurityDependencies(expectedFiles, read = readSecurityBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertSecurityDependencies(context, expectedFiles));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertSecurityDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash: proofHash } = proofOperations(context);
    const changedIncludingJoint = Object.entries(expectedFiles).filter(([file, expected]) => proofHash(file) !== expected);
    const joint = changedIncludingJoint.filter(([file, expected]) => Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]);
    internalAssertJointDependencies(context, Object.fromEntries(joint));
    const changedIncludingCombined = changedIncludingJoint.filter(([file, expected]) => !Object.hasOwn(jointPredecessors, file) || expected !== jointPredecessors[file]);
    if (!changedIncludingCombined.length) return;
    const combined = changedIncludingCombined.filter(([file, expected]) => Object.hasOwn(combinedPredecessors, file) && expected === combinedPredecessors[file]);
    internalAssertCombinedDependencies(context, Object.fromEntries(combined));
    const changedAll = changedIncludingCombined.filter(([file, expected]) => !Object.hasOwn(combinedPredecessors, file) || expected !== combinedPredecessors[file]);
    if (!changedAll.length) return;
    const latest = changedAll.filter(([file, expected]) => Object.hasOwn(backendPredecessors, file) && expected === backendPredecessors[file]);
    internalAssertBackendDependencies(context, Object.fromEntries(latest));
    const changed = changedAll.filter(([file, expected]) => !Object.hasOwn(backendPredecessors, file) || expected !== backendPredecessors[file]);
    if (!changed.length) return;
    const current = changed.filter(([file, expected]) => Object.hasOwn(ktpbPredecessors, file) && expected === ktpbPredecessors[file]);
    internalAssertKtpbDependencies(context, Object.fromEntries(current));
    const prior = changed.filter(([file, expected]) => !Object.hasOwn(ktpbPredecessors, file) || expected !== ktpbPredecessors[file]);
    if (!prior.length) return;
    for (const [file, expected] of prior) {
      assert.ok(Object.hasOwn(securityPredecessors, file), `Changed unreviewed security dependency ${file}`);
      assert.equal(expected, securityPredecessors[file], `Wrong frontend security predecessor ${file}`);
    }
    const clearance = internalVerifySecurityAmendment(context);
    internalAssertKtpbDependencies(context, Object.fromEntries(prior.map(([file]) => [file, clearance.dependencies.reviewedFiles[file]])));
  });
}

const verifySecurityAmendmentIdentity = Symbol('verifySecurityAmendment');

function internalVerifySecurityAmendmentCanonical(context, clearance) {
  const { bytes: read } = proofOperations(context);
  assert.equal(clearance.status, 'approved-bounded-frontend-security', 'Frontend security amendment requires independent approval');
  internalVerifySecurityDependencyFiles(context, clearance);
  assert.equal(clearance.reviewReport, securityReportPath);
  const bytes = read(securityReportPath);
  assert.equal(securityDigest(bytes), clearance.reviewReportSha256, 'Changed independent frontend security report');
  const report = JSON.parse(bytes);
  assert.equal(report.format, 'alageum-frontend-security-independent-review-v1'); assert.equal(report.status, clearance.status);
  assert.equal(report.baselineCommit, securityBaselineCommit); assert.equal(report.baselineTree, securityBaselineTree);
  assert.equal(report.approvedDependenciesSha256, securityDigest(JSON.stringify(clearance.dependencies)));
  assert.equal(report.lockSha256, fixedLockHash);
  assert.deepEqual(report.packageUpdates, { sharp: ['0.35.4', '0.35.5'], 'source-map-js': ['1.2.1', '1.2.2'], nativeBinaryEntries: 26 });
  for (const field of ['sourceUiChanges', 'recordChanges', 'geometryMaterialChanges', 'pageChanges', 'thresholdChanges', 'workflowChanges', 'priorApprovalChanges', 'backendDependencyChanges', 'auditGateChanges']) assert.equal(report[field], 0, `Unapproved frontend security scope ${field}`);
  return clearance;

}
