import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { baselineOfficialProducts as officialProducts, importedProducts, webOfficialProducts, categories, catalogImport, productById, specUnit } from '../lib/catalog/data.js';
import { filterProducts, paginationWindow, normalizeSelection, selectionCsv } from '../lib/catalog/query.js';

const families=importedProducts.filter(p=>p.recordKind==='family');
const models=importedProducts.filter(p=>p.recordKind==='variant');
test('all 104 pages are reconciled exactly once and all product pages link to families',()=>{
 assert.deepEqual(catalogImport.coverage.map(p=>p.page),Array.from({length:104},(_,i)=>i+1));
 for (let page=6;page<=98;page++){const c=catalogImport.coverage.find(p=>p.page===page);assert.ok(c.families.length>0,`page ${page}`);for(const id of c.families)assert.ok(families.some(f=>f.id===id),id);}
});
test('all 62 contents headings reconcile to 65 independently recorded families',()=>{
 assert.equal(catalogImport.familyCount,65);assert.equal(families.length,65);
 assert.equal(catalogImport.listedModelCount,models.length);
 assert.equal(catalogImport.configurationCount,families.reduce((n,p)=>n+p.configurations.length,0));
 assert.equal(catalogImport.recordCount,importedProducts.length);
});
test('every record has grounded pages, recognized category and no commercial guesses',()=>{
 for(const p of importedProducts){assert.equal(p.sourceKind,'supplied-pdf');assert.ok(categories.some(c=>c.id===p.category),p.id);assert.ok(p.sourcePages.length);assert.ok(p.sourcePages.every(n=>n>=6 && n<=98));assert.equal(p.isOrderableSku,false);assert.ok(!('price' in p));assert.ok(!('stock' in p));assert.equal(p.sourceUrl,catalogImport.sourceUrl);for(const s of p.technicalSpecs){assert.ok(s.label);assert.ok(s.page>=6&&s.page<=98);assert.equal(typeof s.value,'string');}}
});
test('all imported model references retain their parent and exact page rows',()=>{
 for(const p of models){const parent=productById(p.familyId);assert.ok(parent);assert.ok(parent.variantIds.includes(p.id));assert.ok(p.variantSpecs.every(s=>p.sourcePages.includes(s.page)));}
});
test('raw configurations and wildcard index codes do not become fake product cards',()=>{
 for(const f of families){for(const c of f.configurations){assert.ok(['configuration','code-option'].includes(c.kind));assert.ok(c.specifications.length);if(c.kind==='code-option')assert.ok(!models.some(m=>m.sku===c.designation));}}
 assert.ok(families.some(f=>f.configurations.some(c=>c.kind==='code-option')));
});
test('source image for every family crop and all 104 pages exists',()=>{
 assert.equal(families.filter(p=>p.image).length,catalogImport.imagesCount);
 for(const p of families)if(p.image)assert.ok(existsSync(new URL(`../public${p.image}`,import.meta.url)),p.image);
 for(let n=1;n<=104;n++)assert.ok(existsSync(new URL(`../public/catalog-source/page-${String(n).padStart(3,'0')}.webp`,import.meta.url)));
});
test('existing 19 URLs survive and five overlaps are merged without duplicate ids',()=>{
 for(const p of webOfficialProducts)assert.ok(productById(p.id),p.id);
 assert.equal(new Set(officialProducts.map(p=>p.id)).size,officialProducts.length);
 assert.equal(officialProducts.length,importedProducts.length+14);
 assert.equal(productById('pktp-400').sourceKind,'supplied-pdf');assert.equal(productById('pktp-400').power,400);assert.equal(productById('pktp-1000').power,1000);
 assert.match(productById('pktp-400').manufacturer,/АЭМЗ/);
});
test('catalog disagreements remain documented instead of silently corrected',()=>{
 assert.ok(catalogImport.issues.length>=15);
 const k8=productById('cat-k8m');assert.ok(k8.technicalSpecs.some(s=>s.value==='690'&&s.unit==='кВ'));assert.ok(k8.notes.some(n=>n.includes('690')));
 const y20=productById('cat-yakno-20');assert.ok(y20.technicalSpecs.some(s=>s.value==='25'&&s.unit==='А'));assert.ok(y20.notes.length);
});
test('volt and kilovolt metadata avoid duplicate or silently converted units',()=>{
 const sh=productById('cat-shcho-70');assert.equal(sh.voltage,'380/220');assert.equal(specUnit(sh,{key:'voltage',unit:'кВ'}),'В');
 assert.equal(specUnit(productById('tmg-400'),{key:'voltage',unit:'кВ'}),'кВ');
});
test('new categories, models, and configuration labels can be searched',()=>{
 assert.ok(filterProducts(officialProducts,{category:'protection'}).length>0);
 assert.ok(filterProducts(officialProducts,{q:'УКЗВ-6(10)К-5-1У1'}).length>0);
 assert.equal(filterProducts(officialProducts,{recordKind:'family'}).length,65);
});
test('large catalog pagination is bounded and retains edges',()=>{
 assert.deepEqual(paginationWindow(1,41),[1,2,null,41]);
 assert.deepEqual(paginationWindow(20,41),[1,null,19,20,21,null,41]);
 assert.deepEqual(paginationWindow(2,2),[1,2]);
});
test('new product selection and CSV remain compatible with local inquiry',()=>{
 const p=models.find(p=>p.id.startsWith('cat-ukzv'));
 const selection=normalizeSelection([{id:p.id,quantity:2}],officialProducts);assert.equal(selection.length,1);assert.ok(selectionCsv(selection,officialProducts).includes(p.sku));
});
test('frozen source manifest preserves exact source size, hash, and PDF identity',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../docs/catalog-import/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.sourceBytes,182693789);assert.equal(manifest.sourceSha256,'5cc9f57bf3ed16be6f168c0fff25f02a444675146919bfd277b7e722e640cefc');assert.equal(manifest.sourceFileId,'1qMKtgoDWWIjVhAwbrRd8YORKhIpSKazr');
});

