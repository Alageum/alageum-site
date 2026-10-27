import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { officialProducts } from '../../frontend/lib/catalog/data.js';
import { normalizeApiProduct } from '../../frontend/lib/catalog/apiData.js';
import { selectionCsv } from '../../frontend/lib/catalog/query.js';
import { inquiryItems } from '../../frontend/lib/inquiry/model.js';
import { quotePayload, selectionFingerprint } from '../../frontend/lib/quotes/model.js';
import { importedProductId } from './measurement-column-asset-snapshot.mjs';

export const sourceFixturePath='frontend/e2e/fixtures/ptmm-public-dtos.json';
const sourceFixtureHash='96fbf1a0eb3bce595248efaa06bffdd2e98d7532f4bb9417c4227f86687e5dcb';
export const clientBaselinePath='docs/catalog-transformers-2026/review/protection-context-integration/baseline-client-consumers.json';
const root=new URL('../../',import.meta.url);
const baselineHash='69ab2ac713fdb0f74141e5ed12c276fb22820254f3976947ede922205deddb1b';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashValue=value=>hash(JSON.stringify(value));
const sourceRows=officialProducts.map(({catalogEditorial,...row})=>{void catalogEditorial;return row;});
const scalar=value=>typeof value==='string'||typeof value==='number'?value:null;
const rows=value=>Array.isArray(value)?value.filter(row=>row&&typeof row==='object').map(row=>({label:String(row.label||''),value:String(scalar(row.value)??'—'),unit:String(row.unit||''),page:Number.isInteger(row.page)?row.page:null})):[];

// This is a CURRENT behavioral contract, not a historical byte approval bridge.
// No archived gate imports this module and no archived hash is re-attested.
// Injection exists only for negative tests; CLI always uses current production code.
export async function verifyCurrentClientDtoContract({read=path=>readFile(new URL(path,root)),normalize=normalizeApiProduct,products=sourceRows}={}) {
 const baselineBytes=await read(clientBaselinePath);
 assert.equal(hash(baselineBytes),baselineHash,'Changed or missing immutable client baseline');
 const baseline=JSON.parse(baselineBytes);
 assert.equal(baseline.format,'alageum-pr33-client-consumers-v1');
 assert.equal(products.length,843,'Incomplete current source catalog');
 assert.deepEqual(products.map(row=>row.id),Object.keys(baseline.records),'Current source identity/order drift');
 // Existing importer evidence independently binds ALL raw records, including
 // added-field source facts. Never derive expected source identity from inputs.
 const sourceFixtureBytes=await read(sourceFixturePath);
 assert.equal(hash(sourceFixtureBytes),sourceFixtureHash,'Changed or missing immutable importer fixture');
 const fixture=JSON.parse(sourceFixtureBytes);
 assert.equal(fixture.format,'ptmm-importer-public-dtos-v1');
 const original=JSON.stringify(products);
 assert.equal(hash(original),fixture.sourceRecordsSha256,'Current raw source differs from retained importer evidence');
 const current=[];
 for(const row of products){
  const dto={id:importedProductId(row.id),public_key:row.id,sku:row.sku,category_public_key:row.category,translations:{ru:{name:row.name}},specs:row,provenance:row,media:row.image?[{path:row.image,kind:'image',alt:row.imageCaption}]:[]};
  const normalized=normalize(dto);
  for(const key of ['current','function','manufacturers','variantSpecs'])assert.ok(Object.hasOwn(normalized,key),`Missing current field ${row.id}/${key}`);
  assert.equal(normalized.current,scalar(row.current),`Wrong current ${row.id}`);
  assert.equal(normalized.function,scalar(row.function),`Wrong function ${row.id}`);
  assert.deepEqual(normalized.manufacturers,Array.isArray(row.manufacturers)?row.manufacturers.filter(value=>typeof value==='string'):[],`Wrong manufacturers ${row.id}`);
  assert.equal(Object.hasOwn(normalized,'sourceVariantSpecs'),Object.hasOwn(row,'variantSpecs'));
  assert.deepEqual(normalized.sourceVariantSpecs,row.variantSpecs);
  assert.deepEqual(normalized.variantSpecs,rows(row.variantSpecs));
  // Only these explicit added fields are projected out. Every prior field,
  // including unexpected additions, remains bound to the archived digest.
  const {current:amperage,function:purpose,manufacturers,sourceVariantSpecs,variantSpecs,...prior}=normalized;
  void amperage;void purpose;void manufacturers;void sourceVariantSpecs;void variantSpecs;
  const items=[{id:row.id,databaseId:normalized.databaseId,quantity:2}];
  assert.deepEqual({normalized:hashValue(prior),selectionCsv:hashValue(selectionCsv(items,[normalized])),inquiry:hashValue(inquiryItems(items,[normalized])),quotePayload:hashValue(quotePayload(items)),selectionFingerprint:hashValue(selectionFingerprint(items))},baseline.records[row.id],`Changed prior field or consumer ${row.id}`);
  current.push(normalized);
 }
 assert.equal(JSON.stringify(products),original,'Normalization mutated source records');
 return {format:'alageum-current-client-dto-contract-v1',status:'passed',records:products.length,baselineSha256:baselineHash,sourceFixtureSha256:sourceFixtureHash,sourceRecordsSha256:fixture.sourceRecordsSha256,currentNormalizedSha256:hashValue(current),addedFields:['current','function','manufacturers'],historicalApproval:false,releaseApproval:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyCurrentClientDtoContract(),null,2));
