import test from 'node:test';
import assert from 'node:assert/strict';
import {siteNavigation} from '../lib/public/site-navigation.js';
import {catalogDirections, topCatalogDirections} from '../lib/public/catalog-directions.js';
import {industries} from '../lib/public/industries.js';
import {investorRedirects} from '../lib/public/company-architecture.js';
import {engineeringOrganizations} from '../lib/public/engineering-organizations.js';
import {existsSync} from 'node:fs';

test('primary navigation matches the requested order and preserves all nested catalogue groups',()=>{
 assert.deepEqual(siteNavigation.map(s=>s.label),['Каталог','Отрасли','Предприятия','Инвесторам','Проектировщикам','Компания']);
 assert.equal(siteNavigation[4].href,'/documents');
 const catalogue=siteNavigation[0];assert.equal(catalogue.links.length,topCatalogDirections.length);
 const hrefs=catalogue.links.flatMap(([,href,,children])=>[href,...children.map(([,url])=>url)]);
 assert.equal(new Set(hrefs).size,catalogDirections.length);
 for(const direction of catalogDirections)assert.ok(hrefs.includes(`/catalog/directions/${direction.id}`));
 assert.equal(siteNavigation[1].links.length,7);assert.equal(industries.length,7);
 assert.equal(siteNavigation[2].links.length,10);
 assert.equal(new Set(siteNavigation[2].links.map(([,href])=>href)).size,10);
});
test('new enterprise links reach dedicated partner profiles and investors is no longer redirected away',()=>{
 assert.deepEqual(investorRedirects(),[]);
 for(const item of engineeringOrganizations){assert.ok(siteNavigation[2].links.some(([,href])=>href===item.href));assert.ok(existsSync(`app/(site)/manufacturers/${item.id}/page.js`));assert.ok(existsSync(`app/[locale]/(site)/manufacturers/${item.id}/page.js`));}
 assert.ok(existsSync('app/(site)/investors/page.js'));assert.ok(existsSync('app/[locale]/(site)/investors/page.js'));
});
