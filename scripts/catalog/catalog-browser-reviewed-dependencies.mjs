import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
import { ktpbPredecessors, internalAssertKtpbDependencies } from './ktpb-source-context-reviewed-dependencies.mjs';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import { visualPredecessors, internalAssertVisualPresentationDependencies } from './visual-presentation-reviewed-dependencies.mjs';
// Exact test-only successor to PR34. Raw bytes only; no historical verifier call.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const browserReviewDir = 'docs/catalog-transformers-2026/review/catalog-browser-assertions';
export const browserClearancePath = `${browserReviewDir}/clearance.json`;
export const browserReportPath = `${browserReviewDir}/independent-review.json`;
export const browserBaselineCommit = 'eace83de78e3167fe17a8dcd94ff72de6997974f';
export const browserBaselineTree = '1df444ca998debdfb8a61bd20ecec23cbf97961f';
export const browserTestPath = 'frontend/e2e/catalog.spec.js';
export const browserTestSha256 = 'cc06ec1299f040b684785837f16dba1c4f1f8faa1e6e0170d8f0df196cc8ad67';
export const browserPredecessors = Object.freeze({
  [browserTestPath]: '7609074a1aa0c7f35930ba1b125cfa166f5a194713daf722e32d8bc549a15a65',
  'frontend/tests/transformer-asset-completion.test.mjs': '95ec5797c9d4faa549cc67711a937ed4561abce2110932b6a90e7c659beda40c',
  'scripts/catalog/protection-context-reviewed-dependencies.mjs': 'e38831416b22581376c8604884906276d977c4d56197d8f7b2f9dd0bb9c775c0',
});
export const browserRequiredFiles = Object.freeze([
  ...Object.keys(browserPredecessors),
  'scripts/catalog/catalog-browser-reviewed-dependencies.mjs',
  'frontend/tests/catalog-browser-amendment.test.mjs',
  `${browserReviewDir}/README.md`,
]);
export const browserCorrections = Object.freeze(['paired-family-icon', 'original-measurement-mutations', 'family-query-record-kind']);
const historicalApprovals = Object.freeze({
  'docs/catalog-transformers-2026/review/protection-context-integration/clearance.json': 'e5bd71b71484553680bcd7056aa4dfbc84c012f884038c0e753cc60d1dd576aa',
  'docs/catalog-transformers-2026/review/protection-context-integration/independent-review.json': 'fa98e92c5de1edee2f281f14aa54da1dbaf67f576983edd62824ad6098a22214',
});
export const browserDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readBrowserBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid browser review path');
  return fs.readFileSync(path.join(root, file));
};

export function verifyBrowserAssertionAmendment(read = readBrowserBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalVerifyBrowserAssertionAmendment(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyBrowserAssertionAmendment(context) {
  return evaluateProof(context, () => {

    return prove(context, verifyBrowserAssertionAmendmentIdentity, 'approved', browserClearancePath, internalVerifyBrowserAssertionAmendmentCanonical);
  });
}

// Every historical obligation is checked. The owning invocation rechecks all
// consumed paths before a public result can return.
export function assertBrowserAssertionDependencies(expectedFiles, read = readBrowserBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertBrowserAssertionDependencies(context, expectedFiles));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertBrowserAssertionDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash: proofHash } = proofOperations(context);
    let changed = Object.entries(expectedFiles).map(([file, expected]) => ({ file, expected, actual: proofHash(file) })).filter(item => item.actual !== item.expected);
    if (!changed.length) return;
    const joint = changed.filter(({ file, expected }) => Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]);
    internalAssertJointDependencies(context, Object.fromEntries(joint.map(({ file, expected }) => [file, expected])));
    changed = changed.filter(({ file, expected }) => !Object.hasOwn(jointPredecessors, file) || expected !== jointPredecessors[file]);
    if (!changed.length) return;
    // Only the exact PR43 edge may bypass the older historical branch.
    const terminal = changed.filter(({ file, expected }) => Object.hasOwn(ktpbPredecessors, file) && expected === ktpbPredecessors[file]);
    internalAssertKtpbDependencies(context, Object.fromEntries(terminal.map(({ file, expected }) => [file, expected])));
    changed = changed.filter(({ file, expected }) => !Object.hasOwn(ktpbPredecessors, file) || expected !== ktpbPredecessors[file]);
    if (!changed.length) return;
    const browserChanges = [], visualChanges = {};
    for (const item of changed) {
      const { file, expected } = item;
      if (Object.hasOwn(browserPredecessors, file)) {
        assert.equal(expected, browserPredecessors[file], `Wrong browser predecessor hash ${file}`);
        browserChanges.push(item);
      } else {
        assert.ok(Object.hasOwn(visualPredecessors, file), `Changed unreviewed browser dependency ${file}`);
        visualChanges[file] = expected;
      }
    }
    if (browserChanges.length) {
      const clearance = internalVerifyBrowserAssertionAmendment(context);
      const current = {};
      for (const { file, actual } of browserChanges) {
        const expected = clearance.dependencies.reviewedFiles[file];
        if (Object.hasOwn(visualPredecessors, file)) current[file] = expected;
        else assert.equal(actual, expected, `Changed approved browser bytes ${file}`);
      }
      internalAssertVisualPresentationDependencies(context, current);
    }
    internalAssertVisualPresentationDependencies(context, visualChanges);
  });
}

const verifyBrowserAssertionAmendmentIdentity = Symbol('verifyBrowserAssertionAmendment');

function internalVerifyBrowserAssertionAmendmentCanonical(context, clearance) {
  const { bytes: read, hash: proofHash } = proofOperations(context);
  assert.equal(clearance.format, 'alageum-catalog-browser-clearance-v1');
  assert.equal(clearance.status, 'approved-three-browser-assertions', 'Browser assertion amendment requires independent approval');
  assert.equal(clearance.baselineCommit, browserBaselineCommit); assert.equal(clearance.baselineTree, browserBaselineTree);
  const { predecessors, reviewedFiles } = clearance.dependencies;
  assert.deepEqual(predecessors, browserPredecessors, 'Changed browser predecessor scope or hashes');
  assert.deepEqual(Object.keys(reviewedFiles).sort(), [...browserRequiredFiles].sort(), 'Incomplete or overbroad browser dependency scope');
  assert.equal(reviewedFiles[browserTestPath], browserTestSha256, 'Unapproved browser assertion bytes');
  const forwarded = {};
  for (const [file, expected] of Object.entries({ ...historicalApprovals, ...reviewedFiles })) {
    if (Object.hasOwn(visualPredecessors, file)) forwarded[file] = expected;
    else assert.equal(proofHash(file), expected, `Changed browser amendment dependency ${file}`);
  }
  internalAssertVisualPresentationDependencies(context, forwarded);
  assert.equal(clearance.reviewReport, browserReportPath);
  const reportBytes = read(browserReportPath);
  assert.equal(browserDigest(reportBytes), clearance.reviewReportSha256, 'Changed independent browser review');
  const report = JSON.parse(reportBytes);
  assert.equal(report.format, 'alageum-catalog-browser-independent-review-v1'); assert.equal(report.status, clearance.status);
  assert.equal(report.baselineCommit, browserBaselineCommit); assert.equal(report.baselineTree, browserBaselineTree);
  assert.equal(report.approvedDependenciesSha256, browserDigest(JSON.stringify(clearance.dependencies)));
  assert.deepEqual(report.corrections, browserCorrections); assert.equal(report.hostedCaseCount, 254);
  assert.equal(report.runtimeChanges, 0); assert.equal(report.pixelOrLayoutRelaxations, 0);
  return clearance;

}
