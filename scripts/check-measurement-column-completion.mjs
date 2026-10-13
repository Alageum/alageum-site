import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { officialProducts } from '../frontend/lib/catalog/data.js';
import { transformerImport } from '../frontend/lib/catalog/transformers2026.js';
import { measurementColumn2026CompletionManifest as manifest, getMeasurementColumn2026Completion } from '../frontend/lib/catalog/models/measurementColumn2026Completion.js';
import { measurementColumn2026Types, MEASUREMENT_COLUMN_2026_TYPE } from '../frontend/lib/catalog/models/measurementColumn2026Types.js';
import { transformerRecordShape, recordShapeDigest } from '../frontend/lib/catalog/models/transformer2026Shape.js';
import { getEquipmentVisual } from '../frontend/lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../frontend/lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../frontend/lib/catalog/models/transformerExecutionChoices.js';
import { getNtmiSourcePreview } from '../frontend/lib/catalog/ntmiSourcePreview.js';
import { getSourcePageAsset } from '../frontend/lib/catalog/sources.js';
import { verifyProtectionContextPreservation } from './check-protection-context-integration.mjs';
import { importedProductId } from './catalog/catalog-asset-snapshot.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = 'docs/catalog-transformers-2026/review/measurement-column-completion';
const read = file => fs.readFileSync(path.join(root, file));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const measurementColumnExactIds = Object.freeze(['alageum-2026-zom-1p25-35', 'alageum-2026-znom35-config1', 'alageum-2026-znom35-config2']);
export function verifyMeasurementColumnScope() {
  assert.equal(manifest.format, 'alageum-measurement-column-completion-v1');
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl']) assert.equal(manifest[key], transformerImport[key]);
  assert.deepEqual(Object.keys(manifest.records).sort(), [...measurementColumnExactIds].sort());
  assert.equal(hash(read(`${reviewDir}/prototype-independent-review.json`)), 'd5c865c6381d1f70bd570bd3b2f6b39fb50bd4203811476c508eb355936b8eff');
  assert.equal(manifest.prototypeReviewSha256, 'd5c865c6381d1f70bd570bd3b2f6b39fb50bd4203811476c508eb355936b8eff');
  const review = JSON.parse(read(`${reviewDir}/prototype-independent-review.json`));
  assert.equal(hash(read(`${reviewDir}/prototype-frozen-files.json`)), review.frozenManifestSha256);
  assert.equal(review.decision, 'accepted-for-normal-source-grounded-representative-illustration-with-required-display-context');
  assert.equal(review.sourcePdfSha256, manifest.sourceSha256);
  assert.equal(review.acceptedFiles.length, 6);
  for (const item of review.acceptedFiles) {
    const bytes = read(item.path);
    assert.equal(bytes.length, item.bytes); assert.equal(hash(bytes), item.sha256, `Changed accepted prototype ${item.path}`);
  }
  assert.deepEqual(Object.keys(measurementColumn2026Types), [MEASUREMENT_COLUMN_2026_TYPE]);
  assert.equal(measurementColumn2026Types[MEASUREMENT_COLUMN_2026_TYPE].runtimeEligible, false, 'A type cannot grant record authority');
  for (const [id, entry] of Object.entries(manifest.records)) {
    const record = officialProducts.find(value => value.id === id), reviewed = review.records.find(value => value.id === id);
    assert.ok(record && reviewed); assert.equal(entry.sourceRecordId, id); assert.equal(entry.sourceFamilyId, record.familyId);
    assert.equal(entry.type, MEASUREMENT_COLUMN_2026_TYPE);
    assert.equal(entry.record_shape_sha256, recordShapeDigest(transformerRecordShape(record)), `Changed source shape ${id}`);
    assert.equal(entry.database_id, importedProductId(id)); assert.equal(entry.rawSourceMedia, record.image);
    assert.equal(entry.sourceImage, record.image); assert.deepEqual(entry.sourcePages, [reviewed.sourcePage]);
    assert.ok(record.sourcePages.includes(reviewed.sourcePage));
    assert.equal(entry.sourceImage, `/catalog-source/transformers-2026/page-${String(reviewed.sourcePage).padStart(3, '0')}.webp`);
    assert.equal(hash(read(`frontend/public${entry.sourceImage}`)), getSourcePageAsset(entry.sourceImage).sha256);
    assert.equal(entry.mainDisclosure, reviewed.requiredMainVisibleWording);
    assert.equal(entry.simplificationNote, review.requiredVisibleSimplificationNote);
    assert.equal(entry.sourceContextCaveat, reviewed.requiredSourceContextCaveat);
    assert.equal(entry.reason, `${entry.mainDisclosure} ${entry.simplificationNote} ${entry.sourceContextCaveat}`);
    for (const field of ['dimensionAccurate', 'exactMeshReuseAllowed', 'deliveredConfigurationVerified', 'inherit']) assert.equal(entry[field], false);
    assert.equal(entry.representativeOnly, true); assert.equal(entry.sharedRepresentativeAssetReuseAllowed, true);
    assert.equal(record.sku, null); assert.equal(record.isOrderableSku, false);
    for (const channel of ['geometry', 'icons']) assert.equal(getMeasurementColumn2026Completion(record, channel).type, entry.type);
    assert.equal(getEquipmentVisual(record).type, entry.type); assert.equal(getEquipmentIcon(record).type, entry.type);
    assert.deepEqual(getEquipmentConstructionChoices(record), []);
  }
  return { addedDefaultBindings: 3, refinedIcons: 3, addedSourceBasedIcons: 0, newProducts: 0 };
}
export async function verifyMeasurementColumnPreservation() {
  const baselineBytes = read(`${reviewDir}/baseline-outputs.json`);
  assert.equal(hash(baselineBytes), 'dda99f863f2a27a114e2b36ad597d338395868ef8b36655827f6a52540d69c2f', 'Changed exact PR32 baseline snapshot');
  const checkpointBytes = read('docs/catalog-transformers-2026/review/protection-context-integration/baseline-outputs.json');
  assert.equal(hash(checkpointBytes), 'edc00fd04790d5493d14c0965cc3fc3363af2d7ad2ca0c5b702887bd2e8a0b0b', 'Changed frozen PR33 checkpoint');
  // Historical PR33 claims are evaluated at their immutable checkpoint. The
  // separate successor preservation check accounts for only its exact deltas.
  const baseline = JSON.parse(baselineBytes), current = JSON.parse(checkpointBytes);
  assert.equal(Object.keys(baseline.modelOutputs).length, 125); assert.equal(Object.keys(baseline.iconOutputs).length, 135);
  assert.equal(Object.keys(current.products).length, 843); assert.deepEqual(Object.keys(current.products), Object.keys(baseline.products));
  for (const key of ['legacyIds', 'executionManifest', 'identities', 'sourcePreviews']) assert.deepEqual(current[key], baseline[key], `Changed historical ${key}`);
  for (const key of ['modelOutputs', 'iconOutputs']) {
    for (const [id, expected] of Object.entries(baseline[key])) assert.deepEqual(current[key][id], expected, `Changed existing ${key}/${id}`);
    assert.deepEqual(Object.keys(current[key]).filter(id => !Object.hasOwn(baseline[key], id)), [MEASUREMENT_COLUMN_2026_TYPE]);
  }
  const affected = new Set(measurementColumnExactIds), changed = [];
  for (const [id, old] of Object.entries(baseline.products)) {
    const candidate = current.products[id];
    for (const key of ['body', 'staticMedia', 'apiMedia', 'choices', 'panels']) assert.equal(candidate[key], old[key], `Changed ${id}/${key}`);
    if (!affected.has(id)) assert.deepEqual(candidate, old, `Changed unapproved product ${id}`);
    if (candidate.static !== old.static || candidate.api !== old.api) {
      assert.notEqual(candidate.static, old.static); assert.notEqual(candidate.api, old.api); changed.push(id);
    }
  }
  assert.deepEqual(changed.sort(), [...measurementColumnExactIds].sort());
  const sourceGroundedDefault3D = officialProducts.filter(row => { const visual = getEquipmentVisual(row); return visual.type && visual.confidence === 'source-matched'; }).length;
  const sourceBasedIcons = officialProducts.filter(row => getEquipmentIcon(row).confidence === 'source-based').length;
  const gaps = officialProducts.filter(row => row.recordKind === 'variant' && !getEquipmentVisual(row).type && !getEquipmentConstructionChoices(row).length && !getNtmiSourcePreview(row));
  const counts = { productBodies: 843, unaffectedRecords: 840, legacyRecords: baseline.legacyIds.length, priorSourceAssetAdmissions: 13,
    choiceRecords: officialProducts.filter(row => getEquipmentConstructionChoices(row).length).length,
    choices: officialProducts.reduce((count, row) => count + getEquipmentConstructionChoices(row).length, 0),
    sourceContextPreviews: officialProducts.filter(row => getNtmiSourcePreview(row)).length,
    oldModelTypes: 125, oldIconTypes: 135, sourceGroundedDefault3D, sourceBasedIcons, explicitConstructionGaps: gaps.length,
    constructionGapFamilies: new Set(gaps.map(row => row.familyId)).size };
  assert.deepEqual(counts, { productBodies: 843, unaffectedRecords: 840, legacyRecords: 238, priorSourceAssetAdmissions: 13,
    choiceRecords: 36, choices: 74, sourceContextPreviews: 2, oldModelTypes: 125, oldIconTypes: 135,
    sourceGroundedDefault3D: 464, sourceBasedIcons: 465, explicitConstructionGaps: 243, constructionGapFamilies: 29 });
  await verifyProtectionContextPreservation();
  return counts;
}
export async function verifyMeasurementColumnCompletion({ candidate = false } = {}) {
  const scope = verifyMeasurementColumnScope(), preservation = await verifyMeasurementColumnPreservation();
  if (!candidate) {
    const { verifyMeasurementColumnDependencyAmendment, measurementColumnClearancePath } = await import('./catalog/measurement-column-reviewed-dependencies.mjs');
    verifyMeasurementColumnDependencyAmendment(JSON.parse(read(measurementColumnClearancePath)));
  }
  return { status: candidate ? 'candidate-checks-only-independent-approval-required' : 'approved-bounded-measurement-columns', ...scope, ...preservation };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyMeasurementColumnCompletion({ candidate: process.argv.includes('--candidate') })));
