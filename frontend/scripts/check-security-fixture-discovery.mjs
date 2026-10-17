import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const mode = process.argv[2]?.startsWith('--') ? process.argv[2] : '--discovery';
assert.ok(['--discovery', '--quotes', '--browser-results', '--legacy-results'].includes(mode));
const quoteMode = mode === '--quotes';
const completed = mode.endsWith('-results');
const file = process.argv[mode === '--discovery' ? 2 : 3];
assert.ok(file, 'A Playwright --list --reporter=json result is required');
const report = JSON.parse(readFileSync(file, 'utf8'));
const flatten = suites => suites.flatMap(suite => [
  ...(suite.specs || []).flatMap(spec => (spec.tests || []).map(test => ({ title: spec.title, test }))),
  ...flatten(suite.suites || []),
]);
const cases = flatten(report.suites);
assert.equal(report.errors?.length || 0, 0);
assert.ok(cases.every(({ test }) => test.expectedStatus === 'passed'), 'No skipped or expected-failing assertions');
if (quoteMode) {
  assert.equal(cases.length, 28, 'All fourteen quote scenarios must run on desktop and mobile');
  assert.equal(new Set(cases.map(item => item.title)).size, 14);
  for (const project of ['quotes-desktop', 'quotes-mobile']) {
    const subset = cases.filter(({ test }) => test.projectName === project);
    assert.equal(subset.length, 14);
    assert.equal(new Set(subset.map(item => item.title)).size, 14);
  }
} else {
  const browser = ['login through UI', 'RFQ and ticket creation through UI', 'persisted legacy bearer cannot restore a browser session even with an existing cookie'];
  const legacy = ['foreign order and document are hidden', 'AI read isolation and scoped write confirmation'];
  const expected = mode === '--browser-results' ? browser : mode === '--legacy-results' ? legacy : [...browser, ...legacy];
  assert.deepEqual(cases.map(item => item.title).sort(), [...expected].sort());
  if (completed) {
    assert.ok(cases.every(({ test }) => test.status === 'expected' && test.results.length === 1 && test.results[0].status === 'passed' && test.results[0].retry === 0), 'Every partitioned assertion must pass once without retry');
    assert.equal(report.stats.expected, expected.length);
    for (const key of ['unexpected', 'skipped', 'flaky']) assert.equal(report.stats[key], 0);
  }
}
console.log(`Verified ${cases.length} declared ${quoteMode ? 'quote' : 'security'} cases without dropping assertions.`);
