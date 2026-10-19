import assert from 'node:assert/strict';
import test from 'node:test';
import { products, webOfficialProducts, officialProducts, demoProducts, categories } from '../lib/catalog/data.js';
import { filterProducts, normalizeSelection, selectionCsv } from '../lib/catalog/query.js';
import { manufacturers, projects, documents, offices } from '../lib/public/content.js';
import { solutions } from '../lib/public/solutions.js';
import { localResourceHref } from '../lib/public/localResources.js';
test('official reference records are distinct from synthetic fixtures', () => {
 assert.equal(webOfficialProducts.length, 19); assert.equal(demoProducts.length, 9);
 assert.equal(new Set(products.map(p => p.id)).size, products.length);
 for (const p of webOfficialProducts) {
  assert.equal(p.source, 'official'); assert.ok(p.sourceUrl.startsWith('https://alageum.com/ru/'));
  assert.equal(p.sourceCheckedAt, '2026-09-30'); assert.ok(categories.some(c=>c.id===p.category));
  assert.equal(p.documentCount, 0); assert.equal(p.image, null);
  assert.ok(!Object.hasOwn(p, 'price')); assert.ok(!Object.hasOwn(p, 'stock'));
  assert.ok(p.voltage === null || !p.voltage.includes('кВ'));
 }
});
test('manufacturer search works without guessing catalog manufacturers', () => {
 const results=filterProducts(officialProducts,{q:'АЭМЗ'});assert.deepEqual(results.map(p=>p.id),['pktp-400','pktp-1000']);
 const asia=filterProducts(officialProducts,{q:'Asia Trafo'});assert.equal(asia.length,207);
 for(const row of asia){assert.equal(row.sourceId,'transformers-2026');assert.equal(row.manufacturer,'ТОО «Asia Trafo»');assert.ok(row.manufacturerEvidencePages.includes(166));}
});
test('power unknowns remain unknown and reference values are preserved', () => {
 assert.equal(officialProducts.find(p=>p.id==='ntmi-6').power,null);
 assert.equal(webOfficialProducts.find(p=>p.id==='kso-366').voltage,null);assert.equal(officialProducts.find(p=>p.id==='kso-366').voltage,'6;10');
 assert.equal(officialProducts.find(p=>p.id==='tmg-2500').power,2500);
});
test('source-aware selections and exports support official and demo items', () => {
 const items=normalizeSelection([{id:'tmg-630',quantity:2},{id:'demo-001',quantity:1}],products);
 assert.equal(items.length,2);const csv=selectionCsv(items,products);
 assert.match(csv,/Официальный каталог/);assert.match(csv,/ДЕМО — не заказ/);
});
test('public content has unique slugs and verified source hosts', () => {
 for(const list of [manufacturers,projects]){assert.equal(new Set(list.map(x=>x.id)).size,list.length);for(const item of list)assert.ok(['alageum.com','asiatrafo.kz'].includes(new URL(item.source).hostname));}
 // Document cards now use the existing local archive/catalog destinations.
 const documentSources = ['https://alageum.com/images/katalog/2Imid_rus2024.pdf', 'https://asiatrafo.kz/images/referent.pdf',
  'https://alageum.com/ru/katalog/transformatory', 'https://alageum.com/ru/katalog/shkafy-upravleniya'];
 assert.deepEqual(documents.map(item => item.href), documentSources.map(localResourceHref));
 for (const item of documents) assert.match(item.href, /^\/(?:documents\/[a-z0-9-]+\.pdf|catalog\?category=(?:transformers|substations))$/);
 for(const office of offices){assert.match(office.tel,/^\+7\d{10}$/);assert.match(office.email,/@alageum\.com$/);}
});
test('current construction project is never represented as completed', () => {
 const project=projects.find(p=>p.id==='petropavlovsk');assert.match(project.label,/В реализации/);assert.match(project.note,/не подтверждён/);
});
test('solution categories are known and every solution has useful input requirements', () => {
 for(const solution of solutions){assert.ok(categories.some(c=>c.id===solution.category));assert.equal(solution.inputs.length,4);}
});

test('expanded cases distinguish participation, dated evidence and consolidated objects', () => {
 assert.ok(projects.length >= 16);
 assert.equal(projects.filter(project => project.id === 'hub-aktau').length, 1);
 for (const project of projects) {
  assert.ok(['construction', 'reconstruction', 'supply'].includes(project.kind));
  assert.ok(project.role && project.period && project.context && project.contribution && project.note);
 }
 const expo = projects.find(project => project.id === 'expo-2017');
 assert.equal(expo.metric, '90'); assert.match(expo.note, /строительстве всего/);
 const dostyk = projects.find(project => project.id === 'dostyk-pavlodar');
 assert.match(dostyk.role, /IEM/);
 assert.equal(projects.find(project => project.id === 'astana-substations').metric, '100');
});
