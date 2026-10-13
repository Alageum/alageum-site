// Default is a review-only staging build. Activation requires explicit hash-bound clearance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readInventories, adaptInventories, digest, objectDigest } from './catalog/transformer-adapter.mjs';
const require=createRequire(import.meta.url);
const {readCatalog}=require('../backend-node/src/domain/catalog-source.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2); const option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const input=path.resolve(option('--input',path.join(root,'docs/catalog-transformers-2026/review')));
const output=path.resolve(option('--output',path.join(root,'docs/catalog-transformers-2026/staging')));
const activate=args.includes('--activate'); const check=args.includes('--check');
const source=JSON.parse(fs.readFileSync(path.join(root,'docs/catalog-transformers-2026/review/source-manifest.json')));
const sections=readInventories(input);
// Strip only machine-local PDF paths from the review binding; all source values remain bound.
const reviewed=structuredClone(sections); for(const section of reviewed) if(section.inventory.source?.filePath) delete section.inventory.source.filePath;
const inventorySha256=objectDigest(reviewed);
const oldRecords=readCatalog().filter(r=>r.sourceId!=='transformers-2026');
assert.equal(oldRecords.length,238,'Legacy baseline must be preserved');
const result=adaptInventories(sections,source,oldRecords);
const {records,identity,metadata}=result;
metadata.inventorySha256=inventorySha256;
metadata.recordsSha256=objectDigest(records);
let clearance=null;
if(activate) {
  assert.ok(option('--clearance'), '--activate requires --clearance; source review is not implicit');
  clearance=JSON.parse(fs.readFileSync(path.resolve(option('--clearance'))));
  assert.equal(clearance.format,'alageum-transformer-review-clearance-v1');
  assert.equal(clearance.status,'approved'); assert.equal(clearance.sourceSha256,source.sha256);
  assert.equal(clearance.inventorySha256,inventorySha256,'Inventory changed since independent review');
  assert.ok(clearance.approvedBy && clearance.approvedAt && clearance.reviewReports?.length,'Missing review provenance');
  metadata.active=true;
}
const bytes=value=>Buffer.from(`${JSON.stringify(value,null,2)}\n`);
const outputs=new Map();
function put(relative,value){outputs.set(path.join(output,relative),bytes(value));}
function chunks(name,rows){
  const parts=[];let pending=[];
  const flush=()=>{if(!pending.length)return;const file=`${name}/part-${String(parts.length+1).padStart(3,'0')}.json`;const content=bytes(pending);assert.ok(content.length<=74000,`Oversized record in ${name}`);outputs.set(path.join(output,file),content);parts.push({path:file,recordCount:pending.length,bytes:content.length,sha256:digest(content)});pending=[];};
  for(const row of rows){if(pending.length&&bytes([...pending,row]).length>74000)flush();pending.push(row);}flush();
  const index={format:'alageum-catalog-chunks-v1',recordCount:rows.length,maxChunkBytes:74000,chunks:parts};put(`${name}.json`,index);return index;
}
const index=chunks('products',records);
chunks('configurations',result.configurations);
put('identity-manifest.json',identity);put('manifest.json',metadata);
put('review-binding.json',{format:'alageum-transformer-review-binding-v1',sourceSha256:source.sha256,inventorySha256,recordsSha256:metadata.recordsSha256,activationAllowed:activate,clearance});
if(activate){
  // The separately reviewed append-only batch does not alter these original source shards.
  const identityCompletion=JSON.parse(fs.readFileSync(path.join(root,'backend-node/data/catalog-release.json'))).sources?.identityCompletion;
  outputs.set(path.join(root,'backend-node/data/catalog-release.json'),bytes({format:'alageum-catalog-release-v1',recordCount:oldRecords.length+records.length+(identityCompletion?.recordCount || 0),categoryCount:new Set([...oldRecords,...records].map(r=>r.category)).size,sources:{legacy:{recordCount:oldRecords.length},'transformers-2026':{recordCount:records.length,active:true,inventorySha256,recordsSha256:metadata.recordsSha256},...(identityCompletion?{identityCompletion}:{})}}));
  for(const [file,content] of [...outputs]) {
    const relative=path.relative(output,file);
    if(relative.startsWith('products/') || ['products.json','manifest.json','identity-manifest.json','review-binding.json'].includes(relative)) outputs.set(path.join(root,'backend-node/data/catalog-transformers-2026',relative),content);
  }
  const imports=[];
  for(const [i,chunk] of index.chunks.entries()){
    const rows=JSON.parse(outputs.get(path.join(output,chunk.path)));
    const file=`part-${String(i+1).padStart(3,'0')}.js`;
    outputs.set(path.join(root,'frontend/lib/catalog/transformers-2026-data',file),Buffer.from(`// Generated from independently reviewed source records.\nconst records = ${JSON.stringify(rows,null,2)};\nexport default records;\n`));imports.push(`import part${i} from './transformers-2026-data/${file}';`);
  }
  outputs.set(path.join(root,'frontend/lib/catalog/transformers2026.js'),Buffer.from(`// Generated by scripts/import-transformers-2026.mjs after hash-bound source review.\n${imports.join('\n')}\nexport const transformerProducts = [${index.chunks.map((_,i)=>`...part${i}`).join(',')}];\nexport const transformerImport = ${JSON.stringify(metadata,null,2)};\n`));
  outputs.set(path.join(root,'backend-node/data/catalog-import/additional-sources.json'),bytes([{path:'../catalog-transformers-2026',sourceId:'transformers-2026',recordCount:records.length,inventorySha256,recordsSha256:metadata.recordsSha256}]));
}
for(const directory of new Set([...outputs.keys()].filter(file=>/part-\d{3}\.(json|js)$/.test(file)).map(file=>path.dirname(file)))) {
 if(fs.existsSync(directory)) for(const name of fs.readdirSync(directory).filter(name=>/^part-\d{3}\.(json|js)$/.test(name))) { const file=path.join(directory,name); if(!outputs.has(file)){if(check)throw new Error(`Stale generated shard ${file}`);else fs.unlinkSync(file);} }
}
for(const [file,content] of outputs){if(check){assert.equal(digest(fs.readFileSync(file)),digest(content),`${file} is stale`);}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}}
console.log(JSON.stringify({mode:activate?'activated':'staged-only',inventorySha256,sourceFamilyCount:metadata.sourceFamilyCount,sourceModelVariationCount:metadata.sourceModelVariationCount,sourceConfigurationCount:metadata.sourceConfigurationCount,admittedModelCount:metadata.admittedModelCount,heldModelCount:metadata.heldModelCount,familyCount:metadata.familyCount,recordCount:records.length,admittedConfigurationCount:metadata.admittedConfigurationCount,heldConfigurationCount:metadata.heldConfigurationCount,skippedFamilyIds:identity.skippedFamilyIds},null,2));
