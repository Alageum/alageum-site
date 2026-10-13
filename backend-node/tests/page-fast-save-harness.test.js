"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pageDeliveryOptions, pageFixtureUrl, extractPageProbeEvidence, assertPageProbeAcceptance } = require("../scripts/page-test-guards");
const { seedTestPageAdmins } = require("../scripts/seed-test-page-admins");
const { UID, FIELDS } = require("../src/domain/pages");

const environment = (probe = false) => ({
  APP_ENV: "test", ALAGEUM_TEST_PAGE_FIXTURES: "1",
  DATABASE_URL: "postgresql://disposable@127.0.0.1:5432/alageum_strapi_pages_test",
  ...(probe ? { ALAGEUM_TEST_PAGE_FAST_SAVE: "1" } : {}),
});

function fixtureApp({ database = "alageum_strapi_pages_test", mode = "test", existing = false } = {}) {
  const roles = [], users = [], grants = [], reads = [];
  return {
    roles, users, grants, reads,
    config: { get: () => mode },
    db: { connection: { raw: async query => { reads.push(query); return { rows: [{ database }] }; } } },
    admin: { services: {
      metrics: { sendDidInviteUser: async () => {} },
      role: {
        create: async data => { const role = { ...data, id: roles.length + 1 }; roles.push(role); return role; },
        assignPermissions: async (id, permissions) => { grants.push({ id, permissions }); },
      },
      user: {
        exists: async () => existing || users.length > 0,
        create: async data => { const user = { ...data, id: users.length + 1 }; users.push(user); return user; },
      },
    } },
  };
}

test("default Page delivery options stay unchanged and probe requires both explicit opt-ins", () => {
  assert.deepEqual(pageDeliveryOptions([], environment()), { httpOnly: false, fastSaveProbe: false });
  assert.deepEqual(pageDeliveryOptions(["--http-only"], environment()), { httpOnly: true, fastSaveProbe: false });
  assert.deepEqual(pageDeliveryOptions(["--fast-save-probe"], environment(true)), { httpOnly: false, fastSaveProbe: true });
  for (const [argv, env] of [
    [["--fast-save-probe"], environment()],
    [[], environment(true)],
    [["--http-only"], environment(true)],
    [["--fast-save-probe", "--http-only"], environment(true)],
    [["--fast-save-probe"], { ...environment(true), ALAGEUM_TEST_PAGE_FAST_SAVE: "true" }],
    [["--fast-save-probe"], { ...environment(true), APP_ENV: "production" }],
    [["--http-only"], { ...environment(), CI: "1" }],
    [["--http-only", "--http-only"], environment()],
    [["--fast-save-probe", "--fast-save-probe"], environment(true)],
    [["--skip-existing"], environment(true)],
  ]) assert.throws(() => pageDeliveryOptions(argv, env));
});

test("Page fixture guard permits only the exact disposable loopback database in test mode", () => {
  assert.equal(pageFixtureUrl(environment()).pathname, "/alageum_strapi_pages_test");
  for (const patch of [
    { APP_ENV: "production" }, { APP_ENV: undefined }, { ALAGEUM_TEST_PAGE_FIXTURES: "0" },
    { DATABASE_URL: undefined }, { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "https://127.0.0.1/alageum_strapi_pages_test" },
    { DATABASE_URL: "postgresql://db.example/alageum_strapi_pages_test" },
    { DATABASE_URL: "postgresql://127.0.0.1/alageum_strapi_pages_test_extra" },
    { DATABASE_URL: "postgresql://127.0.0.1/alageum_strapi" },
    { DATABASE_URL: "postgresql://127.0.0.1/alageum_strapi_pages_test?host=db.example" },
    { DATABASE_URL: "postgresql://127.0.0.1/alageum_strapi_pages_test#override" },
  ]) assert.throws(() => pageFixtureUrl({ ...environment(), ...patch }));
});

test("fixture opt-in and environment errors stop before any Strapi database access or writes", async () => {
  for (const [options, env] of [
    [{ fastSaveProbe: true }, environment()],
    [{}, environment(true)],
    [{ fastSaveProbe: "true" }, environment(true)],
    [{ fastSaveProbe: true }, { ...environment(true), APP_ENV: "production" }],
    [{ fastSaveProbe: true }, { ...environment(true), DATABASE_URL: "postgresql://db.example/alageum_strapi_pages_test" }],
  ]) {
    const app = fixtureApp();
    await assert.rejects(seedTestPageAdmins(app, options, env));
    assert.equal(app.reads.length, 0);
    assert.equal(app.roles.length + app.users.length + app.grants.length, 0);
  }
});

test("Page fixtures refuse existing admins and mismatched runtime or connected database before writes", async () => {
  for (const options of [{ existing: true }, { database: "production" }, { mode: "production" }]) {
    const app = fixtureApp(options);
    await assert.rejects(seedTestPageAdmins(app, { fastSaveProbe: true }, environment(true)));
    assert.equal(app.roles.length + app.users.length + app.grants.length, 0);
  }
});

