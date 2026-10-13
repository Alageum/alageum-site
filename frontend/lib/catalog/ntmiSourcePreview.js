import metadata from './ntmi-source-preview-manifest.json' with { type: 'json' };
import { getCatalogSourceComparisons } from './identityCompletion.js';
import { recordShapeDigest, transformerRecordShape } from './models/transformer2026Shape.js';
import { sourcePageImage, sourcePageUrl } from './sources.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export const ntmiSourcePreviewManifest = freeze(metadata);

/** A separate, display-only source preview. The original canonical record and its
 * internal guarded panel are required; a panel or synthetic PDF product cannot
 * substitute for the record. This never grants default visual/icon authority.
 */
export function getNtmiSourcePreview(product) {
  try {
    if (!product || !Object.hasOwn(product, 'id') || !Object.hasOwn(metadata.records, product.id)) return null;
    const approved = metadata.records[product.id];
    const panel = getCatalogSourceComparisons(product).find(value => value.id === approved.panelId);
    if (!panel || panel.canonicalId !== product.id || panel.representation !== 'alias' || panel.relation !== 'same_catalog_model') return null;
    if (recordShapeDigest(transformerRecordShape(product)) !== approved.recordShapeSha256) return null;
    if (product.source === 'api' && product.databaseId !== approved.databaseId) return null;
    if (recordShapeDigest(JSON.stringify(panel)) !== approved.panelSha256) return null;
    for (const field of ['sourceId', 'sourceFileId', 'sourceSha256', 'sourceUrl', 'sourceTitle']) {
      if (panel[field] !== metadata.source[field]) return null;
    }
    if (panel.sourcePages.length !== 1 || panel.sourcePages[0] !== 96) return null;
    const sourceHref = sourcePageUrl(panel, 96), sourceImage = sourcePageImage(panel, 96);
    if (!sourceHref || sourceImage !== metadata.preview.sourceImage) return null;
    return freeze({
      ...metadata.preview, ...metadata.source, canonicalId: product.id, panelId: panel.id,
      sourcePages: [96], sourceHref, sourceImage,
    });
  } catch { return null; }
}
