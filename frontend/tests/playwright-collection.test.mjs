import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlaywrightCollection } from './helpers/playwright-collection.mjs';
const report = () => ({ errors: [], suites: [{ title: 'current.spec.js', specs: [{ file: 'current.spec.js', title: 'original case', tests: [{ projectName: 'desktop' }] }, { file: 'current.spec.js', title: 'new route case', tests: [{ projectName: 'desktop' }] }] }] });
test('semantic discovery accepts expanded scenario coverage without changing a magic count', () => {
  assert.equal(assertPlaywrightCollection(report(), ['current.spec.js'], ['desktop']).length, 2);
});
test('missing specs/projects, dedicated leakage, empty discovery and duplicate cases fail', () => {
  assert.throws(() => assertPlaywrightCollection(report(), ['current.spec.js', 'missing.spec.js'], ['desktop']));
  assert.throws(() => assertPlaywrightCollection(report(), ['current.spec.js'], ['desktop', 'mobile']));
  assert.throws(() => assertPlaywrightCollection(report(), [], ['desktop']));
  assert.throws(() => assertPlaywrightCollection({ errors: [], suites: [] }, ['current.spec.js'], ['desktop']));
  const duplicate = report(); duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.throws(() => assertPlaywrightCollection(duplicate, ['current.spec.js'], ['desktop']));
});
