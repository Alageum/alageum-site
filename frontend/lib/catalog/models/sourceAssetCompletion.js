import manifestData from './sourceAssetCompletionManifest.json' with { type: 'json' };
import { verifiedTransformerAsset } from './transformer2026Runtime.js';
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
// The release checker independently pins these exact records, captions and modules.
// No category, family, name or power fallback can admit another product.
export const sourceAssetCompletionManifest = freeze(manifestData);
export function getSourceAssetCompletion(product, channel) {
  if (!product || !['geometry', 'icons'].includes(channel)) return null;
  try {
    if (!Object.hasOwn(sourceAssetCompletionManifest.records, product.id)) return null;
    const entry = sourceAssetCompletionManifest.records[product.id];
    if (product.source !== 'api' && Object.hasOwn(product, 'sourceMediaPath')) return null;
    const rawMedia = product.source === 'api' ? product.sourceMediaPath : product.image;
    if (rawMedia !== entry.rawSourceMedia) return null;
    if (!verifiedTransformerAsset(product, entry, sourceAssetCompletionManifest)) return null;
    const common = { type: entry.type, sourceFamilyId: entry.sourceFamilyId, sourcePages: entry.sourcePages, reason: entry.reason };
    return channel === 'geometry'
      ? { ...common, confidence: 'source-matched', fallbackImage: entry.rawSourceMedia }
      : { ...common, confidence: 'source-based', sourceImage: entry.sourceImage };
  } catch { return null; }
}