test("opt-in fixture adds only a dedicated native Page probe role and preserves existing role grants", async () => {
  const normal = fixtureApp(), probe = fixtureApp();
  const normalUsers = await seedTestPageAdmins(normal, {}, environment());
  const probeUsers = await seedTestPageAdmins(probe, { fastSaveProbe: true }, environment(true));
  assert.deepEqual(Object.keys(normalUsers), ["editor", "publisher", "denied"]);
  assert.deepEqual(Object.keys(probeUsers), ["editor", "publisher", "denied", "probe"]);
  assert.deepEqual(probe.roles.slice(0, 3), normal.roles);
  assert.deepEqual(probe.grants.slice(0, 3), normal.grants);
  assert.equal(probe.roles[3].code, "alageum-page-test-probe");
  assert.equal(probe.users[3].email, "page-probe@node-ci.example");
  assert.deepEqual(probe.users[3].roles, [probe.roles[3].id]);
  assert.ok(probe.users[3].isActive && !probe.users[3].blocked);
  assert.equal(probe.users[3].registrationToken, null);
  assert.deepEqual(probe.grants[3].permissions, ["read", "create", "update", "publish"].map(action => ({
    action: `plugin::content-manager.explorer.${action}`, subject: UID, conditions: [],
    properties: action === "publish" ? {} : { fields: FIELDS },
  })));
  assert.equal(new Set(Object.values(probeUsers).map(user => user.password)).size, 4);
  assert.ok(Object.values(probeUsers).every(user => /^Aa1![a-f0-9]{64}$/.test(user.password)));
});

test("probe fixture rejects a second seed without creating or widening any role", async () => {
  const app = fixtureApp();
  await seedTestPageAdmins(app, { fastSaveProbe: true }, environment(true));
  const before = JSON.stringify({ roles: app.roles, grants: app.grants, users: app.users });
  await assert.rejects(seedTestPageAdmins(app, { fastSaveProbe: true }, environment(true)), /fresh/);
  assert.equal(JSON.stringify({ roles: app.roles, grants: app.grants, users: app.users }), before);
});

const totals = () => ({ planned: 12, attempted: 12, passed: 12, failed: 0 });
const browserReport = evidence => ({
  stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 0 },
  suites: [{ suites: [{ specs: [{ tests: [{ results: [{ stdout: [{ text: `PAGE_FAST_SAVE_PROBE_EVIDENCE=${JSON.stringify(evidence)}\n` }] }] }] }] }] }],
});

function completeEvidence() {
  const attempts = ["body-title-create", "title-body-create", "immediate-body-edit"].flatMap(scenario =>
    ["pressSequentially", "contenteditable-fill"].flatMap(input => ["Save", "Publish"].map(button => ({ scenario, input, button }))));
  const report = { schemaVersion: 1, totals: totals(), debounceWindowMs: 300, timingAnchor: "latest-body-beforeinput-or-input", underDebounceWindow: { pointer: 12, click: 12 }, fastWindowCovered: true, attempts };
  for (const [index, attempt] of attempts.entries()) {
    const expected = { slug: `fast-save-${index}`, title: `Probe ${index}`, locale_code: "ru", body: [{ type: "paragraph", children: [{ type: "text", text: `Body ${index}` }] }] };
    const publish = attempt.button === "Publish";
    const publishedAt = publish ? "2026-10-03T12:00:00.000Z" : null;
    const method = attempt.button === "Save" && attempt.scenario === "immediate-body-edit" ? "PUT" : "POST";
    const atMs = 1000 * (index + 1), target = `${attempt.button.toLowerCase()}-action`;
    Object.assign(attempt, {
      kind: "attempt", number: index + 1, outcome: "passed", mismatches: [], expected,
      submitted: structuredClone(expected), response: { ...structuredClone(expected), documentId: `doc${index}`, publishedAt },
      writes: [{ method, submitted: structuredClone(expected) }],
      request: { method, status: attempt.button === "Save" && attempt.scenario !== "immediate-body-edit" ? 201 : 200 },
      reloaded: { method: "GET", status: 200, fields: { ...structuredClone(expected), documentId: `doc${index}`, publishedAt: null }, ui: { title: expected.title, slug: expected.slug, body: structuredClone(expected.body) } },
      public: {
        api: { method: "GET", status: publish ? 200 : 404, ...(publish ? { fields: { ...structuredClone(expected), publishedAt } } : {}) },
        page: { method: "GET", status: publish ? 200 : 404, ...(publish ? { fields: { title: expected.title, body: expected.body[0].children[0].text } } : {}) },
      },
      events: [{ type: "beforeinput", target: "body", atMs }, { type: "pointerdown", target, atMs: atMs + 50 }, { type: "click", target, atMs: atMs + 52 }],
      timings: { lastBodyInputAtMs: null, lastBodyBeforeInputAtMs: atMs, bodyEditTimingEventType: "beforeinput", bodyEditTimingAtMs: atMs, bodyBlurAtMs: atMs + 51, actionPointerAtMs: atMs + 50, actionClickAtMs: atMs + 52, inputToPointerMs: 50, inputToClickMs: 52 },
      withinDebounceWindow: { pointer: true, click: true },
    });
  }
  return report;
}

