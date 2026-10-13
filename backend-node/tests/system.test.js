"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { createMetrics, formatTimestamp, createSystem, jsonInteger } = require("../src/domain/system");
const { version: packageVersion } = require("../package.json");
const fixture = JSON.parse(readFileSync(path.join(__dirname, "reference/legacy-system.json"), "utf8"), (key, value, context) =>
  typeof value === "number" && !Number.isSafeInteger(value) && /^\d+$/.test(context.source) ? JSON.rawJSON(context.source) : value);
const instant = new Date("2026-10-03T12:34:56.123Z");

test("system reference verifies frozen sources, pinned packages, and a narrow execution scope", () => {
  assert.equal(fixture.evidence, "system DTO/metrics reference; not full legacy endpoint execution");
  assert.equal(fixture.source_revision, "74b92855d1dcc2997c471823f83686ac66972649");
  assert.equal(fixture.python_requirement, ">=3.12");
  assert.deepEqual(fixture.runtime_versions, { fastapi: "0.141.1", starlette: "1.6.0", pydantic: "2.13.4", "pydantic-core": "2.46.4", httpx: "0.28.1" });
  for (const [file, digest] of Object.entries(fixture.source_sha256)) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(__dirname, "../..", file))).digest("hex"), digest, `Frozen source changed: ${file}`);
  }
});

for (const vector of fixture.timestamp_cases) test(`Pydantic UTC timestamp shape: ${vector.input}`, () => {
  assert.equal(formatTimestamp(new Date(vector.input)), vector.expected);
});

test("timestamp rejects an invalid clock value instead of inventing a timestamp", () => {
  assert.throws(() => formatTimestamp(new Date(NaN)), RangeError);
});

for (const vector of fixture.dto_cases) test(`system ${vector.kind} returns only its frozen DTO allowlist`, async () => {
  const calls = [];
  const options = {
    db: { raw: async (...args) => { calls.push(args); return { ...vector.ignored_extras, rows: [{ secret: "fixture-secret" }] }; } },
    metrics: createMetrics(), environment: "test", now: () => new Date(vector.input_timestamp),
    ...vector.ignored_extras,
    get settings() { throw new Error("Whole settings must never be read"); },
  };
  const service = createSystem(options);
  const ctx = {
    status: 418, body: { ...vector.ignored_extras },
    query: { ...vector.ignored_extras }, params: { ...vector.ignored_extras },
    state: { user: { id: "fixture-user", ...vector.ignored_extras } },
    headers: { authorization: "fixture-token", "x-organization-id": "fixture-tenant" },
  };
  await service[vector.kind](ctx);
  const expected = vector.kind === "version" ? { ...vector.expected, version: packageVersion } : vector.expected;
  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, expected);
  assert.deepEqual(Object.keys(ctx.body), vector.field_allowlist);
  assert.deepEqual(calls, vector.kind === "readiness" ? [["SELECT 1"]] : []);
  assert.doesNotMatch(JSON.stringify(ctx.body), /fixture-secret|fixture-token|fixture-user|fixture-tenant|password|database_url|APP_VERSION|migration|backend/);
});

test("health is a fresh wallclock read with no database access or metric mutation", () => {
  let ticks = 0;
  const metrics = createMetrics();
  const service = createSystem({
    db: { get raw() { throw new Error("Health must not acquire the database"); } },
    metrics, environment: "test", now: () => new Date(instant.getTime() + ticks++),
  });
  const first = {}, second = {};
  service.health(first);
  service.health(second);
  assert.deepEqual(first.body, { status: "ok", timestamp: "2026-10-03T12:34:56.123000Z" });
  assert.deepEqual(second.body, { status: "ok", timestamp: "2026-10-03T12:34:56.124000Z" });
  assert.equal(ticks, 2);
  assert.deepEqual(metrics.snapshot(), {});
});

