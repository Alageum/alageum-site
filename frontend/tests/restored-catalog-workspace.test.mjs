import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAdvancedProducts } from '../lib/catalog/advancedQuery.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { liveComparisonRows, liveComparisonValue, liveRowDiffers } from '../lib/catalog/liveComparison.js';
import { collectPages, pagePath } from '../lib/api/pagination.js';
import { normalizeSearchHistory, rememberSearch, readSearchHistory } from '../lib/catalog/searchHistory.js';
import { initialInquiry, buildInquiryText } from '../lib/inquiry/model.js';
import { projectDraftPatch } from '../lib/ecosystem/projectDraft.js';
import { summaryTotal, dashboardSections } from '../lib/dashboard/summary.js';

const live=(id,power,current)=>normalizeApiProduct({id,public_key:id,slug:id,sku:id,translations:{ru:{name:id}},specs:{power,current,function:'metering',manufacturers:['factory'],technicalSpecs:[]},attributes:[{code:'IP',value:'IP54',unit:''}],comparable:true,category_public_key:'transformers'});
const first=live('tmg-630',630,'100 A'),second=live('tmg-1000',1000,'200 A');
test('live API keeps advanced parameter fields instead of discarding them',()=>{
 assert.equal(first.current,'100 A');assert.equal(first.function,'metering');assert.deepEqual(first.manufacturers,['factory']);
 assert.deepEqual(filterAdvancedProducts([first,second],{f_current:JSON.stringify(['100 A'])}).map(p=>p.id),[first.id]);
 assert.deepEqual(filterAdvancedProducts([first,second],{searchMode:'exact',q:'TMG'}),[]);
 assert.deepEqual(filterAdvancedProducts([first,second],{searchMode:'exact',q:'tmg-630'}).map(p=>p.id),[first.id]);
});
test('live comparison retains general fields, attributes and technical data with differences',()=>{
 const other={...second,attributes:[{code:'IP',value:'IP65',unit:''}],technicalSpecs:[{label:'Frequency',value:'50',unit:'Hz'}]};
 const rows=liveComparisonRows([first,other]);
 const power=rows.find(r=>r.key==='power'),ip=rows.find(r=>r.code==='IP'),frequency=rows.find(r=>r.label==='Frequency');
 assert.ok(power&&ip&&frequency);assert.equal(liveRowDiffers([first,other],power),true);
 assert.equal(liveComparisonValue(first,ip),'IP54');assert.equal(liveComparisonValue(other,ip),'IP65');
 assert.equal(liveComparisonValue(first,frequency),'—');assert.equal(liveRowDiffers([first,first],ip),false);
});
test('all-page reader exposes records after page 50 and never truncates',async()=>{
 const calls=[];const result=await collectPages(async n=>{calls.push(n);return {items:Array.from({length:n===1?50:1},(_,i)=>({id:String((n-1)*50+i)})),page:n,page_size:50,total:51};},(p,n)=>p.page===n);
 assert.equal(result.length,51);assert.deepEqual(calls,[1,2]);assert.equal(pagePath('/orders',1),'/orders');assert.equal(pagePath('/orders',2),'/orders?page=2');
});
test('all-page reader rejects wrong pages, duplicates, incomplete sets and runaway servers',async()=>{
 await assert.rejects(collectPages(async()=>({items:[],page:2}), (p,n)=>p.page===n));
 await assert.rejects(collectPages(async()=>({items:[{id:'same'}],page_size:1,total:3}),()=>true),/repeated_page/);
 await assert.rejects(collectPages(async()=>({items:[],page_size:1,total:3}),()=>true),/incomplete_page/);
 await assert.rejects(collectPages(async n=>({items:[{id:String(n)}],page_size:1,total:5}),()=>true,{maxPages:2}),/page_limit/);
});
test('later page errors are not mistaken for a complete first page',async()=>{
 const denied=Object.assign(Error('forbidden'),{status:403});await assert.rejects(collectPages(async n=>{if(n>1)throw denied;return {items:[{id:'one'}],page_size:1,total:2};},()=>true),e=>e===denied);
});
test('local search history is bounded, deduplicated, removable and resilient to corrupt storage',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 rememberSearch(storage,'  TMG  ');rememberSearch(storage,'KTP');rememberSearch(storage,'TMG');assert.deepEqual(readSearchHistory(storage),['TMG','KTP']);
 assert.equal(normalizeSearchHistory(Array.from({length:20},(_,i)=>`query${i}`)).length,8);
 assert.deepEqual(readSearchHistory({getItem:()=>'{bad'}),[]);assert.doesNotThrow(()=>rememberSearch({getItem(){throw Error();},setItem(){throw Error();}},'search'));
});
test('investment requests retain purpose and never become equipment-price requests',()=>{
 const inquiry=initialInquiry({intent:'investment'});assert.equal(inquiry.intent,'investment');
 const text=buildInquiryText({...inquiry,description:'Investment project'},[{id:'ignored',name:'Equipment',sku:'X',quantity:1}],[]);
 assert.match(text,/Инвестиционное сотрудничество/);assert.doesNotMatch(text,/ОБОРУДОВАНИЕ|Нужна помощь с подбором|стоимость, наличие/);assert.match(text,/не является заказом/);
});
test('dashboard accepts only confirmed totals and keeps permissions per section',()=>{
 assert.equal(summaryTotal({items:[],page:1,total:51}),51);
 for(const p of [null,{}, {items:[],page:1,total:'51'},{items:[],page:2,total:1}])assert.throws(()=>summaryTotal(p));
 assert.ok(dashboardSections.every(s=>s.permission&&s.href.startsWith('/b2b/')));
});

test('project edits bound values and do not change identity or simulated status',()=>{
 const patch=projectDraftPatch({id:'other',status:'quoted',name:' Name ',task:'x'.repeat(6000),items:[{id:'known',quantity:10000,unitPrice:'1.20'},{id:'known',quantity:2},{id:'unknown',quantity:1}]},id=>id==='known');
 assert.equal(patch.id,undefined);assert.equal(patch.status,undefined);assert.equal(patch.name,'Name');assert.equal(patch.task.length,5000);assert.deepEqual(patch.items,[{id:'known',quantity:999,unitPrice:'1.20'}]);
 assert.throws(()=>projectDraftPatch({name:' '},()=>true));assert.throws(()=>projectDraftPatch({items:null},()=>true));
});