test("curated probe evidence is extracted from nested Playwright stdout without runnable harness imports", () => {
  const evidence = completeEvidence();
  const report = browserReport(evidence);
  assert.deepEqual(extractPageProbeEvidence(report), evidence);
  assertPageProbeAcceptance(report, evidence);
  assert.throws(() => extractPageProbeEvidence({ suites: [] }), /exactly one/);
  report.suites.push(...report.suites);
  assert.throws(() => extractPageProbeEvidence(report), /exactly one/);
  const malformed = browserReport(evidence);
  malformed.suites[0].suites[0].specs[0].tests[0].results[0].stdout[0].text = "PAGE_FAST_SAVE_PROBE_EVIDENCE={invalid}\n";
  assert.throws(() => extractPageProbeEvidence(malformed), SyntaxError);
});

test("probe acceptance rejects incomplete, failed, skipped or flaky browser/attempt evidence", () => {
  const evidence = completeEvidence();
  for (const stats of [
    { expected: 0 }, { expected: 2 }, { unexpected: 1 }, { skipped: 1 }, { flaky: 1 }, { skipped: undefined },
  ]) {
    const report = browserReport(evidence);
    Object.assign(report.stats, stats);
    assert.throws(() => assertPageProbeAcceptance(report, evidence));
  }
  for (const patch of [
    { planned: 11 }, { attempted: 11 }, { passed: 11 }, { failed: 1 }, { attempted: 13 }, { passed: undefined },
  ]) assert.throws(() => assertPageProbeAcceptance(browserReport(evidence), { ...evidence, totals: { ...totals(), ...patch } }));
});

test("probe acceptance rejects absent, duplicate and wrong matrix records despite passing totals", () => {
  for (const mutate of [
    evidence => { evidence.attempts = []; },
    evidence => { evidence.attempts.pop(); },
    evidence => { evidence.attempts[11] = structuredClone(evidence.attempts[0]); },
    evidence => { evidence.attempts[0].scenario = "unmeasured-scenario"; },
    evidence => { evidence.attempts[0].input = "scripted-value"; },
    evidence => { evidence.attempts[0].button = "Save again"; },
  ]) {
    const evidence = completeEvidence(); mutate(evidence);
    assert.throws(() => assertPageProbeAcceptance(browserReport(evidence), evidence), /twelve attempts|matrix tuple/);
  }
});

test("probe acceptance independently verifies content and outcomes, never just their summary", () => {
  for (const mutate of [
    attempt => { attempt.outcome = "failed"; },
    attempt => { attempt.mismatches.push("submitted.content"); },
    attempt => { delete attempt.submitted; },
    attempt => { attempt.submitted.body = null; },
    attempt => { attempt.response.title = "Different saved title"; },
    attempt => { attempt.reloaded.fields.body = []; },
    attempt => { attempt.reloaded.ui.body = []; },
    attempt => { attempt.writes.push(structuredClone(attempt.writes[0])); },
    attempt => { attempt.request.status = 500; },
    attempt => { attempt.public.page.status = 200; },
    attempt => { delete attempt.public; },
  ]) {
    const evidence = completeEvidence(); mutate(evidence.attempts[0]);
    assert.throws(() => assertPageProbeAcceptance(browserReport(evidence), evidence));
  }
  const published = completeEvidence(); published.attempts[1].public.api.fields.body = null;
  assert.throws(() => assertPageProbeAcceptance(browserReport(published), published));
});

test("probe acceptance requires observed finite timing while permitting truthful slower coverage", () => {
  for (const mutate of [
    attempt => { attempt.timings.inputToClickMs = null; },
    attempt => { attempt.timings.inputToPointerMs = -1; },
    attempt => { attempt.timings.actionClickAtMs = Infinity; },
    attempt => { attempt.timings.bodyEditTimingAtMs = NaN; },
    attempt => { attempt.timings.inputToClickMs++; },
    attempt => { attempt.events = []; },
    attempt => { attempt.withinDebounceWindow.click = false; },
  ]) {
    const evidence = completeEvidence(); mutate(evidence.attempts[0]);
    assert.throws(() => assertPageProbeAcceptance(browserReport(evidence), evidence));
  }
  const slower = completeEvidence(), attempt = slower.attempts[0];
  attempt.timings.inputToClickMs = 350;
  attempt.timings.actionClickAtMs = attempt.timings.bodyEditTimingAtMs + 350;
  attempt.events[2].atMs = attempt.timings.actionClickAtMs;
  attempt.withinDebounceWindow.click = false;
  slower.underDebounceWindow.click = 11;
  slower.fastWindowCovered = false;
  assertPageProbeAcceptance(browserReport(slower), slower);
  slower.fastWindowCovered = true;
  assert.throws(() => assertPageProbeAcceptance(browserReport(slower), slower), /separately and truthfully/);
});
