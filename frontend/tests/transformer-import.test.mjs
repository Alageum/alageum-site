import { measurementColumn2026CompletionManifest } from '../lib/catalog/models/measurementColumn2026Completion.js';
import { sourceAssetCompletionManifest } from '../lib/catalog/models/sourceAssetCompletion.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeSpec, digest, familyKey } from '../../scripts/catalog/transformer-adapter.mjs';
import { officialProducts, baselineOfficialProducts, transformerProducts, identityCompletionProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { groupProducts, equipmentTypeFor, facetValues } from '../lib/catalog/grouping.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { sourcePageUrl, isSourcePage } from '../lib/catalog/sources.js';
const require=createRequire(import.meta.url);
const {readCatalog}=require('../../backend-node/src/domain/catalog-source.js');
// Independent UUIDv5 computation keeps frontend-only CI free of backend npm dependencies.
const importedProductId=key=>{const bytes=createHash('sha1').update(Buffer.from('541788eefbf04d859d33e593b82f303c','hex')).update(`product:${key}`).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../docs/catalog-transformers-2026/staging');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const manifest=read('manifest.json');const identity=read('identity-manifest.json');
const rows=read('products.json').chunks.flatMap(chunk=>{const bytes=fs.readFileSync(path.join(root,chunk.path));assert.equal(digest(bytes),chunk.sha256);assert.equal(bytes.length,chunk.bytes);return JSON.parse(bytes);});
const allConfigs=read('configurations.json').chunks.flatMap(chunk=>JSON.parse(fs.readFileSync(path.join(root,chunk.path))));
test('review-only staging accounts for exact identities without importing unreviewed rows',()=>{
 assert.equal(manifest.sourceModelVariationCount,540);assert.equal(manifest.sourceConfigurationCount,407);assert.equal(manifest.admittedModelCount,508);assert.equal(manifest.heldModelCount,32);assert.equal(manifest.familyCount,77);assert.equal(manifest.recordCount,585);
 assert.equal(rows.length,manifest.recordCount);assert.equal(allConfigs.length,407);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 assert.deepEqual(readCatalog(),officialProducts);assert.equal(baselineOfficialProducts.length,238);
 assert.equal(officialProducts.length,238+transformerProducts.length+identityCompletionProducts.length);
 if(!manifest.active) assert.equal(transformerProducts.length,0);
});
test('candidate old identities never become duplicate cards, merges, or an all-held family',()=>{
 assert.equal(identity.held.length,32);assert.deepEqual(identity.automaticMerges,[]);assert.deepEqual(identity.skippedFamilyIds,['ntmi']);
 assert.equal(new Set(identity.oldIds).size,238);
 for(const entry of identity.held) {assert.ok(!rows.some(r=>r.id===entry.id));for(const id of entry.candidateOldIds)assert.ok(identity.oldIds.includes(id));}
 assert.ok(!rows.some(r=>r.id===familyKey('ntmi')));
 assert.equal(identity.admittedModelIds.length,508);
});
test('every admitted variation has exactly one explicit parent; standalone reactor configurations stay a family',()=>{
 const families=rows.filter(r=>r.recordKind==='family');const models=rows.filter(r=>r.recordKind==='variant');
 assert.equal(families.length,77);assert.equal(models.length,508);
 for(const model of models){const family=families.find(r=>r.id===model.familyId);assert.ok(family);assert.ok(family.variantIds.includes(model.id));}
 const groups=groupProducts(rows);assert.equal(groups.length,77);assert.equal(groups.flatMap(g=>g.memberIds).length,585);
 const reactor=rows.find(r=>r.sourceFamilyId==='asia-shunt-reactor-configurations');assert.equal(reactor.sourceRecordType,'configuration-family');assert.equal(reactor.configurations.length,15);assert.equal(reactor.variantIds.length,0);
});
test('short designations and repeated source labels never become fabricated SKUs',()=>{
 for(const row of rows){assert.equal(row.sku,null);assert.equal(row.isOrderableSku,false);assert.ok(row.designation);assert.ok(!Object.hasOwn(row,'price'));assert.ok(!Object.hasOwn(row,'stock'));assert.match(row.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);}
 const p175=rows.filter(r=>r.recordKind==='variant'&&r.sourceRow?.pdfPage===175);assert.equal(p175.length,22);assert.equal(new Set(p175.map(r=>r.designation)).size,12);
});
test('units and physical page provenance survive adapters and API transport',()=>{
 assert.deepEqual(normalizeSpec({label:'L',value:'767',unit:null,page:6}),{label:'L',value:'767',unit:'',page:6,sourceUnit:null,unitStatus:'not-stated'});
 for(const row of rows)for(const spec of row.technicalSpecs){assert.equal(typeof spec.unit,'string');assert.ok(row.sourcePages.includes(spec.page));assert.ok(isSourcePage(row,spec.page));}
 const record=rows.find(r=>r.sourcePages.includes(177));const api=normalizeApiProduct({public_key:record.id,translations:{ru:{name:record.name}},specs:record,provenance:record});
 assert.ok(api.sourcePages.includes(177));assert.equal(api.sourceId,'transformers-2026');assert.equal(sourcePageUrl(api,187),'/catalog/source?source=transformers-2026&page=187');
 assert.deepEqual(normalizeApiProduct({provenance:{sourceId:'substations',sourcePages:[104,105,187]}}).sourcePages,[104]);
});
test('reactive power is distinct from transformer kVA and missing manufacturer stays unknown',()=>{
 const reactors=rows.filter(r=>r.productKind==='reactor');assert.ok(reactors.length);
 for(const reactor of reactors){assert.equal(reactor.category,'reactors');assert.equal(equipmentTypeFor(reactor),'reactor');assert.equal(reactor.power,null);assert.deepEqual(facetValues(reactor,'power'),[]);}
 assert.ok(reactors.some(r=>r.technicalSpecs.some(s=>s.unit==='кВАр')));
 for(const row of rows)if(row.manufacturer===null)assert.deepEqual(row.manufacturers,[]);
});
test('source warnings and held configuration evidence are preserved',()=>{
 assert.equal(manifest.admittedConfigurationCount,349);assert.equal(manifest.heldConfigurationCount,58);
 assert.ok(rows.some(r=>r.notes.length));assert.ok(allConfigs.some(c=>identity.held.some(h=>h.id===c.modelId)));
 const flat=rows.filter(r=>r.recordKind==='family').flatMap(r=>r.configurations);assert.equal(flat.length,349);
 assert.ok(flat.every(c=>!identity.held.some(h=>h.id===c.modelId)));
});

test('runtime geometry and icons are limited to their independent exact allowlists',async()=>{ const {transformerRuntimeManifest}=await import('../lib/catalog/models/transformer2026Runtime.js'); for(const row of rows){ assert.equal(getEquipmentVisual(row).type,measurementColumn2026CompletionManifest.records[row.id]?.type || sourceAssetCompletionManifest.records[row.id]?.type || transformerRuntimeManifest.geometry[row.id]?.type || null); assert.equal(getEquipmentIcon(row).type,measurementColumn2026CompletionManifest.records[row.id]?.type || sourceAssetCompletionManifest.records[row.id]?.type || transformerRuntimeManifest.icons[row.id]?.type || null); } });

test('reviewed asset shape matches static/API wire records and rejects every identity/spec mutation',async()=>{
 const {createHash}=await import('node:crypto');
 const {transformerRecordShape,recordShapeDigest}=await import('../lib/catalog/models/transformer2026Shape.js');
 const {verifiedTransformerAsset,transformerRuntimeManifest}=await import('../lib/catalog/models/transformer2026Runtime.js');
 for(const text of ['', 'abc', 'Трансформатор / реактор', 'a'.repeat(10000)])assert.equal(recordShapeDigest(text),createHash('sha256').update(text).digest('hex'));
 for(const row of rows){
  const hash=recordShapeDigest(transformerRecordShape(row));assert.equal(hash,createHash('sha256').update(transformerRecordShape(row)).digest('hex'));
  const approved={record_shape_sha256:hash,database_id:importedProductId(row.id),type:'fixture'};
  const live=normalizeApiProduct({id:approved.database_id,public_key:row.id,sku:null,category_public_key:row.category,translations:{ru:{name:row.name}},specs:row,provenance:row,media:[{path:row.image,kind:'image',alt:row.imageCaption}]});
  assert.equal(verifiedTransformerAsset(row,approved,transformerRuntimeManifest),approved);
  assert.equal(verifiedTransformerAsset(live,approved,transformerRuntimeManifest),approved,row.id);
  assert.equal(verifiedTransformerAsset({...live,image:'/catalog-source/transformers-2026/page-012.webp'},approved,transformerRuntimeManifest),approved,'A trusted display-only override leaves original saved media bound');
  for(const patch of [{sourceFileId:'other'},{sourceSha256:'other'},{sourceId:'substations'},{designation:'edited'},{execution:'other'},{sourceFamilyId:'other'},{sourceRow:{page:1}},{technicalSpecs:[{label:'changed',value:'1',unit:'',page:1}]},{sourceMediaPath:null}])assert.equal(verifiedTransformerAsset({...live,...patch},approved,transformerRuntimeManifest),null,row.id);
  assert.equal(verifiedTransformerAsset({...live,databaseId:'other'},approved,transformerRuntimeManifest),null);
  assert.equal(getEquipmentVisual({...live,sourceId:null,sourceFileId:null}).type,null);
 }
});


test('raw API media cannot be bypassed with fake sourceMediaPath/type or an approved-looking display image',async()=>{
 const {verifiedTransformerAsset,transformerRuntimeManifest}=await import('../lib/catalog/models/transformer2026Runtime.js');
 const {recordShapeDigest,transformerRecordShape}=await import('../lib/catalog/models/transformer2026Shape.js');
 const {getProductMedia}=await import('../lib/catalog/media.js');
 const row=rows.find(r=>r.id==='alageum-tmg-standard-16');
 const approved={record_shape_sha256:recordShapeDigest(transformerRecordShape(row)),database_id:importedProductId(row.id),type:'fixture'};
 const base={id:approved.database_id,public_key:row.id,sku:null,category_public_key:row.category,translations:{ru:{name:row.name}},specs:row,provenance:row};
 for(const media of [[],[{kind:'image',path:'/catalog-source/transformers-2026/page-013.webp'}]]){
  const value=normalizeApiProduct({...base,sourceMediaPath:row.image,image:row.image,type:'tr26-corrugated-small',media});
  assert.equal(verifiedTransformerAsset(value,approved,transformerRuntimeManifest),null);
  assert.equal(value.sourceMediaPath,media[0]?.path || null);
  const shown=getProductMedia(value,{type:null,fallbackImage:'/catalog-source/transformers-2026/page-012.webp'});
  assert.equal(shown.image,media[0]?.path || null);
 }
});
