import { jointPredecessors, internalAssertJointDependencies } from './joint-site-reviewed-dependencies.mjs';
import { ktpbPredecessors, internalAssertKtpbDependencies } from './ktpb-source-context-reviewed-dependencies.mjs';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import { internalAssertSecurityDependencies } from './frontend-security-reviewed-dependencies.mjs';
import { internalAssertCorrectionDependencies } from './ptmm-browser-correction-reviewed-dependencies.mjs';
// Exact source/UI and browser successor to PR40. This leaf reads raw bytes only;
// it never calls an older verifier, projects historical bytes or caches authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ptmmReviewDir = 'docs/catalog-transformers-2026/review/ptmm-dimension-qualification';
export const ptmmClearancePath = `${ptmmReviewDir}/clearance.json`;
export const ptmmReportPath = `${ptmmReviewDir}/independent-review.json`;
export const ptmmBaselineCommit = '27e143efa1e0cbe850887a6807b17ea29a2877da';
export const ptmmBaselineTree = 'aa54618c5f6f6602899dc87422082ff5d1ca678e';
export const ptmmPredecessors = Object.freeze({
  ".github/workflows/ci.yml": "29327c64c02e2e9d8ce62fcf782e516e9bd0c08430c0f554e3b12064aa31e986",
  "frontend/components/catalog/Comparison.js": "1a16a142fbba09180eb99e11a043743af47efb1af22635fe1af88082656e6055",
  "frontend/components/catalog/LiveCatalog.js": "0fac247a4162fc8a9618998fca8e40c1a9e7004f10c45555c639a2420c62c8ef",
  "frontend/tests/catalog-comparison-specs.test.mjs": "c93fb9bb1cf285a3f4e375e6cee6ad1bc75e17c91070ec70792b192707cd420a",
  "frontend/components/catalog/ImportedProductData.js": "a7f478e4e78f0dc894641eb2db56808eb1604ea66bd41cb80b094590685cb4a4",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs": "6ad4bdb7c5dace0f3dc2effe5c2c919d79ef5e7ea541d9fa772898719ada40ad",
  "scripts/catalog/visual-presentation-reviewed-dependencies.mjs": "eceb99b8fbc1a0a52a6dbb6756f43d49d36a910aecc2b8edb50e3c07c11a3c38",
  "frontend/tests/helpers/visual-presentation-historical-bytes.mjs": "af06ebe3f20976a5360fad739939ed022e5e60b7bf025b62b60520fc6cae9a33",
  "frontend/tests/visual-presentation-amendment.test.mjs": "0bcf64814f15b6db3e7c8ba8398aa25aa6d7d6d3a222e0f5a355822e13dd672a",
  "frontend/tests/transformer-asset-completion.test.mjs": "508622cad1f6bcad73c795cdf222da81d73e6a2ee26e7b17f97f6ade5c05cc8d",
  ".gitignore": "6ae95a6d226fb48d54d7d25043ba523334822712d1fdca4dcf9d55641138fd07"
});
export const ptmmRequiredFiles = Object.freeze([
  "frontend/e2e/helpers/ptmm-qualification-dom.mjs",
  "frontend/e2e/helpers/ptmm-browser-events.mjs",
  "frontend/tests/ptmm-browser-evidence.test.mjs",
  ".github/workflows/ci.yml",
  ".gitignore",
  "backend-node/src/domain/catalog-identity.js",
  "backend-node/src/domain/catalog-source.js",
  "backend-node/src/domain/catalog.js",
  "backend-node/src/domain/quotes.js",
  "docs/catalog-transformers-2026/review/catalog-browser-assertions/clearance.json",
  "docs/catalog-transformers-2026/review/catalog-browser-assertions/independent-review.json",
  "docs/catalog-transformers-2026/review/catalog-visual-presentation/README.md",
  "docs/catalog-transformers-2026/review/catalog-visual-presentation/clearance.json",
  "docs/catalog-transformers-2026/review/catalog-visual-presentation/historical-test-bytes.json",
  "docs/catalog-transformers-2026/review/catalog-visual-presentation/independent-review.json",
  "docs/catalog-transformers-2026/review/protection-context-integration/clearance.json",
  "docs/catalog-transformers-2026/review/protection-context-integration/independent-review.json",
  "docs/catalog-transformers-2026/review/ptmm-dimension-qualification/README.md",
  "docs/catalog-transformers-2026/review/ptmm-dimension-qualification/fixed-dependencies.json",
  "docs/catalog-transformers-2026/review/ptmm-dimension-qualification/historical-test-bytes.json",
  "docs/catalog-transformers-2026/review/ptmm-dimension-qualification/source-evidence.json",
  "docs/catalog-transformers-2026/review/ptmm-dimension-qualification/source-ui-review.json",
  "frontend/components/catalog/CatalogSpecValue.js",
  "frontend/components/catalog/Comparison.js",
  "frontend/components/catalog/ImportedProductData.js",
  "frontend/components/catalog/LiveCatalog.js",
  "frontend/components/catalog/ProductDetails.js",
  "frontend/components/catalog/models/createEquipmentViewer.js",
  "frontend/components/catalog/source-context/CatalogSourceContext.module.css",
  "frontend/e2e/catalog.spec.js",
  "frontend/e2e/fixtures/ptmm-public-dtos.json",
  "frontend/e2e/helpers/ptmm-qualification-fixtures.mjs",
  "frontend/e2e/ptmm-qualification.spec.js",
  "frontend/lib/catalog/apiData.js",
  "frontend/lib/catalog/data.js",
  "frontend/lib/catalog/grouping.js",
  "frontend/lib/catalog/models/protectionExampleGeometry.js",
  "frontend/lib/catalog/models/protectionExampleTypes.js",
  "frontend/lib/catalog/models/transformer2026Shape.js",
  "frontend/lib/catalog/presentation.js",
  "frontend/lib/catalog/ptmmDimensionQualification.js",
  "frontend/lib/catalog/query.js",
  "frontend/lib/catalog/source.js",
  "frontend/lib/catalog/sources-manifest.json",
  "frontend/lib/catalog/sources.js",
  "frontend/package-lock.json",
  "frontend/package.json",
  "frontend/playwright.catalog.config.js",
  "frontend/playwright.ptmm-qualification.config.mjs",
  "frontend/public/catalog-source/page-068.webp",
  "frontend/public/catalog-source/page-069.webp",
  "frontend/tests/catalog-browser-amendment.test.mjs",
  "frontend/tests/catalog-comparison-specs.test.mjs",
  "frontend/tests/equipment-viewer-presentation.test.mjs",
  "frontend/tests/helpers/historical-reviewed-bytes.mjs",
  "frontend/tests/helpers/ptmm-qualification-historical-bytes.mjs",
  "frontend/tests/helpers/render-catalog-spec-value.mjs",
  "frontend/tests/helpers/visual-presentation-historical-bytes.mjs",
  "frontend/tests/protection-context-amendment.test.mjs",
  "frontend/tests/ptmm-browser-contract.test.mjs",
  "frontend/tests/ptmm-dimension-qualification.test.mjs",
  "frontend/tests/ptmm-qualification-amendment.test.mjs",
  "frontend/tests/source-context-viewport.test.mjs",
  "frontend/tests/transformer-asset-completion.test.mjs",
  "frontend/tests/visual-presentation-amendment.test.mjs",
  "scripts/catalog/catalog-browser-reviewed-dependencies.mjs",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs",
  "scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs",
  "scripts/catalog/visual-presentation-reviewed-dependencies.mjs"
]);
export const ptmmSourceUiFiles = Object.freeze({
  "frontend/components/catalog/CatalogSpecValue.js": "2f17c69d29d5ee96275555391e443f37f0f4f577aab6366f7f45d20e67e19c8c",
  "frontend/components/catalog/Comparison.js": "756435b644592c5719776f67ef0bd146c69366635e47fb948bf02ac0aadb81cd",
  "frontend/components/catalog/ImportedProductData.js": "930b86b108abd7b839acbf62a7ced8c4d6ffcd9bed82babe0bfb404b34c6683d",
  "frontend/components/catalog/LiveCatalog.js": "81d2562f9b2be3e23e1105f988e00595f4707f56829290fec0e8528f33675cf4",
  "frontend/lib/catalog/ptmmDimensionQualification.js": "1300b65ff65e908471a6188a7f0fdc7f7e958997fdc06fc06331b08df45f17b0",
  "frontend/tests/catalog-comparison-specs.test.mjs": "c903c8cbc916dbda1e8d4f32c6ce09f9ac49c45317eff1889627267150feb2c8",
  "frontend/tests/helpers/render-catalog-spec-value.mjs": "57e2cbf02cee481b9961d20892428c6ac1cfa5abdfbd47dfa7939b18c332ca76",
  "frontend/tests/ptmm-dimension-qualification.test.mjs": "03beaa1778bfff62ce1965ed8001324f09639e5c98db1e765926b7e1f1376ecd"
});
export const ptmmAffectedIds = Object.freeze(['cat-ptm-tded-v002', 'cat-ptm-tded-v005', 'cat-ptm-tded-v008']);
const fixedPath = `${ptmmReviewDir}/fixed-dependencies.json`;
const fixedSha256 = '37f53534afa3d98d286a5a7cd1e866560b38c612dd153f81dac538f0cbfc6313';
const sourceUiSha256 = '4fc8d837f2ceb97dca1cbb6fa66f6490db2de97d9753654fbb0c895e32e23fa3';
export const ptmmDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readPtmmBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid PTMM review path');
  return fs.readFileSync(path.join(root, file));
};