test("readiness awaits exactly SELECT 1 before reading its wallclock", async () => {
  let release;
  const events = [];
  const pending = new Promise(resolve => { release = resolve; });
  const metrics = createMetrics();
  const service = createSystem({
    db: { raw: (...args) => { events.push(args); return pending; } }, metrics, environment: "test",
    now: () => { events.push("clock"); return instant; },
  });
  const ctx = {};
  const response = service.readiness(ctx);
  assert.deepEqual(events, [["SELECT 1"]]);
  assert.deepEqual(ctx, {});
  release({ rows: [{ "?column?": 0, password: "fixture-secret" }] });
  await response;
  assert.deepEqual(events, [["SELECT 1"], "clock"]);
  assert.deepEqual(ctx, { status: 200, body: { status: "ok", timestamp: "2026-10-03T12:34:56.123000Z", database: "ok" } });
  assert.deepEqual(metrics.snapshot(), {});
});

test("readiness propagates rejection untouched for the existing safe-500 middleware", async () => {
  const failure = new Error("fixture-password and database internals");
  let clockReads = 0;
  const service = createSystem({
    db: { raw: async () => { throw failure; } }, metrics: createMetrics(), environment: "test",
    now: () => { clockReads++; return instant; },
  });
  const ctx = {};
  await assert.rejects(service.readiness(ctx), error => error === failure);
  assert.deepEqual(ctx, {});
  assert.equal(clockReads, 0);
});

test("version captures immutable public metadata and ignores arbitrary environment settings", t => {
  const poisoned = { APP_NAME: "fixture-secret-name", APP_VERSION: "fixture-secret-version", APP_ENV: "production", NODE_ENV: "production", DATABASE_URL: "fixture-secret-database", ALAGEUM_JWT_SECRET: "fixture-secret-token" };
  const saved = Object.fromEntries(Object.keys(poisoned).map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, poisoned);
  for (const environment of ["test", "development"]) {
    const options = { db: {}, metrics: createMetrics(), environment, now: () => { throw new Error("Version must not use the clock"); }, name: "spoof", version: "spoof", settings: poisoned };
    const service = createSystem(options);
    options.environment = "production";
    const ctx = {};
    service.version(ctx);
    assert.deepEqual(ctx, { status: 200, body: { name: "ALAGEUM API", version: packageVersion, environment } });
    assert.ok(Object.isFrozen(ctx.body));
    assert.throws(() => { ctx.body.version = "spoofed"; }, TypeError);
    assert.doesNotMatch(JSON.stringify(ctx.body), /fixture|DATABASE_URL|NODE_ENV|APP_|jwt|secret/);
    const again = {};
    service.version(again);
    assert.deepEqual(again.body, { name: "ALAGEUM API", version: packageVersion, environment });
  }
});

test("system cannot introduce a public version environment outside the existing guard", () => {
  for (const environment of [undefined, null, "", "production", "staging", "TEST", 0, {}, ["test"]]) {
    assert.throws(() => createSystem({ db: {}, metrics: createMetrics(), environment }), /guarded test\/development/);
  }
});

test("metrics starts empty, snapshots itself before completion, and resets only by new instance", () => {
  const metrics = createMetrics();
  const service = createSystem({ db: {}, metrics, environment: "test" });
  assert.deepEqual(Object.keys(metrics).sort(), ["recordHttp", "snapshot"]);
  const ctx = { query: { reset: "true", label: "fixture-secret" }, body: { secret: "fixture-secret" } };
  service.metrics(ctx);
  assert.deepEqual(ctx, { query: { reset: "true", label: "fixture-secret" }, status: 200, body: {} });
  metrics.recordHttp(200, 0.1);
  assert.deepEqual(ctx.body, {});
  const second = {};
  service.metrics(second);
  assert.deepEqual(second.body, { http_request_duration_seconds_count: 1, http_request_duration_seconds_sum: 0.1, http_requests_total: 1 });
  metrics.recordHttp(200, 0.2);
  assert.equal(second.body.http_requests_total, 1);
  assert.equal(metrics.snapshot().http_requests_total, 2);
  assert.deepEqual(createMetrics().snapshot(), {});
  assert.equal(metrics.snapshot().http_requests_total, 2);
});

