"use strict";

// Pure guards shared by disposable Page fixtures and their delivery harness.
// Importing these helpers never starts Strapi, PostgreSQL or a browser.
const assert = require("node:assert/strict");
const PROBE_EVIDENCE_PREFIX = "PAGE_FAST_SAVE_PROBE_EVIDENCE=";

function validatePageProbeOptIn(fastSaveProbe, env = process.env) {
  assert.equal(typeof fastSaveProbe, "boolean", "Page fast-save probe option must be explicit");
  assert.equal(fastSaveProbe, env.ALAGEUM_TEST_PAGE_FAST_SAVE === "1", "--fast-save-probe and ALAGEUM_TEST_PAGE_FAST_SAVE=1 must be enabled together");
  if (fastSaveProbe) assert.equal(env.APP_ENV, "test", "Page fast-save probe requires APP_ENV=test");
}

function pageDeliveryOptions(argv, env = process.env) {
  assert.deepEqual(argv.filter(value => !["--http-only", "--fast-save-probe"].includes(value)), [], "Unknown Page harness option");
  assert.equal(new Set(argv).size, argv.length, "Duplicate Page harness option");
  const httpOnly = argv.includes("--http-only");
  const fastSaveProbe = argv.includes("--fast-save-probe");
  assert.ok(!(httpOnly && fastSaveProbe), "--fast-save-probe cannot be combined with --http-only");
  assert.ok(!httpOnly || !env.CI, "CI must execute the native browser suite; --http-only is local-only");
  validatePageProbeOptIn(fastSaveProbe, env);
  return { httpOnly, fastSaveProbe };
}

function pageFixtureUrl(env = process.env) {
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { /* Reject malformed URLs without echoing credentials. */ }
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol) || env.APP_ENV !== "test" || env.ALAGEUM_TEST_PAGE_FIXTURES !== "1" || !["localhost", "127.0.0.1"].includes(url.hostname) || decodeURIComponent(url.pathname) !== "/alageum_strapi_pages_test" || url.search || url.hash) {
    throw new Error("Page fixtures require the dedicated loopback alageum_strapi_pages_test database and explicit test opt-in");
  }
  return url;
}

function extractPageProbeEvidence(browserReport) {
  const entries = [];
  function visit(suites) {
    for (const suite of suites || []) {
      for (const spec of suite.specs || []) for (const test of spec.tests || []) for (const result of test.results || []) {
        const stdout = (result.stdout || []).map(item => item.text || "").join("");
        for (const line of stdout.split(/\r?\n/)) if (line.startsWith(PROBE_EVIDENCE_PREFIX)) entries.push(line.slice(PROBE_EVIDENCE_PREFIX.length));
      }
      visit(suite.suites);
    }
  }
  visit(browserReport.suites);
  assert.equal(entries.length, 1, "Probe browser must emit exactly one curated evidence record");
  return JSON.parse(entries[0]);
}