/** Candidate integrity alone is not release approval. */
export function verifyPtmmQualificationDependencyFiles(clearance, read = readPtmmBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyPtmmQualificationDependencyFiles(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyPtmmQualificationDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { bytes: read, hash: proofHash, json: proofJson } = proofOperations(context);

    assert.equal(clearance.format, 'alageum-ptmm-qualification-clearance-v1');
    assert.equal(clearance.baselineCommit, ptmmBaselineCommit); assert.equal(clearance.baselineTree, ptmmBaselineTree);
    assert.deepEqual(clearance.dependencies.predecessors, ptmmPredecessors, 'Changed PTMM predecessor scope or hashes');
    const reviewed = clearance.dependencies.reviewedFiles;
    assert.deepEqual(Object.keys(reviewed).sort(), [...ptmmRequiredFiles].sort(), 'Incomplete or overbroad PTMM dependency closure');
    const fixedBytes = read(fixedPath);
    assert.equal(ptmmDigest(fixedBytes), fixedSha256, 'Changed PTMM fixed dependency map');
    for (const [file, expected] of Object.entries(JSON.parse(fixedBytes))) {
      if (Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]) internalAssertJointDependencies(context, { [file]: expected });
      else if (Object.hasOwn(ktpbPredecessors, file) && expected === ktpbPredecessors[file]) internalAssertKtpbDependencies(context, { [file]: expected });
      else if (file === 'frontend/package-lock.json') internalAssertSecurityDependencies(context, { [file]: expected });
      else assert.equal(proofHash(file), expected, `Changed fixed PTMM dependency ${file}`);
    }
    for (const [file, expected] of Object.entries(ptmmSourceUiFiles)) {
      assert.equal(reviewed[file], expected, `Changed independently reviewed PTMM source/UI pin ${file}`);
      if (Object.hasOwn(jointPredecessors, file) && expected === jointPredecessors[file]) internalAssertJointDependencies(context, { [file]: expected });
      else assert.equal(proofHash(file), expected, `Changed independently reviewed PTMM source/UI bytes ${file}`);
    }
    internalAssertCorrectionDependencies(context, reviewed);
    const sourceUi = proofJson(`${ptmmReviewDir}/source-ui-review.json`);
    assert.equal(proofHash(`${ptmmReviewDir}/source-ui-review.json`), sourceUiSha256);
    assert.deepEqual(sourceUi.reviewedLogicFiles, ptmmSourceUiFiles); assert.deepEqual(sourceUi.affectedIds, ptmmAffectedIds);
    assert.equal(sourceUi.status, 'source-ui-passed-pending-separate-gate-amendment');
    return clearance;
  });
}

