import { transformerRecordShape, recordShapeDigest } from './models/transformer2026Shape.js';
import { sourcePageUrl } from './sources.js';

// Display-only review of the three unchanged PTMM records at 737651d.
// Page 68 labels the dimension rows PTM and TDE, without a separate PTMM row.
// These bindings confer no geometry, climate, product identity or ordering authority.
const reviewed = Object.freeze({
  'cat-ptm-tded-v002': Object.freeze({
    databaseId: 'ef3c1cf6-dda7-5b63-b6d3-edd7d93045c2',
    recordShapeSha256: 'd456fea4ab80463fc4ef57924e0fd895f3dacede23b2735050e25e9735fc5853',
    variantSha256: '4f4d5c44cb9d590e7fb5290d39a53276f95f9106b6c60f2146a82e8fc43a7eb1',
  }),
  'cat-ptm-tded-v005': Object.freeze({
    databaseId: '26450c85-a253-5e09-9025-21c94c6b1372',
    recordShapeSha256: '9f36dc92af1c546024051a25c23362b1fc76a6652727f3eab12dac6bd75d8c35',
    variantSha256: 'e1c8def46948cb0f1c4c2d972bdb0d1002d604d27fbd47359ef5f5e530331b56',
  }),
  'cat-ptm-tded-v008': Object.freeze({
    databaseId: 'b540e770-7cb9-50d5-a0b2-f22153d85395',
    recordShapeSha256: '19f35cccc12c9a99d2ff41e0748cc6a0566b5ffb3998468bb680b5438458fdf4',
    variantSha256: '2d093dba26e806c9a7805f3c174b1c18692daea5081380b1aa0b5f0ebc54efd1',
  }),
});
const sourceLabels = Object.freeze({
  'Габаритные размеры В×Ш×Г': 'ПТМ в таблице источника',
  'Габаритные размеры ТДЕ В×Ш×Г': 'ТДЕ в таблице источника',
});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const variantDigest = value => recordShapeDigest(JSON.stringify(canonical(value ?? null)));

// Use the same own-data-only copy rules as protectionExampleRuntime, without
// changing that separately reviewed asset guard or borrowing geometry authority.
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

/** Qualification applies to the supplied record only; never hydrate edited API data.
 * A comparison row is only a label/unit selector, so resolve it against this record.
 * Preserve the stored unit; the dimension rows themselves do not print a unit.
 */
export function getPtmmDimensionQualification(product, row) {
  try {
    if (!product || typeof product !== 'object' || Array.isArray(product)
      || Object.hasOwn(Object.prototype, 'toJSON') || Object.hasOwn(Array.prototype, 'toJSON')) return null;
    const identity = Object.getOwnPropertyDescriptor(product, 'id');
    if (!identity || !Object.hasOwn(identity, 'value') || typeof identity.value !== 'string' || !Object.hasOwn(reviewed, identity.value)) return null;
    const selectedRow = ownData(row);
    if (!selectedRow || !Object.hasOwn(sourceLabels, selectedRow.label) || selectedRow.unit !== 'мм') return null;
    const record = ownData(product), binding = reviewed[record.id];
    if (record.source === 'api') {
      if (record.databaseId !== binding.databaseId || !Object.hasOwn(record, 'sourceMediaPath')
        || !Object.hasOwn(record, 'sourceVariantSpecs') || variantDigest(record.sourceVariantSpecs) !== binding.variantSha256) return null;
    } else if (record.source !== 'official' || Object.hasOwn(record, 'databaseId') || Object.hasOwn(record, 'sourceMediaPath')) return null;
    if (recordShapeDigest(transformerRecordShape(record)) !== binding.recordShapeSha256
      || variantDigest(record.variantSpecs) !== binding.variantSha256) return null;
    const specs = record.technicalSpecs.filter(spec => spec.label === selectedRow.label && spec.unit === selectedRow.unit);
    if (specs.length !== 1 || specs[0].page !== 68) return null;
    const sourceHref = sourcePageUrl(record, 68);
    if (sourceHref !== '/catalog/source?page=68') return null;
    return Object.freeze({
      sourceLabel: sourceLabels[selectedRow.label], sourceHref,
      note: `Применимость этих размеров к ${record.name} не подтверждена. В исходной строке единица измерения не указана; обозначение „мм“ требует подтверждения.`,
    });
  } catch { return null; }
}

// Also used when deciding which comparison rows differ: a qualified source value
// must not be treated as an equal, confirmed dimension of another product.
export function catalogSpecValueText(product, row, value) {
  const qualification = getPtmmDimensionQualification(product, row);
  return qualification ? `${qualification.sourceLabel}: ${value}. ${qualification.note}` : value;
}
