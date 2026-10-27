import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyCurrentClientDtoContract, clientBaselinePath, sourceFixturePath } from '../../scripts/catalog/current-client-dto-contract.mjs';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { officialProducts } from '../lib/catalog/data.js';
const read=path=>readFile(new URL(`../../${path}`,import.meta.url));
test('current DTO extension preserves all former fields and consumer fingerprints for 843 source records, without granting approval',async()=>{
 const proof=await verifyCurrentClientDtoContract();assert.equal(proof.records,843);assert.equal(proof.status,'passed');assert.equal(proof.historicalApproval,false);assert.equal(proof.releaseApproval,false);
});
test('current proof re-reads baseline and rejects missing, tampered and stale evidence after successful verification',async()=>{
 await verifyCurrentClientDtoContract();
 await assert.rejects(verifyCurrentClientDtoContract({read:()=>Promise.reject(Error('missing baseline'))}),/missing baseline/);
 const bytes=await read(clientBaselinePath);
 await assert.rejects(verifyCurrentClientDtoContract({read:async()=>Buffer.concat([bytes,Buffer.from(' ')])}),/immutable client baseline/);
 const stale=JSON.parse(bytes);stale.baseCommit='stale';await assert.rejects(verifyCurrentClientDtoContract({read:async()=>Buffer.from(JSON.stringify(stale))}),/immutable client baseline/);
 assert.equal((await verifyCurrentClientDtoContract()).status,'passed');
});
test('current proof rejects prior-field drift, unlisted fields, altered extension values and missing additions',async()=>{
 const mutations=[p=>({...p,name:'changed'}),p=>({...p,unreviewed:true}),p=>({...p,current:'invented'}),p=>({...p,function:'invented'}),p=>({...p,manufacturers:['invented']}),p=>{const copy={...p};delete copy.current;return copy;},p=>({...p,variantSpecs:[{label:'invented'}]})];
 for(const mutate of mutations)await assert.rejects(verifyCurrentClientDtoContract({normalize:dto=>mutate(normalizeApiProduct(dto))}));
});
test('current proof rejects incomplete source closure and re-ordered source identities',async()=>{
 await assert.rejects(verifyCurrentClientDtoContract({products:officialProducts.slice(1)}),/Incomplete current source/);
 await assert.rejects(verifyCurrentClientDtoContract({products:officialProducts.toReversed()}),/identity\/order drift/);
});

test('current proof rejects fabricated extension source facts even when normalizer agrees',async()=>{
 const source=officialProducts.map(({catalogEditorial,...row})=>{void catalogEditorial;return row;});
 for(const patch of [{current:'INVENTED'},{function:'INVENTED'},{manufacturers:['INVENTED']},{variantSpecs:[{label:'INVENTED',value:'fake',unit:'x',page:999}]}]) {
  const changed=structuredClone(source);Object.assign(changed[0],patch);
  await assert.rejects(verifyCurrentClientDtoContract({products:changed}),/retained importer evidence/);
 }
});
test('retained importer fixture is reread and cannot be missing, changed or stale',async()=>{
 await verifyCurrentClientDtoContract();
 for(const replacement of [null,Buffer.from('{}'),Buffer.from('stale')])await assert.rejects(verifyCurrentClientDtoContract({read:async path=>{if(path!==sourceFixturePath)return read(path);if(replacement===null)throw Error('missing source fixture');return replacement;}}));
 assert.equal((await verifyCurrentClientDtoContract()).status,'passed');
});
