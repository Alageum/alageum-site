import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { officialProducts, demoProducts } from '../lib/catalog/data.js';
import { getProductPhotograph, productPhotographyManifest } from '../lib/catalog/photography.js';
import { getProjectPhoto, getManufacturerPhoto, getCorporatePhoto, photographyManifest } from '../lib/public/photography.js';

import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { photoPublicDto } from './helpers/photography-api-fixture.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const matched = officialProducts.filter(product => getProductPhotograph(product));

test('photographs have local verified bytes and bounded provenance', () => {
  for (const photo of [...Object.values(photographyManifest.assets), ...Object.values(productPhotographyManifest.photos)]) {
    assert.match(photo.path, /^\/photography\/[a-z/-]+\.webp$/);
    const bytes = readFileSync(new URL(`../public${photo.path}`, import.meta.url));
    assert.equal(digest(bytes), photo.sha256);
    assert.ok(photo.width > 0 && photo.height > 0);
    assert.ok(photo.alt && photo.caption);
    assert.match(photo.sourcePage, /^https:\/\/(alageum\.com|asiatrafo\.kz|www\.gov\.kz|aemz\.kz)\//);
    assert.equal(photo.historical, true);
  }
});

test('all six real enterprise profiles and three verified project photos are mapped', () => {
  for (const id of ['ktz','asia-trafo','aemz','utz','petz','elmo']) assert.ok(getManufacturerPhoto(id));
  for (const id of ['petropavlovsk','nura','yassy']) assert.ok(getProjectPhoto(id));
  assert.equal(getProjectPhoto('nur-esil'), null);
  assert.equal(getCorporatePhoto('category-protection'), null);
  assert.equal(getProjectPhoto('__proto__'), null);
  assert.match(getProjectPhoto('petropavlovsk').caption, /Осмотр/);
  assert.match(getProjectPhoto('nura').caption, /Автотрансформатор/);
});

test('photo coverage is an explicit record allow-list, never a category guess', () => {
  assert.equal(matched.length, Object.keys(productPhotographyManifest.records).length);
  assert.equal(matched.length, 94);
  for (const product of demoProducts) assert.equal(getProductPhotograph(product), null);
  assert.equal(getProductPhotograph({...matched[0], id:'unreviewed-product'}), null);
  assert.equal(getProductPhotograph(Object.create(matched[0])), null);
  assert.equal(getProductPhotograph(null), null);
});

test('changed record identity, specifications or media revoke static photo mapping', () => {
  const record = matched.find(item => item.sourceId === 'transformers-2026');
  for (const changes of [{source:'demo'},{designation:'different'},{power:99999},{sourceSha256:'different'},{image:'/catalog-products/other.webp'},{sourceFamilyId:'other'}, {databaseId:'unexpected'}]) {
    assert.equal(getProductPhotograph({...record,...changes}), null, JSON.stringify(changes));
  }
});

test('live photo mapping requires exact importer UUID and unchanged source media and record shape', () => {
  const record = matched.find(item => item.sourceId === 'transformers-2026');
  const binding = productPhotographyManifest.records[record.id];
  const api = {...record, source:'api', databaseId:binding.databaseId, sourceMediaPath:record.image ?? null, ...(Object.hasOwn(record,'variantSpecs')?{sourceVariantSpecs:record.variantSpecs}:{})};
  assert.ok(getProductPhotograph(api));
  assert.equal(getProductPhotograph({...api,databaseId:'another-row'}),null);
  assert.equal(getProductPhotograph({...api,sourceMediaPath:'/catalog-products/editor-chosen.webp'}),null);
  assert.equal(getProductPhotograph({...api,technicalSpecs:[]}),null);
});

test('every catalog photo is explicitly illustrative and preserves existing technical images', () => {
  for (const photo of Object.values(productPhotographyManifest.photos)) {
    assert.ok(['manufacturer-context','equipment-type','series-example'].includes(photo.representation));
    assert.ok(photo.shortCaption && photo.disclaimer);
  }
  const wrapper = readFileSync(new URL('../components/catalog/ProductPhotoVisual.js',import.meta.url),'utf8');
  assert.match(wrapper, /<ProductPhotograph\s+product=\{product\}\s*\/>/);
  assert.match(wrapper, /<FamilyProductVisual\s+product=\{product\}\s+records=\{records\}\s*\/>/);
  const visual = readFileSync(new URL('../components/catalog/ProductVisual.js',import.meta.url),'utf8');
  assert.ok(visual.includes('<EquipmentModel'));
  assert.ok(visual.includes('<CatalogSourceContext'));
  assert.ok(visual.includes('product-original-illustration'));
});

test('TM conservator photo and KSO photo cannot leak to different series', () => {
  const tm=officialProducts.find(p=>p.sourceFamilyId==='tm-standard');
  assert.equal(getProductPhotograph(tm).id,'aemz-tm-series');
  assert.notEqual(getProductPhotograph(officialProducts.find(p=>p.id==='tmg-630')).id,'aemz-tm-series');
  assert.equal(getProductPhotograph(officialProducts.find(p=>p.id==='kso-2-10')).id,'aemz-kso2-10-series');
  for(const id of ['kso-292','kso-366']) assert.equal(getProductPhotograph(officialProducts.find(p=>p.id===id)),null);
});

test('all 94 photos survive the actual Node catalog source and public DTO contract', () => {
  for (const id of Object.keys(productPhotographyManifest.records)) {
    const api = normalizeApiProduct(photoPublicDto(id));
    assert.ok(getProductPhotograph(api), id);
    assert.equal(getProductPhotograph({...api,databaseId:'another-row'}),null,id);
    assert.equal(getProductPhotograph({...api,sourceMediaPath:'/catalog-products/editor.webp'}),null,id);
  }
});

test('raw variant changes revoke photographs without changing shared historical hash format', () => {
  const record = matched.find(item => item.variantSpecs?.length);
  const changed = [{label:'Номинальная мощность',value:'99999',unit:'кВА'}];
  assert.equal(getProductPhotograph({...record,variantSpecs:changed}),null);
  const dto=photoPublicDto(record.id);
  dto.specs.variantSpecs=changed;
  assert.equal(getProductPhotograph(normalizeApiProduct(dto)),null);
  assert.ok(getProductPhotograph({...record,description:'Owner editorial change'}));
});
