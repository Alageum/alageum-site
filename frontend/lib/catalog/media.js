import { isTransformer2026Record } from './models/transformer2026Runtime.js';
import manifest from './media-manifest.json' with { type: 'json' };
import { getSourcePageAsset } from './sources.js';

const isMedia = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const imagePath = /^\/(catalog-products|catalog-source|brand)\/[A-Za-z0-9_./-]+\.(webp|png|jpe?g|gif|avif)$/i;

// JSONB can reorder object keys. Media order and the presence of alt are meaningful.
export function sameOrderedMedia(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return isMedia(item) && isMedia(other) && item.path === other.path && item.kind === other.kind
      && Object.hasOwn(item, 'alt') === Object.hasOwn(other, 'alt') && item.alt === other.alt;
  });
}

export function selectApiProductImage(id, media, databaseId) {
  const override = Object.hasOwn(manifest.overrides, id) ? manifest.overrides[id] : null;
  // This narrowly corrects untouched imported mismatches without rewriting saved media.
  const selected = override && databaseId === override.database_id && sameOrderedMedia(media, override.imported) ? override.reviewed : media;
  if (!Array.isArray(selected)) return null;
  const image = selected.find(item => isMedia(item) && item.kind === 'image' && typeof item.path === 'string'
    && imagePath.test(item.path) && !item.path.split('/').some(segment => segment === '.' || segment === '..'));
  return image ? { ...image } : null;
}

export function getProductMedia(product, visual) {
  const image = product.source === 'api' && isTransformer2026Record(product)
    ? visual.type ? visual.fallbackImage : product.sourceMediaPath
    : product.source === 'api' ? product.image : visual.fallbackImage || product.image;
  if (!image) return { image: null, alt: '', caption: 'Проверенный чертёж конструкции не предоставлен', sourcePages: [], sourceId: null, representation: null };
  const asset = Object.hasOwn(manifest.assets, image) ? manifest.assets[image] : null;
  const scan = getSourcePageAsset(image);
  const representation = asset?.representation || scan?.representation || null;
  const sourcePages = [...(asset?.source_pages || scan?.source_pages || [])];
  const sourceId = asset?.source_id || scan?.source_id || null;
  const caption = representation === 'source-scan'
    ? `Страница ${sourcePages[0]} исходного каталога; не фотография изделия`
    : representation === 'crop'
      ? 'Иллюстрация серии из исходного каталога; не фотография конкретного исполнения'
      : 'Иллюстрация; конструкция конкретного исполнения не подтверждена';
  // A static reviewed fallback can differ from the record's original image and alt.
  const alt = product.source === 'api' && isTransformer2026Record(product)
    ? image === product.image ? product.imageCaption : image === product.sourceMediaPath ? product.sourceImageCaption : null
    : product.imageCaption === '' ? '' : product.source !== 'api' && image !== product.image ? null : product.imageCaption;
  return { image, alt: typeof alt === 'string' ? alt : caption, caption, sourcePages, sourceId, representation };
}
