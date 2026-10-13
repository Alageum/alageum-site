import { types as utilTypes } from 'node:util';
import { runFreshProof, proofOperations, prove, evaluateProof } from './proof-invocation.mjs';
import { internalProtectionContextHistoricalHash, internalAssertProtectionContextSourceInputs } from './protection-context-reviewed-dependencies.mjs';
// One additive review can accept these exact integration adapters. It cannot amend
// source transcriptions, shape hashing, media, historical geometry or approvals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { internalAssertMeasurementColumnForwardDependency, internalAssertMeasurementColumnForwardDependencies } from './measurement-column-reviewed-dependencies.mjs';
import baseline from '../../docs/catalog-transformers-2026/review/source-asset-completion/baseline-dependencies.json' with { type: 'json' };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sourceAssetClearancePath = 'docs/catalog-transformers-2026/review/source-asset-completion/clearance.json';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const readBytes = file => {
  assert.ok(typeof file === 'string' && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid reviewed path');
  return fs.readFileSync(path.join(root, file));
};
export const rawFileHash = file => digest(readBytes(file));
export const sourceAssetAmendmentFiles = Object.freeze([
  'frontend/lib/catalog/models/types.js', 'frontend/lib/catalog/models/iconTypes.js',
  'frontend/lib/catalog/models/geometry.js', 'frontend/components/catalog/EquipmentIcon.js',
  'frontend/lib/catalog/models/visualMap.js', 'frontend/lib/catalog/models/iconMap.js',
  'scripts/catalog/transformer-reviewed-dependencies.mjs',
  'scripts/approve-transformer-asset-completion.mjs', 'scripts/check-ntmi-source-previews.mjs',
]);
export function verifySourceAssetDependencyAmendment(clearance, read = readBytes) {
  return runFreshProof({ root, omittedReader: arguments.length <= 1, read, inputs: [clearance] },
    context => internalVerifySourceAssetDependencyAmendment(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifySourceAssetDependencyAmendment(context, clearance) {
  return evaluateProof(context, () => {
    const { hash: proofHash, json: proofJson } = proofOperations(context);

    assert.equal(clearance.format, 'alageum-source-asset-completion-clearance-v1');
    assert.equal(clearance.status, 'approved-bounded-source-assets', 'Source asset integration still requires independent approval');
    assert.equal(clearance.baselineCommit, 'a8f4f88845823105b242499bbe7b804368fcd0c8');
    assert.equal(clearance.baselineTree, 'd53245e72ec843f5a8c3d88b3730cba1b166356b');
    const hash = file => proofHash(file);
    assert.equal(hash(clearance.reviewReport), clearance.reviewReportSha256, 'Changed independent integration review');
    const report = proofJson(clearance.reviewReport);
    assert.equal(report.format, 'alageum-source-asset-completion-independent-review-v1');
    assert.equal(report.status, 'approved-bounded-source-assets');
    assert.equal(report.approvedDependenciesSha256, digest(JSON.stringify(clearance.dependencies)), 'Changed approved integration dependencies');
    assert.equal(report.approvedBindingsSha256, hash('frontend/lib/catalog/models/sourceAssetCompletionManifest.json'), 'Changed reviewed bindings');
    assert.deepEqual(report.unchangedCounts, { productBodies: 843, unaffectedRecords: 830, legacyRecords: 238, choiceRecords: 36, choices: 74 });
    const { amendments, reviewedFiles } = clearance.dependencies;
    assert.deepEqual(Object.keys(amendments).sort(), [...sourceAssetAmendmentFiles].sort(), 'Incomplete or overbroad dependency amendment');
    assert.deepEqual(Object.keys(baseline).sort(), [...sourceAssetAmendmentFiles].sort(), 'Changed baseline dependency scope');
    for (const file of sourceAssetAmendmentFiles) {
      assert.equal(amendments[file].baselineSha256, baseline[file], `Wrong baseline dependency ${file}`);
      assert.equal(reviewedFiles[file], amendments[file].reviewedSha256, `Missing exact amendment pin ${file}`);
    }
    for (const file of ['scripts/catalog/source-asset-reviewed-dependencies.mjs',
      'docs/catalog-transformers-2026/review/source-asset-completion/baseline-dependencies.json',
      'scripts/check-source-asset-completion.mjs', 'scripts/catalog/catalog-asset-snapshot.mjs',
      'docs/catalog-transformers-2026/review/source-asset-completion/baseline-outputs.json',
      'frontend/lib/catalog/models/sourceAssetCompletionManifest.json', 'frontend/lib/catalog/models/sourceAssetCompletion.js',
      'docs/catalog-transformers-2026/review/source-asset-completion/immutable-dependencies.json',
      'docs/catalog-transformers-2026/review/source-asset-completion/accessory-source-decision.json',
      'docs/catalog-transformers-2026/review/source-asset-completion/x4k3-source-decision.json',
      'docs/catalog-transformers-2026/review/source-asset-completion/x4k3-presentation-scope.json',
      ...['Types', 'Geometry', 'Icons'].map(name => `frontend/lib/catalog/models/accessory2026${name}.js`)]) {
      assert.ok(Object.hasOwn(reviewedFiles, file), `Missing integration verifier/input ${file}`);
    }
    const immutable = proofJson('docs/catalog-transformers-2026/review/source-asset-completion/immutable-dependencies.json');
    for (const [file, expected] of Object.entries(immutable)) {
      assert.ok(!sourceAssetAmendmentFiles.includes(file), `Cannot amend immutable dependency ${file}`);
      assert.equal(reviewedFiles[file], expected, `Missing historical source approval/dependency ${file}`);
    }
    internalAssertProtectionContextSourceInputs(context, immutable);
    internalAssertMeasurementColumnForwardDependencies(context, reviewedFiles);
    return clearance;
  });
}
/** Return only the independently attested pre-integration hash to historical gates.
 * Historical documents are still evaluated against their original hashes and outputs.
 */
export function historicalDependencyHash(file) {
  return historicalDependencyHashes([file])[0].hash;
}
/** One finalized, bounded batch, retaining order and duplicate obligations. */
export function historicalDependencyHashes(files) {
  assert.ok(!utilTypes.isProxy(files) && Array.isArray(files) && Object.getPrototypeOf(files) === Array.prototype, 'Invalid historical path list');
  const descriptors = Object.getOwnPropertyDescriptors(files);
  assert.ok(files.length <= 1024 && Reflect.ownKeys(descriptors).length === files.length + 1, 'Invalid historical path list');
  for (let i = 0; i < files.length; i++) {
    const descriptor = descriptors[i];
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'string', 'Invalid historical path list');
  }
  return runFreshProof({ root, omittedReader: true, read: readBytes, inputs: [files] },
    context => files.map(file => ({ file, hash: internalHistoricalDependencyHash(context, file) })));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalHistoricalDependencyHash(context, file) {
  return evaluateProof(context, () => {
    assert.ok(typeof file === 'string' && file && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid protection/context review path');

    const actual = internalProtectionContextHistoricalHash(context, file);
    if (!sourceAssetAmendmentFiles.includes(file) || actual === baseline[file]) return actual;
    const clearance = internalVerifySourceAssetDependencyAmendmentFromDisk(context);
    internalAssertMeasurementColumnForwardDependency(context, file, clearance.dependencies.amendments[file].reviewedSha256);
    return baseline[file];
  });
}

const verifySourceAssetDependencyAmendmentIdentity = Symbol('verifySourceAssetDependencyAmendment');

function internalVerifySourceAssetDependencyAmendmentFromDisk(context) {
  return prove(context, verifySourceAssetDependencyAmendmentIdentity, 'approved', sourceAssetClearancePath,
    internalVerifySourceAssetDependencyAmendment);
}
