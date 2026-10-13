import metadata from './identity-completion-data/manifest.json' with { type: 'json' };
import { catalogSourceComparisons } from './identityCompletionData.js';
import { recordShapeDigest, transformerRecordShape } from './models/transformer2026Shape.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const manifest = freeze(metadata);
const panels = new Map(catalogSourceComparisons.map(panel => [panel.id, freeze(panel)]));
const empty = Object.freeze([]);
export const catalogIdentityCompletion = manifest;
export const catalogReadAliases = manifest.aliases;

/** Read navigation only. Never apply aliases to persisted selections, DB keys or snapshots. */
export function resolveCatalogReadId(id) {
  if (typeof id !== 'string') return null;
  return Object.hasOwn(manifest.aliases, id) ? manifest.aliases[id] : id;
}

function reviewedRecord(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
  try {
    const prototype = Object.getPrototypeOf(product);
    if (prototype !== Object.prototype && prototype !== null) return null;
    for (const key of ['id', 'name', 'category', 'source', 'sourceUrl', 'recordType']) if (!Object.hasOwn(product, key)) return null;
    if (typeof product.id !== 'string' || !Object.hasOwn(manifest.guards, product.id)) return null;
    const guard = manifest.guards[product.id];
    if (product.source === 'api') {
      if (!Object.hasOwn(product, 'databaseId') || product.databaseId !== guard.databaseId || !Object.hasOwn(product, 'sourceMediaPath')) return null;
    } else if (product.source !== 'official' || Object.hasOwn(product, 'databaseId')) return null;
    return recordShapeDigest(transformerRecordShape(product)) === guard.recordShapeSha256 ? guard : null;
  } catch { return null; }
}

/** Source descriptions are attached only to unchanged reviewed reference records.
 * The returned panels retain their own facts, units and provenance; they are not products.
 */
export function getCatalogSourceComparisons(product) {
  const guard = reviewedRecord(product);
  return guard ? Object.freeze(guard.comparisonIds.map(id => panels.get(id))) : empty;
}

/** Related references express a documented relationship, never execution equivalence. */
export function getCatalogRelatedReferences(product) {
  return reviewedRecord(product)?.relatedReferences || empty;
}

/** Optional explicit family navigation, without changing immutable parent variantIds. */
export function getAdditionalCatalogVariantIds(familyId) {
  return typeof familyId === 'string' && Object.hasOwn(manifest.familyMembers, familyId) ? manifest.familyMembers[familyId] : empty;
}

/** API aliases retain their requested identity until the original imported UUID is verified.
 * Canonical URLs keep ordinary live-catalog matching; an alias miss never falls back to a reused key.
 */
export function getApiCatalogReadProduct(requestedId, records = []) {
  if (typeof requestedId !== 'string' || !Array.isArray(records)) return null;
  if (Object.hasOwn(manifest.aliases, requestedId)) {
    const canonicalId = manifest.aliases[requestedId];
    const guard = manifest.guards[canonicalId];
    if (!guard?.databaseId) return null;
    return records.find(product => product && ['source', 'id', 'databaseId'].every(key => Object.hasOwn(product, key)) && product.source === 'api' && product.id === canonicalId && product.databaseId === guard.databaseId) || null;
  }
  return records.find(product => product && (product.id === requestedId || product.slug === requestedId || product.databaseId === requestedId)) || null;
}
