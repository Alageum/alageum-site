import metadata from './sourceContextManifest.json' with { type: 'json' };
import registry from '../sources-manifest.json' with { type: 'json' };
import { getCatalogSource, sourcePageUrl } from '../sources.js';
import { recordShapeDigest, transformerRecordShape } from '../models/transformer2026Shape.js';

// Candidate content pin; publication still requires independent dependency approval.
const reviewedManifestSha256 = 'ab9829f623d6d2af5f086a2f9a7b87466244dcce27602789008b74410d063527';
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const sourceContextManifest = freeze(metadata);
const assetDescriptors = () => {
  const assets = new Map();
  for (const asset of [
    ...Object.entries(metadata.assets).map(([path, asset]) => ({ path, sha256: asset.sha256, bytes: asset.bytes })),
    ...Object.values(metadata.figures).map(figure => ({ path: figure.cropPath, sha256: figure.cropSha256, bytes: figure.cropBytes })),
  ]) {
    // A full-page figure reuses its registered source bytes without a new crop.
    if (assets.has(asset.path) && JSON.stringify(assets.get(asset.path)) !== JSON.stringify(asset)) throw new Error('Conflicting source asset');
    assets.set(asset.path, asset);
  }
  return [...assets.values()];
};
const expectedBuildProof = () => ({ format: 'catalog-source-context-build-proof-v1', manifestSha256: reviewedManifestSha256, assets: assetDescriptors() });

// Reject prototype inheritance, accessors, sparse arrays and cycles before reading
// authority. No getters from a malformed product are evaluated by the resolver.
function dataTree(value, ancestors = new Set()) {
  if (value === null || value === undefined || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string')) return false;
  if (Array.isArray(value) && keys.length !== value.length + 1) return false;
  ancestors.add(value);
  const valid = keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Object.hasOwn(descriptor, 'value') && dataTree(descriptor.value, ancestors);
  });
  ancestors.delete(value);
  return valid;
}
// Shape/source helpers read optional properties. Copy only validated own data to
// null-prototype objects so a missing field cannot evaluate a prototype getter.
function ownDataSnapshot(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const copy = [];
    for (let index = 0; index < value.length; index += 1) copy.push(ownDataSnapshot(Object.getOwnPropertyDescriptor(value, String(index)).value));
    return copy;
  }
  const copy = Object.create(null);
  for (const key of Object.getOwnPropertyNames(value)) copy[key] = ownDataSnapshot(Object.getOwnPropertyDescriptor(value, key).value);
  return copy;
}
function safeSerializationPrototypes() {
  // JSON.stringify consults inherited toJSON even when it is an accessor. A
  // polluted serializer must fail closed before that property can be evaluated.
  return !Object.hasOwn(Object.prototype, 'toJSON') && !Object.hasOwn(Array.prototype, 'toJSON');
}
export function verifySourceContextManifest(candidate = metadata) {
  try { return safeSerializationPrototypes() && dataTree(candidate) && recordShapeDigest(JSON.stringify(candidate)) === reviewedManifestSha256; }
  catch { return false; }
}
function sourceRegistryMatches(product) {
  const source = getCatalogSource(product);
  if (!source || Object.entries(metadata.source).some(([key, value]) => source[key] !== value)) return false;
  return Object.entries(metadata.assets).every(([path, expected]) => {
    const actual = Object.hasOwn(registry.assets, path) ? registry.assets[path] : null;
    return actual && JSON.stringify(actual) === JSON.stringify(expected);
  });
}
function entryFor(product) {
  try {
    if (!verifySourceContextManifest() || !dataTree(product) || !product || Array.isArray(product)) return null;
    product = ownDataSnapshot(product);
    for (const key of ['id', 'source', 'name', 'sku', 'category', 'recordKind', 'recordType', 'sourceUrl', 'sourceTitle', 'sourceKind', 'sourcePages', 'technicalSpecs', 'notes']) {
      if (!Object.hasOwn(product, key)) return null;
    }
    // This exact raw family has no parent; ID and canonical shape still bind it.
    if (!Object.hasOwn(product, 'familyId') && product.id !== 'cat-ktpb-k') return null;
    if (!Object.hasOwn(metadata.records, product.id) || !['official', 'api'].includes(product.source)) return null;
    const entry = metadata.records[product.id];
    if (product.source === 'official') {
      if (Object.hasOwn(product, 'databaseId') || Object.hasOwn(product, 'sourceMediaPath')) return null;
      if (!Object.hasOwn(product, 'image') || product.image !== entry.rawSourceMedia) return null;
    } else {
      if (!Object.hasOwn(product, 'databaseId') || product.databaseId !== entry.databaseId) return null;
      if (!Object.hasOwn(product, 'sourceMediaPath') || product.sourceMediaPath !== entry.rawSourceMedia) return null;
    }
    if (!sourceRegistryMatches(product)) return null;
    if (recordShapeDigest(transformerRecordShape(product)) !== entry.recordShapeSha256) return null;
    return { entry, product };
  } catch { return null; }
}

