import {localResourceHref,localSourceHref} from '../lib/public/localResources.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {careerRedirects} from '../lib/public/career-architecture.js';
import {companyRedirects,investorRedirects} from '../lib/public/company-architecture.js';
import {careerSections,careerSectionIndex,careerFooterGroups} from '../components/careers/navigation.js';
test('career redirects are final localized routes with no duplicate configuration entries',()=>{
 const rules=[...companyRedirects(),...investorRedirects(),...careerRedirects()];
 assert.equal(new Set(rules.map(r=>r.source)).size,rules.length);
 for(const prefix of ['','/ru','/en','/kk']){
  const rule=rules.find(r=>r.source===`${prefix}/careers/learning`);
  assert.equal(rule.destination,`${['/en','/kk'].includes(prefix)?prefix:''}/careers#learning`);
  assert.equal(rule.permanent,true);
  assert.ok(!rules.some(r=>r.source===rule.destination.split('#')[0]));
 }
 assert.equal(rules.find(r=>r.source==='/kz/karera/aktualnye-vakansii').destination,'/kk/careers/vacancies');
});
test('career navigation keeps four distinct destinations and the most specific active item',()=>{
 assert.equal(careerSections.length,4);
 for(const locale of ['','/ru','/en','/kk']){
  assert.equal(careerSectionIndex(`${locale}/careers`),0);
  assert.equal(careerSectionIndex(`${locale}/careers/vacancies/production-director`),1);
  assert.equal(careerSectionIndex(`${locale}/careers/internships`),2);
  assert.equal(careerSectionIndex(`${locale}/careers/apply?type=internship`),3);
 }
 assert.equal(new Set(careerFooterGroups.flatMap(([,links])=>links.map(([,href])=>href))).size,6);
});

test('old career navigation resolves to the new service while dated evidence stays in the archive',()=>{
 assert.equal(localResourceHref('https://alageum.com/ru/karera/aktualnye-vakansii'),'/careers/vacancies');
 assert.equal(localResourceHref('https://alageum.com/ru/karera/stazhirovki-dlya-studentov'),'/careers/internships');
 assert.equal(localSourceHref('https://alageum.com/ru/karera/aktualnye-vakansii'),'/materials/ru-karera-aktualnye-vakansii');
});
