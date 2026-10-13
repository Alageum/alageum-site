import { recordShapeDigest, transformerRecordShape } from './transformer2026Shape.js';

// One independently reviewed designation. The manufacturer's scoped ШР11 page
// corroborates the existing page-64 drawing; ПР and ПР-11 are not included.
export const legacyAssetCompletion = Object.freeze({
  id: 'cat-pr-shr11-v002',
  recordShapeSha256: '61886bb30411408e112bb2fc173c30e6530a6c78c76738399a340caafe356f7c',
  databaseId: '3ed86cce-9191-5c02-ac5a-81359077ae48',
  primarySourceUrl: 'https://alageum.com/ru/katalog/shkafy-upravleniya/shr11',
  primaryImageUrl: 'https://alageum.com/images/oborudovanie/shkafi/shr11.jpg',
  primaryImageSha256: 'c7a04b0e52b6e6eaaa9aabccdc463c673911639a848a72b52d5480ca911fbdab',
  review: 'docs/catalog-completion-2026-10-06/shr11-independent-review.json',
  reviewSha256: '9e4a40dadb63fa7bad590f83a89c53b8199b85028c44bca2a9452e0483c60332',
});
const reason = 'Представительная открытая панель ШР11: официальный раздел производителя подтверждает рисунок со стр. 64. Иллюстративный разрез видимой компоновки; не CAD, не точные размеры, внутренняя схема или комплектация заказа. На ПР и ПР-11 не распространяется.';
const pages = Object.freeze([64]);
const visual = Object.freeze({ type: 'open-distribution-panel', confidence: 'source-matched',
  sourceFamilyId: 'cat-pr-shr11', sourcePages: pages, fallbackImage: '/catalog-products/cat-pr-shr11.webp',
  sourceUrl: legacyAssetCompletion.primarySourceUrl, viewMode: 'illustrative-cutaway', reason });
const icon = Object.freeze({ type: visual.type, confidence: 'source-based', sourceFamilyId: visual.sourceFamilyId,
  sourcePages: pages, sourceImage: visual.fallbackImage, sourceUrl: visual.sourceUrl, reason });

export function getReviewedLegacyCompletion(product, channel) {
  if (!product || typeof product !== 'object' || Array.isArray(product) || !['geometry', 'icons'].includes(channel)) return null;
  try {
    const prototype = Object.getPrototypeOf(product);
    if (prototype !== Object.prototype && prototype !== null) return null;
    for (const key of ['id', 'name', 'category', 'source', 'sourceUrl', 'recordType', 'recordKind']) if (!Object.hasOwn(product, key)) return null;
    if (product.id !== legacyAssetCompletion.id) return null;
    if (product.source === 'api') {
      if (!Object.hasOwn(product, 'databaseId') || product.databaseId !== legacyAssetCompletion.databaseId || !Object.hasOwn(product, 'sourceMediaPath')) return null;
    } else if (product.source !== 'official' || Object.hasOwn(product, 'databaseId') || Object.hasOwn(product, 'sourceMediaPath')) return null;
    if (recordShapeDigest(transformerRecordShape(product)) !== legacyAssetCompletion.recordShapeSha256) return null;
    return channel === 'geometry' ? visual : icon;
  } catch { return null; }
}
