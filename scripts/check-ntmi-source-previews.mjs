import { runFreshProof, proofOperations, evaluateProof } from './catalog/proof-invocation.mjs';
import { historicalDependencyHash, internalHistoricalDependencyHash } from './catalog/source-asset-reviewed-dependencies.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { productById } from '../frontend/lib/catalog/data.js';
import { catalogIdentityCompletion, getCatalogSourceComparisons } from '../frontend/lib/catalog/identityCompletion.js';
import { ntmiSourcePreviewManifest } from '../frontend/lib/catalog/ntmiSourcePreview.js';
import { transformer2026AssetEvidence } from '../frontend/lib/catalog/models/transformer2026Bindings.js';
import { transformer2026Types, TRANSFORMER_2026_DISCLOSURE } from '../frontend/lib/catalog/models/transformer2026Types.js';
import { recordShapeDigest, transformerRecordShape } from '../frontend/lib/catalog/models/transformer2026Shape.js';
import { getCatalogSource, getSourcePageAsset } from '../frontend/lib/catalog/sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readNtmiBytes = file => {
  assert.ok(typeof file === 'string' && !path.isAbsolute(file) && !file.split('/').includes('..'));
  return fs.readFileSync(path.join(root, file));
};
export const ntmiPreviewClearancePath = 'docs/catalog-transformers-2026/review/ntmi-source-preview/clearance.json';
export const hashBytes = value => createHash('sha256').update(value).digest('hex');
export const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
export const hashFile = file => {
  assert.ok(typeof file === 'string' && !path.isAbsolute(file) && !file.split('/').includes('..'));
  return historicalDependencyHash(file);
};
export const requiredPreviewFiles = Object.freeze([
  'frontend/lib/catalog/ntmi-source-preview-manifest.json',
  'frontend/lib/catalog/ntmiSourcePreview.js',
  'frontend/components/catalog/CatalogSourcePreview.js',
  'frontend/components/catalog/CatalogSourcePreview.module.css',
  'frontend/components/catalog/CatalogSourceEvidence.js',
  'frontend/lib/catalog/identityCompletion.js',
  'frontend/lib/catalog/identity-completion-data/manifest.json',
  'frontend/lib/catalog/identity-completion-data/panels-001.js',
  'frontend/lib/catalog/sources.js',
  'frontend/lib/catalog/sources-manifest.json',
  'backend-node/data/catalog-sources.json',
  'frontend/public/catalog-source/transformers-2026/page-096.webp',
  'scripts/check-ntmi-source-previews.mjs',
]);

