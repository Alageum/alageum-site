import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
import { ktpbPredecessors, internalAssertKtpbDependencies } from './ktpb-source-context-reviewed-dependencies.mjs';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import { internalAssertPtmmQualificationDependencies } from './ptmm-qualification-reviewed-dependencies.mjs';
// Exact presentation-only successor to PR36. Fresh raw reads; no older gate calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const visualReviewDir = 'docs/catalog-transformers-2026/review/catalog-visual-presentation';
export const visualClearancePath = `${visualReviewDir}/clearance.json`;
export const visualReportPath = `${visualReviewDir}/independent-review.json`;
export const visualBaselineCommit = 'c83265e76c3c671e84e97ed6d8527f788abe46e8';
export const visualBaselineTree = 'bec2becfba7dd142d548d241ce0210900ee3731c';
export const visualPredecessors = Object.freeze({
  "frontend/tests/helpers/historical-reviewed-bytes.mjs": "0546ba1c64f7331cf57f93efebbcac2f3a54ff3e98078b6091127a60cc955500",
  "frontend/components/catalog/models/createEquipmentViewer.js": "145ea78f14dc5f2a211bf7c7befadf851cefe2a3ecf1c1942086f069811a65e7",
  "frontend/components/catalog/source-context/CatalogSourceContext.module.css": "0ee83f648f3f6904c4522c1f7cda1b4a0d38f8805f8e1456eaf46d76e8f028c3",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs": "0cf8dfcdf11e933af1d5cf2d88aa8f4c878730c632538fcefd3457b4236aaa6e",
  "scripts/catalog/catalog-browser-reviewed-dependencies.mjs": "808f1034297f0b3ab62826a339373287684a1df5bf173b06d9162d83976cc279",
  "frontend/tests/transformer-asset-completion.test.mjs": "9541ff421a159dfc5e6781def30f64d1738733ca8bb135b616cab52ca6fa86d6",
  "frontend/tests/catalog-browser-amendment.test.mjs": "df7d2e4fb399023b597dfaed3797f5cbaabce452d1c7a54b177fb05d96fd5e80",
  "frontend/tests/protection-context-amendment.test.mjs": "36ab081e0d832126e5281f22da9f30249fc91cc66ad023e8f09f71e86b307439"
});
export const visualRequiredFiles = Object.freeze([
  ...Object.keys(visualPredecessors),
  'frontend/tests/equipment-viewer-presentation.test.mjs', 'frontend/tests/source-context-viewport.test.mjs',
  'frontend/tests/visual-presentation-amendment.test.mjs', 'frontend/tests/helpers/visual-presentation-historical-bytes.mjs',
  'scripts/catalog/visual-presentation-reviewed-dependencies.mjs',
  `${visualReviewDir}/README.md`, `${visualReviewDir}/historical-test-bytes.json`,
]);
const fixed = Object.freeze({
  "docs/catalog-transformers-2026/review/protection-context-integration/clearance.json": "e5bd71b71484553680bcd7056aa4dfbc84c012f884038c0e753cc60d1dd576aa",
  "docs/catalog-transformers-2026/review/protection-context-integration/independent-review.json": "fa98e92c5de1edee2f281f14aa54da1dbaf67f576983edd62824ad6098a22214",
  "docs/catalog-transformers-2026/review/catalog-browser-assertions/clearance.json": "59b6ee5c2eff75482fc2982ff591237f8975c8ff14affe459b43bff601ff0885",
  "docs/catalog-transformers-2026/review/catalog-browser-assertions/independent-review.json": "592e59a3085ea9addbc5b031acfbd39e30bffde55720889c4cd53197365e5e28",
  "frontend/e2e/catalog.spec.js": "cc06ec1299f040b684785837f16dba1c4f1f8faa1e6e0170d8f0df196cc8ad67",
  "frontend/lib/catalog/models/protectionExampleGeometry.js": "4d545c102d7b8443f4ce18b80df9449b2db56fd5cbb6d13f58066a5fea02bef9",
  "frontend/lib/catalog/models/protectionExampleTypes.js": "6de7d7a8331548541d792df1b0773c5b87499b60afaa4bffc6b0d10573683c16",
  "docs/catalog-transformers-2026/review/catalog-visual-presentation/historical-test-bytes.json": "b614eee30bff041c851590b2ce0695a0e3a7180188adba1680a6e366d9f78b0e"
});
export const visualDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readVisualBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid visual presentation review path');
  return fs.readFileSync(path.join(root, file));
};
export function verifyVisualPresentationAmendment(read = readVisualBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalVerifyVisualPresentationAmendment(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyVisualPresentationAmendment(context) {
  return evaluateProof(context, () => {

    return prove(context, verifyVisualPresentationAmendmentIdentity, 'approved', visualClearancePath, internalVerifyVisualPresentationAmendmentCanonical);
  });
}
// Invocation-scoped: no cached authority, virtual bytes or reusable approval token.
export function assertVisualPresentationDependencies(expectedFiles, read = readVisualBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertVisualPresentationDependencies(context, expectedFiles));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertVisualPresentationDependencies(context, expectedFiles) {
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
    for (const { file, expected } of changed) {
      assert.ok(Object.hasOwn(visualPredecessors, file), `Changed unreviewed visual presentation dependency ${file}`);
      assert.equal(expected, visualPredecessors[file], `Wrong visual presentation predecessor ${file}`);
    }
    const clearance = internalVerifyVisualPresentationAmendment(context);
    internalAssertPtmmQualificationDependencies(context, Object.fromEntries(changed.map(({ file }) => [file, clearance.dependencies.reviewedFiles[file]])));
  });
}

