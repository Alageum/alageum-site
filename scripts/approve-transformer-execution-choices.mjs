// Separate display-choice clearance. Never writes the default geometry/icon allowlists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { transformerProducts, transformerImport } from '../frontend/lib/catalog/transformers2026.js';
import { transformer2026AssetEvidence as evidence } from '../frontend/lib/catalog/models/transformer2026Bindings.js';
import { transformer2026Types, TRANSFORMER_2026_DISCLOSURE } from '../frontend/lib/catalog/models/transformer2026Types.js';
import { transformerRecordShape, recordShapeDigest } from '../frontend/lib/catalog/models/transformer2026Shape.js';
import { assertReviewedTransformerDependency } from './catalog/transformer-reviewed-dependencies.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const hashFile = relative => {
  assert.ok(typeof relative === 'string' && !path.isAbsolute(relative) && !relative.split('/').includes('..'), 'Invalid review path');
  return sha256(fs.readFileSync(path.join(root, relative)));
};
// UUIDv5 from the backend import namespace; no live lookup or new product identity.
const importedProductId = key => {
  const bytes = createHash('sha1').update(Buffer.from('541788eefbf04d859d33e593b82f303c', 'hex')).update(`product:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function buildTransformerExecutionChoices(approval) {
  assert.equal(approval.format, 'alageum-transformer-execution-choices-clearance-v1');
  assert.equal(approval.status, 'approved-explicit-choice-only');
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl', 'inventorySha256']) {
    assert.equal(approval[key], transformerImport[key], `Wrong choice approval ${key}`);
  }
  assert.ok(approval.reviewReport && approval.reviewedAt);
  assert.equal(hashFile(approval.reviewReport), approval.reviewReportSha256, 'Changed independent choice review');
  const review = JSON.parse(fs.readFileSync(path.join(root, approval.reviewReport), 'utf8'));
  assert.equal(review.format, 'alageum-transformer-execution-choice-independent-review-v1');
  assert.equal(review.status, 'approved-explicit-choice-only');
  assert.deepEqual(review.counts, { records: 32, choices: 66, geometryTypes: 7 });
  for (const key of ['sourceId', 'sourceFileId', 'sourceSha256', 'inventorySha256', 'reviewedAt']) assert.equal(review[key], approval[key]);
  assert.equal(review.approvedRecordsSha256, sha256(JSON.stringify(approval.records)), 'Changed independently reviewed choices or captions');
  const dependencies = {
    reviewedLibraryHashes: approval.reviewedLibraryHashes,
    reviewedSourceImageHashes: approval.reviewedSourceImageHashes,
    sourceRegistrySha256: approval.sourceRegistrySha256,
  };
  assert.equal(review.approvedDependenciesSha256, sha256(JSON.stringify(dependencies)), 'Changed independent dependency approval');
  for (const name of ['AssetEvidence.json', 'Geometry.js', 'GroupMap.js', 'Icons.js', 'PowerLayouts.js', 'Types.js', 'Shape.js']) {
    assert.ok(approval.reviewedLibraryHashes?.[`frontend/lib/catalog/models/transformer2026${name}`], `Missing reviewed library hash ${name}`);
  }
  for (const [file, hash] of Object.entries(approval.reviewedLibraryHashes)) {
    assertReviewedTransformerDependency(file, hash, approval);
  }
  assert.equal(approval.sourceRegistrySha256, hashFile('backend-node/data/catalog-sources.json'));
  const result = {
    format: 'alageum-transformer-execution-choices-v1', selectionMode: 'explicit-only',
    ...Object.fromEntries(['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl', 'inventorySha256', 'reviewedAt', 'reviewReport', 'reviewReportSha256', 'reviewedLibraryHashes', 'reviewedSourceImageHashes', 'sourceRegistrySha256'].map(key => [key, approval[key]])),
    records: {}, choices: {},
  };
  const rows = new Map(transformerProducts.map(record => [record.id, record]));
  for (const entry of approval.records) {
    const record = rows.get(entry.sourceRecordId);
    assert.ok(record, `Unadmitted choice record ${entry.sourceRecordId}`);
    assert.ok(!Object.hasOwn(result.records, record.id), `Duplicate choice record ${record.id}`);
    const proposed = evidence.records.find(row => row.sourceRecordId === record.id);
    assert.equal(proposed?.status, 'execution-choice-required', `Held or non-mixed choice record ${record.id}`);
    assert.deepEqual(proposed.candidateOldIds, []);
    assert.equal(record.recordKind, 'variant');
    assert.equal(entry.record_shape_sha256, recordShapeDigest(transformerRecordShape(record)), `Changed choice record ${record.id}`);
    assert.equal(entry.database_id, importedProductId(record.id), `Wrong choice database identity ${record.id}`);
    assert.deepEqual(entry.choices.map(choice => choice.groupId), proposed.choices.map(choice => choice.groupId), `Changed source alternatives ${record.id}`);
    result.records[record.id] = {
      sourceFamilyId: record.sourceFamilyId, record_shape_sha256: entry.record_shape_sha256,
      database_id: entry.database_id, choiceIds: entry.choices.map(choice => choice.groupId),
    };
    for (const choice of entry.choices) {
      const source = proposed.choices.find(value => value.groupId === choice.groupId);
      for (const key of ['geometryType', 'iconType', 'sourcePages', 'viewMode']) assert.deepEqual(choice[key], source[key], `Changed choice ${record.id}/${choice.groupId}/${key}`);
      assert.ok(Object.hasOwn(transformer2026Types, choice.geometryType));
      assert.ok(choice.sourcePages.length && choice.sourcePages.every(page => record.sourcePages.includes(page)));
      assert.equal(typeof choice.label, 'string'); assert.ok(choice.label.trim());
      assert.equal(typeof choice.reason, 'string'); assert.ok(choice.reason.trim());
      assert.equal(typeof choice.sourceCaption, 'string'); assert.ok(choice.sourceCaption.trim());
      const sourceImages = choice.sourcePages.map(page => `/catalog-source/transformers-2026/page-${String(page).padStart(3, '0')}.webp`);
      for (const file of sourceImages) {
        assert.ok(Object.hasOwn(approval.reviewedSourceImageHashes, file), `Missing reviewed source image ${file}`);
        assert.equal(hashFile(`frontend/public${file}`), approval.reviewedSourceImageHashes[file], `Changed reviewed source image ${file}`);
      }
      const definition = {
        id: choice.groupId, label: choice.label, geometryType: choice.geometryType, iconType: choice.iconType,
        reason: choice.reason, sourceCaption: choice.sourceCaption, sourcePages: choice.sourcePages,
        fallbackImage: sourceImages[0], sourceImages, viewMode: choice.viewMode,
        disclosure: TRANSFORMER_2026_DISCLOSURE, dimensionAccurate: false, exactMeshReuseAllowed: false,
      };
      if (Object.hasOwn(result.choices, choice.groupId)) assert.deepEqual(result.choices[choice.groupId], definition, 'Inconsistent reviewed group');
      result.choices[choice.groupId] = definition;
    }
  }
  assert.equal(Object.keys(result.records).length, 32, 'Review the exact 32 admitted mixed rows');
  assert.equal(Object.values(result.records).reduce((sum, record) => sum + record.choiceIds.length, 0), 66);
  assert.equal(Object.keys(result.choices).length, 7);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2];
  assert.ok(file, 'Supply explicit independent construction-choice clearance JSON');
  const result = buildTransformerExecutionChoices(JSON.parse(fs.readFileSync(file, 'utf8')));
  const target = path.join(root, 'frontend/lib/catalog/models/transformerExecutionChoicesManifest.json');
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target, 'utf8'), bytes);
  else fs.writeFileSync(target, bytes);
  console.log(JSON.stringify({ records: 32, choices: 66, geometryTypes: 7, defaultBindingsChanged: false }));
}
