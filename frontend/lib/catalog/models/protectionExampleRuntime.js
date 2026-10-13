import manifestData from './protectionExampleRuntimeManifest.json' with { type: 'json' };
import { transformerRecordShape, recordShapeDigest } from './transformer2026Shape.js';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const protectionExampleRuntimeManifest = freeze(manifestData);

// Copy only own data properties before any identity or shape lookup. An object
// supplied by the API cannot acquire authority through an inherited accessor.
function ownData(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean', 'undefined'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value)) throw new TypeError('Invalid source record');
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError('Invalid record prototype');
  if (array && Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('Sparse source array');
  const copy = array ? [] : Object.create(null);
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !property || !Object.hasOwn(property, 'value')) throw new TypeError('Invalid source property');
    if (array && key === 'length') continue;
    if (!property.enumerable || key === '__proto__' || key === 'toJSON') throw new TypeError('Invalid source property');
    Object.defineProperty(copy, key, { value: ownData(property.value, ancestors), enumerable: true });
  }
  ancestors.delete(value);
  return copy;
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function getProtectionExampleEvidence(product) {
  try {
    if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
    if (Object.hasOwn(Object.prototype, 'toJSON') || Object.hasOwn(Array.prototype, 'toJSON')) return null;
    const identity = Object.getOwnPropertyDescriptor(product, 'id');
    if (!identity || !Object.hasOwn(identity, 'value') || typeof identity.value !== 'string'
      || !Object.hasOwn(protectionExampleRuntimeManifest.records, identity.value)) return null;
    const record = ownData(product);
    if (!Object.hasOwn(protectionExampleRuntimeManifest.records, record.id)) return null;
    const entry = protectionExampleRuntimeManifest.records[record.id];
    for (const key of ['id', 'name', 'category', 'source', 'sourceKind', 'sourceUrl', 'recordKind', 'recordType']) if (!Object.hasOwn(record, key)) return null;
    if (record.source === 'api') {
      if (!Object.hasOwn(record, 'databaseId') || record.databaseId !== entry.databaseId || !Object.hasOwn(record, 'sourceMediaPath')) return null;
    } else if (record.source !== 'official' || Object.hasOwn(record, 'databaseId') || Object.hasOwn(record, 'sourceMediaPath')) return null;
    if ((record.source === 'api' ? record.sourceMediaPath : record.image) !== entry.rawSourceMedia) return null;
    if (recordShapeDigest(transformerRecordShape(record)) !== entry.recordShapeSha256) return null;
    const variantSpecs = record.source === 'api' ? record.sourceVariantSpecs : record.variantSpecs;
    if (recordShapeDigest(JSON.stringify(canonical(variantSpecs ?? null))) !== entry.variantSpecsSha256) return null;
    if (record.source === 'api' && (!Object.hasOwn(record, 'variantSpecs')
      || recordShapeDigest(JSON.stringify(canonical(record.variantSpecs))) !== entry.variantDisplaySha256)) return null;
    return entry;
  } catch { return null; }
}

export function getProtectionExampleAsset(product, channel) {
  if (!['geometry', 'icons'].includes(channel)) return null;
  const entry = getProtectionExampleEvidence(product);
  if (!entry || (channel === 'geometry' && !entry.geometryType)) return null;
  const common = { type: entry.type, sourceFamilyId: entry.sourceFamilyId, sourcePages: entry.sourcePages, reason: entry.reason };
  return channel === 'geometry'
    ? { ...common, confidence: 'source-matched', fallbackImage: entry.rawSourceMedia }
    : { ...common, confidence: 'source-based', sourceImage: entry.rawSourceMedia };
}

// These IDs are reserved for the exact reviewed records. A rejected amendment
// cannot fall through to their less strict historical construction bindings.
export function getRejectedProtectionExampleAsset(product, channel) {
  if (!product || !['object', 'function'].includes(typeof product) || !['geometry', 'icons'].includes(channel)) return null;
  const rejected = sourceFamilyId => {
    const common = { sourceFamilyId, sourcePages: [], reason: 'Данные записи изменены или источник не подтверждён. Иллюстрация конструкции требует повторной проверки.' };
    return channel === 'geometry' ? { ...common, type: null, confidence: 'source-only', fallbackImage: null }
      : { ...common, type: 'equipment', confidence: 'typical', sourceImage: null };
  };
  try {
    // Malformed identity must stop before the old resolver reads it. Never walk
    // an adversarial prototype chain or execute an accessor to discover its ID.
    const prototype = Object.getPrototypeOf(product);
    if (typeof product === 'function' || Array.isArray(product) || (prototype !== Object.prototype && prototype !== null)) return rejected(null);
    const descriptor = Object.getOwnPropertyDescriptor(product, 'id');
    if (descriptor && !Object.hasOwn(descriptor, 'value')) return rejected(null);
    if (!descriptor && Object.hasOwn(Object.prototype, 'id')) return rejected(null);
    if (descriptor && typeof descriptor.value !== 'string') return rejected(null);
    const id = descriptor?.value;
    if (!Object.hasOwn(protectionExampleRuntimeManifest.records, id) || getProtectionExampleEvidence(product)) return null;
    return rejected('cat-ptm-tded');
  } catch { return rejected(null); }
}
