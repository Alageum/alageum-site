import test from 'node:test';
import assert from 'node:assert/strict';
import {siteNavigation, catalogMenuGroups} from '../lib/public/site-navigation.js';
import {catalogDirections, catalogEquipmentDirections} from '../lib/public/catalog-directions.js';
import {industries} from '../lib/public/industries.js';
import {investorRedirects} from '../lib/public/company-architecture.js';
import {engineeringOrganizations} from '../lib/public/engineering-organizations.js';
import {existsSync} from 'node:fs';

test('primary navigation matches the requested order and preserves all nested catalogue groups',()=>{
 assert.deepEqual(siteNavigation.map(s=>s.label),['О компании','Направления','Предприятия','Каталог','Отрасли','Проектировщикам','Контакты']);
 assert.equal(siteNavigation[1].href,'/directions');
 assert.equal(siteNavigation.at(-1).href,'/contacts');
 const catalogue=siteNavigation[3];
 assert.equal(catalogue.title,'Разделы оборудования');
 const mobileHrefs=catalogue.links.flatMap(([,href,,children])=>children?.map(([,url])=>url) ?? [href]);
 assert.deepEqual(mobileHrefs,catalogMenuGroups.flatMap(group=>group.links.map(([,url])=>url)));
 assert.deepEqual(new Set(mobileHrefs),new Set([...catalogDirections,...catalogEquipmentDirections].map(direction=>`/catalog/directions/${direction.id}`)));
 assert.equal(siteNavigation[4].links.length,7);assert.equal(industries.length,7);
 assert.equal(siteNavigation[2].links.length,10);
 assert.equal(new Set(siteNavigation[2].links.map(([,href])=>href)).size,10);
});
test('new enterprise links reach dedicated partner profiles and investors is no longer redirected away',()=>{
 assert.deepEqual(investorRedirects(),[]);
 for(const item of engineeringOrganizations){assert.ok(siteNavigation[2].links.some(([,href])=>href===item.href));assert.ok(existsSync(`app/(site)/manufacturers/${item.id}/page.js`));assert.ok(existsSync(`app/[locale]/(site)/manufacturers/${item.id}/page.js`));}
 assert.ok(existsSync('app/(site)/investors/page.js'));assert.ok(existsSync('app/[locale]/(site)/investors/page.js'));
});
