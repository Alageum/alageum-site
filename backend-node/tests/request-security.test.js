"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyRequestSecurity, clientAddress, trustedProxyAddresses } = require("../src/domain/client-address");
const { createDistributedRateLimiter, parseAttempts } = require("../src/domain/distributed-rate-limit");
function ctx(peer, headers = {}) { return { req: { socket: { remoteAddress: peer } }, request: { protocol: "http" }, headers, get: key => headers[key.toLowerCase()] || "" }; }
test("untrusted forwarding headers and ctx.ip cannot replace the real socket peer", () => {
  const value = ctx("::ffff:192.0.2.10", { "x-forwarded-for": "203.0.113.8", "x-forwarded-proto": "https" });
  value.ip = "203.0.113.9";
  assert.equal(applyRequestSecurity(value, ["127.0.0.1"]), "192.0.2.10");
  assert.equal(clientAddress(value), "192.0.2.10"); assert.equal(value.request.protocol, "http");
  assert.equal(clientAddress({ ip: "spoofed", headers: { "x-forwarded-for": "203.0.113.9" } }), "unknown");
});
test("explicit trusted proxy uses the nearest untrusted peer and single reviewed protocol", () => {
  const value = ctx("127.0.0.1", { "x-forwarded-for": "198.51.100.99, 192.0.2.10, 10.0.0.4", "x-forwarded-proto": "https" });
  assert.equal(applyRequestSecurity(value, ["127.0.0.1", "10.0.0.4"]), "192.0.2.10");
  assert.equal(clientAddress(value), "192.0.2.10"); assert.equal(value.request.protocol, "https");
  value.headers["x-forwarded-for"] = "203.0.113.9";
  assert.equal(clientAddress(value), "192.0.2.10");
});
test("proxy settings reject wildcard, DNS, CIDR and unbounded lists", () => {
  for (const values of [["*"], ["localhost"], ["10.0.0.0/8"], ["0.0.0.0"], ["::"], Array(33).fill("127.0.0.1"), "127.0.0.1"]) assert.throws(() => trustedProxyAddresses(values));
  assert.deepEqual(trustedProxyAddresses(["::ffff:127.0.0.1", "127.0.0.1"]), ["127.0.0.1"]);
  assert.deepEqual(trustedProxyAddresses(["::FFFF:7f00:1", "127.0.0.1"]), ["127.0.0.1"]);
  assert.deepEqual(trustedProxyAddresses(["2001:db8::1", "2001:0DB8:0:0:0:0:0:1"]), ["2001:db8::1"]);
});
test("malformed trusted forwarding chains and protocols fail closed", () => {
  for (const headers of [{ "x-forwarded-proto": "https,http" }, { "x-forwarded-proto": "ftp" }, { "x-forwarded-for": "192.0.2.2,garbage" }, { "x-forwarded-for": "192.0.2.2:1234" }, { "x-forwarded-for": Array(17).fill("192.0.2.2").join(",") }]) {
    assert.throws(() => applyRequestSecurity(ctx("127.0.0.1", headers), ["127.0.0.1"]), { code: "invalid_proxy_headers", status: 400 });
  }
});
test("distributed admission rejects invalid policies and corrupt stored state", () => {
  const good = { db: {}, secret: "fixture-".repeat(8), policy: "login" };
  for (const delta of [{ secret: "short" }, { policy: "../bad" }, { limit: 0 }, { limit: 1001 }, { windowMs: 0 }, { maxKeys: 0 }]) assert.throws(() => createDistributedRateLimiter({ ...good, ...delta }));
  for (const value of [null, {}, "invalid", [-1], ["1"], [1,2]]) assert.throws(() => parseAttempts(value, 1));
  assert.deepEqual(parseAttempts("[1,2]", 2), [1,2]);
});
test("database or lock failure rejects admission without an in-memory fallback", async () => {
  const limit = createDistributedRateLimiter({ db: { transaction: async () => { throw new Error("private database diagnostic"); } }, secret: "fixture-".repeat(8), policy: "login" });
  await assert.rejects(limit("192.0.2.1"), error => error.code === "rate_limit_unavailable" && error.status === 503 && !error.message.includes("private"));
});
test("legacy login admission middleware awaits success and fails closed before downstream parsing", async () => {
  const middleware = require("../src/middlewares/request-security");
  let admit, entered = false;
  const pending = new Promise(resolve => { admit = resolve; });
  const request = { ...ctx("127.0.0.1"), path: "/API/V1/AUTH/LOGIN/", method: "POST" };
  const service = middleware({}, { strapi: { config: { get: (_key, fallback) => fallback }, alageum: { auth: { chargeLogin: () => pending } } } });
  const operation = service(request, async () => { entered = true; });
  await Promise.resolve(); assert.equal(entered, false); admit(); await operation; assert.equal(entered, true);
  const missing = middleware({}, { strapi: { config: { get: (_key, fallback) => fallback } } });
  await assert.rejects(missing(request, () => { throw new Error("must not run"); }), { code: "rate_limit_unavailable", status: 503 });
});

