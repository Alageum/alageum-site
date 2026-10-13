import { verifyKtpbSourceContextPreservation } from './check-ktpb-source-context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { officialProducts, valueOrDash } from '../frontend/lib/catalog/data.js';
import { getCatalogSpecSummary, facetValues } from '../frontend/lib/catalog/grouping.js';
import { comparisonSpecValue } from '../frontend/lib/catalog/comparison.js';
import { getEquipmentVisual } from '../frontend/lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../frontend/lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../frontend/lib/catalog/models/transformerExecutionChoices.js';
import { getNtmiSourcePreview } from '../frontend/lib/catalog/ntmiSourcePreview.js';
import { protectionExampleRuntimeManifest as bindings, getProtectionExampleEvidence } from '../frontend/lib/catalog/models/protectionExampleRuntime.js';
import { protectionExampleTypes } from '../frontend/lib/catalog/models/protectionExampleTypes.js';
import { protectionExampleIconDefinitions } from '../frontend/lib/catalog/models/protectionExampleIcons.js';
import { sourceContextManifest } from '../frontend/lib/catalog/source-context/sourceContexts.js';
import { normalizeApiProduct } from '../frontend/lib/catalog/apiData.js';
import { selectionCsv } from '../frontend/lib/catalog/query.js';
import { inquiryItems } from '../frontend/lib/inquiry/model.js';
import { quotePayload, selectionFingerprint } from '../frontend/lib/quotes/model.js';
import { importedProductId } from './catalog/measurement-column-asset-snapshot.mjs';
import { protectionContextAssetSnapshot } from './catalog/protection-context-asset-snapshot.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const protectionContextReviewDir = 'docs/catalog-transformers-2026/review/protection-context-integration';
export const protectionExampleExactIds = Object.freeze(['cat-ptm-tded', 'cat-ptm-tded-v012', 'cat-ptm-tded-v013']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFileSync(path.join(root, file));

export async function verifyProtectionContextPreservation() {
  const baselineBytes = read(`${protectionContextReviewDir}/baseline-outputs.json`);
  assert.equal(digest(baselineBytes), 'edc00fd04790d5493d14c0965cc3fc3363af2d7ad2ca0c5b702887bd2e8a0b0b', 'Changed exact PR33 checkpoint');
  const baseline = JSON.parse(baselineBytes), current = await protectionContextAssetSnapshot(root);
  const clientBytes = read(`${protectionContextReviewDir}/baseline-client-consumers.json`);
  assert.equal(digest(clientBytes), '69ab2ac713fdb0f74141e5ed12c276fb22820254f3976947ede922205deddb1b');
  const clientBaseline = JSON.parse(clientBytes);
  assert.deepEqual(Object.keys(clientBaseline.records), Object.keys(baseline.products));
  const hashValue = value => digest(JSON.stringify(value));
  const normalizedRows = [];
  for (const row of officialProducts) {
    const normalized = normalizeApiProduct({ id: importedProductId(row.id), public_key: row.id, sku: row.sku,
      category_public_key: row.category, translations: { ru: { name: row.name } }, specs: row, provenance: row,
      media: row.image ? [{ path: row.image, kind: 'image', alt: row.imageCaption }] : [],
    });
    // This is one intentional client provenance addition, not a claim that the
    // normalized objects are byte-identical. Every former field stays identical.
    normalizedRows.push(normalized);
    const { sourceVariantSpecs, variantSpecs, ...previousFields } = normalized;
    assert.equal(Object.hasOwn(normalized, 'sourceVariantSpecs'), Object.hasOwn(row, 'variantSpecs'));
    assert.deepEqual(sourceVariantSpecs, row.variantSpecs);
    assert.deepEqual(variantSpecs, (row.variantSpecs || []).map(spec => ({ label: String(spec.label || ''), value: String(spec.value ?? '—'), unit: String(spec.unit || ''), page: Number.isInteger(spec.page) ? spec.page : null })));
    const items = [{ id: row.id, databaseId: normalized.databaseId, quantity: 2 }];
    assert.deepEqual({ normalized: hashValue(previousFields), selectionCsv: hashValue(selectionCsv(items, [normalized])),
      inquiry: hashValue(inquiryItems(items, [normalized])), quotePayload: hashValue(quotePayload(items)),
      selectionFingerprint: hashValue(selectionFingerprint(items)) }, clientBaseline.records[row.id], `Changed client/quote consumer ${row.id}`);
  }
  const auditBytes = read(`${protectionContextReviewDir}/baseline-api-spec-audit.json`);
  assert.equal(digest(auditBytes), 'ef3ea8944fd248e83b690e7a3d69554a04b4df73a3f7e4380384a06aef6e2323');
  const audit = JSON.parse(auditBytes), summaryChanges = [], facetChanges = [];
  const priorRows = normalizedRows.map(row => { const prior = { ...row }; delete prior.variantSpecs; delete prior.sourceVariantSpecs; return prior; });
  const displayed = rows => rows.map(({ key, label, value, unit, values }) => ({ key, label, value, unit, values }));
  for (let index = 0; index < officialProducts.length; index++) {
    const source = officialProducts[index], live = normalizedRows[index], prior = priorRows[index];
    const expected = getCatalogSpecSummary(source, officialProducts), current = getCatalogSpecSummary(live, normalizedRows), before = getCatalogSpecSummary(prior, priorRows);
    assert.deepEqual(displayed(current), displayed(expected), `Changed displayed source summary ${source.id}`);
    current.forEach((row, i) => { if (row.value !== before[i].value) summaryChanges.push({ id: source.id, field: row.key, static: row.value, api: before[i].value }); });
    for (const field of ['power', 'voltage', 'current', 'function', 'cooling', 'installation', 'subtype']) {
      const expected = facetValues(source, field), current = facetValues(live, field), before = facetValues(prior, field);
      assert.deepEqual(current, expected, `Changed source facet ${source.id}/${field}`);
      if (JSON.stringify(current) !== JSON.stringify(before)) facetChanges.push({ id: source.id, field, static: current, api: before });
    }
  }
  assert.deepEqual(summaryChanges, audit.summaryDiffs); assert.equal(summaryChanges.length, 23);
  assert.deepEqual(facetChanges, audit.facetDiffs);
  const expectedComparison = [25, 40, 63].map(power => ({ id: `alageum-2026-tmg-20kv-copper-${power}`, label: 'Обмотки', unit: '', before: 'медные', after: 'медные · трехфазные, двухобмоточные' }));
  for (const [products, format] of [[officialProducts, valueOrDash], [normalizedRows, value => value ?? '—']]) {
    const rows = [...new Map(products.flatMap(product => (product.technicalSpecs || []).map(row => [`${row.label}|${row.unit}`, row]))).values()], changed = [];
    for (const product of products) for (const row of rows) {
      const before = format((product.technicalSpecs || []).find(spec => spec.label === row.label && spec.unit === row.unit)?.value, row.unit);
      const after = comparisonSpecValue(product.technicalSpecs, row, format);
      if (before !== after) changed.push({ id: product.id, label: row.label, unit: row.unit, before, after });
    }
    assert.deepEqual(changed, expectedComparison, 'Unapproved technical comparison cell changes');
  }
  assert.equal(Object.keys(baseline.modelOutputs).length, 126); assert.equal(Object.keys(baseline.iconOutputs).length, 136);
  assert.equal(Object.keys(current.products).length, 843); assert.deepEqual(Object.keys(current.products), Object.keys(baseline.products));
  for (const key of ['legacyIds', 'executionManifest', 'identities', 'sourcePreviews']) assert.deepEqual(current[key], baseline[key], `Changed historical ${key}`);
  for (const key of ['modelOutputs', 'iconOutputs']) {
    for (const [id, output] of Object.entries(baseline[key])) assert.deepEqual(current[key][id], output, `Changed existing ${key}/${id}`);
    const expected = Object.keys(key === 'modelOutputs' ? protectionExampleTypes : protectionExampleIconDefinitions);
    assert.deepEqual(Object.keys(current[key]).filter(id => !Object.hasOwn(baseline[key], id)), expected);
  }
  const changed = [];
  for (const [id, old] of Object.entries(baseline.products)) {
    const actual = current.products[id];
    for (const key of ['body', 'staticMedia', 'apiMedia', 'choices', 'panels']) assert.equal(actual[key], old[key], `Changed ${id}/${key}`);
    if (!protectionExampleExactIds.includes(id)) assert.deepEqual(actual, old, `Changed unapproved product ${id}`);
    if (actual.static !== old.static || actual.api !== old.api) { assert.notEqual(actual.static, old.static); assert.notEqual(actual.api, old.api); changed.push(id); }
  }
  assert.deepEqual(changed.sort(), [...protectionExampleExactIds].sort());
  assert.deepEqual(Object.keys(bindings.records), [...protectionExampleExactIds].slice(1).concat(protectionExampleExactIds[0]));
  for (const row of officialProducts) {
    const entry = getProtectionExampleEvidence(row);
    assert.equal(!!entry, protectionExampleExactIds.includes(row.id));
    if (entry) {
      assert.equal(getEquipmentIcon(row).type, entry.type);
      assert.equal(getEquipmentVisual(row).type, entry.geometryType);
      assert.deepEqual(getEquipmentConstructionChoices(row), []);
    }
  }
  assert.deepEqual(Object.keys(current.sourceContexts).sort(), Object.keys(sourceContextManifest.records).sort());
  const { legacySourceContexts } = await verifyKtpbSourceContextPreservation(current);
  for (const [id, pair] of Object.entries(legacySourceContexts)) {
    assert.equal(pair.static.canonicalId, id); assert.equal(pair.api.canonicalId, id);
    const row = officialProducts.find(record => record.id === id);
    assert.equal(getEquipmentVisual(row).type, null); assert.equal(getEquipmentVisual(row).confidence, 'source-only');
    assert.equal(getEquipmentIcon(row).confidence, 'typical'); assert.deepEqual(getEquipmentConstructionChoices(row), []);
  }
  const gaps = officialProducts.filter(row => row.recordKind === 'variant' && !getEquipmentVisual(row).type && !getEquipmentConstructionChoices(row).length && !getNtmiSourcePreview(row));
  const counts = { productBodies: 843, unchangedProductBindings: 840, legacyRecords: current.legacyIds.length,
    oldModelTypes: 126, oldIconTypes: 136, newModelTypes: 2, newIconTypes: 3,
    sourceGroundedDefault3D: officialProducts.filter(row => { const visual = getEquipmentVisual(row); return visual.type && visual.confidence === 'source-matched'; }).length,
    sourceBasedIcons: officialProducts.filter(row => getEquipmentIcon(row).confidence === 'source-based').length,
    choiceRecords: officialProducts.filter(row => getEquipmentConstructionChoices(row).length).length,
    choices: officialProducts.reduce((count, row) => count + getEquipmentConstructionChoices(row).length, 0),
    ntmiSourcePreviews: officialProducts.filter(row => getNtmiSourcePreview(row)).length,
    explicitConstructionGaps: gaps.length, constructionGapFamilies: new Set(gaps.map(row => row.familyId)).size,
    sourceContextRecords: Object.keys(legacySourceContexts).length, newProducts: 0, confidencePromotions: 0, apiSummaryCorrections: 23, comparisonCellCorrections: 3 };
  assert.deepEqual(counts, { productBodies: 843, unchangedProductBindings: 840, legacyRecords: 238, oldModelTypes: 126, oldIconTypes: 136,
    newModelTypes: 2, newIconTypes: 3, sourceGroundedDefault3D: 464, sourceBasedIcons: 465, choiceRecords: 36, choices: 74,
    ntmiSourcePreviews: 2, explicitConstructionGaps: 243, constructionGapFamilies: 29, sourceContextRecords: 24, newProducts: 0, confidencePromotions: 0, apiSummaryCorrections: 23, comparisonCellCorrections: 3 });
  return counts;
}

export async function verifyProtectionContextIntegration({ candidate = false } = {}) {
  const counts = await verifyProtectionContextPreservation();
  const { verifyProtectionContextDependencyFiles, verifyProtectionContextDependencyAmendment, protectionContextClearancePath } = await import('./catalog/protection-context-reviewed-dependencies.mjs');
  const clearance = JSON.parse(read(protectionContextClearancePath));
  (candidate ? verifyProtectionContextDependencyFiles : verifyProtectionContextDependencyAmendment)(clearance);
  return { status: candidate ? 'candidate-checks-only-independent-approval-required' : 'approved-bounded-protection-context', ...counts };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyProtectionContextIntegration({ candidate: process.argv.includes('--candidate') })));
