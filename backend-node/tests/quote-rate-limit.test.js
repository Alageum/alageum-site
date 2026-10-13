"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const path = require("node:path");
const { AppError } = require("../src/domain/errors");
const { createQuoteRateLimiter, quoteClientKey } = require("../src/domain/quote-rate-limit");
const fixture = require("./reference/legacy-quote-limit.json");

function context(request) {
  return {
    req: { socket: { remoteAddress: request.peer ?? undefined } },
    headers: request.headers ?? {},
    state: { user: { id: request.user }, organization: { id: request.organization } },
    request: { headers: { "idempotency-key": request.idempotency_key } },
    ip: "203.0.113.100",
    ips: ["203.0.113.101", "203.0.113.102"],
  };
}

function denial(error) {
  assert.ok(error instanceof AppError);
  assert.deepEqual({ code: error.code, message: error.message, status: error.status, details: error.details }, fixture.denial);
  return true;
}

test("quote limiter reference pins frozen sources and its isolated execution scope", () => {
  assert.equal(fixture.evidence, "quote limiter/client-key/error AST reference; not full legacy endpoint execution");
  assert.equal(fixture.source_revision, "8def4eb6b95588d11313f5df19f67bd80d1564a0");
  assert.equal(fixture.python_requirement, ">=3.12");
  assert.equal(fixture.runtime_dependencies, "Python standard library only");
  assert.deepEqual(fixture.settings, { policy: "quote_create", requests: 10, window_seconds: 60, max_keys: 10000, trusted_proxy_ips: [] });
  assert.deepEqual(fixture.denial, { code: "rate_limit_exceeded", message: "Too many requests", status: 429, details: null });
  assert.deepEqual(fixture.quote_policy_routes, [
    { function: "create_quote", path_suffix: "/catalog", policy: "quote_create" },
    { function: "create_legacy_quote", path_suffix: "", policy: "quote_create" },
  ]);
  for (const [file, digest] of Object.entries(fixture.source_sha256)) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(__dirname, "../..", file))).digest("hex"), digest, `Frozen source changed: ${file}`);
  }
});

for (const vector of fixture.client_key_cases) test(`quote peer matches default-empty Python proxy trust: ${vector.id}`, () => {
  assert.equal(quoteClientKey(context(vector)), vector.expected);
});

for (const vector of fixture.cases) test(`quote limiter matches frozen Python: ${vector.id}`, () => {
  let now = -Infinity;
  let clockReads = 0;
  let attempts = 0;
  const instances = new Map();
  for (const step of vector.steps) {
    assert.ok(step.at_seconds >= now, "the injected reference clock is monotonic");
    now = step.at_seconds;
    const instance = step.instance ?? "default";
    if (!instances.has(instance)) instances.set(instance, createQuoteRateLimiter({
      now: () => { clockReads++; return now; },
      ...(vector.max_keys === undefined ? {} : { maxKeys: vector.max_keys }),
    }));
    const check = instances.get(instance);
    const key = step.request ? quoteClientKey(context(step.request)) : step.key;
    assert.equal(key, step.expected_key);
    assert.equal(step.expected_accepted + step.expected_denied, step.repeat);
    for (let index = 0; index < step.repeat; index++) {
      attempts++;
      if (index < step.expected_accepted) assert.equal(check(key), undefined);
      else assert.throws(() => check(key), denial);
    }
  }
  assert.equal(clockReads, attempts, "every accepted or denied check reads the monotonic clock exactly once");
});

test("quote key never reads headers, authenticated identity, idempotency, or Koa proxy-derived values", () => {
  const ctx = { req: { socket: { remoteAddress: "198.51.100.10" } } };
  for (const field of ["headers", "header", "get", "ip", "ips", "state", "request", "body", "query", "params"]) {
    Object.defineProperty(ctx, field, { get() { throw new Error(`Untrusted ${field} must not be read`); } });
  }
  assert.equal(quoteClientKey(ctx), "198.51.100.10");
  for (const missing of [{}, { req: {} }, { req: { socket: {} } }]) assert.equal(quoteClientKey(missing), "unknown");
});

test("the default clock uses monotonic milliseconds converted to seconds and ignores wallclock changes", t => {
  let monotonicMs = 1000;
  let clockReads = 0;
  t.mock.method(performance, "now", () => { clockReads++; return monotonicMs; });
  t.mock.method(Date, "now", () => { throw new Error("Quote throttling must not use wallclock time"); });
  const check = createQuoteRateLimiter();
  for (let index = 0; index < 10; index++) check("peer");
  assert.throws(() => check("peer"), denial);
  monotonicMs = 60999;
  assert.throws(() => check("peer"), denial);
  monotonicMs = 61000;
  for (let index = 0; index < 10; index++) check("peer");
  assert.throws(() => check("peer"), denial);
  assert.equal(clockReads, 23);
});

test("default capacity is 10000 keys and admission evicts the least recently used active key", () => {
  const check = createQuoteRateLimiter({ now: () => 0 });
  for (let index = 0; index < 10; index++) check("oldest");
  for (let index = 1; index < 10000; index++) check(`peer-${index}`);
  // The 10000th key fills capacity. A denial refreshes oldest, so peer-1 is
  // the next eviction victim; an active bucket must not reject a new peer.
  assert.throws(() => check("oldest"), denial);
  check("new-peer");
  assert.throws(() => check("oldest"), denial);
  for (let index = 0; index < 10; index++) check("peer-1");
  assert.throws(() => check("peer-1"), denial);
});

test("synchronous checks serialize same-tick callers without reserving denied timestamps", async () => {
  const check = createQuoteRateLimiter({ now: () => 42 });
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => Promise.resolve().then(() => check("peer"))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 10);
  for (const result of results.slice(10)) {
    assert.equal(result.status, "rejected");
    denial(result.reason);
  }
});

test("factory instances expose only a check and never share buckets or a reset hook", () => {
  const first = createQuoteRateLimiter({ now: () => 0 });
  const second = createQuoteRateLimiter({ now: () => 0 });
  assert.equal(typeof first, "function");
  assert.deepEqual(Object.keys(first), []);
  assert.equal(first.clear, undefined);
  assert.equal(first.reset, undefined);
  for (let index = 0; index < 10; index++) first("peer");
  assert.throws(() => first("peer"), denial);
  for (let index = 0; index < 10; index++) second("peer");
  assert.throws(() => second("peer"), denial);
  assert.throws(() => first("peer"), denial);
});