test("real Koa emits secure cookies only for TLS or an explicitly trusted HTTPS proxy", () => {
  const Koa = require("koa"), app = new Koa();
  assert.equal(app.proxy, false);
  function context(peer) {
    const headers = new Map();
    const request = { method: "POST", url: "/", headers: { "x-forwarded-proto": "https", "x-forwarded-for": "192.0.2.10" }, socket: { remoteAddress: peer } };
    const response = { getHeader: name => headers.get(name), setHeader: (name, value) => headers.set(name, value) };
    return { value: app.createContext(request, response), headers };
  }
  const trusted = context("127.0.0.1"); applyRequestSecurity(trusted.value, ["127.0.0.1"]);
  trusted.value.cookies.set("__Host-test", "synthetic", { secure: true, httpOnly: true, sameSite: "lax", signed: false, path: "/" });
  assert.match(trusted.headers.get("Set-Cookie").join(";"), /secure/); assert.equal(trusted.value.secure, true);
  const direct = context("192.0.2.11"); applyRequestSecurity(direct.value, ["127.0.0.1"]);
  assert.equal(direct.value.secure, false);
  assert.throws(() => direct.value.cookies.set("__Host-test", "synthetic", { secure: true, signed: false }), /secure cookie/);
});

test("native CMS admission covers auth aliases but leaves reads and business paths unchanged", async () => {
  const { requestPolicy } = require("../src/domain/cms-admission");
  for (const path of ["/admin/login", "/ADMIN/LOGIN/", "/admin/register", "/admin/register-admin", "/admin/forgot-password", "/admin/reset-password"]) assert.equal(requestPolicy({ method: "POST", path }), "entry");
  assert.equal(requestPolicy({ method: "POST", path: "/admin/access-token" }), "refresh");
  for (const path of ["/cms", "/admin/users", "/api/v1/health", "/api/v1/metrics", "/api/v1/auth/login"]) assert.equal(requestPolicy({ method: "POST", path }), null);
  assert.equal(requestPolicy({ method: "GET", path: "/admin/login" }), null);
  const names = require("../config/middlewares")({ env: { array: (_key, fallback) => fallback } });
  const body = names.findIndex(value => value.name === "strapi::body");
  assert.ok(names.indexOf("global::request-security") < body);
  assert.ok(names.indexOf("global::cms-admission") > body);
});

test("native CMS identity middleware awaits quota and never replaces native authority", async () => {
  const factory = require("../src/middlewares/cms-admission"), calls = [];
  const middleware = factory({}, { strapi: { alageum: { cmsAdmission: { identity: async request => calls.push(["identity", request]) } } } });
  const request = { method: "POST", path: "/admin/login", request: { body: { email: "synthetic@example.test" } } };
  await middleware(request, async () => calls.push(["native-auth", request]));
  assert.deepEqual(calls.map(call => call[0]), ["identity", "native-auth"]);
  const closed = factory({}, { strapi: {} });
  await assert.rejects(closed(request, () => { throw Error("must not run"); }), { code: "rate_limit_unavailable", status: 503 });
});

test("CMS credentials reject native passport query fallback before quota or auth", async () => {
  const Strategy = require("passport-local").Strategy, { toLower } = require("lodash/fp");
  const extracted = []; let nativeFailures = 0;
  const strategy = new Strategy({ usernameField: "email" }, (email, _password, done) => { extracted.push(toLower(email)); done(null, {}); });
  strategy.success = () => {}; strategy.fail = () => { nativeFailures++; };
  strategy.authenticate({ body: { password: "synthetic" }, query: { email: "Victim@example.test" } });
  strategy.authenticate({ body: { email: ["ignored@example.test"], password: "synthetic" }, query: { email: "Victim@example.test" } });
  strategy.authenticate({ body: { email: ["Victim@example.test"], password: "synthetic" }, query: {} });
  assert.equal(nativeFailures, 1);
  assert.deepEqual(extracted, ["victim@example.test", "victim@example.test"]);
  const admission = require("../src/domain/cms-admission").createCmsAdmission({ db: { transaction() { throw Error("must not reach quota"); } }, config: { jwtSecret: "fixture-".repeat(8) } });
  for (const [body, query] of [
    [{ password: "synthetic" }, { email: "victim@example.test" }],
    [{ email: ["victim@example.test"], password: "synthetic" }, {}],
    [{ email: "victim@example.test" }, { password: "synthetic" }],
    [{ email: "victim@example.test", password: ["synthetic"] }, {}],
    [{ email: "victim@example.test", password: "synthetic" }, { email: "another@example.test" }],
    [{ email: "victim\u0000@example.test", password: "synthetic" }, {}],
  ]) await assert.rejects(admission.identity({ path: "/admin/login", method: "POST", request: { body }, query }), { code: "validation_error", status: 422 });
});