/** Serializable build result, not a user credential or a runtime byte check.
 * The build must independently verify current files before emitting this object.
 * Its exact shape survives Next's server/client boundary without a WeakSet brand.
 */
export function isSourceContextAssetProof(candidate) {
  try {
    return verifySourceContextManifest() && dataTree(candidate)
      && JSON.stringify(candidate) === JSON.stringify(expectedBuildProof());
  } catch { return false; }
}

/** Local build/review reader only: no runtime networking or original PDF fetch.
 * Reuse per immutable deployment snapshot; invalidate() clears the local cache.
 * A serialized proof remains a statement about its original build, so publishing
 * must deploy it atomically with the exact assets and run this gate on every build.
 */
export function createSourceContextAssetVerifier(readAssetBytes) {
  let pending = null, generation = 0;
  async function verify() {
    if (pending) return pending;
    const currentGeneration = generation;
    pending = (async () => {
      try {
        if (typeof readAssetBytes !== 'function' || !verifySourceContextManifest() || !sourceRegistryMatches(Object.assign(Object.create(null), { sourceUrl: metadata.source.source_url }))) return null;
        const checks = await Promise.all(assetDescriptors().map(async asset => {
          const raw = await readAssetBytes(asset.path);
          if (!ArrayBuffer.isView(raw) && !(raw instanceof ArrayBuffer)) return false;
          const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw.slice(0)) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).slice();
          if (bytes.byteLength !== asset.bytes) return false;
          const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
          return digest === asset.sha256;
        }));
        if (!checks.every(Boolean) || generation !== currentGeneration) return null;
        return freeze(expectedBuildProof());
      } catch { return null; }
    })();
    return pending;
  }
  function invalidate() { generation += 1; pending = null; }
  return Object.freeze({ verify, invalidate });
}

/** Display-only source context for exact records and an explicitly bound family overview. It does not return a product,
 * a construction choice, geometry/icon type, row climate, or confidence upgrade.
 * Pass the proof emitted by the current deployment's mandatory build gate.
 */
export function getCatalogSourceContext(product, assetEvidence) {
  try {
    if (!isSourceContextAssetProof(assetEvidence)) return null;
    const admitted = entryFor(product);
    if (!admitted) return null;
    const { entry, product: record } = admitted;
    const context = metadata.contexts[entry.contextKey];
    const figures = context.figureKeys.map(key => {
      const figure = metadata.figures[key];
      if (!figure || sourcePageUrl(record, figure.sourcePage) !== figure.sourceHref) throw new Error('Unknown source figure');
      return {
        ...figure,
        // This is a link to an existing separate example, never a row replacement.
        exemplarHref: figure.exemplarId ? `/catalog/${figure.exemplarId}${record.source === 'api' ? '?source=api' : ''}` : null,
      };
    });
    return freeze({
      canonicalId: record.id,
      heading: context.heading, intro: context.intro, status: context.status,
      sourceHref: context.sourceHref, sourceLinkLabel: context.sourceLinkLabel,
      sourceTitle: metadata.source.title, figures,
    });
  } catch { return null; }
}
