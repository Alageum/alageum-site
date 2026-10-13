"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, randomUUID, createHash } = require("node:crypto");
const knex = require("knex");
const jwt = require("jsonwebtoken");
const authModule = require("../src/domain/auth");
const auditModule = require("../src/domain/audit");
const { ensureSchema } = require("../src/domain/federated-schema");
const { createFederatedAuth } = require("../src/domain/federated-auth");
const { createGoogleOidc, JWKS_URL } = require("../src/domain/google-oidc");
const logger = require("../src/middlewares/safe-request-logger");
const config = { env: "test", googleEnabled: true, browserOrigin: "http://localhost:3000", googleClientId: "local-client.apps.googleusercontent.com", googleClientSecret: "local-only-test-secret", jwtSecret: "local-only-unit-secret-at-least-32-chars", jwtIssuer: "local", jwtAudience: "local" };
const hash = value => createHash("sha256").update(value).digest("hex");
function ctx({ jar = new Map(), body = {}, query = {}, method = "GET", boundary = "", origin = config.browserOrigin, ip = randomUUID() } = {}) {
  const headers = { origin, "x-browser-session": boundary }, responseHeaders = {}, writes = [];
  return { jar, writes, responseHeaders, request: { body }, query, method, state: {}, ip, headers,
    get: key => headers[key.toLowerCase()] || "", set: (key, value) => { responseHeaders[key] = value; },
    cookies: { get: name => jar.get(name), set: (name, value, options) => { writes.push({ name, value, options }); if (value === null) jar.delete(name); else jar.set(name, value); } },
    redirect(url) { this.location = url; this.status = 302; } };
}
test("real PostgreSQL Google signup, cookie sessions, replay, cancellation and tenant isolation", { timeout: 60000 }, async t => {
  const connection = process.env.ALAGEUM_FEDERATED_TEST_DATABASE_URL;
  if (!connection || new URL(connection).pathname !== "/alageum_federated_test") throw new Error("Use a fresh dedicated ALAGEUM_FEDERATED_TEST_DATABASE_URL ending /alageum_federated_test");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 8 } }); t.after(() => db.destroy());
  if ((await db.raw("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'b2b'")).rows.length) throw new Error("Refusing to overwrite existing database");
  await authModule.ensureSchema(db); await auditModule.ensureSchema(db); await ensureSchema(db); await ensureSchema(db);
  const table = name => db.withSchema("b2b").table(name);
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fixture", use: "sig", alg: "RS256" };
  const codes = new Map(); let exchanges = 0;
  const google = createGoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: `${config.browserOrigin}/api/v1/auth/google/callback`, fetchImpl: async (url, options) => {
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
    exchanges += 1; const form = new URLSearchParams(options.body), fixture = codes.get(form.get("code"));
    assert.ok(fixture, "provider recognizes test code");
    assert.equal(createHash("sha256").update(form.get("code_verifier")).digest("base64url"), fixture.challenge);
    if (fixture.wait) await fixture.wait;
    const now = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({ id_token: jwt.sign({ iss: "https://accounts.google.com", aud: config.googleClientId, iat: now, exp: now + 300,
      sub: fixture.subject, email: fixture.email, email_verified: true, nonce: fixture.nonce }, privateKey, { algorithm: "RS256", keyid: "fixture" }), access_token: "discarded" }));
  } });
  const federated = createFederatedAuth({ db, config, audit: auditModule.audit, google });
  const auth = authModule.createAuth({ db, config, audit: auditModule.audit, browserSessions: federated });
  async function begin(jar, { subject = "subject-one", email = "new@example.test", next = "/b2b/documents", wait } = {}) {
    const available = ctx({ jar, method: "POST" }); await federated.prepare(available); const flowId = available.body.flow_id;
    const start = ctx({ jar, method: "POST", body: { next, flow_id: flowId } }); await federated.start(start);
    const url = new URL(start.body.authorization_url), code = randomUUID();
    codes.set(code, { subject, email, wait, nonce: url.searchParams.get("nonce"), challenge: url.searchParams.get("code_challenge") });
    return { query: { code, state: url.searchParams.get("state") }, flowId, start };
  }
  async function finish(jar, flow) { const result = ctx({ jar, query: flow.query }); await federated.callback(result); return result; }
  let jar = new Map(), sessionId, originalRaw, userId;
  await t.test("registration has secure cookie flags, no tokens in redirect and no company membership", async () => {
    const flow = await begin(jar, { next: "https://attacker.test" }), result = await finish(jar, flow);
    const url = new URL(result.location); assert.equal(url.searchParams.get("federated"), "success"); assert.equal(url.searchParams.get("next"), "/b2b");
    sessionId = url.searchParams.get("session"); originalRaw = jar.get("alageum_dev_session");
    assert.equal(originalRaw.length, 43); assert.ok(!result.location.includes(originalRaw));
    const written = result.writes.find(value => value.name === "alageum_dev_session");
    assert.equal(written.options.httpOnly, true); assert.equal(written.options.sameSite, "lax"); assert.equal(written.options.path, "/"); assert.equal(written.options.domain, undefined);
    assert.equal((await table("browser_sessions").first()).token_hash, hash(originalRaw));
    assert.equal((await table("memberships")).length, 0);
    const session = ctx({ jar, query: { session_id: sessionId } }); await federated.session(session); userId = session.body.user.id;
    assert.equal(session.body.session_id, sessionId); assert.ok(!JSON.stringify(session.body).includes(originalRaw));
    await assert.rejects(auth.context(ctx({ jar, boundary: sessionId })), { code: "organization_access_denied" });
    await assert.rejects(federated.session(ctx({ jar, query: { session_id: randomUUID() } })), { code: "authentication_required" });
  });
  await t.test("same provider subject returns same user despite changed email and rotates/revokes session", async () => {
    const stale = new Map(jar); const flow = await begin(jar, { email: "changed@example.test" }), result = await finish(jar, flow);
    sessionId = new URL(result.location).searchParams.get("session"); assert.notEqual(jar.get("alageum_dev_session"), originalRaw);
    assert.equal((await table("users")).length, 1); assert.equal((await table("external_identities").first()).user_id, userId);
    await assert.rejects(federated.currentUser(ctx({ jar: stale, boundary: sessionId })), { code: "authentication_required" });
    await assert.rejects(federated.currentUser(ctx({ jar, boundary: randomUUID() })), { code: "authentication_required" });
  });
  await t.test("email collision cannot attach another subject or create a duplicate account", async () => {
    const other = new Map(), result = await finish(other, await begin(other, { subject: "attacker-subject" }));
    assert.equal(new URL(result.location).searchParams.get("federated"), "account_link_required");
    assert.equal((await table("users")).length, 1); assert.equal((await table("external_identities")).length, 1); assert.ok(!other.has("alageum_dev_session"));
  });
  await t.test("state/browser mismatch, expired attempt and reused callback cannot sign in", async () => {
    const other = new Map(), flow = await begin(other); const before = exchanges;
    assert.equal(new URL((await finish(other, { query: { ...flow.query, state: "x".repeat(43) } })).location).searchParams.get("federated"), "invalid_federated_state");
    assert.equal(new URL((await finish(new Map(), flow)).location).searchParams.get("federated"), "invalid_federated_state"); assert.equal(exchanges, before);
    await table("federated_attempts").where({ state_hash: hash(flow.query.state) }).update({ expires_at: new Date(0) });
    assert.equal(new URL((await finish(other, flow)).location).searchParams.get("federated"), "invalid_federated_state");
    const valid = await begin(other); const results = await Promise.all([finish(other, valid), finish(other, valid)]);
    assert.equal(results.filter(value => new URL(value.location).searchParams.get("federated") === "success").length, 1);
    assert.equal(new URL((await finish(other, valid)).location).searchParams.get("federated"), "invalid_federated_state");
  });
  await t.test("provider cancellation consumes attempt and never reflects raw descriptions", async () => {
    const other = new Map(), flow = await begin(other); flow.query = { state: flow.query.state, error: "access_denied", error_description: "SENSITIVE-DATA" };
    const result = await finish(other, flow); assert.equal(new URL(result.location).searchParams.get("federated"), "provider_cancelled");
    assert.ok(!result.location.includes("SENSITIVE")); assert.ok(!other.has("alageum_dev_session"));
    assert.equal(new URL((await finish(other, flow)).location).searchParams.get("federated"), "invalid_federated_state");
  });
  await t.test("latest sign-in wins even when an older exchange finishes late", async () => {
    let release; const wait = new Promise(resolve => { release = resolve; }); const other = new Map();
    const old = await begin(other, { wait }), pending = finish(other, old);
    while (await table("federated_attempts").where({ state_hash: hash(old.query.state) }).first()) await new Promise(resolve => setTimeout(resolve, 5));
    const newer = await begin(other, { subject: "newer-subject", email: "newer@example.test" }); const result = await finish(other, newer);
    const latestRaw = other.get("alageum_dev_session"); assert.equal(new URL(result.location).searchParams.get("federated"), "success");
    release(); assert.equal(new URL((await pending).location).searchParams.get("federated"), "invalid_federated_state"); assert.equal(other.get("alageum_dev_session"), latestRaw);
  });
  await t.test("explicit cancellation invalidates both in-flight exchange and deferred start", async () => {
    let release; const wait = new Promise(resolve => { release = resolve; }); const other = new Map();
    const old = await begin(other, { wait }), pending = finish(other, old);
    while (await table("federated_attempts").where({ state_hash: hash(old.query.state) }).first()) await new Promise(resolve => setTimeout(resolve, 5));
    await federated.cancel(ctx({ jar: other, method: "POST", body: { flow_id: old.flowId } })); release();
    assert.equal(new URL((await pending).location).searchParams.get("federated"), "invalid_federated_state"); assert.ok(!other.has("alageum_dev_session"));
    await assert.rejects(federated.start(ctx({ jar: other, method: "POST", body: { flow_id: old.flowId } })), { code: "invalid_federated_state" });
  });
  await t.test("cookie mutations require exact Origin and active tab boundary; role still controls tenant and signing", async () => {
    await assert.rejects(federated.start(ctx({ jar, method: "POST", origin: "https://evil.test" })), { code: "origin_denied" });
    await assert.rejects(federated.currentUser(ctx({ jar, boundary: sessionId, method: "POST", origin: "" })), { code: "origin_denied" });
    const org = randomUUID(), role = randomUUID();
    await table("organizations").insert({ id: org, name: "Member company" });
    await table("roles").insert({ id: role, organization_id: org, code: "reader", name: "Reader", permissions: JSON.stringify(["document.read"]) });
    await table("memberships").insert({ id: randomUUID(), organization_id: org, user_id: userId, role_id: role });
    const authorized = await auth.permission(ctx({ jar, boundary: sessionId }), "document.read"); assert.equal(authorized.organization_id, org);
    await assert.rejects(auth.permission(ctx({ jar, boundary: sessionId }), "document.sign"), { code: "permission_denied" });
    const other = ctx({ jar, boundary: sessionId }); other.headers["x-organization-id"] = randomUUID();
    await assert.rejects(auth.context(other), { code: "organization_access_denied" });
    const logoutResponse = ctx({ jar, boundary: sessionId, method: "POST" }); await federated.logout(logoutResponse); assert.equal(logoutResponse.writes.length, 0);
    await assert.rejects(federated.currentUser(ctx({ jar, boundary: sessionId })), { code: "authentication_required" });
  });
  await t.test("logout invalidates a pending provider exchange before it can recreate a session", async () => {
    const other = new Map(), signed = await finish(other, await begin(other));
    const boundary = new URL(signed.location).searchParams.get("session");
    let release; const wait = new Promise(resolve => { release = resolve; });
    const next = await begin(other, { wait }), pending = finish(other, next);
    while (await table("federated_attempts").where({ state_hash: hash(next.query.state) }).first()) await new Promise(resolve => setTimeout(resolve, 5));
    const logoutResponse = ctx({ jar: other, boundary, method: "POST" }); await federated.logout(logoutResponse); assert.equal(logoutResponse.writes.length, 0); release();
    assert.equal(new URL((await pending).location).searchParams.get("federated"), "invalid_federated_state");
    await assert.rejects(federated.currentUser(ctx({ jar: other, boundary, method: "GET" })), { code: "authentication_required" });
  });
  await t.test("transactional session recheck rejects revocation and wrong actor; holds session until signing commit", async () => {
    const other = new Map(), signed = await finish(other, await begin(other));
    const boundary = new URL(signed.location).searchParams.get("session"), snapshot = new Map(other);
    const request = ctx({ jar: snapshot, boundary, method: "POST" });
    await assert.rejects(db.transaction(tx => auth.assertActiveSession(tx, request, randomUUID())), { code: "authentication_required" });
    const tx = await db.transaction();
    try {
      await auth.assertActiveSession(tx, request, userId);
      let completed = false;
      const revoking = federated.logout(ctx({ jar: other, boundary, method: "POST" })).then(() => { completed = true; });
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const rows = await db.raw("SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%browser_sessions%'");
        if (rows.rows.length) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(blocked, true, "logout waits for the FOR SHARE session lock"); assert.equal(completed, false);
      await tx.commit(); await revoking;
    } catch (error) { await tx.rollback(); throw error; }
    await assert.rejects(db.transaction(connection => auth.assertActiveSession(connection, request, userId)), { code: "authentication_required" });
    const now = Math.floor(Date.now() / 1000), bearer = ctx();
    bearer.headers.authorization = "Bearer " + jwt.sign({ sub: userId, type: "access", jti: randomUUID(), iat: now, nbf: now, exp: now + 300 }, config.jwtSecret, { issuer: config.jwtIssuer, audience: config.jwtAudience });
    await db.transaction(tx => auth.assertActiveSession(tx, bearer, userId));
    await assert.rejects(db.transaction(tx => auth.assertActiveSession(tx, bearer, randomUUID())), { code: "invalid_token" });
  });
  await t.test("inactive linked account cannot obtain a session", async () => {
    await table("users").where({ id: userId }).update({ is_active: false });
    const other = new Map(), result = await finish(other, await begin(other));
    assert.equal(new URL(result.location).searchParams.get("federated"), "provider_login_failed"); assert.ok(!other.has("alageum_dev_session"));
  });
});
test("request logging excludes callback query secrets on success and thrown errors", async () => {
  const lines = [], run = logger({}, { strapi: { log: { http: line => lines.push(line) } } });
  for (const throws of [false, true]) {
    const promise = run({ path: "/api/v1/auth/google/callback", url: "/api/v1/auth/google/callback?code=SECRET&state=SECRET&error_description=SECRET", method: "GET", status: 302 }, async () => { if (throws) throw new Error("failure"); });
    if (throws) await assert.rejects(promise); else await promise;
  }
  assert.equal(lines.length, 2); assert.ok(lines.every(line => !line.includes("SECRET") && !line.includes("?")));
});
