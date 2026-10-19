"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const knex = require("knex");
const { createDistributedRateLimiter, ensureSchema } = require("../src/domain/distributed-rate-limit");
const secret = "isolated-distributed-limit-fixture-secret-32-plus";
test("PostgreSQL quota admission remains atomic across replicas, restart, failures and capacity", { timeout: 30000 }, async t => {
  const connection = process.env.ALAGEUM_RATE_LIMIT_TEST_DATABASE_URL;
  if (!connection || new URL(connection).pathname !== "/alageum_rate_limit_test" || !["127.0.0.1", "localhost"].includes(new URL(connection).hostname)) throw new Error("Use a fresh dedicated loopback /alageum_rate_limit_test database");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 12 } });
  const other = knex({ client: "pg", connection, pool: { min: 0, max: 12 } });
  t.after(async () => { await other.destroy(); await db.destroy(); });
  if ((await db.raw("SELECT 1 FROM information_schema.schemata WHERE schema_name='b2b'")).rows.length) throw new Error("Refusing existing database");
  await ensureSchema(db); await ensureSchema(db);
  const rows = () => db.withSchema("b2b").table("rate_limit_buckets");
  await t.test("parallel independent replicas admit exactly the shared quota", async () => {
    const a = createDistributedRateLimiter({ db, secret, policy: "parallel", limit: 10 });
    const b = createDistributedRateLimiter({ db: other, secret, policy: "parallel", limit: 10 });
    const result = await Promise.allSettled(Array.from({ length: 32 }, (_, i) => (i % 2 ? a : b)("private@example.test")));
    assert.equal(result.filter(x => x.status === "fulfilled").length, 10);
    assert.ok(result.filter(x => x.status === "rejected").every(x => x.reason.code === "rate_limited"));
    const stored = await rows().where({ policy: "parallel" });
    assert.equal(stored.length, 1); assert.equal(stored[0].attempts.length, 10);
    assert.ok(!JSON.stringify(stored).includes("private@example.test")); assert.match(stored[0].key_hash, /^[a-f0-9]{64}$/);
    const restarted = createDistributedRateLimiter({ db: other, secret, policy: "parallel", limit: 10 });
    const headers = {}; await assert.rejects(restarted("private@example.test", { set: (key, value) => { headers[key] = value; } }), { code: "rate_limited", status: 429 });
    assert.ok(Number(headers["Retry-After"]) > 0);
    const mismatched = createDistributedRateLimiter({ db: other, secret, policy: "parallel", limit: 20 });
    await assert.rejects(mismatched("private@example.test"), { code: "rate_limit_unavailable", status: 503 });
  });
  await t.test("sliding windows expire at their boundary, preserving another policy", async () => {
    const limit = createDistributedRateLimiter({ db, secret, policy: "window", limit: 2, windowMs: 1000 });
    await limit("a"); await limit("a"); await assert.rejects(limit("a"), { code: "rate_limited" });
    const time = Number((await db.raw("SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS n")).rows[0].n);
    await rows().where({ policy: "window" }).update({ attempts: JSON.stringify([time - 1000, time - 900]), expires_at: new Date(time + 100) });
    await limit("a"); await assert.rejects(limit("a"), { code: "rate_limited" });
    const isolated = createDistributedRateLimiter({ db, secret, policy: "other-policy", limit: 1 });
    await isolated("a");
  });
  await t.test("new-key capacity is bounded and cannot evict a live blocked identity", async () => {
    const limit = createDistributedRateLimiter({ db, secret, policy: "bounded", limit: 1, maxKeys: 2 });
    await limit("a"); await limit("b"); await assert.rejects(limit("c"), { code: "rate_limited" });
    await assert.rejects(limit("a"), { code: "rate_limited" });
    assert.equal(Number((await rows().where({ policy: "bounded" }).count({ n: "*" }).first()).n), 2);
    await rows().where({ policy: "bounded" }).update({ expires_at: new Date(0), attempts: "[]" });
    await limit("c"); assert.equal(Number((await rows().where({ policy: "bounded" }).count({ n: "*" }).first()).n), 1);
  });
  await t.test("allocation stays bounded when different replicas race new keys", async () => {
    const a = createDistributedRateLimiter({ db, secret, policy: "capacity-race", limit: 1, maxKeys: 3 });
    const b = createDistributedRateLimiter({ db: other, secret, policy: "capacity-race", limit: 1, maxKeys: 3 });
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b)(`key-${i}`)));
    assert.equal(results.filter(x => x.status === "fulfilled").length, 3);
    assert.equal(Number((await rows().where({ policy: "capacity-race" }).count({ n: "*" }).first()).n), 3);
  });
  await t.test("real auth, password-cookie and Google adapters share the same admission bucket", async () => {
    const config = { env: "test", jwtSecret: secret, browserOrigin: "http://localhost:3000", googleEnabled: true, googleClientId: "synthetic.apps.googleusercontent.com", googleClientSecret: "synthetic-provider-secret" };
    const audit = async () => {};
    const browser = require("../src/domain/browser-sessions").createBrowserSessions({ db, config, audit });
    const auth = require("../src/domain/auth").createAuth({ db: other, config, audit, browserSessions: browser });
    const google = require("../src/domain/federated-auth").createFederatedAuth({ db: other, config, audit, browserSessions: browser, google: { exchange() { throw Error("must not call provider"); } } });
    const limit = createDistributedRateLimiter({ db, secret, policy: "auth-entry", limit: 20 });
    for (let i = 0; i < 20; i++) await limit("192.0.2.77");
    const ctx = () => ({ req: { socket: { remoteAddress: "192.0.2.77" } }, ip: "spoofed-bypass", method: "POST", request: { body: {} }, query: {}, get: key => key === "Origin" ? config.browserOrigin : "", set() {} });
    for (const operation of [auth.login, browser.prepare, browser.passwordLogin, google.start, google.callback]) await assert.rejects(operation(ctx()), { code: "rate_limited", status: 429 });
    const identity = createDistributedRateLimiter({ db, secret, policy: "password-identity", limit: 20 });
    for (let i = 0; i < 20; i++) await identity("victim@example.test");
    const attempt = ctx(); attempt.req.socket.remoteAddress = "192.0.2.88"; attempt.request.body = { email: "VICTIM@example.test", password: "synthetic-invalid-password" };
    await assert.rejects(auth.login(attempt), { code: "rate_limited", status: 429 });
    const invalid = ctx(); invalid.req.socket.remoteAddress = "192.0.2.89"; invalid.request.body = { email: "bad\u0000@example.test", password: "synthetic-password" };
    await assert.rejects(auth.login(invalid), { code: "validation_error", status: 422 });
  });
  await t.test("a blocked shared bucket times out instead of admitting an uncharged request", async () => {
    const limit = createDistributedRateLimiter({ db: other, secret, policy: "locked", limit: 2 }); await limit("a");
    let release, started;
    const hold = new Promise(resolve => { release = resolve; }), acquired = new Promise(resolve => { started = resolve; });
    const transaction = db.transaction(async tx => { await tx.withSchema("b2b").table("rate_limit_buckets").where({ policy: "locked" }).forUpdate().first(); started(); await hold; });
    await acquired;
    try { await assert.rejects(limit("a"), { code: "rate_limit_unavailable", status: 503 }); }
    finally { release(); await transaction; }
    await limit("a"); await assert.rejects(limit("a"), { code: "rate_limited", status: 429 });
  });
  await t.test("native CMS quotas share identity and address limits across replicas and auth routes", async () => {
    const { createCmsAdmission } = require("../src/domain/cms-admission");
    const a = createCmsAdmission({ db, config: { jwtSecret: secret } }), b = createCmsAdmission({ db: other, config: { jwtSecret: secret } });
    const ctx = () => ({ method: "POST", path: "/ADMIN/LOGIN/", req: { socket: { remoteAddress: "192.0.2.200" } }, request: { body: { email: "OPERATOR@example.test", password: "synthetic-password" } } });
    for (let i = 0; i < 20; i++) { await a.address(ctx()); await b.identity(ctx()); }
    for (const path of ["/admin/login", "/admin/register-admin", "/admin/reset-password", "/admin/forgot-password"]) {
      const request = ctx(); request.path = path; await assert.rejects(b.address(request), { code: "rate_limited", status: 429 });
    }
    const anotherAddress = ctx(); anotherAddress.req.socket.remoteAddress = "192.0.2.201";
    await b.address(anotherAddress); await assert.rejects(a.identity(anotherAddress), { code: "rate_limited", status: 429 });
    const refresh = ctx(); refresh.path = "/admin/access-token"; await b.address(refresh);
    const before = Number((await rows().count({ n: "*" }).first()).n);
    await a.address({ method: "GET", path: "/api/v1/health" });
    assert.equal(Number((await rows().count({ n: "*" }).first()).n), before);
  });
  await t.test("corrupt quota state and a missing shared table fail closed", async () => {
    const limit = createDistributedRateLimiter({ db, secret, policy: "corrupt", limit: 1 }); await limit("a");
    await rows().where({ policy: "corrupt" }).update({ attempts: '["invalid"]' });
    await assert.rejects(limit("a"), { code: "rate_limit_unavailable", status: 503 });
    await db.schema.withSchema("b2b").renameTable("rate_limit_buckets", "unavailable_rate_limit_buckets");
    await assert.rejects(limit("b"), { code: "rate_limit_unavailable", status: 503 });
    await db.schema.withSchema("b2b").renameTable("unavailable_rate_limit_buckets", "rate_limit_buckets");
    await db.raw("ALTER TABLE b2b.rate_limit_buckets DROP CONSTRAINT rate_limit_buckets_pkey");
    await assert.rejects(ensureSchema(db), /key constraint is incompatible/);
  });
});
