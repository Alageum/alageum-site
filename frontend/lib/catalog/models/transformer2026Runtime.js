import baseManifest from './transformer2026RuntimeManifest.json' with { type: 'json' };
import supplement from './transformer2026AssetCompletionManifest.json' with { type: 'json' };
import { transformerRecordShape, recordShapeDigest } from './transformer2026Shape.js';
const deepFreeze = value => {
 if(value && typeof value === 'object') { for(const child of Object.values(value))deepFreeze(child);Object.freeze(value); }
 return value;
};
// Generated supplements add exact records without changing historical clearance files.
const manifest=deepFreeze({...baseManifest,
 supplementaryReview:{reviewReport:supplement.reviewReport,reviewReportSha256:supplement.reviewReportSha256},
 geometry:{...baseManifest.geometry,...supplement.geometry},icons:{...baseManifest.icons,...supplement.icons}});
export const transformerRuntimeManifest=manifest;
const knownRecordIds = new Set(manifest.knownRecordIds);
export const isTransformer2026Record = product => product?.sourceId === manifest.sourceId || product?.sourceFileId === manifest.sourceFileId || knownRecordIds.has(product?.id);
export function getReviewedTransformerAsset(product, channel) {
 if(!product || !['geometry','icons'].includes(channel) || !Object.hasOwn(manifest[channel],product.id))return null;
 const approved=manifest[channel][product.id];
 return verifiedTransformerAsset(product, approved, manifest);
}
export function verifiedTransformerAsset(product, approved, manifest) {
 if(!product || typeof product !== 'object' || Array.isArray(product) || !approved) return null;
 const prototype=Object.getPrototypeOf(product);
 if(prototype!==Object.prototype && prototype!==null)return null;
 for(const key of ['id','source','sourceId','sourceFileId','sourceSha256'])if(!Object.hasOwn(product,key))return null;
 if(product.sourceId!==manifest.sourceId || product.sourceFileId!==manifest.sourceFileId || product.sourceSha256!==manifest.sourceSha256)return null;
 if(product.source==='api') {
  if(!Object.hasOwn(product,'databaseId') || product.databaseId!==approved.database_id || !Object.hasOwn(product,'sourceMediaPath'))return null;
 } else if(product.source!=='official' || Object.hasOwn(product,'databaseId')) return null;
 try { if(recordShapeDigest(transformerRecordShape(product))!==approved.record_shape_sha256)return null; }
 catch { return null; }
 return approved;
}
