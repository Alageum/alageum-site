import { assertProtectionContextSourceInputs } from './catalog/protection-context-reviewed-dependencies.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { officialProducts } from '../frontend/lib/catalog/data.js';
import { transformerImport } from '../frontend/lib/catalog/transformers2026.js';
import { sourceAssetCompletionManifest as manifest, getSourceAssetCompletion } from '../frontend/lib/catalog/models/sourceAssetCompletion.js';
import { transformerRecordShape, recordShapeDigest } from '../frontend/lib/catalog/models/transformer2026Shape.js';
import { transformerRuntimeManifest } from '../frontend/lib/catalog/models/transformer2026Runtime.js';
import { accessory2026TypeIds } from '../frontend/lib/catalog/models/accessory2026Types.js';
import { getSourcePageAsset } from '../frontend/lib/catalog/sources.js';
import { importedProductId } from './catalog/catalog-asset-snapshot.mjs';
import { digest, rawFileHash, readBytes, sourceAssetClearancePath, verifySourceAssetDependencyAmendment } from './catalog/source-asset-reviewed-dependencies.mjs';
import { verifyMeasurementColumnPreservation } from './check-measurement-column-completion.mjs';
import { measurementColumnBaselineCommit, measurementColumnClearancePath, verifyMeasurementColumnDependencyAmendment } from './catalog/measurement-column-reviewed-dependencies.mjs';
const reviewDir = 'docs/catalog-transformers-2026/review/source-asset-completion';
export const sourceAssetExactIds = Object.freeze([
  'alageum-2026-relay-tr100', 'alageum-2026-sensor-pt100', 'alageum-2026-damper-ek290',
  ...[63, 100, 160, 250, 400, 630, 1000, 1250, 1600, 2500].map(power => `alageum-tmgi-x4k3-${power}`),
]);
export function verifySourceAssetScope() {
  assert.equal(manifest.format, 'alageum-source-asset-completion-v1');
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl']) assert.equal(manifest[key], transformerImport[key]);
  assert.deepEqual(Object.keys(manifest.records).sort(), [...sourceAssetExactIds].sort());
  assert.deepEqual(accessory2026TypeIds, ['tr26-accessory-relay-tr100', 'tr26-accessory-probe-pt100', 'tr26-accessory-damper-ek290']);
  const accessory = JSON.parse(readBytes(`${reviewDir}/accessory-source-decision.json`));
  assert.equal(accessory.status, 'approved-bounded-photo-exteriors-no-runtime-clearance');
  assert.equal(accessory.source.sourceSha256, manifest.sourceSha256);
  assert.equal(accessory.source.physicalPage, 85);
  for (const [file, expected] of Object.entries(accessory.acceptedFileHashes)) assert.equal(rawFileHash(file), expected, `Changed accepted accessory prototype ${file}`);
  const presentation = JSON.parse(readBytes(`${reviewDir}/x4k3-presentation-scope.json`));
  assert.equal(presentation.sourceDecisionSha256, rawFileHash(`${reviewDir}/x4k3-source-decision.json`));
  const x4k3 = JSON.parse(readBytes(`${reviewDir}/x4k3-source-decision.json`));
  assert.equal(x4k3.decision.representativeRecordIllustrationSupported, true);
  assert.equal(x4k3.decision.exactSeriesEquivalenceEstablished, false);
  assert.equal(x4k3.records.length, 10);
  const byId = new Map(officialProducts.map(record => [record.id, record]));
  for (const [id, entry] of Object.entries(manifest.records)) {
    const record = byId.get(id);
    assert.equal(entry.sourceRecordId, id); assert.equal(entry.sourceFamilyId, record.familyId);
    assert.equal(entry.record_shape_sha256, recordShapeDigest(transformerRecordShape(record)), `Changed source shape ${id}`);
    assert.equal(entry.database_id, importedProductId(id), `Wrong API identity ${id}`);
    assert.equal(entry.rawSourceMedia, record.image, `Changed raw source media ${id}`);
    assert.equal(entry.representativeOnly, true); assert.equal(entry.dimensionAccurate, false);
    assert.equal(entry.exactMeshReuseAllowed, false); assert.equal(entry.inherit, false);
    assert.equal(record.sku, null); assert.equal(record.isOrderableSku, false);
    assert.equal(transformerRuntimeManifest.geometry[id], undefined);
    if (!id.startsWith('alageum-2026-')) assert.equal(transformerRuntimeManifest.icons[id], undefined);
    else assert.equal(transformerRuntimeManifest.icons[id].record_shape_sha256, entry.record_shape_sha256);
    assert.ok(entry.sourcePages.every(page => record.sourcePages.includes(page)), `Unrelated source page ${id}`);
    assert.equal(rawFileHash(`frontend/public${entry.sourceImage}`), getSourcePageAsset(entry.sourceImage).sha256);
    assert.match(entry.reason, /не CAD|Не CAD/);
    assert.equal(getSourceAssetCompletion(record, 'geometry').type, entry.type);
    assert.equal(getSourceAssetCompletion(record, 'icons').type, entry.type);
    const reviewed = x4k3.records.find(row => row.id === id);
    if (reviewed) {
      assert.equal(entry.type, reviewed.candidateGeometryType); assert.equal(entry.type, reviewed.candidateIconType);
      assert.equal(entry.record_shape_sha256, reviewed.recordShapeSha256); assert.equal(entry.database_id, reviewed.databaseId);
      assert.deepEqual(entry.sourcePages, [reviewed.drawingPage]); assert.equal(record.name, reviewed.name);
      assert.equal(entry.captionDiscrepancy, x4k3.allowedWording.commonDisclosure);
      assert.equal(entry.reason, `${x4k3.allowedWording[reviewed.drawingPage === 30 ? 'small' : 'large']}. ${x4k3.allowedWording.commonDisclosure}`);
    } else {
      const accepted = accessory.records.find(row => row.id === id);
      assert.ok(accepted); assert.deepEqual(entry.sourcePages, [85]);
      assert.equal(entry.type, accepted.geometryType); assert.equal(entry.type, accepted.iconType);
      assert.equal(entry.record_shape_sha256, accepted.recordShapeSha256); assert.equal(entry.database_id, accepted.databaseId);
      const key = id.includes('relay') ? 'relay' : id.includes('sensor') ? 'probe' : 'damper';
      assert.equal(entry.reason, `${accessory.visibleLimitations[key]} ${accessory.visibleLimitations.common}`);
    }
  }
  return { addedBindings: 13, accessories: 3, x4k3: 10, newProducts: 0 };
}
export async function verifySourceAssetPreservation() {
  const baseline = JSON.parse(readBytes(`${reviewDir}/baseline-outputs.json`));
  // PR32's claim is checked at its frozen checkpoint. The current catalogue is
  // separately checked against that checkpoint; its three later bindings are
  // never attributed to the historical thirteen-record approval.
  const checkpointBytes = readBytes('docs/catalog-transformers-2026/review/measurement-column-completion/baseline-outputs.json');
  assert.equal(digest(checkpointBytes), 'dda99f863f2a27a114e2b36ad597d338395868ef8b36655827f6a52540d69c2f', 'Changed frozen PR32 checkpoint');
  const checkpoint = JSON.parse(checkpointBytes);
  assert.equal(Object.keys(checkpoint.products).length, 843);
  assert.deepEqual(Object.keys(checkpoint.products), Object.keys(baseline.products), 'Changed ordered catalogue identities');
  for (const key of ['legacyIds', 'executionManifest', 'identities']) assert.deepEqual(checkpoint[key], baseline[key], `Changed historical ${key}`);
  for (const key of ['modelOutputs', 'iconOutputs']) {
    const historicalOutputs = Object.fromEntries(Object.keys(baseline[key]).map(id => [id, checkpoint[key][id]]));
    assert.deepEqual(historicalOutputs, baseline[key], `Changed historical ${key}`);
    assert.deepEqual(Object.keys(checkpoint[key]).filter(id => !Object.hasOwn(baseline[key], id)).sort(), [...accessory2026TypeIds].sort(), 'PR32 added exactly its three accessory types');
  }
  const affected = new Set(sourceAssetExactIds), changed = [];
  for (const [id, old] of Object.entries(baseline.products)) {
    const current = checkpoint.products[id];
    for (const key of ['body', 'choices', 'panels', 'staticMedia', 'apiMedia']) assert.equal(current[key], old[key], `Changed ${id}/${key}`);
    if (!affected.has(id)) assert.deepEqual(current, old, `Changed unapproved product output ${id}`);
    if (current.static !== old.static || current.api !== old.api) changed.push(id);
  }
  assert.deepEqual(changed.sort(), [...sourceAssetExactIds].sort(), 'PR32 changed only its thirteen exact bindings');
  const forwardPreservation = await verifyMeasurementColumnPreservation();
  return { historicalCheckpoint: { commit: measurementColumnBaselineCommit,
    productBodies: 843, unaffectedRecords: 830, legacyRecords: 238, choiceRecords: 36, choices: 74,
    oldModelTypes: Object.keys(baseline.modelOutputs).length, oldIconTypes: Object.keys(baseline.iconOutputs).length },
  forwardPreservation };
}
export async function verifySourceAssetCompletion({ candidate = false } = {}) {
  const scope = verifySourceAssetScope(), preservation = await verifySourceAssetPreservation();
  if (!candidate) {
    verifyMeasurementColumnDependencyAmendment(JSON.parse(readBytes(measurementColumnClearancePath)));
    const clearance = verifySourceAssetDependencyAmendment(JSON.parse(readBytes(sourceAssetClearancePath)));
    const protectedFiles = JSON.parse(readBytes(`${reviewDir}/immutable-dependencies.json`));
    assertProtectionContextSourceInputs(protectedFiles);
    for (const [file, hash] of Object.entries(protectedFiles)) {
      assert.equal(clearance.dependencies.reviewedFiles[file], hash, `Missing historical dependency ${file}`);
    }
    assert.equal(clearance.dependencies.reviewedFiles[`${reviewDir}/immutable-dependencies.json`], rawFileHash(`${reviewDir}/immutable-dependencies.json`));
    assert.equal(clearance.bindingsSha256, rawFileHash('frontend/lib/catalog/models/sourceAssetCompletionManifest.json'));
    assert.equal(clearance.baselineOutputsSha256, digest(readBytes(`${reviewDir}/baseline-outputs.json`)));
  }
  return { status: candidate ? 'candidate-checks-only-independent-approval-required' : 'approved-source-assets-with-bounded-measurement-column-amendment', ...scope, ...preservation };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifySourceAssetCompletion({ candidate: process.argv.includes('--candidate') })));
}
