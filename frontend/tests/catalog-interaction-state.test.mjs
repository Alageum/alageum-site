import assert from 'node:assert/strict';
import test from 'node:test';
import { parseComparison, reconcileComparisonDraft } from '../lib/catalog/query.js';
const products = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
test('checkbox draft is immediately visible before URL acknowledgement', () => {
 const optimistic = { query: '', ids: ['a'] };
 assert.equal(reconcileComparisonDraft('', optimistic), optimistic);
 assert.deepEqual(parseComparison(reconcileComparisonDraft('', optimistic).ids.join(','), products), ['a']);
 assert.deepEqual(reconcileComparisonDraft('a', optimistic), { query: 'a', ids: ['a'] });
});
test('Back and Forward replace the optimistic selection with their URL selection', () => {
 const current = { query: 'a,b', ids: ['a', 'b'] };
 const back = reconcileComparisonDraft('a', current);
 assert.deepEqual(back.ids, ['a']);
 assert.deepEqual(reconcileComparisonDraft('a,b', back).ids, ['a', 'b']);
 assert.deepEqual(parseComparison(reconcileComparisonDraft('', back).ids.join(','), products), []);
});
test('late API products resolve bookmarked comparison IDs without dropping identity', () => {
 const draft = reconcileComparisonDraft('a,b');
 assert.deepEqual(parseComparison(draft.ids.join(','), []), []);
 assert.deepEqual(parseComparison(reconcileComparisonDraft('a,b', draft).ids.join(','), products), ['a', 'b']);
});
test('URL and draft values remain bounded by valid current products', () => {
 const draft = { query: 'a', ids: ['unknown','a','a','b','c','d','e'] };
 assert.deepEqual(parseComparison(reconcileComparisonDraft('a', draft).ids.join(','), products), ['a','b','c','d']);
});
