import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {localResourceHref,localSourceHref,isLegacyAlageumHref} from '../lib/public/localResources.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('verified legacy routes resolve to their own new public destinations',()=>{
 for(const [old,target] of [['kompaniya/o-nas','/company'],['kompaniya/istoriya','/company#history'],['kompaniya/dostizheniya','/company#achievements'],['kompaniya/prodazha','/contacts#assets'],['novosti','/news'],['kontakty','/contacts'],['predpriyatiya/too-asia-trafo','/manufacturers/asia-trafo']]){
  assert.equal(localResourceHref(`https://www.alageum.com/ru/${old}?utm_source=archive`),target);
  assert.equal(localResourceHref(`/ru/${old}`),target);
 }
 assert.equal(localResourceHref('//alageum.com/ru/kompaniya/o-nas'),'/company');
});
test('unknown retired links disappear instead of jumping to an unrelated page',()=>{
 for(const href of ['https://alageum.com/ru/kompaniya/missing','https://alageum.com/images/missing.pdf']){
  assert.equal(isLegacyAlageumHref(href),true);assert.equal(localResourceHref(href),null);
 }
});
test('new deployment URLs, local routes, independent services and business email are untouched',()=>{
 for(const href of ['/','/company','/ru','/en/company','/documents/alageum-group-2024.pdf','https://alageum.com/company','https://alageum.com/en/company','https://alageum.com/uploads/new.jpg','https://2gis.kz/','https://forbes.kz/ranking/object/1044','mailto:sales@alageum.com','tel:+77710052222'])assert.equal(localResourceHref(href),href);
});
test('original archived publications remain accessible locally without an outbound source link',()=>{
 for(const item of read('../lib/public/materials-index.json').items){
  assert.equal(localSourceHref(item.url),`/materials/${item.id}`);
  assert.ok(existsSync(new URL(`../lib/public/materials/${item.id}.json`,import.meta.url)));
 }
});
test('legacy photos and the corporate PDF resolve to existing files, retaining provenance separately',()=>{
 for(const [source,path] of Object.entries(read('../lib/public/legacy-assets.json'))){
  assert.equal(localResourceHref(source),path);assert.ok(existsSync(new URL(`../public${path}`,import.meta.url)));
 }
 assert.equal(localResourceHref('https://alageum.com/images/katalog/2Imid_rus2024.pdf'),'/documents/alageum-group-2024.pdf');
 assert.ok(existsSync(new URL('../public/documents/alageum-group-2024.pdf',import.meta.url)));
});
