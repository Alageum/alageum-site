"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const knex = require("knex");
const argon2 = require("argon2");
const authModule = require("../src/domain/auth");
const auditModule = require("../src/domain/audit");
const federatedSchema = require("../src/domain/federated-schema");
const { createBrowserSessions, browserSettings } = require("../src/domain/browser-sessions");
const { createFederatedAuth } = require("../src/domain/federated-auth");

const config = { env: "test", googleEnabled: false, browserOrigin: "http://localhost:3000",
  jwtSecret: "isolated-browser-session-test-secret-32-plus", jwtIssuer: "test", jwtAudience: "test" };
function ctx({ jar = new Map(), method = "POST", body = {}, query = {}, boundary = "", origin = config.browserOrigin } = {}) {
  const headers = { origin, "x-browser-session": boundary }, responseHeaders = {}, writes = [];
  return { jar, method, request: { body }, query, headers, responseHeaders, writes, state: {}, ip: randomUUID(),
    get: name => headers[name.toLowerCase()] || "", set: (name, value) => { responseHeaders[name] = value; },
    cookies: { get: name => jar.get(name), set: (name, value, options) => { writes.push({ name, value, options }); if (value === null) jar.delete(name); else jar.set(name, value); } } };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("cookie settings are independent of Google and reject unsafe origins", () => {
  assert.deepEqual(browserSettings(config), { origin: config.browserOrigin, secure: false });
  assert.deepEqual(browserSettings({ ...config, browserOrigin: "https://app.example.test" }), { origin: "https://app.example.test", secure: true });
  assert.equal(browserSettings({ googleEnabled: false }), null);
  for (const browserOrigin of ["http://app.example.test", "https://app.example.test/", "https://user:pass@app.example.test", "javascript:alert(1)"]) {
    assert.throws(() => browserSettings({ ...config, browserOrigin }));
  }
});

test("real PostgreSQL password cookies, CSRF, cancellation, revocation and stale logout", { timeout: 60000 }, async t => {
  const connection = process.env.ALAGEUM_BROWSER_SESSION_TEST_DATABASE_URL;
  if (!connection || new URL(connection).pathname !== "/alageum_browser_session_test") throw new Error("Use a fresh dedicated ALAGEUM_BROWSER_SESSION_TEST_DATABASE_URL ending /alageum_browser_session_test");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 8 } }); t.after(() => db.destroy());
  if ((await db.raw("SELECT 1 FROM information_schema.schemata WHERE schema_name='b2b'")).rows.length) throw new Error("Refusing to overwrite existing database");
  await authModule.ensureSchema(db); await federatedSchema.ensureSchema(db); await auditModule.ensureSchema(db);
  const table = name => db.withSchema("b2b").table(name);
  const user = { id: randomUUID(), email: "verified@example.test", display_name: "Test customer",
    password_hash: await argon2.hash("local-test-only-password"), credential_version: 0, is_active: true };
  await table("users").insert(user);
  const sessions = createBrowserSessions({ db, config, audit: auditModule.audit });
  const auth = authModule.createAuth({ db, config, audit: auditModule.audit, browserSessions: sessions });
  const provider = createFederatedAuth({ db, config, audit: auditModule.audit, browserSessions: sessions });
  async function prepare(jar, service = sessions) { const c = ctx({ jar }); await service.prepare(c); return c.body.flow_id; }
  async function login(jar) {
    const flow_id = await prepare(jar);
    const c = ctx({ jar, body: { email: user.email, password: "local-test-only-password", flow_id } });
    await auth.browserLogin(c); return c;
  }
  let jar = new Map(), signed;

  await t.test("password login works with Google disabled, emits no bearer pair, and grants no membership", async () => {
    const availability = ctx({ method: "GET" }); provider.providers(availability); assert.equal(availability.body.google.available, false);
    signed = await login(jar); const raw = jar.get("alageum_dev_session");
    assert.equal(signed.status, 200); assert.equal(raw.length, 43);
    assert.deepEqual(Object.keys(signed.body).sort(), ["session_id", "user"]);
    assert.ok(!JSON.stringify(signed.body).includes(raw));
    const written = signed.writes.find(value => value.name === "alageum_dev_session");
    assert.equal(written.options.httpOnly, true); assert.equal(written.options.sameSite, "lax"); assert.equal(written.options.path, "/");
    assert.equal(written.options.domain, undefined);
    const stored = await table("browser_sessions").where({ id: signed.body.session_id }).first();
    assert.equal(stored.token_hash, createHash("sha256").update(raw).digest("hex"));
    assert.equal(stored.credential_version, 0); assert.equal((await table("refresh_sessions")).length, 0);
    await assert.rejects(auth.context(ctx({ jar, method: "GET", boundary: signed.body.session_id })), { code: "organization_access_denied" });
  });
  await t.test("cookie bootstrap and reads require matching public boundary; writes require exact Origin", async () => {
    const id = signed.body.session_id;
    await assert.rejects(sessions.currentUser(ctx({ jar, method: "GET" })), { code: "authentication_required" });
    await assert.rejects(sessions.currentUser(ctx({ jar, method: "GET", boundary: randomUUID() })), { code: "authentication_required" });
    await assert.rejects(sessions.session(ctx({ jar, method: "GET", query: { session_id: randomUUID() } })), { code: "authentication_required" });
    const current = ctx({ jar, method: "GET", query: { session_id: id } }); await sessions.session(current); assert.equal(current.body.user.id, user.id);
    for (const origin of ["", "https://evil.example.test"]) {
      await assert.rejects(sessions.prepare(ctx({ jar, origin })), { code: "origin_denied" });
      await assert.rejects(auth.browserLogin(ctx({ jar, origin })), { code: "origin_denied" });
      await assert.rejects(sessions.currentUser(ctx({ jar, boundary: id, origin })), { code: "origin_denied" });
    }
  });
  await t.test("password attempts are strict, one-use and explicitly cancellable", async () => {
    const flow_id = await prepare(jar), body = { email: user.email, password: "local-test-only-password", flow_id };
    await assert.rejects(auth.browserLogin(ctx({ jar, body: { ...body, role: "admin" } })), { code: "validation_error" });
    await assert.rejects(auth.browserLogin(ctx({ jar, body: { ...body, password: "wrong-password" } })), { code: "invalid_credentials" });
    const result = ctx({ jar, body }); await auth.browserLogin(result);
    await assert.rejects(auth.browserLogin(ctx({ jar, body })), { code: "invalid_federated_state" });
    const cancelled = await prepare(jar); await sessions.cancel(ctx({ jar, body: { flow_id: cancelled } }));
    await assert.rejects(auth.browserLogin(ctx({ jar, body: { ...body, flow_id: cancelled } })), { code: "invalid_federated_state" });
    signed = result;
  });
  await t.test("a newer prepare invalidates an older in-flight password verification", async () => {
    const flow_id = await prepare(jar), started = deferred(), release = deferred(), before = jar.get("alageum_dev_session");
    const pending = sessions.passwordLogin(ctx({ jar, body: { email: user.email, password: "unused-test-value", flow_id } }),
      async () => { started.resolve(); await release.promise; return user; }, async () => user);
    const rejected = assert.rejects(pending, { code: "invalid_federated_state" });
    await started.promise; await prepare(jar); release.resolve(); await rejected;
    assert.equal(jar.get("alageum_dev_session"), before);
  });
  await t.test("HTTPS cookie flags use __Host prefix without a Domain attribute", async () => {
    const secureConfig = { ...config, browserOrigin: "https://app.example.test" }, secureJar = new Map();
    const secure = createBrowserSessions({ db, config: secureConfig, audit: auditModule.audit });
    const prepared = ctx({ jar: secureJar, origin: secureConfig.browserOrigin }); await secure.prepare(prepared);
    const c = ctx({ jar: secureJar, origin: secureConfig.browserOrigin, body: { email: user.email, password: "unused-test-value", flow_id: prepared.body.flow_id } });
    await secure.passwordLogin(c, async () => user, async () => user);
    const cookie = c.writes.find(value => value.name === "__Host-alageum_session");
    assert.ok(cookie); assert.equal(cookie.options.secure, true); assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.path, "/"); assert.equal(cookie.options.domain, undefined);
  });
  await t.test("password reset version invalidates cookie, access and refresh credentials immediately", async () => {
    signed = await login(jar); const id = signed.body.session_id;
    const legacy = ctx({ body: { email: user.email, password: "local-test-only-password" } }); await auth.login(legacy);
    const bearer = ctx({ method: "GET" }); bearer.headers.authorization = "Bearer " + legacy.body.access_token;
    assert.equal((await auth.currentUser(bearer)).id, user.id);
    await table("users").where({ id: user.id }).increment("credential_version", 1);
    await assert.rejects(sessions.currentUser(ctx({ jar, method: "GET", boundary: id })), { code: "authentication_required" });
    await assert.rejects(auth.currentUser(bearer), { code: "authentication_required" });
    await assert.rejects(auth.refresh(ctx({ body: { refresh_token: legacy.body.refresh_token } })), { code: "invalid_token" });
    await assert.rejects(db.transaction(tx => auth.assertActiveSession(tx, bearer, user.id)), { code: "invalid_token" });
    signed = await login(jar); assert.equal((await table("browser_sessions").where({ id: signed.body.session_id }).first()).credential_version, 1);
  });
  await t.test("session/user locks serialize a protected write with password reset", async () => {
    const tx = await db.transaction(), request = ctx({ jar: new Map(jar), boundary: signed.body.session_id });
    let reset;
    try {
      await auth.assertActiveSession(tx, request, user.id);
      let completed = false;
      reset = table("users").where({ id: user.id }).increment("credential_version", 1).then(() => { completed = true; });
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const result = await db.raw("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%credential_version%'");
        if (result.rows.length) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(blocked, true); assert.equal(completed, false); await tx.commit(); await reset;
    } catch (error) { await tx.rollback(); await reset; throw error; }
    await assert.rejects(db.transaction(connection => auth.assertActiveSession(connection, request, user.id)), { code: "authentication_required" });
    signed = await login(jar);
  });
  await t.test("delayed old logout cannot revoke a newer browser-bound login", async () => {
    const started = deferred(), release = deferred(), oldJar = new Map(jar), oldId = signed.body.session_id;
    const delayedDb = { withSchema: name => db.withSchema(name), transaction: async callback => { started.resolve(); await release.promise; return db.transaction(callback); } };
    const delayed = createBrowserSessions({ db: delayedDb, config, audit: auditModule.audit });
    const pending = delayed.logout(ctx({ jar: oldJar, boundary: oldId })); const rejected = assert.rejects(pending, { code: "authentication_required" });
    await started.promise; signed = await login(jar); const raw = jar.get("alageum_dev_session"); release.resolve(); await rejected;
    assert.equal(jar.get("alageum_dev_session"), raw);
    assert.equal((await sessions.currentUser(ctx({ jar, method: "GET", boundary: signed.body.session_id }))).id, user.id);
  });
  await t.test("parallel expired-browser relogins do not sweep rows while holding another session lock", async () => {
    const firstJar = new Map(), secondJar = new Map();
    const [first, second] = await Promise.all([login(firstJar), login(secondJar)]);
    await table("browser_sessions").whereIn("id", [first.body.session_id, second.body.session_id]).update({ expires_at: new Date(0) });
    const [firstAgain, secondAgain] = await Promise.all([login(firstJar), login(secondJar)]);
    assert.notEqual(firstAgain.body.session_id, first.body.session_id);
    assert.notEqual(secondAgain.body.session_id, second.body.session_id);
    assert.equal((await sessions.currentUser(ctx({ jar: firstJar, method: "GET", boundary: firstAgain.body.session_id }))).id, user.id);
    assert.equal((await sessions.currentUser(ctx({ jar: secondJar, method: "GET", boundary: secondAgain.body.session_id }))).id, user.id);
  });
  await t.test("a completed logout response arriving after a newer login never erases its cookie", async () => {
    const oldResponse = ctx({ jar, boundary: signed.body.session_id });
    await sessions.logout(oldResponse);
    signed = await login(jar); const newestRaw = jar.get("alageum_dev_session");
    // Simulate the browser receiving the older HTTP response last.
    for (const write of oldResponse.writes) {
      if (write.value === null) jar.delete(write.name); else jar.set(write.name, write.value);
    }
    assert.equal(jar.get("alageum_dev_session"), newestRaw);
    assert.equal((await sessions.currentUser(ctx({ jar, method: "GET", boundary: signed.body.session_id }))).id, user.id);
  });
  await t.test("logout invalidates pending password preparation and active sessions", async () => {
    const flow_id = await prepare(jar), id = signed.body.session_id;
    const result = ctx({ jar, boundary: id }); const oldRaw = jar.get("alageum_dev_session");
    await sessions.logout(result);
    assert.equal(result.writes.length, 0, "late logout response must not clear a newer cookie");
    assert.equal(jar.get("alageum_dev_session"), oldRaw);
    await assert.rejects(sessions.currentUser(ctx({ jar, method: "GET", boundary: id })), { code: "authentication_required" });
    await assert.rejects(auth.browserLogin(ctx({ jar, body: { email: user.email, password: "local-test-only-password", flow_id } })), { code: "invalid_federated_state" });
  });
});