export function verifyPtmmQualificationAmendment(read = readPtmmBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 0, read, inputs: [] },
    context => internalVerifyPtmmQualificationAmendment(context));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyPtmmQualificationAmendment(context) {
  return evaluateProof(context, () => {

    return prove(context, verifyPtmmQualificationAmendmentIdentity, 'approved', ptmmClearancePath, internalVerifyPtmmQualificationAmendmentCanonical);
  });
}

// Each entry must name its exact historical byte hash. Any changed file outside
// this bounded successor remains an error, including after a successful call.
export function assertPtmmQualificationDependencies(expectedFiles, read = readPtmmBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertPtmmQualificationDependencies(context, expectedFiles));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertPtmmQualificationDependencies(context, expectedFiles) {
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
      assert.ok(Object.hasOwn(ptmmPredecessors, file), `Changed unreviewed PTMM dependency ${file}`);
      assert.equal(expected, ptmmPredecessors[file], `Wrong PTMM predecessor hash ${file}`);
    }
    const clearance = internalVerifyPtmmQualificationAmendment(context);
    internalAssertCorrectionDependencies(context, Object.fromEntries(changed.map(({ file }) => [file, clearance.dependencies.reviewedFiles[file]])));
  });
}

const verifyPtmmQualificationAmendmentIdentity = Symbol('verifyPtmmQualificationAmendment');