const verifyVisualPresentationAmendmentIdentity = Symbol('verifyVisualPresentationAmendment');

function internalVerifyVisualPresentationAmendmentCanonical(context, clearance) {
  const { bytes: read } = proofOperations(context);
  assert.equal(clearance.format, 'alageum-visual-presentation-clearance-v1');
  assert.equal(clearance.status, 'approved-bounded-visual-presentation', 'Visual presentation requires independent approval');
  assert.equal(clearance.baselineCommit, visualBaselineCommit); assert.equal(clearance.baselineTree, visualBaselineTree);
  assert.deepEqual(clearance.dependencies.predecessors, visualPredecessors, 'Changed visual predecessor scope or hashes');
  const reviewed = clearance.dependencies.reviewedFiles;
  assert.deepEqual(Object.keys(reviewed).sort(), [...visualRequiredFiles].sort(), 'Incomplete or overbroad visual dependency scope');
  assert.equal(reviewed['frontend/components/catalog/models/createEquipmentViewer.js'], '46efdcd611b69deba5a3d1bb30fe4ee95c72b705ce569a140252aba918fafe27', 'Changed reviewed exposure correction');
  assert.equal(reviewed['frontend/components/catalog/source-context/CatalogSourceContext.module.css'], '0d13bcc3c0b8131c94427904aad26cd5ee45f8ac2d36a452869d8317512e4218', 'Changed reviewed viewport correction');
  internalAssertPtmmQualificationDependencies(context, fixed);
  internalAssertPtmmQualificationDependencies(context, reviewed);
  assert.equal(clearance.reviewReport, visualReportPath);
  const reportBytes = read(visualReportPath);
  assert.equal(visualDigest(reportBytes), clearance.reviewReportSha256, 'Changed independent visual presentation report');
  const report = JSON.parse(reportBytes);
  assert.equal(report.format, 'alageum-visual-presentation-independent-review-v1'); assert.equal(report.status, clearance.status);
  assert.equal(report.baselineCommit, visualBaselineCommit); assert.equal(report.baselineTree, visualBaselineTree);
  assert.equal(report.approvedDependenciesSha256, visualDigest(JSON.stringify(clearance.dependencies)));
  assert.deepEqual(report.modelTypes, ['source69-ptm-u1-example', 'source69-tde9-u3-example']);
  assert.deepEqual(report.exposure, { reviewedTypes: 1, otherTypes: 1.45 });
  assert.equal(report.sourceImageMaxHeight, 'min(39rem, max(1rem, calc(100svh - 96px - 3rem)))');
  assert.equal(report.hostedCaseCount, 254); assert.equal(report.thresholdChanges, 0);
  assert.equal(report.geometryMaterialChanges, 0); assert.equal(report.recordChanges, 0); assert.equal(report.pageChanges, 0);
  return clearance;

}
