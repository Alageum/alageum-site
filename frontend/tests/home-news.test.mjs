import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {homeArchiveNews} from '../lib/public/home-news.js';
const archive=JSON.parse(readFileSync(new URL('../lib/public/materials-index.json',import.meta.url),'utf8')).items;
test('home archive cards link to existing publications with matching dates and real local images',()=>{
 const cards=homeArchiveNews();assert.equal(cards.length,3);
 assert.equal(homeArchiveNews(1).length,1);
 for(const card of cards){
  const item=archive.find(item=>`/materials/${item.id}`===card.href);
  assert.ok(item);assert.equal(item.published,card.date);
  assert.ok(existsSync(new URL(`../public${card.photo}`,import.meta.url)));
 }
 assert.deepEqual(cards.map(c=>c.date),cards.map(c=>c.date).toSorted().reverse());
});