/** Reproduce this exact source mapping from immutable internal evidence. */
export function verifyNtmiSourcePreviewScope(manifest = ntmiSourcePreviewManifest) {
  return runFreshProof({ root, omittedReader: true, read: readNtmiBytes, inputs: [manifest] },
    context => internalVerifyNtmiSourcePreviewScope(context, manifest));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyNtmiSourcePreviewScope(context, manifest) {
  return evaluateProof(context, () => {
      const { json: proofJson } = proofOperations(context);
    assert.equal(manifest.format, 'alageum-ntmi-source-preview-v1');
    assert.deepEqual(Object.keys(manifest.records).sort(), ['ntmi-10', 'ntmi-6']);
    const source = getCatalogSource(manifest.source);
    assert.equal(source?.id, 'transformers-2026');
    assert.equal(source.source_sha256, '8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e');
    assert.equal(manifest.source.sourceTitle, 'Технический каталог трансформаторов · 18.03.2026');
    const group = transformer2026AssetEvidence.groups.find(item => item.id === 'measurement-ntmi');
    assert.equal(manifest.preview.groupId, group.id);
    assert.equal(manifest.preview.geometryType, group.geometryType);
    assert.equal(manifest.preview.iconType, group.iconType);
    assert.equal(manifest.preview.sourceImage, group.sourceImages[0]);
    assert.deepEqual(group.sourcePages, [96]);
    assert.deepEqual(transformer2026Types[manifest.preview.geometryType].pages, [96]);
    assert.equal(manifest.preview.disclosure, TRANSFORMER_2026_DISCLOSURE);
    assert.equal(manifest.preview.dimensionAccurate, false);
    assert.equal(manifest.preview.exactMeshReuseAllowed, false);
    assert.equal(getSourcePageAsset(manifest.preview.sourceImage).sha256, internalHistoricalDependencyHash(context, `frontend/public${manifest.preview.sourceImage}`));
    for (const [id, approved] of Object.entries(manifest.records)) {
      const product = productById(id), panel = getCatalogSourceComparisons(product)[0];
      assert.equal(approved.panelId, `alageum-2026-${id}`);
      assert.equal(panel.id, approved.panelId);
      assert.equal(panel.canonicalId, id);
      assert.equal(panel.representation, 'alias');
      assert.equal(panel.relation, 'same_catalog_model');
      assert.equal(approved.databaseId, catalogIdentityCompletion.guards[id].databaseId);
      assert.equal(approved.recordShapeSha256, recordShapeDigest(transformerRecordShape(product)));
      assert.equal(approved.panelSha256, recordShapeDigest(JSON.stringify(panel)));
      for (const key of Object.keys(manifest.source)) assert.equal(panel[key], manifest.source[key]);
      assert.deepEqual(panel.sourcePages, [96]);
      assert.equal(product.power, null); assert.equal(panel.power, null);
    }
    return { sourcePreviews: 2, newProducts: 0, newDefaultBindings: 0, newConstructionChoices: 0 };
  });
}

export function verifyNtmiSourcePreviewFiles(clearance) {
  return runFreshProof({ root, omittedReader: true, read: readNtmiBytes, inputs: [clearance] },
    context => internalVerifyNtmiSourcePreviewFiles(context, clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyNtmiSourcePreviewFiles(context, clearance) {
  return evaluateProof(context, () => {
      const { json: proofJson } = proofOperations(context);
    assert.equal(clearance.format, 'alageum-ntmi-source-preview-clearance-v1');
    assert.equal(clearance.sourceSha256, ntmiSourcePreviewManifest.source.sourceSha256);
    assert.deepEqual(clearance.counts, internalVerifyNtmiSourcePreviewScope(context, ntmiSourcePreviewManifest));
    const prior = proofJson('docs/catalog-transformers-2026/review/assets-clearance.json');
    const supplement = proofJson('docs/catalog-transformers-2026/review/asset-completion/clearance.json');
    const requiredUnchanged = [...new Set([...Object.keys(prior.reviewedLibraryHashes), ...Object.keys(supplement.dependencies.reviewedFileHashes)])];
    assert.deepEqual(Object.keys(clearance.dependencies.unchanged).sort(), requiredUnchanged.sort());
    assert.deepEqual(Object.keys(clearance.dependencies.preview).sort(), [...requiredPreviewFiles].sort());
    for (const group of Object.values(clearance.dependencies)) for (const [file, digest] of Object.entries(group)) assert.equal(internalHistoricalDependencyHash(context, file), digest, `Changed NTMI preview dependency ${file}`);
    return clearance.counts;
  });
}

export function verifyNtmiSourcePreviewClearance(clearance = undefined) {
  return runFreshProof({ root, omittedReader: true, read: readNtmiBytes, inputs: clearance === undefined ? [] : [clearance] },
    context => internalVerifyNtmiSourcePreviewClearance(context, clearance === undefined ? proofOperations(context).json(ntmiPreviewClearancePath) : clearance));
}
// Internal evaluator only; an active invocation is mandatory and its owner finalizes.
export function internalVerifyNtmiSourcePreviewClearance(context, clearance) {
  return evaluateProof(context, () => {
      const { json: proofJson } = proofOperations(context);
    const counts = internalVerifyNtmiSourcePreviewFiles(context, clearance);
    assert.equal(clearance.status, 'approved-source-preview-only');
    assert.equal(internalHistoricalDependencyHash(context, clearance.reviewReport), clearance.reviewReportSha256, 'Changed independent NTMI review');
    const report = proofJson(clearance.reviewReport);
    assert.equal(report.format, 'alageum-ntmi-source-preview-independent-review-v1');
    assert.equal(report.status, 'approved-source-preview-only');
    assert.equal(report.sourceSha256, clearance.sourceSha256);
    assert.equal(report.approvedDependenciesSha256, hashBytes(JSON.stringify(clearance.dependencies)));
    assert.deepEqual(report.counts, counts);
    return counts;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(verifyNtmiSourcePreviewClearance()));
}
