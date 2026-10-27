import test from 'node:test';
import assert from 'node:assert/strict';
import { currentCiMigrations, migrateCurrentReferenceAndTiming } from './helpers/current-ci-migrations.mjs';
const prior=currentCiMigrations.map(([before])=>before).join('\n');
const expected=currentCiMigrations.map(([,after])=>after).join('\n');
test('current migration admits only the exact reference command and finite timeout changes',()=>{
 assert.equal(migrateCurrentReferenceAndTiming(prior),expected);
 for(const [oldValue] of currentCiMigrations){
  assert.throws(()=>migrateCurrentReferenceAndTiming(prior.replace(oldValue,'')));
  assert.throws(()=>migrateCurrentReferenceAndTiming(prior+oldValue));
  assert.throws(()=>migrateCurrentReferenceAndTiming(prior.replace(oldValue,oldValue.replace(/\n/,' changed\n'))));
 }
 assert.throws(()=>migrateCurrentReferenceAndTiming(expected),'stale/current bytes must not pose as the archived input');
 for(const mutation of [expected.replace('45','999'),expected.replace('30','999'),expected.replace('--reference system','--reference system || true'),expected+'\ncontinue-on-error: true']) assert.notEqual(migrateCurrentReferenceAndTiming(prior),mutation);
});
