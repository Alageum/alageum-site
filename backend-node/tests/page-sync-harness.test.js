"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SCENARIOS, extractPageSyncEvidence, assertPageSyncAcceptance } = require("../scripts/page-sync-guards");

function passed() {
  const evidence = { schemaVersion: 1, totals: { planned: 7, attempted: 7, passed: 7, failed: 0 },
    scenarios: SCENARIOS.map((id, index) => ({ id, outcome: "passed", mismatches: [], writeCount: [1, 1, 1, 9, 0, 0, 2][index] })),
    writes: [["POST", "save", 201], ["POST", "publish", 200], ["PUT", "save", 200], ["POST", "publish", 200],
      ...Array.from({ length: 8 }, () => ["POST", "publish", 200]),
      ["PUT", "save", 200], ["POST", "discard", 200]].map(([method, action, status]) => ({ method, action, status })) };
  evidence.scenarios[3].operations = ["measured",
    ...Array.from({ length: 4 }, (_, index) => [`repeat-${index + 1}-restore`, `repeat-${index + 1}-clear`]).flat()].map(purpose => {
    const expected = { slug: "synthetic-test", title: "Synthetic test", locale_code: "ru",
      body: purpose.endsWith("-restore") ? [{ type: "paragraph", children: [{ type: "text", text: purpose }] }] : null };
    return { purpose, method: "POST", kind: "publish", status: 200, expected,
      submitted: structuredClone(expected), response: structuredClone(expected),
      timing: { withinDebounceWindow: true, inputToActionMs: 8 } };
  });
  const result = { status: "passed", retry: 0, stdout: [{ text: `PAGE_SYNC_REGRESSION_EVIDENCE=${JSON.stringify(evidence)}\n` }] };
  const report = { stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 }, suites: [{ suites: [{ specs: [{ tests: [{ expectedStatus: "passed", results: [result] }] }] }] }] };
  return { evidence, report, result };
}

test("Page lifecycle evidence is extracted once from nested, already-redacted browser output", () => {
  const { evidence, report, result } = passed();
  assert.deepEqual(extractPageSyncEvidence(report), evidence);
  assert.doesNotThrow(() => assertPageSyncAcceptance(report, evidence));
  result.stdout.push(result.stdout[0]);
  assert.throws(() => extractPageSyncEvidence(report), /one curated evidence/);
  result.stdout = [];
  assert.throws(() => extractPageSyncEvidence(report), /one curated evidence/);
});

test("Page lifecycle acceptance refuses retries, missing scenarios, hidden mismatches, and extra writes", () => {
  const mutations = [
    ({ report }) => { report.stats.skipped = 1; },
    ({ report }) => { report.stats.expected = 0; },
    ({ result }) => { result.retry = 1; },
    ({ result }) => { result.status = "failed"; },
    ({ report, result }) => { report.suites[0].suites[0].specs[0].tests[0].results.push(result); },
    ({ evidence }) => { evidence.scenarios.pop(); },
    ({ evidence }) => { evidence.scenarios[1].id = evidence.scenarios[0].id; },
    ({ evidence }) => { evidence.scenarios[0].outcome = "failed"; },
    ({ evidence }) => { evidence.scenarios[0].mismatches.push("lost body"); },
    ({ evidence }) => { evidence.writes.push({}); },
    ({ evidence }) => { evidence.scenarios[3].operations.pop(); },
    ({ evidence }) => { evidence.scenarios[3].operations[2].purpose = "repeat-1-restore"; },
    ({ evidence }) => { evidence.scenarios[3].operations[2].submitted.body = [{ type: "paragraph", children: [{ type: "text", text: "stale" }] }]; },
    ({ evidence }) => { evidence.scenarios[3].operations[2].response.body = []; },
    ({ evidence }) => { evidence.scenarios[3].operations[2].timing.inputToActionMs = 300; },
    ({ evidence }) => { evidence.scenarios[3].operations[2].timing.withinDebounceWindow = false; },
    ({ evidence }) => { evidence.scenarios[3].operations[2].status = 201; },
    ({ evidence }) => { const operation = evidence.scenarios[3].operations[1];
      operation.expected.body = operation.submitted.body = operation.response.body = null; },
  ];
  for (const mutate of mutations) {
    const fixture = passed(); mutate(fixture);
    assert.throws(() => assertPageSyncAcceptance(fixture.report, fixture.evidence));
  }
});