function internalVerifyPtmmQualificationAmendmentCanonical(context, clearance) {
  const { bytes: read } = proofOperations(context);
  assert.equal(clearance.status, 'approved-bounded-ptmm-qualification', 'PTMM qualification requires independent approval');
  internalVerifyPtmmQualificationDependencyFiles(context, clearance);
  assert.equal(clearance.reviewReport, ptmmReportPath);
  const bytes = read(ptmmReportPath);
  assert.equal(ptmmDigest(bytes), clearance.reviewReportSha256, 'Changed independent PTMM report');
  const report = JSON.parse(bytes);
  assert.equal(report.format, 'alageum-ptmm-qualification-independent-review-v1'); assert.equal(report.status, clearance.status);
  assert.equal(report.baselineCommit, ptmmBaselineCommit); assert.equal(report.baselineTree, ptmmBaselineTree);
  assert.equal(report.approvedDependenciesSha256, ptmmDigest(JSON.stringify(clearance.dependencies)));
  assert.equal(report.sourceUiReviewSha256, sourceUiSha256); assert.deepEqual(report.affectedIds, ptmmAffectedIds);
  assert.equal(report.dimensionCellsPerMode, 6); assert.equal(report.otherRecordsUnchanged, 840); assert.equal(report.rawRecordsPreserved, 843);
  assert.equal(report.sourceUnitWording, 'В исходной строке единица измерения не указана; обозначение „мм“ требует подтверждения.');
  assert.deepEqual(report.browserEvidence, { readability: 'cell-and-ancestor-bounds', units: 'rendered-dom', console: 'bounded-per-case-page-events' });
  assert.equal(report.separateBrowserCases, 16); assert.equal(report.existingCatalogCases, 254);
  assert.equal(report.existingSuiteChanges, 0); assert.equal(report.thresholdChanges, 0);
  assert.equal(report.existingCatalogJobTimeoutMinutes, 25); assert.equal(report.existingCatalogStepTimeoutMinutes, 18);
  assert.equal(report.qualificationJobTimeoutMinutes, 15); assert.equal(report.qualificationStepTimeoutMinutes, 6);
  assert.equal(report.geometryMaterialChanges, 0); assert.equal(report.recordChanges, 0); assert.equal(report.pageChanges, 0);
  return clearance;

}
