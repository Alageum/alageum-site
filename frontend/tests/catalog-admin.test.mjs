import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { editorDraft, editorPayload, catalogPrice } from '../lib/catalog/admin.js';
import { normalizeApiProduct, normalizeApiSelection, isApiCatalog, safeSourceUrl } from '../lib/catalog/apiData.js';
import { baselineOfficialProducts as officialProducts, importedProducts } from '../lib/catalog/data.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { selectionCsv } from '../lib/catalog/query.js';
const product = { id:'uuid',public_key:'product-a',slug:'product-a',category_id:'cat',category_public_key:'transformers',sku:'A',version:7,price:'1250.10',currency:'USD',price_mode:'fixed',status:'published',translations:{ru:{name:'Current',description:'Current description'},en:{name:'English'}},specs:{power:630,technicalSpecs:[{label:'Power',value:'630',unit:'kVA'}]},provenance:{sourceKind:'supplied-pdf',sourcePages:[6],sourceUrl:'https://example.com/source'},media:[],source_data:{name:'OLD',image:'/brand/old.png',power:100}};
test('draft preserves exact decimal price and explicit currency, with no invented default',()=>{
 assert.equal(editorDraft(product).price,'1250.10');
 assert.equal(editorDraft(null).price_mode,'on_request');
 assert.equal(editorDraft(null).currency,'');
 const payload=editorPayload(editorDraft(product),product);
 assert.equal(payload.price,'1250.10');assert.equal(payload.version,7);assert.equal(payload.public_key,undefined);assert.equal(payload.translations.en.name,'English');
});
test('editor rejects invalid money, malformed keys and malformed JSON',()=>{
 for(const price of ['1e3','-1','1.001','NaN','Infinity','1,00'])assert.throws(()=>editorPayload({...editorDraft(product),price},product));
 assert.throws(()=>editorPayload({...editorDraft(product),currency:''},product));
 assert.throws(()=>editorPayload({...editorDraft(product),specs:'[]'},product));
 assert.throws(()=>editorPayload({...editorDraft(product),public_key:'../bad'},product));
});
test('on-request clears price without silently setting currency',()=>{
 const draft={...editorDraft(product),price_mode:'on_request',currency:''};
 const payload=editorPayload(draft,product);assert.equal(payload.price,null);assert.equal(payload.currency,null);assert.equal(catalogPrice(payload),'По запросу');
});
test('live adapter preserves public identity and authoritative edits, never stale imported values',()=>{
 const live=normalizeApiProduct(product);assert.equal(live.id,'product-a');assert.equal(live.databaseId,'uuid');assert.equal(live.name,'Current');assert.equal(live.power,630);assert.equal(live.image,null);assert.equal(live.category,'transformers');assert.equal(live.price,'1250.10');
 const cleared=normalizeApiProduct({...product,specs:{},translations:{ru:{name:'New'}},media:[]});assert.equal(cleared.power,null);assert.deepEqual(cleared.technicalSpecs,[]);assert.equal(cleared.description,'');
});
test('API source is explicit and safe provenance rejects active URLs',()=>{
 assert.equal(isApiCatalog(new URLSearchParams('source=api')),true);assert.equal(isApiCatalog({source:'demo'}),false);assert.equal(safeSourceUrl('javascript:alert(1)'),null);
});
test('API selection stores only bounded identities and quantities, not stale product snapshots',()=>{
 assert.deepEqual(normalizeApiSelection([null,{id:'cat-a',quantity:10000,name:'stale'},{id:'cat-a',quantity:2},{id:'../bad',quantity:1}]),[{id:'cat-a',quantity:999}]);
 assert.match(selectionCsv([{id:'product-a',quantity:1}],[normalizeApiProduct(product)]),/Актуальный каталог API/);
});
test('database overlay reassembles all238 canonical records exactly',()=>{
 const overlay=JSON.parse(fs.readFileSync(new URL('../../docs/catalog-import/database-overlay.json',import.meta.url)));
 const records=new Map(importedProducts.map(product=>[product.id,product]));overlay.records.forEach(product=>records.set(product.id,product));
 assert.equal(overlay.recordCount,238);assert.deepEqual(overlay.order.map(id=>records.get(id)),officialProducts);
});
test('live imported identity preserves reviewed icon mapping',()=>{
 const protectedIds={
  'cat-ptm-tded':'878abd26-7425-5419-a7d4-a689acdff2ab',
  'cat-ptm-tded-v012':'d96ccf51-505d-5061-83de-7611dd1aef7a',
  'cat-ptm-tded-v013':'9af03c31-ebcc-5d9f-be2e-0a101abd7abc',
 };
 for(const source of officialProducts){
  const raw={...product,public_key:source.id,category_public_key:source.category,specs:source,provenance:source};
  if(Object.hasOwn(protectedIds,source.id)){
   // A borrowed public key with edited content has no successor icon authority.
   assert.equal(getEquipmentIcon(normalizeApiProduct(raw)).type,'equipment',source.id);
   Object.assign(raw,{id:protectedIds[source.id],sku:source.sku,translations:{ru:{name:source.name,description:source.description}},media:[{path:source.image,kind:'image',alt:source.imageCaption}]});
  }
  assert.equal(getEquipmentIcon(normalizeApiProduct(raw)).type,getEquipmentIcon(source).type,source.id);
 }
});
test('CSV treats formula-looking administrator strings as text',()=>{
 const csv=selectionCsv([{id:'a',quantity:1}],[{id:'a',source:'api',sku:'=1+1',name:'@SUM(1)'}]);
 assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"\'@SUM(1)"'));
});
test('live deployment cannot reveal hidden bundled records through a source override',()=>{
 const before=process.env.NEXT_PUBLIC_CATALOG_SOURCE;
 try {process.env.NEXT_PUBLIC_CATALOG_SOURCE='api';assert.equal(isApiCatalog({source:'static'}),true);assert.equal(isApiCatalog({source:'demo'}),true);} finally {if(before===undefined)delete process.env.NEXT_PUBLIC_CATALOG_SOURCE;else process.env.NEXT_PUBLIC_CATALOG_SOURCE=before;}
});
