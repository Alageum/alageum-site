import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {catalogDirections,topCatalogDirections,catalogDirectionById,catalogDirectionHref,getDirectionProducts} from '../lib/public/catalog-directions.js';
import {officialProducts} from '../lib/catalog/data.js';
import {projects} from '../lib/public/content.js';

test('direction tree preserves the requested hierarchy and every target resolves',()=>{
 assert.equal(topCatalogDirections.length,14);
 assert.equal(catalogDirections.length,21);
 assert.equal(new Set(catalogDirections.map(item=>item.id)).size,21);
 for(const item of catalogDirections){
  assert.equal(catalogDirectionHref(item.id),`/catalog/directions/${item.id}`);
  if(item.parentId)assert.ok(catalogDirectionById(item.parentId).children.includes(item.id));
  for(const child of item.children)assert.equal(catalogDirectionById(child).parentId,item.id);
  for(const id of item.productIds)assert.ok(officialProducts.some(product=>product.id===id),`${item.id}: missing ${id}`);
  for(const id of item.projectIds)assert.ok(projects.some(project=>project.id===id),`${item.id}: missing project ${id}`);
 }
});
test('navigation never invents equipment through name matching or includes demo and API records',()=>{
 assert.deepEqual(getDirectionProducts('furnace-transformers',officialProducts),[]);
 assert.deepEqual(getDirectionProducts('hv-oru',officialProducts),[]);
 assert.deepEqual(getDirectionProducts('unknown',officialProducts),[]);
 assert.deepEqual(getDirectionProducts('power-transformers',null),[]);
 const id=catalogDirectionById('power-transformers').productIds[0];
 assert.deepEqual(getDirectionProducts('power-transformers',[{id,source:'demo'},{id,source:'api'}]),[]);
 assert.deepEqual(getDirectionProducts('furnace-transformers',[{id:'invented-furnace',name:'Печной трансформатор',source:'official'}]),[]);
 const before=JSON.stringify(officialProducts);
 for(const item of catalogDirections){
  const matches=getDirectionProducts(item.id,officialProducts);
  assert.deepEqual(matches.map(p=>p.id),item.productIds);
  assert.ok(matches.every(product=>officialProducts.includes(product)));
 }
 assert.equal(JSON.stringify(officialProducts),before);
});
test('semantic boundaries separate reactors, autotransformers, GIS, low voltage and cathodic protection',()=>{
 assert.ok(getDirectionProducts('reactors',officialProducts).every(p=>p.productKind==='reactor'));
 assert.ok(getDirectionProducts('autotransformers',officialProducts).every(p=>p.productKind==='autotransformer'));
 assert.ok(getDirectionProducts('power-transformers',officialProducts).every(p=>p.productKind==='transformer'&&p.sourceFamilyId.startsWith('asia-')));
 assert.deepEqual(catalogDirectionById('gis').productIds,['cat-rmu-ae']);
 assert.ok(catalogDirectionById('lv-assemblies').productIds.includes('cat-vru'));
 assert.ok(!catalogDirectionById('relay-protection').productIds.includes('cat-ptm-tded'));
 assert.deepEqual(catalogDirectionById('autotransformers').projectIds,['nura']);
});
test('client navigation data imports no catalog payload or technical authority',()=>{
 const source=readFileSync(new URL('../lib/public/catalog-directions.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/^import\s/m);
});
