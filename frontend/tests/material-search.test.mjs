import test from 'node:test';
import assert from 'node:assert/strict';
import index from '../lib/public/materials-index.json' with {type:'json'};
import {materialMatches} from '../lib/public/material-search.js';
test('English and Kazakh topic queries find original-language transformer plant articles',()=>{
 const article=index.items.find(i=>i.title.includes('Кентауский трансформаторный завод посетил'));
 assert.ok(article);
 for(const q of [' transformer ','TRANSFORMERS plant','трансформатор зауыт'])assert.ok(materialMatches(article,q),q);
 assert.equal(materialMatches(article,'transformer banana'),false);
});
test('empty search preserves the archive and translated titles remain searchable without mutating source',()=>{
 assert.ok(index.items.every(i=>materialMatches(i,'  ')));
 const item={title:'История компании',id:'history',url:'https://alageum.com/ru/kompaniya/istoriya'};
 assert.ok(materialMatches(item,'group history','Group history'));
 assert.equal(item.title,'История компании');
});