function assertPageProbeAcceptance(browserReport, probeEvidence) {
  assert.equal(browserReport.stats?.expected, 1, "The one bounded Page probe browser case must pass");
  for (const key of ["unexpected", "skipped", "flaky"]) assert.equal(browserReport.stats?.[key], 0, `Probe browser ${key} must be zero`);
  assert.deepEqual(probeEvidence.totals, { planned: 12, attempted: 12, passed: 12, failed: 0 }, "All twelve Page fast-save attempts must pass");
  assert.equal(probeEvidence.schemaVersion, 1);
  assert.equal(probeEvidence.debounceWindowMs, 300);
  assert.equal(probeEvidence.timingAnchor, "latest-body-beforeinput-or-input");
  assert.ok(Array.isArray(probeEvidence.attempts), "Probe must retain per-attempt evidence");
  assert.equal(probeEvidence.attempts.length, 12, "Probe must retain exactly twelve attempts");
  const matrix = ["body-title-create", "title-body-create", "immediate-body-edit"].flatMap(scenario =>
    ["pressSequentially", "contenteditable-fill"].flatMap(input => ["Save", "Publish"].map(button => `${scenario}|${input}|${button}`)));
  assert.deepEqual(probeEvidence.attempts.map(({ scenario, input, button }) => `${scenario}|${input}|${button}`).sort(), matrix.sort(), "Probe evidence must cover each matrix tuple exactly once");
  const contentFields = ["slug", "title", "locale_code", "body"];
  const content = value => Object.fromEntries(contentFields.map(key => [key, value?.[key]]));
  const finite = (value, label) => assert.ok(Number.isFinite(value) && value >= 0, `${label} must be a finite nonnegative observation`);
  const coverage = { pointer: 0, click: 0 };
  for (const attempt of probeEvidence.attempts) {
    assert.equal(attempt.kind, "attempt");
    assert.equal(attempt.outcome, "passed", "Every measured attempt must pass");
    assert.deepEqual(attempt.mismatches, [], "No measured content mismatch may be hidden by totals");
    assert.deepEqual(Object.keys(attempt.expected || {}).sort(), [...contentFields].sort(), "Expected Page content must retain every measured field");
    for (const value of [attempt.submitted, attempt.response, attempt.reloaded?.fields]) assert.deepEqual(content(value), attempt.expected, "Submitted, response and reloaded Page content must match the entered fixture");
    assert.ok(Array.isArray(attempt.writes));
    assert.equal(attempt.writes.length, 1, "Each attempt must retain exactly one native write");
    assert.deepEqual(content(attempt.writes[0].submitted), attempt.expected);
    const method = attempt.button === "Save" && attempt.scenario === "immediate-body-edit" ? "PUT" : "POST";
    assert.equal(attempt.request?.method, method);
    assert.equal(attempt.writes[0].method, method);
    assert.equal(attempt.request.status, attempt.button === "Save" && attempt.scenario !== "immediate-body-edit" ? 201 : 200);
    assert.equal(attempt.reloaded?.status, 200);
    assert.equal(attempt.reloaded?.method, "GET");
    assert.match(attempt.response.documentId, /^[a-z0-9]+$/);
    assert.equal(attempt.reloaded.fields.documentId, attempt.response.documentId);
    assert.equal(attempt.reloaded.fields.publishedAt, null, "Reloaded evidence must be the native draft");
    assert.deepEqual(attempt.reloaded.ui, { title: attempt.expected.title, slug: attempt.expected.slug, body: attempt.expected.body }, "Native reloaded UI must show exact entered content");
    const publicStatus = attempt.button === "Publish" ? 200 : 404;
    for (const surface of ["api", "page"]) {
      assert.equal(attempt.public?.[surface]?.method, "GET");
      assert.equal(attempt.public[surface].status, publicStatus, "Public evidence must match the selected publication action");
    }
    if (attempt.button === "Publish") {
      assert.ok(Number.isFinite(Date.parse(attempt.response.publishedAt)), "Published response must include its timestamp");
      assert.deepEqual(content(attempt.public.api.fields), attempt.expected);
      assert.equal(attempt.public.api.fields.publishedAt, attempt.response.publishedAt);
      assert.deepEqual(attempt.public.page.fields, { title: attempt.expected.title, body: attempt.expected.body[0].children[0].text });
    } else assert.equal(attempt.response.publishedAt, null);
    const timing = attempt.timings;
    assert.ok(timing && Array.isArray(attempt.events), "Real passive event evidence is required");
    assert.ok(["beforeinput", "input"].includes(timing.bodyEditTimingEventType));
    for (const key of ["bodyEditTimingAtMs", "actionPointerAtMs", "actionClickAtMs", "inputToPointerMs", "inputToClickMs"]) finite(timing[key], key);
    for (const key of ["lastBodyInputAtMs", "lastBodyBeforeInputAtMs", "bodyBlurAtMs"]) if (timing[key] !== null) finite(timing[key], key);
    const lastEdit = attempt.events.filter(event => event.target === "body" && ["beforeinput", "input"].includes(event.type)).at(-1);
    const actionTarget = `${attempt.button.toLowerCase()}-action`;
    const pointer = attempt.events.find(event => event.type === "pointerdown" && event.target === actionTarget);
    const click = attempt.events.find(event => event.type === "click" && event.target === actionTarget);
    assert.equal(lastEdit?.type, timing.bodyEditTimingEventType);
    assert.equal(lastEdit?.atMs, timing.bodyEditTimingAtMs);
    assert.equal(pointer?.atMs, timing.actionPointerAtMs);
    assert.equal(click?.atMs, timing.actionClickAtMs);
    assert.equal(timing.inputToPointerMs, timing.actionPointerAtMs - timing.bodyEditTimingAtMs);
    assert.equal(timing.inputToClickMs, timing.actionClickAtMs - timing.bodyEditTimingAtMs);
    const within = { pointer: timing.inputToPointerMs < 300, click: timing.inputToClickMs < 300 };
    assert.deepEqual(attempt.withinDebounceWindow, within, "Window classification must reflect the actual event deltas");
    for (const key of ["pointer", "click"]) if (within[key]) coverage[key]++;
  }
  assert.deepEqual(probeEvidence.underDebounceWindow, coverage, "Coverage counts must reflect the measured attempts");
  assert.equal(probeEvidence.fastWindowCovered, coverage.click === 12, "Fast-window coverage must be reported separately and truthfully");
}

module.exports = { validatePageProbeOptIn, pageDeliveryOptions, pageFixtureUrl, extractPageProbeEvidence, assertPageProbeAcceptance };
