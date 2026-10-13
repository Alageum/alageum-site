"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const factory = require("../src/middlewares/compat-metrics");
const { createMetrics } = require("../src/domain/system");

test("HTTP metrics surround compatibility errors and require one application recorder", () => {
  const names = require("../config/middlewares")({ env: { array: (_name, value) => value } });
  assert.ok(names.indexOf("strapi::errors") < names.indexOf("global::compat-metrics"));
  assert.ok(names.indexOf("global::compat-metrics") < names.indexOf("global::compat-errors"));
  assert.throws(() => factory({}, { strapi: {} }), /must be registered/);
});

test("compatibility response completion records only status and monotonic seconds", async () => {
  const samples = [];
  const middleware = factory({}, { strapi: { alageumMetrics: { recordHttp: (...args) => samples.push(args) } } });
  const context = { path: "/api/v1/health", status: 404, query: { secret: "fixture-query" }, headers: { authorization: "fixture-header" }, request: { body: "fixture-body" } };
  let release;
  const pending = middleware(context, () => new Promise(resolve => { release = () => { context.status = 200; resolve(); }; }));
  assert.equal(samples.length, 0);
  release(); await pending;
  assert.equal(samples.length, 1); assert.equal(samples[0].length, 2);
  assert.equal(samples[0][0], 200); assert.equal(typeof samples[0][1], "number");
  assert.ok(Number.isFinite(samples[0][1]) && samples[0][1] >= 0);
});

test("metrics ignore native CMS, admin, assets and similar prefixes without stopping their handlers", async () => {
  const metrics = createMetrics(), middleware = factory({}, { strapi: { alageumMetrics: metrics } });
  let nextCalls = 0;
  for (const path of ["/cms", "/admin/login", "/admin/api/v1/health", "/uploads/file.png", "/_health", "/api/v10/health", "/api/v1-other", "/api/v1ish", "/"]) {
    await middleware({ path, status: 200 }, async () => { nextCalls++; });
  }
  assert.equal(nextCalls, 9); assert.deepEqual(metrics.snapshot(), {});
  for (const path of ["/api/v1", "/api/v1/", "/api/v1/health", "/API/V1/HEALTH/"])
    await middleware({ path, status: 200 }, async () => {});
  assert.equal(metrics.snapshot().http_requests_total, 4);
});

test("handled 4xx/5xx and rejected requests each count once without changing the error", async () => {
  const metrics = createMetrics(), middleware = factory({}, { strapi: { alageumMetrics: metrics } });
  for (const status of [200, 401, 404, 422, 429, 500]) await middleware({ path: "/api/v1/test", status }, async () => {});
  const failure = new Error("Fictitious secret must not become a metric label");
  await assert.rejects(middleware({ path: "/api/v1/test", status: 404 }, async () => { throw failure; }), error => error === failure);
  const result = metrics.snapshot();
  assert.equal(result.http_requests_total, 7); assert.equal(result.http_errors_total, 6);
  assert.equal(result.http_request_duration_seconds_count, 7);
  assert.deepEqual(Object.keys(result), ["http_errors_total", "http_request_duration_seconds_count", "http_request_duration_seconds_sum", "http_requests_total"]);
  assert.equal(JSON.stringify(result).includes("Fictitious"), false);
});

test("snapshot excludes its own completion and separate middleware instances keep isolated counters", async () => {
  const first = createMetrics(), second = createMetrics();
  const one = factory({}, { strapi: { alageumMetrics: first } });
  const two = factory({}, { strapi: { alageumMetrics: second } });
  const ctx = { path: "/api/v1/metrics", status: 200 };
  await one(ctx, async () => { ctx.body = first.snapshot(); });
  assert.deepEqual(ctx.body, {}); assert.equal(first.snapshot().http_requests_total, 1);
  assert.deepEqual(second.snapshot(), {});
  await two({ path: "/api/v1/health", status: 200 }, async () => {});
  assert.equal(first.snapshot().http_requests_total, 1); assert.equal(second.snapshot().http_requests_total, 1);
});