test('specific model voltages override family ranges and consumed power is not mislabeled nominal',()=>{
 assert.equal(productById('cat-yatp-v001').voltage,'220 → 12');assert.equal(productById('cat-yatp-v002').voltage,'220 → 24');assert.equal(productById('cat-yatp-v001').voltageUnit,'В');
 assert.equal(productById('cat-ktpb-k-v001').voltage,'35/10(6)');
 assert.equal(productById('cat-ptm-tded').voltageUnit,'');assert.equal(productById('cat-ya5000-rusm5000').voltageUnit,'');
 for(const p of importedProducts.filter(p=>p.id.startsWith('cat-ptm-tded')))assert.equal(p.power,null,p.id);
});

test('multi-page family rows retain the actual printed source page',()=>{
 const checks=[['cat-krun07-ktz',43],['cat-kru-kerneu-35',47],['cat-k8m',49],['cat-k59',51],['cat-km7m',53],['cat-shueng',73],['cat-kru-27-5',86]];
 for(const [id,page] of checks)assert.ok(productById(id).technicalSpecs.some(s=>s.page===page),`${id} page ${page}`);
 assert.ok(productById('cat-ktpb-k').technicalSpecs.some(s=>s.page===59));
 assert.ok(productById('cat-ktpp-2ktpp-250-6300').configurations.some(c=>c.specifications.some(s=>s.page===15)));
});
test('known illegible labels remain an explicit limit and source errors are user-visible',()=>{
 assert.equal(catalogImport.unresolvedLabels[0].page,30);assert.equal(catalogImport.unresolvedLabels[0].count,2);
 assert.ok(productById('cat-ptm-tded').notes.some(n=>n.includes('ТДЕД')));
 assert.ok(!productById('cat-rmu-ae').notes.some(n=>n.includes('требуется объединение')));
});
