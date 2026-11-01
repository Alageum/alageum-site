import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {factoryDossiers} from '../lib/public/factory-dossiers.js';
import {manufacturers} from '../lib/public/content.js';
const facts=JSON.parse(readFileSync(new URL('../../docs/public-redesign-2026-11-01/facts.json',import.meta.url),'utf8')).facts;
test('every factory retains a sourced dossier and distinguishes design capacity from actual production',()=>{
 assert.deepEqual(Object.keys(factoryDossiers).sort(),manufacturers.map(m=>m.id).sort());
 for(const [id,dossier]of Object.entries(factoryDossiers)){
  assert.equal(new URL(dossier.source).hostname,'alageum.com');
  for(const fact of dossier.facts){assert.ok(fact.unit);assert.ok(fact.period);assert.ok(facts.some(f=>f.owner===`/manufacturers/${id}`&&f.value===fact.value&&f.source===dossier.source));}
 }
 assert.equal(facts.filter(f=>f.kind==='design-capacity').length,1);
 assert.equal(facts.find(f=>f.kind==='design-capacity').organization,'asia-trafo');
 assert.ok(!facts.some(f=>f.kind==='actual-2026-output'));
});
test('numeric fact register records scope, source, period and units for every claim',()=>{
 for(const fact of facts){assert.ok(fact.organization);assert.ok(fact.unit);assert.ok(fact.period);assert.ok(/^https:\/\//.test(fact.source));assert.ok(fact.owner.startsWith('/'));}
 const social=facts.find(f=>f.kind==='social-expenditure');assert.equal(social.period,'2024');assert.equal(social.value,40000000);
 const awards=facts.filter(f=>f.kind==='historical-award'&&f.claim!=='Орден Парасат');assert.ok(awards.every(f=>f.organization==='КТЗ'));
});
