import { isSourcePage } from './sources.js';
import { UUID } from '../quotes/model.js';
import { selectApiProductImage } from './media.js';
// Stable public_key is the UI identity; the database UUID is transport-only.
export function isApiCatalog(params) {
 const source = typeof params?.get === 'function' ? params.get('source') : params?.source;
 // An explicitly live deployment cannot reopen stale bundled records via a query override.
 if (process.env.NEXT_PUBLIC_CATALOG_SOURCE === 'api') return true;
 return source === 'api';
}
export const liveHref = id => `/catalog/${encodeURIComponent(id)}?source=api`;
export const safeSourceUrl = url => typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
const text = value => typeof value === 'string' || typeof value === 'number' ? value : null;
const normalizeSpecRows = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object').map(row => ({ label: String(row.label || ''), value: String(text(row.value) ?? '—'), unit: String(row.unit || ''), page: Number.isInteger(row.page) ? row.page : null })) : [];
export function normalizeApiProduct(product) {
 const specs = product.specs || {}, provenance = product.provenance || {};
 const technicalSpecs = normalizeSpecRows(specs.technicalSpecs);
 const sourceImage = selectApiProductImage(null, product.media, null);
 const image = selectApiProductImage(product.public_key || product.id, product.media, product.id);
 return {
  id: product.public_key || product.id, databaseId: product.id, slug: product.slug,
  name: product.translations?.ru?.name || product.translations?.en?.name || product.slug,
  description: product.translations?.ru?.description || product.translations?.en?.description || '',
  category: product.category_public_key || '', sku: product.sku, source: 'api',
  price: product.price, currency: product.currency, price_mode: product.price_mode, version: product.version, comparable: product.comparable,
  ...Object.fromEntries(['designation','execution','productKind','sourceRecordType','power','voltage','voltageUnit','cooling','installation','subtype','manufacturer','recordKind','recordType','series','familyId','familyName'].map(key => [key,text(specs[key])])),
  // Keep variant-specific source facts for exact evidence checks and preserve
  // their sanitized rows so summaries do not substitute a family-wide range.
  ...(Object.hasOwn(specs, 'variantSpecs') ? { sourceVariantSpecs: specs.variantSpecs } : {}),
  technicalSpecs, variantSpecs: normalizeSpecRows(specs.variantSpecs), configurations: Array.isArray(specs.configurations) ? specs.configurations : [],
  variantIds: Array.isArray(specs.variantIds) ? specs.variantIds.filter(value => typeof value === 'string') : [],
  notes: Array.isArray(specs.notes) ? specs.notes.filter(value => typeof value === 'string') : [],
  sourceFamilyId:text(provenance.sourceFamilyId), sourceId:text(provenance.sourceId), sourceFileId:text(provenance.sourceFileId), sourceSha256:text(provenance.sourceSha256), sourceRow:provenance.sourceRow || null,
  sourceKind: text(provenance.sourceKind), sourceTitle: text(provenance.sourceTitle),
  sourcePages: Array.isArray(provenance.sourcePages) ? provenance.sourcePages.filter(page => isSourcePage(provenance, page)) : [],
  sourceUrl: safeSourceUrl(provenance.sourceUrl), sourceCheckedAt: provenance.sourceCheckedAt,
  sourceMediaPath: sourceImage?.path || null, sourceImageCaption: typeof sourceImage?.alt === 'string' ? sourceImage.alt : null,
  image: image?.path || null, imageCaption: typeof image?.alt === 'string' ? image.alt : null, attributes: product.attributes || [],
 };
}
export function normalizeApiSelection(value) {
 if (!Array.isArray(value)) return [];
 const seen = new Set();
 return value.filter(item => item && typeof item.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) && !seen.has(item.id) && seen.add(item.id)).slice(0,500).map(item => ({id:item.id,...(UUID.test(item.databaseId || '') ? { databaseId: item.databaseId } : {}),quantity:Math.min(999,Math.max(1,Math.floor(Number(item.quantity))||1))}));
}
