import test from 'node:test';
import assert from 'node:assert/strict';
import {companyDestinations,companyRedirects,companyNavigation,companyDestination,companyMenuLinks} from '../lib/public/company-architecture.js';
import {companyPageMetadata} from '../lib/public/company-metadata.js';
import {localResourceHref} from '../lib/public/localResources.js';
test('every retired company route reaches its final section in every supported URL locale',()=>{
 const redirects=companyRedirects();assert.equal(redirects.length,16);
 for(const [section,destination] of Object.entries(companyDestinations))for(const locale of ['','ru','en','kk']){
  const rule=redirects.find(r=>r.source===`${locale?'/'+locale:''}/company/${section}`);
  assert.equal(rule.destination,companyDestination(section,locale||'ru'));assert.equal(rule.permanent,true);
  assert.ok(!Object.keys(companyDestinations).some(s=>rule.destination.split('#')[0]===`/company/${s}`));
  assert.ok(destination.includes('#'));
 }
 assert.equal(companyDestination('unknown'),null);
 assert.equal(companyDestination('history','en'),'/en/company#history');
});
test('primary company navigation has distinct tasks and no retired page links',()=>{
 assert.deepEqual(companyNavigation.map(([,href])=>href),['/company','/manufacturers','/company/team','/company/social']);
 assert.equal(new Set(companyMenuLinks.map(([,href])=>href)).size,companyMenuLinks.length);
 for(const [,href] of companyMenuLinks)assert.ok(!Object.keys(companyDestinations).some(s=>href===`/company/${s}`));
 assert.equal(localResourceHref('https://alageum.com/ru/kompaniya/istoriya'),'/company#history');
 assert.equal(localResourceHref('https://alageum.com/ru/kompaniya/prodazha'),'/contacts#assets');
});
test('canonical metadata uses only an explicitly validated origin and final localized routes',()=>{
 assert.deepEqual(companyPageMetadata({title:'Test'},'/company','ru',''),{title:'Test'});
 const meta=companyPageMetadata({title:'Test'},'/company','kk','https://example.test');
 assert.equal(meta.alternates.canonical,'https://example.test/kk/company');
 assert.equal(meta.alternates.languages.ru,'https://example.test/company');
 assert.throws(()=>companyPageMetadata({title:'Test'},'/company','ru','https://user:secret@example.test'));
 assert.throws(()=>companyPageMetadata({title:'Test'},'/company','ru','https://example.test/path'));
});

test('investors is restored as a standalone destination without a legacy redirect', async()=>{
 const {investorRedirects}=await import('../lib/public/company-architecture.js');
 assert.deepEqual(investorRedirects(),[]);
});
