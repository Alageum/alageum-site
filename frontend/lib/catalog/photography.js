import manifest from './photography-manifest.json' with { type: 'json' };
import { transformerRecordShape, recordShapeDigest } from './models/transformer2026Shape.js';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export function photographVariantDigest(product) {
  const key = product.source === 'api' ? 'sourceVariantSpecs' : 'variantSpecs';
  return recordShapeDigest(JSON.stringify(canonical(Object.hasOwn(product, key) ? product[key] : null)));
}

// Photography is editorial context, not geometry/specification authority.
// Match the complete reviewed record, not a guessed category, name or ID prefix.
// In live mode a changed media/source/technical record fails closed to the
// existing CMS/technical visual. Never apply a bundled photo to another UUID.
export function getProductPhotograph(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
  const prototype = Object.getPrototypeOf(product);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (!Object.hasOwn(product, 'id') || !Object.hasOwn(manifest.records, product.id)) return null;
  const binding = manifest.records[product.id];
  if (product.source === 'api') {
    if (!Object.hasOwn(product, 'databaseId') || product.databaseId !== binding.databaseId || !Object.hasOwn(product, 'sourceMediaPath')) return null;
  } else if (product.source !== 'official' || Object.hasOwn(product, 'databaseId')) return null;
  try {
    if (recordShapeDigest(transformerRecordShape(product)) !== binding.recordSha256 || photographVariantDigest(product) !== binding.variantSpecsSha256) return null;
  } catch { return null; }
  const photo = Object.hasOwn(manifest.photos, binding.photoId) ? manifest.photos[binding.photoId] : null;
  return photo ? { id: binding.photoId, ...photo } : null;
}
export const productPhotographyManifest = manifest;
