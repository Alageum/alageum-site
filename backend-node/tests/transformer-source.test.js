'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {sourceDigest}=require('../src/domain/catalog-media-evidence');
const {readAdditionalCatalog}=require('../src/domain/catalog-source');
const v=require('../src/domain/catalog-validation');
const root=path.resolve(__dirname,'../../docs/catalog-transformers-2026/staging');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const rows=read('products.json').chunks.flatMap(c=>read(c.path));
const fields=['technicalSpecs','configurations','power','voltage','voltageUnit','cooling','installation','subtype','manufacturer','manufacturers','recordKind','recordType','isOrderableSku','series','familyId','familyName','variantIds','variantSpecs','notes','designation','execution','productKind','sourceRecordType'];
test('all staged records fit backend import validation without manufactured SKUs or prices',()=>{
 for(const row of rows){const parsed=v.parse(v.create,{public_key:row.id,slug:row.id,category_id:'46f6a551-7db5-4cff-8bbf-608b11330135',sku:row.sku,translations:{ru:{name:row.name,description:row.description}},specs:Object.fromEntries(fields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])),provenance:{sourceId:row.sourceId,sourceFileId:row.sourceFileId,sourceSha256:row.sourceSha256,sourcePages:row.sourcePages},media:[{path:row.image,kind:'image'}]});assert.equal(parsed.sku,null);assert.equal(parsed.price,null);assert.equal(parsed.price_mode,'on_request');}
});
test('runtime source loader rejects unreviewed, changed, duplicate or corrupt additional data',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'transformer-source-test-'));
 try{
  const catalog=path.join(temp,'catalog-import'),extra=path.join(temp,'catalog-transformers-2026');fs.mkdirSync(catalog);fs.mkdirSync(extra);fs.mkdirSync(path.join(extra,'products'));
  const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
  const row={id:'new-source-row',sourceId:'transformers-2026',sourceSha256:'pdf-hash'};
  const chunk=Buffer.from(JSON.stringify([row]));fs.writeFileSync(path.join(extra,'products/part-001.json'),chunk);
  const recordsSha256=sourceDigest([row]);
  const entry={recordsSha256,path:'../catalog-transformers-2026',sourceId:'transformers-2026',recordCount:1,inventorySha256:'reviewed-input'};write(path.join(catalog,'additional-sources.json'),[entry]);
  write(path.join(extra,'products.json'),{format:'alageum-catalog-chunks-v1',recordCount:1,chunks:[{path:'products/part-001.json',recordCount:1,bytes:chunk.length,sha256:createHash('sha256').update(chunk).digest('hex')}]});
  write(path.join(extra,'manifest.json'),{recordsSha256,active:true,recordCount:1,sourceSha256:'pdf-hash'});
  const binding={recordsSha256,activationAllowed:true,inventorySha256:'reviewed-input',clearance:{status:'approved',inventorySha256:'reviewed-input',sourceSha256:'pdf-hash'}};
  write(path.join(extra,'review-binding.json'),{...binding,activationAllowed:false});assert.throws(()=>readAdditionalCatalog(catalog,[]),/Unreviewed/);
  write(path.join(extra,'review-binding.json'),binding);assert.deepEqual(readAdditionalCatalog(catalog,[{id:'old'}]),[{id:'old'},row]);
  assert.throws(()=>readAdditionalCatalog(catalog,[{id:row.id}]),/identity conflict/);
  write(path.join(extra,'review-binding.json'),{...binding,inventorySha256:'changed'});assert.throws(()=>readAdditionalCatalog(catalog,[]),/Unreviewed/);
  write(path.join(extra,'review-binding.json'),binding);fs.appendFileSync(path.join(extra,'products/part-001.json'),' ');assert.throws(()=>readAdditionalCatalog(catalog,[]),/checksum mismatch/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
