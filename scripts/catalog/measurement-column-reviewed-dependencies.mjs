import { ktpbPredecessors, internalAssertKtpbDependencies } from './ktpb-source-context-reviewed-dependencies.mjs';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import { internalAssertProtectionContextForwardDependencies } from './protection-context-reviewed-dependencies.mjs';
// One forward amendment of PR32. This leaf verifier uses raw bytes only, so
// historical approval adapters cannot authorize themselves through a cycle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reviewDir = 'docs/catalog-transformers-2026/review/measurement-column-completion';
const historicalDir = 'docs/catalog-transformers-2026/review/source-asset-completion';
const manifestPath = 'frontend/lib/catalog/models/measurementColumn2026CompletionManifest.json';
export const measurementColumnClearancePath = `${reviewDir}/clearance.json`;
export const measurementColumnBaselineCommit = '1c705309c561130d34f79a367cd51c7ee864e59c';
export const measurementColumnBaselineTree = '5c59297893d4d1b52bf14c642c1ccc922073c89c';
export const measurementColumnExactIds = Object.freeze([
  'alageum-2026-zom-1p25-35', 'alageum-2026-znom35-config1', 'alageum-2026-znom35-config2',
]);
export const measurementColumnAmendmentFiles = Object.freeze([
  'frontend/lib/catalog/models/types.js', 'frontend/lib/catalog/models/iconTypes.js',
  'frontend/lib/catalog/models/geometry.js', 'frontend/components/catalog/EquipmentIcon.js',
  'frontend/lib/catalog/models/visualMap.js', 'frontend/lib/catalog/models/iconMap.js',
  'scripts/catalog/source-asset-reviewed-dependencies.mjs', 'scripts/check-source-asset-completion.mjs',
  'frontend/tests/source-asset-completion.test.mjs', 'frontend/tests/transformer-asset-completion.test.mjs',
  'frontend/tests/catalog-presentation.test.mjs', 'frontend/tests/transformer-import.test.mjs',
  'frontend/tests/helpers/render-equipment-icon.mjs', 'frontend/e2e/catalog.spec.js',
]);
export const measurementColumnRequiredFiles = Object.freeze([
  'frontend/components/catalog/models/createEquipmentViewer.js',
  'frontend/components/catalog/FamilyProductVisual.js',
  'frontend/components/catalog/Catalog.js',
  'frontend/components/catalog/LiveCatalog.js',
  'frontend/components/catalog/Comparison.js',
  'frontend/components/catalog/Selection.js',
  'frontend/components/catalog/ProductDetails.js',
  'frontend/components/catalog/useUrlComparison.js',
  'frontend/app/globals.css',
  'frontend/lib/catalog/presentation.js',
  'frontend/lib/catalog/familyPresentation.js',
  'frontend/lib/catalog/grouping.js',
  'frontend/lib/catalog/source.js',
  'frontend/lib/catalog/query.js',
  `${historicalDir}/clearance.json`, `${historicalDir}/independent-review.json`,
  `${reviewDir}/prototype-independent-review.json`, `${reviewDir}/prototype-frozen-files.json`,
  `${reviewDir}/baseline-outputs.json`,
  'scripts/catalog/measurement-column-reviewed-dependencies.mjs',
  'scripts/catalog/measurement-column-asset-snapshot.mjs', 'scripts/check-measurement-column-completion.mjs',
  manifestPath, 'frontend/lib/catalog/models/measurementColumn2026Completion.js',
  ...['Types.js', 'Geometry.js', 'Icons.js', 'SourceReview.md'].map(name => `frontend/lib/catalog/models/measurementColumn2026${name}`),
  'frontend/scripts/render-measurement-column-prototype.mjs',
  'frontend/tests/measurement-column2026-prototype.test.mjs',
  'frontend/tests/measurement-column-completion.test.mjs',
  'frontend/tests/measurement-column-amendment.test.mjs',
  'frontend/app/catalog.css', 'frontend/components/catalog/models/EquipmentModel.module.css',
  'frontend/public/catalog-source/transformers-2026/page-099.webp',
  'frontend/public/catalog-source/transformers-2026/page-100.webp',
]);
const fixedFiles = Object.freeze({
  'frontend/components/catalog/models/createEquipmentViewer.js': '145ea78f14dc5f2a211bf7c7befadf851cefe2a3ecf1c1942086f069811a65e7',
  'frontend/components/catalog/FamilyProductVisual.js': 'f1fb238c78542b7a5e2223d6cd7e1ce585743ea328d01aa9b00c85dda251e971',
  'frontend/components/catalog/Catalog.js': '741c30401cbb853b7bfd7788bfbe6c4c7169efc1c3607c4c504f167603454c3e',
  'frontend/components/catalog/LiveCatalog.js': '9f2957d6b8d3ba079241d52f0fcfdd8f1a02e964775407c15163db2308e035c7',
  'frontend/components/catalog/Comparison.js': '40b4191a98b63d3e9b5e0118800d96d9355967f963d3889e6c9d452dcfec8d4e',
  'frontend/components/catalog/Selection.js': 'e9e9ebf345e22a89f484c3566b01a2a2027f07de37b8375f728694d135ee55eb',
  'frontend/components/catalog/ProductDetails.js': '2abb9a7ed3a00f40f4218f6f0c5cd59849e945213f9b5305ad3725ce8a7d94ea',
  'frontend/components/catalog/useUrlComparison.js': 'f2f1691994d6f674c4f914985292739fc66ca54da457218766b6f0b2dfc5a47e',
  'frontend/app/globals.css': '3227280397fa44e6137cdf3a9964829fd5ca1956e9a4bbb6ba090af2d3435937',
  'frontend/lib/catalog/presentation.js': '74b84fbc0648eb230a3c3b2e898328786e2c6ae3328439c1106ea840ae909f32',
  'frontend/lib/catalog/familyPresentation.js': '97a46b15d98e55fb4ec85f7cabfef7c62716a929bcdb51ee16a6bd7714d3c1d2',
  'frontend/lib/catalog/grouping.js': '1e850ada566574e0b2a85a7e46245daa5f14300caab69b7773642e06ed2abbf6',
  'frontend/lib/catalog/source.js': 'cf396ae7923f662d5c3931360b412cfc296e75aa00ace1441b0bbbb4e4971600',
  'frontend/lib/catalog/query.js': 'b1dce5c5ba6b20294098a4edb4a66e7473365406c58e53a3d81c4c5ab4e9d476',
  [`${historicalDir}/clearance.json`]: 'a399a90e94837f973064b955d1a65bf21a2da1f90873da3a706403b0f8005376',
  [`${historicalDir}/independent-review.json`]: '5b084611019226184475b1a578372e2cd557f236f4bc42020c6089d945838bc5',
  [`${reviewDir}/prototype-independent-review.json`]: 'd5c865c6381d1f70bd570bd3b2f6b39fb50bd4203811476c508eb355936b8eff',
  [`${reviewDir}/prototype-frozen-files.json`]: '7ef8917962df26f4b547809621e157142dc83842c19c4aedba1789913a0d7701',
  [`${reviewDir}/baseline-outputs.json`]: 'dda99f863f2a27a114e2b36ad597d338395868ef8b36655827f6a52540d69c2f',
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const readMeasurementColumnBytes = file => {
  assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid measurement-column review path');
  return fs.readFileSync(path.join(root, file));
};

/** Candidate evidence check only. Passing this does not authorize a release. */
export function verifyMeasurementColumnDependencyFiles(clearance, read = readMeasurementColumnBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyMeasurementColumnDependencyFiles(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyMeasurementColumnDependencyFiles(context, clearance) {
  return evaluateProof(context, () => {
    const { hash: proofHash, json: proofJson } = proofOperations(context);

    const hash = file => proofHash(file);
    assert.equal(clearance.format, 'alageum-measurement-column-completion-clearance-v1');
    assert.equal(clearance.baselineCommit, measurementColumnBaselineCommit);
    assert.equal(clearance.baselineTree, measurementColumnBaselineTree);
    const historical = proofJson(`${historicalDir}/clearance.json`);
    const originalFiles = historical.dependencies.reviewedFiles;
    assert.equal(Object.keys(originalFiles).length, 202);
    const { amendments, reviewedFiles } = clearance.dependencies;
    for (const [file, expected] of Object.entries(fixedFiles)) assert.equal(reviewedFiles[file], expected, `Changed frozen measurement-column input ${file}`);
    assert.deepEqual(Object.keys(amendments).sort(), [...measurementColumnAmendmentFiles].sort(), 'Incomplete or overbroad measurement-column amendment');
    const required = [...new Set([...Object.keys(originalFiles), ...measurementColumnRequiredFiles])].sort();
    assert.deepEqual(Object.keys(reviewedFiles).sort(), required, 'Incomplete or overbroad measurement-column dependency scope');
    for (const [file, expected] of Object.entries(originalFiles)) {
      if (measurementColumnAmendmentFiles.includes(file)) {
        assert.equal(amendments[file].baselineSha256, expected, `Wrong PR32 dependency ${file}`);
        assert.equal(reviewedFiles[file], amendments[file].reviewedSha256, `Missing exact measurement-column amendment pin ${file}`);
        assert.notEqual(amendments[file].reviewedSha256, expected, `Unnecessary measurement-column amendment ${file}`);
      } else assert.equal(reviewedFiles[file], expected, `Changed historical measurement-column dependency pin ${file}`);
    }
    internalAssertProtectionContextForwardDependencies(context, reviewedFiles);
    const prototype = proofJson(`${reviewDir}/prototype-independent-review.json`);
    for (const entry of prototype.acceptedFiles) assert.equal(hash(entry.path), entry.sha256, `Changed accepted measurement-column prototype ${entry.path}`);
    assert.equal(clearance.bindingsSha256, hash(manifestPath), 'Changed measurement-column bindings');
    assert.equal(clearance.baselineOutputsSha256, hash(`${reviewDir}/baseline-outputs.json`), 'Changed PR32 output baseline');
    const manifest = proofJson(manifestPath);
    assert.deepEqual(Object.keys(manifest.records).sort(), [...measurementColumnExactIds].sort());
    assert.deepEqual([...new Set(Object.values(manifest.records).map(record => record.type))], ['tr26-measurement-column-zom-znom-source']);
    return clearance;
  });
}

/** Release authority: an exact independent successor review is mandatory. */
export function verifyMeasurementColumnDependencyAmendment(clearance, read = readMeasurementColumnBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifyMeasurementColumnDependencyAmendment(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyMeasurementColumnDependencyAmendment(context, clearance) {
  return evaluateProof(context, () => {
    const { hash: proofHash, json: proofJson } = proofOperations(context);

    assert.equal(clearance.status, 'approved-bounded-measurement-columns', 'Measurement-column integration still requires independent approval');
    internalVerifyMeasurementColumnDependencyFiles(context, clearance);
    assert.equal(clearance.reviewReport, `${reviewDir}/independent-review.json`, 'Wrong measurement-column review report');
    assert.equal(proofHash(clearance.reviewReport), clearance.reviewReportSha256, 'Changed independent measurement-column review');
    const report = proofJson(clearance.reviewReport);
    assert.equal(report.format, 'alageum-measurement-column-completion-independent-review-v1');
    assert.equal(report.status, 'approved-bounded-measurement-columns');
    assert.equal(report.baselineCommit, measurementColumnBaselineCommit);
    assert.equal(report.baselineTree, measurementColumnBaselineTree);
    assert.equal(report.approvedDependenciesSha256, digest(JSON.stringify(clearance.dependencies)), 'Changed independently approved measurement-column dependencies');
    assert.equal(report.approvedBindingsSha256, clearance.bindingsSha256);
    assert.equal(report.approvedBaselineOutputsSha256, clearance.baselineOutputsSha256);
    assert.deepEqual(report.approvedRecordIds, [...measurementColumnExactIds]);
    assert.deepEqual(report.counts, { addedBindings: 3, newModelTypes: 1, newIconTypes: 1, newProducts: 0 });
    assert.deepEqual(report.unchangedCounts, { productBodies: 843, unaffectedRecords: 840, legacyRecords: 238,
      choiceRecords: 36, choices: 74, sourcePreviews: 2, oldModelTypes: 125, oldIconTypes: 135 });
    return clearance;
  });
}

/** Compare to one historical hash without changing any raw hashing semantics. */
export function assertMeasurementColumnForwardDependencies(expectedFiles, read = readMeasurementColumnBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [expectedFiles] },
    context => internalAssertMeasurementColumnForwardDependencies(context, expectedFiles));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertMeasurementColumnForwardDependencies(context, expectedFiles) {
  return evaluateProof(context, () => {
    const { hash: proofHash } = proofOperations(context);
    let changed = Object.entries(expectedFiles).filter(([file, expected]) => proofHash(file) !== expected);
    if (!changed.length) return;
    // Only the exact PR43 edge may bypass the older historical branch.
    const terminal = changed.filter(([file, expected]) => Object.hasOwn(ktpbPredecessors, file) && expected === ktpbPredecessors[file]);
    internalAssertKtpbDependencies(context, Object.fromEntries(terminal));
    changed = changed.filter(([file, expected]) => !Object.hasOwn(ktpbPredecessors, file) || expected !== ktpbPredecessors[file]);
    if (!changed.length) return;
    const needsMeasurementReview = changed.some(([file]) => measurementColumnAmendmentFiles.includes(file));
    const clearance = needsMeasurementReview ? internalVerifyMeasurementColumnDependencyAmendmentFromDisk(context) : null;
    const successorFiles = Object.fromEntries(changed.map(([file, expected]) => {
      if (!measurementColumnAmendmentFiles.includes(file)) return [file, expected];
      const amendment = clearance.dependencies.amendments[file];
      assert.equal(amendment.baselineSha256, expected, `Wrong historical forward-amendment dependency ${file}`);
      return [file, amendment.reviewedSha256];
    }));
    internalAssertProtectionContextForwardDependencies(context, successorFiles);
  });
}
export function assertMeasurementColumnForwardDependency(file, expected, read = readMeasurementColumnBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 2, read, inputs: [file, expected] },
    context => internalAssertMeasurementColumnForwardDependency(context, file, expected));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalAssertMeasurementColumnForwardDependency(context, file, expected) {
  return evaluateProof(context, () => {

    return internalAssertMeasurementColumnForwardDependencies(context, { [file]: expected });
  });
}

const verifyMeasurementColumnDependencyAmendmentIdentity = Symbol('verifyMeasurementColumnDependencyAmendment');

function internalVerifyMeasurementColumnDependencyAmendmentFromDisk(context) {
  return prove(context, verifyMeasurementColumnDependencyAmendmentIdentity, 'approved', measurementColumnClearancePath,
    internalVerifyMeasurementColumnDependencyAmendment);
}