test("metric snapshots are detached, sorted, fixed-name objects with no fabricated domain keys", () => {
  const metrics = createMetrics();
  metrics.recordHttp(500, 1, { name: "password", route: "fixture-private-path", organization_id: "fixture-tenant" });
  const snapshot = metrics.snapshot();
  const fields = ["http_errors_total", "http_request_duration_seconds_count", "http_request_duration_seconds_sum", "http_requests_total"];
  assert.deepEqual(Object.keys(snapshot), fields);
  snapshot.http_requests_total = -1;
  snapshot.ai_requests_total = 123;
  snapshot.secret = "fixture-secret";
  assert.deepEqual(metrics.snapshot(), { http_errors_total: 1, http_request_duration_seconds_count: 1, http_request_duration_seconds_sum: 1, http_requests_total: 1 });
  assert.deepEqual(Object.keys(metrics.snapshot()), fields);
  assert.doesNotMatch(JSON.stringify(metrics.snapshot()), /fixture|ai_|file_|integration_|label|route|user|tenant|password|secret/);
});

test("HTTP completion counters, error threshold, and unrounded accumulation match Python", () => {
  const metrics = createMetrics();
  for (const step of fixture.metric_steps) {
    assert.deepEqual(metrics.snapshot(), step.before);
    metrics.recordHttp(step.status, step.duration_seconds);
    assert.deepEqual(metrics.snapshot(), step.after);
  }
});

for (const vector of fixture.rounding_cases) test(`Python six-place binary64 rounding: ${vector.id}`, () => {
  const metrics = createMetrics();
  for (const sample of vector.samples) metrics.recordHttp(200, sample);
  assert.deepEqual(metrics.snapshot(), vector.expected);
});

for (const vector of fixture.integer_cases) test(`Python exact JSON counters beyond safe Number: ${vector.seed}`, () => {
  // Test the actual serializer used by snapshot directly; never add a public
  // seed/reset mechanism or claim to have processed quadrillions of requests.
  const integer = BigInt(vector.seed) + 1n;
  const actual = jsonInteger(integer);
  for (const key of ["http_requests_total", "http_errors_total", "http_request_duration_seconds_count"]) {
    assert.equal(JSON.stringify(actual), JSON.stringify(vector.expected[key]));
  }
  assert.equal(JSON.stringify({ count: actual }), `{"count":${integer}}`);
  assert.ok(JSON.isRawJSON(actual));
});

test("safe integer serializer retains numeric JSON values across the safe boundary", () => {
  for (const value of [0n, 1n, BigInt(Number.MAX_SAFE_INTEGER)]) {
    assert.equal(jsonInteger(value), Number(value));
    assert.equal(JSON.stringify(jsonInteger(value)), value.toString());
  }
});

test("invalid, negative, and overflowing durations are omitted without fabricating samples", () => {
  const metrics = createMetrics();
  const invalid = [NaN, Infinity, -Infinity, -1, undefined, null, "1", {}, [], 1n];
  for (const value of invalid) metrics.recordHttp(500, value);
  assert.deepEqual(metrics.snapshot(), { http_errors_total: invalid.length, http_requests_total: invalid.length });
  metrics.recordHttp(200, Number.MAX_VALUE);
  metrics.recordHttp(400, Number.MAX_VALUE);
  assert.deepEqual(metrics.snapshot(), {
    http_errors_total: invalid.length + 1,
    http_request_duration_seconds_count: 1,
    http_request_duration_seconds_sum: Number.MAX_VALUE,
    http_requests_total: invalid.length + 2,
  });
  assert.doesNotMatch(JSON.stringify(metrics.snapshot()), /null|NaN|Infinity/);
  metrics.recordHttp(200, 0);
  assert.equal(metrics.snapshot().http_request_duration_seconds_count, 2);
});
