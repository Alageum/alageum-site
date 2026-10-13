import { historicalDependencyHash } from './catalog/source-asset-reviewed-dependencies.mjs';
// Additive, independently reviewed authority. Historical source and asset approvals stay intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformerProducts, transformerImport } from '../frontend/lib/catalog/transformers2026.js';
import { identityCompletionProducts } from '../frontend/lib/catalog/identityCompletionData.js';
import { transformer2026AssetEvidence as evidence } from '../frontend/lib/catalog/models/transformer2026Bindings.js';
import { transformer2026Types, TRANSFORMER_2026_DISCLOSURE } from '../frontend/lib/catalog/models/transformer2026Types.js';
import { transformerRecordShape, recordShapeDigest } from '../frontend/lib/catalog/models/transformer2026Shape.js';
import { readInventories, objectDigest } from './catalog/transformer-adapter.mjs';
import { transformerIntegrationAmendmentFiles } from './catalog/transformer-reviewed-dependencies.mjs';
import baseAssets from '../frontend/lib/catalog/models/transformer2026RuntimeManifest.json' with { type: 'json' };
import baseChoices from '../frontend/lib/catalog/models/transformerExecutionChoicesManifest.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const hashFile = relative => {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.split('/').includes('..'), 'Invalid review path');
  return historicalDependencyHash(relative);
};
const importedProductId = key => {
  const bytes = createHash('sha1').update(Buffer.from('541788eefbf04d859d33e593b82f303c', 'hex')).update(`product:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const counts = { defaultRecords: 25, copperRecords: 13, newlyAdmittedDefaults: 16, explicitChoiceRecords: 4, explicitChoices: 8 };
const identityPath = 'docs/catalog-transformers-2026/review/identity-completion/clearance.json';
const copperPath = 'docs/catalog-transformers-2026/review/asset-completion/copper-independent-review.json';
const originalAssetsPath = 'docs/catalog-transformers-2026/review/assets-clearance.json';
const originalChoicesPath = 'docs/catalog-transformers-2026/review/execution-choice-clearance.json';

export function buildTransformerAssetCompletion(approval) {
  assert.equal(approval.format, 'alageum-transformer-asset-completion-clearance-v1');
  assert.equal(approval.status, 'approved-bounded-supplement');
  assert.deepEqual(approval.counts, counts);
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl', 'inventorySha256']) {
    assert.equal(approval[key], transformerImport[key], `Wrong supplementary source ${key}`);
  }
  const inventories = readInventories(path.join(root, 'docs/catalog-transformers-2026/review'));
  for (const section of inventories) if (section.inventory.source?.filePath) delete section.inventory.source.filePath;
  assert.equal(objectDigest(inventories), approval.inventorySha256, 'Changed original source transcription');
  assert.ok(approval.reviewedAt && approval.reviewReport);
  assert.equal(hashFile(approval.reviewReport), approval.reviewReportSha256, 'Changed independent supplemental review');
  const review = read(approval.reviewReport);
  assert.equal(review.format, 'alageum-transformer-asset-completion-independent-review-v1');
  assert.equal(review.status, 'approved-bounded-supplement');
  assert.deepEqual(review.counts, counts);
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'inventorySha256', 'reviewedAt']) assert.equal(review[key], approval[key]);
  assert.equal(review.approvedRecordsSha256, sha256(JSON.stringify(approval.records)), 'Changed independently reviewed supplemental bindings or captions');
  assert.equal(review.approvedDependenciesSha256, sha256(JSON.stringify(approval.dependencies)), 'Changed independent supplemental dependencies');
  const dependencies = approval.dependencies;
  const requiredFiles = [
    identityPath, copperPath, originalAssetsPath, originalChoicesPath,
    'backend-node/data/catalog-sources.json',
    'frontend/lib/catalog/models/transformer2026RuntimeManifest.json',
    'frontend/lib/catalog/models/transformerExecutionChoicesManifest.json',
    'scripts/approve-transformer-assets.mjs',
    'scripts/approve-transformer-execution-choices.mjs',
    'scripts/catalog/transformer-reviewed-dependencies.mjs',
    'frontend/lib/catalog/models/legacyAssetCompletion.js',
    'docs/catalog-completion-2026-10-06/shr11-independent-review.json',
    ...['AssetEvidence.json', 'Bindings.js', 'Geometry.js', 'GroupMap.js', 'Icons.js', 'PowerLayouts.js', 'Types.js', 'Shape.js'].map(name => `frontend/lib/catalog/models/transformer2026${name}`),
  ];
  for (const file of requiredFiles) assert.ok(Object.hasOwn(dependencies.reviewedFileHashes, file), `Missing supplementary dependency ${file}`);
  for (const [file, hash] of Object.entries(dependencies.reviewedFileHashes)) assert.equal(hashFile(file), hash, `Changed supplementary dependency ${file}`);
  const historicApprovals = [read(originalAssetsPath), read(originalChoicesPath)];
  const requiredAmendments = {};
  for (const historic of historicApprovals) for (const [file, hash] of Object.entries(historic.reviewedLibraryHashes)) {
    if (hashFile(file) !== hash) requiredAmendments[file] = { historicalSha256: hash, reviewedSha256: hashFile(file) };
  }
  assert.deepEqual(dependencies.reviewedIntegrationAmendments, requiredAmendments, 'Review every changed historic integration dependency exactly');
  for (const [file, amendment] of Object.entries(requiredAmendments)) {
    assert.ok(transformerIntegrationAmendmentFiles.includes(file), `Source or geometry dependency cannot be amended here: ${file}`);
    assert.equal(dependencies.reviewedFileHashes[file], amendment.reviewedSha256, `Missing amended dependency ${file}`);
  }
  for (const [file, hash] of Object.entries(dependencies.reviewedSourceImageHashes)) {
    assert.match(file, /^\/catalog-source\/transformers-2026\/page-\d{3}\.webp$/);
    assert.equal(hashFile(`frontend/public${file}`), hash, `Changed supplementary source image ${file}`);
  }
  const identity = read(identityPath), copper = read(copperPath);
  assert.equal(identity.status, 'approved-bounded-identity-representation');
  assert.equal(copper.status, 'approved-representative-subsection-inference');
  for (const document of [identity, copper]) for (const key of ['sourceSha256', 'inventorySha256']) assert.equal(document[key], approval[key]);
  for (const [file, hash] of Object.entries(copper.reviewedSourceImageHashes)) {
    assert.equal(hashFile(file), hash, `Changed copper context ${file}`);
    assert.equal(dependencies.reviewedSourceImageHashes[file.replace(/^frontend\/public/, '')], hash, `Missing copper context ${file}`);
  }
  for (const [file, hash] of Object.entries(copper.reviewedExistingPreviewHashes)) assert.equal(hashFile(file), hash, `Changed copper preview ${file}`);
  const admitted = new Map(identity.actions.filter(entry => entry.mode === 'execution').map(entry => [entry.sourceRecordId, entry]));
  const copperRows = new Map(copper.records.map(entry => [entry.sourceRecordId, entry]));
  assert.equal(admitted.size, 20); assert.equal(copperRows.size, 13);
  const expectedIds = [...new Set([...admitted.keys(), ...copperRows.keys()])].sort();
  assert.equal(expectedIds.length, 29);
  assert.deepEqual(approval.records.map(entry => entry.sourceRecordId).sort(), expectedIds, 'Review only the exact supplementary rows');
  const rows = new Map([...transformerProducts, ...identityCompletionProducts].map(record => [record.id, record]));
  const result = {
    format: 'alageum-transformer-asset-completion-v1',
    ...Object.fromEntries(['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl', 'inventorySha256', 'reviewedAt', 'reviewReport', 'reviewReportSha256', 'counts', 'dependencies'].map(key => [key, approval[key]])),
    geometry: {}, icons: {}, executionChoices: { selectionMode: 'explicit-only', records: {}, choices: {} },
  };
  for (const entry of approval.records) {
    const record = rows.get(entry.sourceRecordId), proposal = evidence.records.find(row => row.sourceRecordId === entry.sourceRecordId);
    assert.ok(record && proposal, `Unadmitted supplemental record ${entry.sourceRecordId}`);
    assert.equal(entry.sourceFamilyId, record.sourceFamilyId);
    assert.equal(entry.record_shape_sha256, recordShapeDigest(transformerRecordShape(record)), `Changed supplemental shape ${record.id}`);
    assert.equal(entry.database_id, importedProductId(record.id), `Wrong supplemental database identity ${record.id}`);
    assert.ok(!Object.hasOwn(baseAssets.geometry, record.id) && !Object.hasOwn(baseAssets.icons, record.id), 'No default override of historical assets');
    assert.ok(!Object.hasOwn(baseChoices.records, record.id), 'No override of historical choices');
    assert.equal(entry.representativeOnly, true); assert.equal(entry.dimensionAccurate, false); assert.equal(entry.exactMeshReuseAllowed, false);
    if (admitted.has(record.id)) {
      assert.equal(admitted.get(record.id).canonicalId, record.id);
      assert.equal(proposal.status, 'old-identity-hold');
      assert.ok(identityCompletionProducts.some(row => row.id === record.id));
    } else assert.ok(copperRows.has(record.id), 'A historic hold needs separate exact clearance');
    const isCopper = copperRows.has(record.id);
    assert.equal(entry.evidenceBasis, isCopper ? 'representative-subsection-inference' : 'explicit-source-caption');
    if (isCopper) {
      const checked = copperRows.get(record.id);
      assert.equal(entry.mode, 'default');
      for (const key of ['record_shape_sha256', 'database_id', 'sourceFamilyId']) assert.equal(entry[key], checked[key]);
      for (const key of ['groupId', 'geometryType', 'iconType']) assert.equal(entry.choices[0][key], checked[key]);
      assert.deepEqual(entry.choices[0].sourcePages, checked.drawingPages);
    }
    assert.equal(entry.mode, proposal.choices.length === 1 ? 'default' : 'explicit-choice-only');
    assert.deepEqual(entry.choices.map(choice => choice.groupId), proposal.choices.map(choice => choice.groupId), 'Do not select or remove source alternatives');
    for (const choice of entry.choices) {
      const source = proposal.choices.find(item => item.groupId === choice.groupId);
      for (const key of ['geometryType', 'iconType', 'sourcePages', 'viewMode']) assert.deepEqual(choice[key], source[key], `Changed supplemental source alternative ${record.id}/${key}`);
      assert.ok(Object.hasOwn(transformer2026Types, choice.geometryType));
      assert.ok(choice.sourcePages.length && choice.sourcePages.every(page => record.sourcePages.includes(page)));
      for (const key of ['label', 'sourceCaption', 'reason']) assert.ok(typeof choice[key] === 'string' && choice[key].trim());
      const sourceImages = choice.sourcePages.map(page => `/catalog-source/transformers-2026/page-${String(page).padStart(3, '0')}.webp`);
      for (const file of sourceImages) assert.ok(Object.hasOwn(dependencies.reviewedSourceImageHashes, file), `Missing supplemental drawing ${file}`);
      const bound = {
        groupId: choice.groupId, sourcePages: choice.sourcePages, sourceImage: sourceImages[0],
        record_shape_sha256: entry.record_shape_sha256, database_id: entry.database_id,
        evidenceBasis: entry.evidenceBasis, reason: choice.reason, sourceCaption: choice.sourceCaption,
        representativeOnly: true, dimensionAccurate: false, exactMeshReuseAllowed: false,
      };
      if (entry.mode === 'default') {
        result.geometry[record.id] = { type: choice.geometryType, ...bound };
        result.icons[record.id] = { type: choice.iconType, ...bound };
      } else {
        const definition = {
          id: choice.groupId, label: choice.label, geometryType: choice.geometryType, iconType: choice.iconType,
          reason: choice.reason, sourceCaption: choice.sourceCaption, sourcePages: choice.sourcePages,
          fallbackImage: sourceImages[0], sourceImages, viewMode: choice.viewMode,
          disclosure: TRANSFORMER_2026_DISCLOSURE, dimensionAccurate: false, exactMeshReuseAllowed: false,
        };
        assert.deepEqual(definition, baseChoices.choices[choice.groupId], 'New TSL rows reuse the exact previously reviewed labels and cutaway disclosure');
        if (Object.hasOwn(result.executionChoices.choices, choice.groupId)) assert.deepEqual(result.executionChoices.choices[choice.groupId], definition);
        result.executionChoices.choices[choice.groupId] = definition;
      }
    }
    if (entry.mode === 'explicit-choice-only') result.executionChoices.records[record.id] = {
      sourceFamilyId: record.sourceFamilyId, record_shape_sha256: entry.record_shape_sha256,
      database_id: entry.database_id, choiceIds: entry.choices.map(choice => choice.groupId),
    };
  }
  assert.equal(Object.keys(result.geometry).length, 25); assert.equal(Object.keys(result.icons).length, 25);
  assert.equal(Object.keys(result.geometry).filter(id => admitted.has(id)).length, 16);
  assert.equal(Object.keys(result.executionChoices.records).length, 4);
  assert.equal(Object.values(result.executionChoices.records).reduce((sum, row) => sum + row.choiceIds.length, 0), 8);
  assert.equal(Object.keys(result.executionChoices.choices).length, 2);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2]; assert.ok(file, 'Supply explicit independent supplemental asset clearance JSON');
  const result = buildTransformerAssetCompletion(JSON.parse(fs.readFileSync(file, 'utf8')));
  const target = path.join(root, 'frontend/lib/catalog/models/transformer2026AssetCompletionManifest.json');
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target, 'utf8'), bytes);
  else fs.writeFileSync(target, bytes);
  console.log(JSON.stringify({ ...counts, historicalClearancesChanged: false }));
}
