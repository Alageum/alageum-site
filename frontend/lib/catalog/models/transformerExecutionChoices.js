import manifest from './transformerExecutionChoicesManifest.json' with { type: 'json' };
import supplement from './transformer2026AssetCompletionManifest.json' with { type: 'json' };
import { verifiedTransformerAsset } from './transformer2026Runtime.js';

const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const registry = deepFreeze({
  ...manifest,
  supplementaryReview: { reviewReport: supplement.reviewReport, reviewReportSha256: supplement.reviewReportSha256 },
  records: { ...manifest.records, ...supplement.executionChoices.records },
  choices: { ...manifest.choices, ...supplement.executionChoices.choices },
});
const noChoices = Object.freeze([]);
export const transformerExecutionChoicesManifest = registry;

function reviewedRecord(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
  // A prototype must not supply an approved record or identity on its behalf.
  const prototype = Object.getPrototypeOf(product);
  if (prototype !== Object.prototype && prototype !== null) return null;
  for (const key of ['id', 'source', 'sourceId', 'sourceFileId', 'sourceSha256']) {
    if (!Object.hasOwn(product, key)) return null;
  }
  if (typeof product.id !== 'string' || !Object.hasOwn(registry.records, product.id)) return null;
  const approved = registry.records[product.id];
  if (product.source === 'api') {
    if (!Object.hasOwn(product, 'databaseId') || product.databaseId !== approved.database_id) return null;
    if (!Object.hasOwn(product, 'sourceMediaPath')) return null;
  } else if (product.source !== 'official' || Object.hasOwn(product, 'databaseId')) {
    return null;
  }
  // Invalid JSON-like shapes, including cycles, must close the gate, not crash a card.
  try {
    return verifiedTransformerAsset(product, approved, registry);
  } catch {
    return null;
  }
}

/** Display-only source alternatives for an exact admitted record. This never changes
 * default visual/icon authority, identity, configurations, ratings or dimensions.
 * The original static/API product must be supplied unchanged, not a synthetic row.
 */
export function getEquipmentConstructionChoices(product) {
  const record = reviewedRecord(product);
  if (!record) return noChoices;
  return Object.freeze(record.choiceIds.map(id => Object.freeze({
    ...registry.choices[id],
    sourceRecordId: product.id,
    sourceFamilyId: record.sourceFamilyId,
    sourceId: registry.sourceId,
    sourceFileId: registry.sourceFileId,
    sourceSha256: registry.sourceSha256,
    sourceUrl: registry.sourceUrl,
  })));
}

/** No default and no fallback: a selected group must belong to this exact record. */
export function getEquipmentConstructionChoice(product, choiceId) {
  if (typeof choiceId !== 'string' || !Object.hasOwn(registry.choices, choiceId)) return null;
  return getEquipmentConstructionChoices(product).find(choice => choice.id === choiceId) || null;
}
