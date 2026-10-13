import manifestData from './measurementColumn2026CompletionManifest.json' with { type: 'json' };
import { verifiedTransformerAsset } from './transformer2026Runtime.js';
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
// Per-record authority belongs to this exact binding manifest and its independent
// integration clearance. Prototype runtimeEligible:false is not an authority grant.
// No category, family, name or power fallback can admit another product.
export const measurementColumn2026CompletionManifest = freeze(manifestData);
export function getMeasurementColumn2026Completion(product, channel) {
  if (!product || !['geometry', 'icons'].includes(channel)) return null;
  try {
    if (!Object.hasOwn(measurementColumn2026CompletionManifest.records, product.id)) return null;
    const entry = measurementColumn2026CompletionManifest.records[product.id];
    if (product.source !== 'api' && Object.hasOwn(product, 'sourceMediaPath')) return null;
    const rawMedia = product.source === 'api' ? product.sourceMediaPath : product.image;
    if (rawMedia !== entry.rawSourceMedia) return null;
    if (!verifiedTransformerAsset(product, entry, measurementColumn2026CompletionManifest)) return null;
    const common = { type: entry.type, sourceFamilyId: entry.sourceFamilyId, sourcePages: entry.sourcePages, reason: entry.reason };
    return channel === 'geometry'
      ? { ...common, confidence: 'source-matched', fallbackImage: entry.rawSourceMedia }
      : { ...common, confidence: 'source-based', sourceImage: entry.sourceImage };
  } catch { return null; }
}
