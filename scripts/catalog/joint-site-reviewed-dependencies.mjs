// Exact bounded local successor. Current bytes only; no inherited verifier imports.
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const jointReviewDir = "docs/catalog-transformers-2026/review/joint-site-integration";
export const jointClearancePath = "docs/catalog-transformers-2026/review/joint-site-integration/clearance.json";
export const jointReportPath = "docs/catalog-transformers-2026/review/joint-site-integration/independent-review.json";
export const jointCandidateEvidencePath = "docs/catalog-transformers-2026/review/joint-site-integration/candidate-evidence.json";
export const jointFixedFilesPath = "docs/catalog-transformers-2026/review/joint-site-integration/fixed-candidate-files.json";
export const jointBaselineCommit = "340c74f63be9b72f35f7ebec689562e2bcdb5ae8";
export const jointBaselineTree = "d97619b3e9c85233b458704b177740b9b9cca0e8";
export const jointCandidateCommit = "aa41d7bb4f1078f0fa76271d6ea6e208b9cfad6e";
export const jointCandidateTree = "46c9b63b700a9f5ea1ff3ce7b6ce88559b296c9a";
export const jointPriorAuthority = Object.freeze({
  "commit": "340c74f63be9b72f35f7ebec689562e2bcdb5ae8",
  "tree": "d97619b3e9c85233b458704b177740b9b9cca0e8",
  "applicationCommit": "7316cef4c92c084aa1b8e30756772d0b428dbc10",
  "applicationTree": "e553a93b6ef0b43682a419b98be4357de03ee77a",
  "clearancePath": "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/test-snapshot-parity/clearance.json",
  "files": {
    "docs/catalog-transformers-2026/review/combined-eds-auth/clearance.json": "cbde66c16dd10f4f9ac7a13eddac9df16bbb0855e517f43bb41e10063c754f53",
    "docs/catalog-transformers-2026/review/combined-eds-auth/independent-review.json": "267018dd18d2a686b0d0e08521c0946cf402948c1045b11f6432f60bf5d8360b",
    "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/clearance.json": "3c87b271a63c561aeb0a548bfdfa3b60ac90d59dfdc2117f194fef1fbf05d2cf",
    "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/browser-locator/independent-review.json": "29cbf4517c98855ec22a977b6f7a1a34e109d67c9fa9ea1d2d73a846f9e6f53b",
    "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/test-snapshot-parity/clearance.json": "302f5ab776de8ec5063ba59933874cff0b7ad38322406cc37edf67b8c63164f2",
    "docs/catalog-transformers-2026/review/combined-eds-auth/revisions/test-snapshot-parity/independent-review.json": "8b1a854395e74d2da5173a3e317b62ebe8cb3a8a9bcc02f8e40b07e31c4787eb"
  }
});
export const jointPredecessors = Object.freeze({
  "frontend/components/catalog/Catalog.js": "741c30401cbb853b7bfd7788bfbe6c4c7169efc1c3607c4c504f167603454c3e",
  "frontend/components/catalog/LiveCatalog.js": "81d2562f9b2be3e23e1105f988e00595f4707f56829290fec0e8528f33675cf4",
  "frontend/components/catalog/ProductDetails.js": "2abb9a7ed3a00f40f4218f6f0c5cd59849e945213f9b5305ad3725ce8a7d94ea",
  "frontend/tests/catalog-proof-parity.test.mjs": "a6965f8b5141240a7a9a172f98a21e1acc44f9178afd542a0e1b552cf1507f4c",
  "frontend/tests/combined-eds-auth-amendment.test.mjs": "8be87621adfc0956ed4664a28f04024e380f44648456d37acc8440d071eeafb4",
  "frontend/tests/helpers/combined-eds-auth-historical-bytes.mjs": "bf8fb67ba601312b5daf0107f7843fc45134bb2470003f434ea056e7a9d45cfb",
  "frontend/tests/transformer-asset-completion.test.mjs": "9344375165890038bab55815f932135c9b6de8dd7426740a09ffa719dc78abcf",
  "scripts/catalog/backend-security-reviewed-dependencies.mjs": "1c748be0d7275e464ec48232d74ee4a33b457e962213c532fc1b76057818453d",
  "scripts/catalog/catalog-browser-reviewed-dependencies.mjs": "077680e71a703697b952e1d245a942b490560d5686aa2bbdcd33669dd10d69b0",
  "scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs": "96e41bb37fdda94042be39c8b1a740d3d479e36f3a022a8f6f6f322fdf1558e4",
  "scripts/catalog/frontend-security-reviewed-dependencies.mjs": "b593fa2ce20149f7664c16b7896bbc889d3dbbea4c2876bfa0a6bff8ad964cf1",
  "scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs": "3c1c563dbc72eaf4f2448b6d3db89ec4d49bd520548a4eaa395aa7d5e6887c4b",
  "scripts/catalog/protection-context-reviewed-dependencies.mjs": "6583a90543b73c620b07baba5b81f0ce8db7cd8a84a3bf171f3864cfa2c34746",
  "scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs": "73a3ed20b0e67227830a305dc020ba9a3eb24ed3c0e1dbb24be1213c67d77013",
  "scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs": "51b448c09d08fd0d78fa1c6ccef95b1e822f041d864c3e4edca70af41ff3f038",
  "scripts/catalog/visual-presentation-reviewed-dependencies.mjs": "2792bf97cd7a89ff448420fb6f7a3d08713324afd746415bdf4816c75deea08e"
});
export const jointNewFiles = Object.freeze([
  "Design/README.md",
  "Design/assets/corporate-production.webp",
  "Design/design-tokens.json",
  "Design/index.html",
  "Design/styles.css",
  "docs/catalog-transformers-2026/review/joint-site-integration/README.md",
  "docs/catalog-transformers-2026/review/joint-site-integration/baseline-dependencies.json",
  "docs/catalog-transformers-2026/review/joint-site-integration/candidate-evidence.json",
  "docs/catalog-transformers-2026/review/joint-site-integration/fixed-candidate-files.json",
  "docs/catalog-transformers-2026/review/joint-site-integration/historical-test-bytes.json",
  "docs/investor-visual-2026-10-12/README.md",
  "docs/investor-visual-2026-10-12/browser-test-result.log",
  "docs/investor-visual-2026-10-12/catalog-geometry.json",
  "docs/investor-visual-2026-10-12/palette-contrast.json",
  "docs/investor-visual-2026-10-12/public-audit.json",
  "docs/investor-visual-2026-10-12/unit-test-result.log",
  "docs/investor-visual-2026-10-12/verification.json",
  "docs/photography/README.md",
  "frontend/app/(site)/contacts/page.js",
  "frontend/app/(site)/data-policy/page.js",
  "frontend/app/(site)/documents/page.js",
  "frontend/app/(site)/inquiry/inquiry.css",
  "frontend/app/(site)/manufacturers/[slug]/page.js",
  "frontend/app/(site)/manufacturers/page.js",
  "frontend/app/(site)/page.js",
  "frontend/app/(site)/projects/[slug]/page.js",
  "frontend/app/(site)/projects/page.js",
  "frontend/app/(site)/solutions/[slug]/page.js",
  "frontend/app/(site)/solutions/page.js",
  "frontend/app/(site)/workspace/workspace.css",
  "frontend/app/investor-pages.css",
  "frontend/app/site-shell.css",
  "frontend/components/catalog/ProductPhotoVisual.js",
  "frontend/components/catalog/ProductPhotograph.js",
  "frontend/components/catalog/ProductPhotograph.module.css",
  "frontend/components/public/CorporateArrow.js",
  "frontend/components/public/CorporatePage.js",
  "frontend/components/public/CorporateParts.js",
  "frontend/components/public/CorporatePhoto.js",
  "frontend/components/public/EditorialPage.js",
  "frontend/components/public/EnterpriseDirectory.js",
  "frontend/components/public/OfficeDirectory.js",
  "frontend/components/public/ProjectCTA.js",
  "frontend/components/public/SourceNote.js",
  "frontend/components/public/StaticCompanyPage.js",
  "frontend/e2e-photography/photography.spec.mjs",
  "frontend/e2e/company-pages.spec.js",
  "frontend/lib/catalog/photography-manifest.json",
  "frontend/lib/catalog/photography.js",
  "frontend/lib/public/company.js",
  "frontend/lib/public/pagesPreview.js",
  "frontend/lib/public/photography-manifest.json",
  "frontend/lib/public/photography.js",
  "frontend/playwright.photography.config.mjs",
  "frontend/public/photography/equipment/category-substations.webp",
  "frontend/public/photography/equipment/category-switchgear.webp",
  "frontend/public/photography/equipment/category-transformers.webp",
  "frontend/public/photography/equipment/dry-transformers.webp",
  "frontend/public/photography/equipment/kso-two-ten.webp",
  "frontend/public/photography/equipment/tm-series.webp",
  "frontend/public/photography/manufacturers/aemz.webp",
  "frontend/public/photography/manufacturers/asia-trafo.webp",
  "frontend/public/photography/manufacturers/elmo.webp",
  "frontend/public/photography/manufacturers/ktz.webp",
  "frontend/public/photography/manufacturers/petz.webp",
  "frontend/public/photography/manufacturers/utz.webp",
  "frontend/public/photography/projects/nura.webp",
  "frontend/public/photography/projects/petropavlovsk.webp",
  "frontend/public/photography/projects/yassy.webp",
  "frontend/scripts/audit-company-pages.mjs",
  "frontend/tests/company-pages.test.mjs",
  "frontend/tests/editorial-pages.test.mjs",
  "frontend/tests/helpers/joint-site-historical-bytes.mjs",
  "frontend/tests/helpers/photography-api-fixture.mjs",
  "frontend/tests/investor-pages.test.mjs",
  "frontend/tests/joint-site-amendment.test.mjs",
  "frontend/tests/photography.test.mjs",
  "scripts/catalog/joint-site-reviewed-dependencies.mjs"
]);
export const jointBoundaries = Object.freeze({
  "historicalApprovalChanges": 0,
  "coordinatorChanges": 0,
  "packageChanges": 0,
  "lockfileChanges": 0,
  "workflowChanges": 0,
  "auditGateChanges": 0,
  "catalogRecordChanges": 0,
  "catalogSourceUiChanges": 3,
  "geometryChanges": 0,
  "rfqContractChanges": 0,
  "cmsContractChanges": 0,
  "integratedFeaturePaths": 73,
  "proofAdapterChanges": 9,
  "testSupportChanges": 4,
  "newProofLeaves": 1,
  "photographicAssets": 15,
  "catalogPhotographMappings": 94,
  "catalogRecords": 843,
  "photographicMeaning": "reviewed illustrative manufacturer/type/series context; not exact SKU identity",
  "photoPublicationRights": "owner-confirmation-required-before-production",
  "cryptographicSigning": "unavailable",
  "signingFlags": "off-by-default",
  "googleLiveProvider": "not-verified",
  "egovProvider": "unavailable",
  "releaseApproval": false,
  "securityWaiver": false,
  "preservedFeatureDependencies": 17
});
Object.freeze(jointPriorAuthority.files);
const baselinePath = `${jointReviewDir}/baseline-dependencies.json`;
const baselineSha256 = '1bdb30c27a3412af2176c56c885d286c00c6f887e474dc06d5a9061f8ede900f';
const fixedPath = jointFixedFilesPath;
const fixedSha256 = '3cf372ad398090b8eabae7b06c9eb47a9b0ab107f39bc9dd04b22288632520a3';
const verifierPath = 'scripts/catalog/joint-site-reviewed-dependencies.mjs';
export const jointDigest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readJointBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid joint proof path');
  return fs.readFileSync(path.join(root, file));
};
export function jointRequiredFiles(read = readJointBytes) {
  return runFreshProof({ root, omittedReader: arguments.length === 0, read, inputs: [] },
    context => internalJointRequiredFiles(context));
}
export function internalJointRequiredFiles(context) {
  return evaluateProof(context, () => {
    const { bytes } = proofOperations(context), baseline = bytes(baselinePath);
    assert.equal(jointDigest(baseline), baselineSha256, 'Changed frozen prior joint baseline');
    const files = [...Object.keys(JSON.parse(baseline)), ...jointNewFiles].sort();
    assert.equal(new Set(files).size, files.length, 'Duplicate joint closure path');
    return files;
  });
}
export function verifyJointDependencyFiles(clearance, read = readJointBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyJointDependencyFiles(context, clearance));
}
export function internalVerifyJointDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { hash, json, bytes } = proofOperations(context);
    assert.equal(clearance.format, 'alageum-joint-site-clearance-v1');
    assert.equal(clearance.baselineCommit, jointBaselineCommit); assert.equal(clearance.baselineTree, jointBaselineTree);
    assert.equal(clearance.candidateCommit, jointCandidateCommit); assert.equal(clearance.candidateTree, jointCandidateTree);
    assert.deepEqual(clearance.boundaries, jointBoundaries, 'Changed joint feature/release boundary');
    assert.deepEqual(clearance.priorAuthority, jointPriorAuthority, 'Changed prior joint authority identity');
    assert.deepEqual(clearance.dependencies.predecessors, jointPredecessors, 'Changed joint predecessor scope or hashes');
    const reviewed = clearance.dependencies.reviewedFiles;
    const required = internalJointRequiredFiles(context);
    assert.deepEqual(Object.keys(reviewed).sort(), required, 'Incomplete or overbroad joint dependency closure');
    for (const [file, expected] of Object.entries(json(baselinePath))) {
      if (Object.hasOwn(jointPredecessors, file)) {
        assert.equal(jointPredecessors[file], expected, `Wrong prior joint predecessor ${file}`);
        assert.notEqual(reviewed[file], expected, `Mixed or unchanged joint successor ${file}`);
      } else assert.equal(reviewed[file], expected, `Changed immutable prior joint pin ${file}`);
    }
    for (const [file, expected] of Object.entries(jointPriorAuthority.files)) assert.equal(reviewed[file], expected, `Changed immutable prior joint authority ${file}`);
    const fixedBytes = bytes(fixedPath);
    assert.equal(jointDigest(fixedBytes), fixedSha256, 'Changed frozen joint candidate files');
    const fixed = JSON.parse(fixedBytes);
    assert.deepEqual(Object.keys(fixed).sort(), [...Object.keys(jointPredecessors), ...jointNewFiles]
      .filter(file => file !== verifierPath && file !== fixedPath).sort(), 'Incomplete fixed joint candidate scope');
    for (const [file, expected] of Object.entries(fixed)) assert.equal(reviewed[file], expected, `Unreviewed joint replacement ${file}`);
    assert.equal(reviewed[fixedPath], fixedSha256, 'Unreviewed joint fixed map');
    for (const [file, expected] of Object.entries(reviewed)) assert.equal(hash(file), expected, `Changed joint-reviewed bytes ${file}`);
    // Hash bindings freeze implementation, while these explicit invariants keep
    // this approval's limits legible and independent of any rollout claims.
    const evidence = json(jointCandidateEvidencePath);
    assert.equal(evidence.candidateCommit, jointCandidateCommit); assert.equal(evidence.candidateTree, jointCandidateTree);
    assert.deepEqual(evidence.boundaries, jointBoundaries);
    assert.deepEqual(evidence.priorAuthority, jointPriorAuthority);
    return clearance;
  });
}
const verifyJointIdentity = Symbol('verifyJointAmendment');
export function verifyJointAmendment(read = readJointBytes) {
  return runFreshProof({ root, omittedReader: arguments.length === 0, read, inputs: [] },
    context => internalVerifyJointAmendment(context));
}
export function internalVerifyJointAmendment(context) {
  return evaluateProof(context, () => prove(context, verifyJointIdentity, 'approved', jointClearancePath, verifyJointCanonical));
}
function verifyJointCanonical(context, clearance) {
  const { bytes } = proofOperations(context);
  assert.equal(clearance.status, 'approved-bounded-joint-site', 'Joint site integration amendment requires independent approval');
  internalVerifyJointDependencyFiles(context, clearance);
  assert.equal(clearance.reviewReport, jointReportPath);
  const reportBytes = bytes(jointReportPath);
  assert.equal(jointDigest(reportBytes), clearance.reviewReportSha256, 'Changed independent joint report');
  const report = JSON.parse(reportBytes);
  assert.equal(report.format, 'alageum-joint-site-independent-review-v1'); assert.equal(report.status, clearance.status);
  for (const field of ['baselineCommit', 'baselineTree', 'candidateCommit', 'candidateTree']) assert.equal(report[field], clearance[field]);
  assert.deepEqual(report.boundaries, jointBoundaries);
  assert.deepEqual(report.priorAuthority, jointPriorAuthority);
  assert.equal(report.approvedDependenciesSha256, jointDigest(JSON.stringify(clearance.dependencies)), 'Changed independently reviewed joint closure');
  assert.equal(report.reviewedVerifierSha256, clearance.dependencies.reviewedFiles[verifierPath]);
  assert.equal(report.reviewedFixedFilesSha256, fixedSha256);
  assert.equal(typeof report.reviewer, 'string'); assert.ok(report.reviewer.trim(), 'Missing independent joint reviewer');
  assert.equal(typeof report.outcome, 'string'); assert.ok(report.outcome.trim(), 'Missing independent joint outcome');
  return clearance;
}
export function assertJointDependencies(expectedFiles, read = readJointBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertJointDependencies(context, expectedFiles));
}
export function internalAssertJointDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash } = proofOperations(context);
    const changed = Object.entries(expectedFiles).filter(([file, expected]) => hash(file) !== expected);
    if (!changed.length) return;
    for (const [file, expected] of changed) {
      assert.ok(Object.hasOwn(jointPredecessors, file), `Changed unreviewed joint dependency ${file}`);
      assert.equal(expected, jointPredecessors[file], `Wrong joint predecessor ${file}`);
    }
    const clearance = internalVerifyJointAmendment(context);
    for (const [file] of changed) assert.equal(hash(file), clearance.dependencies.reviewedFiles[file], `Changed approved joint successor ${file}`);
  });
}
