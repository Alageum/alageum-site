// Separate from data approval. Only exact independently cleared channel bindings activate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {transformerProducts,transformerImport} from '../frontend/lib/catalog/transformers2026.js';
import {identityCompletionProducts} from '../frontend/lib/catalog/identityCompletionData.js';
import {getTransformer2026ReviewAsset} from '../frontend/lib/catalog/models/transformer2026Bindings.js';
import {transformerRecordShape,recordShapeDigest} from '../frontend/lib/catalog/models/transformer2026Shape.js';
import {assertReviewedTransformerDependency} from './catalog/transformer-reviewed-dependencies.mjs';
const require=createRequire(import.meta.url),{importedProductId}=require('../backend-node/src/domain/catalog-identity.js');
const file=process.argv[2];assert.ok(file,'Supply explicit independent asset clearance JSON');
const approval=JSON.parse(fs.readFileSync(file));assert.equal(approval.format,'alageum-transformer-assets-clearance-v1');assert.equal(approval.status,'approved');
for(const field of ['sourceFileId','sourceSha256','inventorySha256'])assert.equal(approval[field],transformerImport[field],`Wrong asset approval ${field}`);
assert.ok(approval.reviewReport&&approval.reviewedAt);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hashFile=relative=>{assert.ok(!path.isAbsolute(relative)&&!relative.split('/').includes('..'));return createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex');};
assert.equal(approval.evidenceRegistrySha256,hashFile('frontend/lib/catalog/models/transformer2026AssetEvidence.json'));
assert.equal(approval.sourceRegistrySha256,hashFile('backend-node/data/catalog-sources.json'));
for(const name of ['AssetEvidence.json','Bindings.js','Geometry.js','GroupMap.js','Icons.js','PowerLayouts.js','Types.js']) assert.ok(approval.reviewedLibraryHashes?.[`frontend/lib/catalog/models/transformer2026${name}`], `Missing reviewed library hash ${name}`);
for(const [file,hash]of Object.entries(approval.reviewedLibraryHashes))assertReviewedTransformerDependency(file,hash,approval);
assert.ok(Object.keys(approval.reviewedSourceImageHashes || {}).length);
for(const [file,hash]of Object.entries(approval.reviewedSourceImageHashes)){assert.match(file,/^\/catalog-source\/transformers-2026\/page-\d{3}\.webp$/);assert.equal(hashFile(`frontend/public${file}`),hash,`Changed reviewed source scan ${file}`);}

const result={format:'alageum-transformer-runtime-assets-v1',sourceId:'transformers-2026',sourceFileId:approval.sourceFileId,sourceSha256:approval.sourceSha256,inventorySha256:approval.inventorySha256,reviewReport:approval.reviewReport,reviewedAt:approval.reviewedAt,knownRecordIds:[...transformerProducts,...identityCompletionProducts].map(r=>r.id),reviewedLibraryHashes:approval.reviewedLibraryHashes,evidenceRegistrySha256:approval.evidenceRegistrySha256,sourceRegistrySha256:approval.sourceRegistrySha256,geometry:{},icons:{}};
for(const channel of ['geometry','icons'])for(const entry of approval[channel]){
 const record=transformerProducts.find(row=>row.id===entry.sourceRecordId);assert.ok(record,`Unadmitted source ID ${entry.sourceRecordId}`);
 assert.ok(!result[channel][record.id],`Duplicate approval ${record.id}`);
 assert.equal(entry.record_shape_sha256,recordShapeDigest(transformerRecordShape(record)),`Source record changed since asset review ${record.id}`);
 const proposed=getTransformer2026ReviewAsset(record.id);assert.ok(['topology-proposal','icon-only-proposal'].includes(proposed.status),`Held/ambiguous asset ${record.id}`);
 assert.equal(proposed.groupId,entry.groupId);assert.deepEqual(proposed.sourcePages,entry.sourcePages);
 assert.equal(channel==='geometry'?proposed.type:proposed.iconType,entry.type);assert.ok(entry.type);
 assert.ok(Object.hasOwn(approval.reviewedSourceImageHashes, proposed.sourceImage), `Missing reviewed source scan hash ${record.id}`);
 assert.ok(entry.sourcePages.every(page=>record.sourcePages.includes(page)),`Asset evidence outside admitted source ${record.id}`);
 result[channel][record.id]={type:entry.type,groupId:entry.groupId,sourcePages:entry.sourcePages,sourceImage:proposed.sourceImage,record_shape_sha256:recordShapeDigest(transformerRecordShape(record)),database_id:importedProductId(record.id)};
}
const target=new URL('../frontend/lib/catalog/models/transformer2026RuntimeManifest.json',import.meta.url),bytes=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),bytes);else fs.writeFileSync(target,bytes);
console.log(JSON.stringify({geometry:Object.keys(result.geometry).length,icons:Object.keys(result.icons).length,inventorySha256:result.inventorySha256}));
