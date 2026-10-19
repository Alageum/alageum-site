import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const browser = ['login through UI', 'RFQ and ticket creation through UI', 'persisted legacy bearer cannot restore a browser session even with an existing cookie'];
const legacy = ['foreign order and document are hidden', 'AI read isolation and scoped write confirmation'];
function run(mode, titles, modify = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'security-discovery-'));
  try {
    const data = { errors: [], stats: { expected: titles.length, unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ specs: titles.map((title, index) => ({ title, tests: [{ projectName: index < 14 ? 'quotes-desktop' : 'quotes-mobile', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0 }] }] })) }] };
    modify(data);
    const file = join(directory, 'cases.json'); writeFileSync(file, JSON.stringify(data));
    return spawnSync(process.execPath, ['scripts/check-security-fixture-discovery.mjs', ...(mode ? [mode] : []), file], { encoding: 'utf8' }).status;
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('workflow preserves all five assertions across exact three-browser and two-legacy partitions', () => {
  assert.equal(run(null, [...browser, ...legacy]), 0);
  assert.equal(run('--browser-results', browser), 0);
  assert.equal(run('--legacy-results', legacy), 0);
});
test('workflow rejects omitted, extra, skipped, retried or failed partitioned assertions', () => {
  assert.notEqual(run(null, [...browser, ...legacy.slice(0, 1)]), 0);
  assert.notEqual(run('--browser-results', [...browser, legacy[0]]), 0);
  for (const status of ['failed', 'skipped', 'timedOut']) assert.notEqual(run('--legacy-results', legacy, data => { data.suites[0].specs[0].tests[0].results[0].status = status; }), 0);
  assert.notEqual(run('--browser-results', browser, data => { data.suites[0].specs[0].tests[0].results[0].retry = 1; }), 0);
});
test('quote discovery requires all fourteen scenarios on both desktop and mobile', () => {
  const titles = Array.from({ length: 14 }, (_, i) => `quote-${i}`);
  assert.equal(run('--quotes', [...titles, ...titles]), 0);
  assert.notEqual(run('--quotes', [...titles, ...titles.slice(1)]), 0);
});
