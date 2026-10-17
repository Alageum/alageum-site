"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const knex = require("knex");
const argon2 = require("argon2");
const { ensureSchema: authSchema, createAuth, table } = require("../src/domain/auth");
const { ensureSchema: federatedSchema } = require("../src/domain/federated-schema");
const { ensureSchema: registrationSchema } = require("../src/domain/registration-schema");
const { ensureSchema: auditSchema, audit } = require("../src/domain/audit");
const { createBrowserSessions } = require("../src/domain/browser-sessions");
const { createRegistration } = require("../src/domain/registration");
const { createRegistrationMail, createMailOutbox, seal, LEASE_MS } = require("../src/domain/registration-mail");
const { provision } = require("../scripts/provision-business-operator");
const { startSmtpCapture, plainText } = require("./helpers/local-smtp-capture");
const config = { env: "test", browserOrigin: "https://site.example.test", jwtSecret: "synthetic-local-mail-test-secret-at-least-32-characters", jwtIssuer: "mail-test", jwtAudience: "mail-test",
  registrationMail: { provider: "smtp", host: "127.0.0.1", tlsServername: "localhost", port: 2525, from: "noreply@example.test", user: "synthetic-test-user", pass: "synthetic-test-password" } };
function ctx(body = {}) { return { request: { body }, req: { socket: { remoteAddress: "127.0.0.9" } }, method: "POST", state: {}, get: name => name.toLowerCase() === "origin" ? config.browserOrigin : "", set() {} }; }
function tokenIn(message, path) {
  assert.equal(message.secure, true);
  const text = plainText(message), url = new URL(text.match(/https:\/\/site\.example\.test\/[^\s]+/)[0]);
  assert.equal(url.pathname, path); assert.equal(url.search, ""); assert.match(url.hash, /^#token=[A-Za-z0-9_-]{64}$/);
  return { token: new URLSearchParams(url.hash.slice(1)).get("token"), text };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
test("real PostgreSQL and certificate-verified local SMTP registration/reset and outbox recovery", { timeout: 120000 }, async t => {
  const connection = process.env.ALAGEUM_REGISTRATION_MAIL_TEST_DATABASE_URL;
  if (!connection || !/^\/alageum_registration_mail_test(?:_[a-z0-9]+)?$/.test(new URL(connection).pathname)) throw new Error("Use a fresh dedicated ALAGEUM_REGISTRATION_MAIL_TEST_DATABASE_URL");
  if (!process.env.ALAGEUM_SMTP_TEST_KEY || !process.env.ALAGEUM_SMTP_TEST_CERT || !process.env.NODE_EXTRA_CA_CERTS) throw new Error("Run scripts/run-registration-mail-tests.sh to create and trust an ephemeral test certificate");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 12 } }); t.after(() => db.destroy());
  if ((await db.raw("SELECT 1 FROM information_schema.schemata WHERE schema_name='b2b'")).rows.length) throw new Error("Refusing an existing domain schema; use a fresh dedicated test database");
  await authSchema(db); await federatedSchema(db); await auditSchema(db); await registrationSchema(db); await registrationSchema(db);
  const sink = await startSmtpCapture({ key: fs.readFileSync(process.env.ALAGEUM_SMTP_TEST_KEY), cert: fs.readFileSync(process.env.ALAGEUM_SMTP_TEST_CERT) }); t.after(() => sink.close());
  const mail = createRegistrationMail({ config }), sessions = createBrowserSessions({ db, config, audit });
  const auth = createAuth({ db, config, audit, browserSessions: sessions });
  const registration = createRegistration({ db, config, auth, audit, browserSessions: sessions, mail });
  const email = "customer@example.test", password = "Synthetic-mail-password!";
  let userId, firstToken;
  await t.test("SMTP preflight completes TLS and authentication without delivering a message", async () => {
    assert.equal(await mail.verifyConnection(), true); assert.equal(sink.messages.length, 0);
    assert.ok(sink.connections.some(value => value.secure && value.auth));
  });
  await t.test("certificate hostname mismatch is rejected, never bypassed", async () => {
    const bad = createRegistrationMail({ config: { ...config, registrationMail: { ...config.registrationMail, tlsServername: "wrong.invalid" } } });
    await assert.rejects(bad.verifyConnection()); assert.equal(sink.messages.length, 0);
  });
  await t.test("incorrect SMTP credentials and plaintext-only servers fail closed", async () => {
    const bad = createRegistrationMail({ config: { ...config, registrationMail: { ...config.registrationMail, pass: "wrong-synthetic-password" } } });
    await assert.rejects(bad.verifyConnection(), { code: "EAUTH" });
    sink.setStartTls(false);
    try { await assert.rejects(createRegistrationMail({ config }).verifyConnection()); }
    finally { sink.setStartTls(true); }
    assert.equal(sink.messages.length, 0);
  });
  await t.test("signup queues encrypted mail; captured SMTP link verifies the actual account", async () => {
    const response = ctx({ email, password, display_name: "Synthetic customer" }); await registration.register(response);
    assert.equal(response.status, 202); assert.equal(sink.messages.length, 0);
    const user = await table(db, "users").where({ email }).first(); userId = user.id; assert.equal(user.is_active, false);
    const queued = await table(db, "registration_mail_outbox").first(); assert.ok(!queued.payload.includes(email)); assert.ok(!queued.payload.includes("token="));
    await registration.flushMail(); assert.equal(sink.messages.length, 1);
    assert.deepEqual(sink.messages[0].recipients, [email]); assert.equal(sink.messages[0].from, config.registrationMail.from);
    const value = tokenIn(sink.messages[0], "/verify-email"); firstToken = value.token;
    assert.match(value.text, /24 часа/); assert.ok(!value.text.includes(password));
    await registration.verifyEmail(ctx({ token: firstToken }));
    await assert.rejects(registration.verifyEmail(ctx({ token: firstToken })), { code: "invalid_token" });
    const login = ctx({ email, password }); await auth.login(login); assert.ok(login.body.access_token);
    assert.equal(Number((await table(db, "memberships").where({ user_id: userId }).count("* AS total").first()).total), 0);
  });
  await t.test("forgot/reset uses the captured real SMTP link and invalidates the previous password", async () => {
    await registration.forgotPassword(ctx({ email })); await registration.flushMail(); assert.equal(sink.messages.length, 2);
    const value = tokenIn(sink.messages[1], "/reset-password"); assert.match(value.text, /30 минут/); assert.notEqual(value.token, firstToken);
    await registration.resetPassword(ctx({ token: value.token, password: "Changed-synthetic-mail-password!" }));
    await assert.rejects(auth.login(ctx({ email, password })), { code: "invalid_credentials" });
    const changed = ctx({ email, password: "Changed-synthetic-mail-password!" }); await auth.login(changed); assert.ok(changed.body.access_token);
  });
  let time = Date.now();
  async function job({ expiresAt = new Date(time + 3600000), consumed = false, attempts = 0, lockedUntil = null } = {}) {
    const tokenId = randomUUID(), jobId = randomUUID();
    await table(db, "account_tokens").where({ user_id: userId, purpose: "reset" }).whereNull("consumed_at").update({ consumed_at: new Date(time) });
    await table(db, "account_tokens").insert({ id: tokenId, user_id: userId, purpose: "reset", token_hash: randomUUID().replaceAll("-", "").repeat(2), expires_at: expiresAt, consumed_at: consumed ? new Date(time) : null });
    await table(db, "registration_mail_outbox").insert({ id: jobId, token_id: tokenId, payload: seal({ email, purpose: "reset", url: config.browserOrigin + "/reset-password#token=" + "b".repeat(64) }, config.jwtSecret), attempts, available_at: new Date(time), locked_until: lockedUntil, lease_id: lockedUntil ? randomUUID() : null, expires_at: new Date(time + 3600000) });
    return { id: jobId, tokenId };
  }
  await t.test("temporary provider failure retries with backoff and stable message ID, then succeeds", async () => {
    const item = await job(); let attempts = 0; const ids = [];
    const delivery = { enabled: true, async send(payload, options) { attempts++; ids.push(options.messageId); if (attempts < 2) { const error = new Error("Synthetic failure with forbidden private detail"); error.responseCode = 451; throw error; } await mail.send(payload, options); } };
    const worker = createMailOutbox({ db, config, mail: delivery, audit, now: () => time });
    await worker.flush(); const stored = await table(db, "registration_mail_outbox").where({ id: item.id }).first();
    assert.equal(stored.attempts, 1); assert.equal(stored.lease_id, null); assert.equal(new Date(stored.available_at).getTime(), time + 30000);
    await worker.flush(); assert.equal(attempts, 1); time += 30000; await worker.flush(); assert.equal(attempts, 2); assert.equal(ids[0], ids[1]);
    assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
  });
  await t.test("ordinary provider failures terminate after exactly five attempts", async () => {
    const item = await job(); let sent = 0;
    const worker = createMailOutbox({ db, config, mail: { enabled: true, async send() { sent++; const error = new Error("Synthetic timeout"); error.code = "ETIMEDOUT"; throw error; } }, audit, now: () => time });
    for (let index = 0; index < 5; index++) { await worker.flush(); time += 30000 * (2 ** index); }
    await worker.flush(); assert.equal(sent, 5);
    assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
  });
  await t.test("corrupt encrypted payload is removed without handing any data to SMTP", async () => {
    const item = await job(); await table(db, "registration_mail_outbox").where({ id: item.id }).update({ payload: "tampered" });
    let sent = 0; const worker = createMailOutbox({ db, config, mail: { enabled: true, async send() { sent++; } }, audit, now: () => time });
    await worker.flush(); assert.equal(sent, 0); assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
    const event = await table(db, "audit_events").where({ entity_id: item.tokenId }).first(); assert.ok(JSON.stringify(event.event_metadata).includes("payload_invalid"));
  });
  await t.test("concurrent ordinary workers claim one delivery once and shutdown drains it", async () => {
    await job(); let sent = 0; const started = deferred(), release = deferred();
    const delivery = { enabled: true, async send() { sent++; started.resolve(); await release.promise; } };
    const first = createMailOutbox({ db, config, mail: delivery, audit, now: () => time }), second = createMailOutbox({ db, config, mail: delivery, audit, now: () => time });
    first.start(); await started.promise; await second.flush(); assert.equal(sent, 1);
    let stopped = false; const stopping = first.stop().then(() => { stopped = true; }); await new Promise(resolve => setImmediate(resolve)); assert.equal(stopped, false);
    release.resolve(); await stopping; assert.equal(stopped, true);
  });
  await t.test("expired and consumed tokens are suppressed even if outbox expiry is later", async () => {
    let sent = 0; const worker = createMailOutbox({ db, config, mail: { enabled: true, async send() { sent++; } }, audit, now: () => time });
    const expired = await job({ expiresAt: new Date(time - 1) }); await worker.flush();
    const consumed = await job({ consumed: true }); await worker.flush();
    assert.equal(sent, 0); assert.equal((await table(db, "registration_mail_outbox").whereIn("id", [expired.id, consumed.id])).length, 0);
  });
  await t.test("crashed worker lease is recovered, while unexpired claims are not stolen", async () => {
    let sent = 0; const item = await job({ attempts: 1, lockedUntil: new Date(time + LEASE_MS) });
    const worker = createMailOutbox({ db, config, mail: { enabled: true, async send() { sent++; } }, audit, now: () => time });
    await worker.flush(); assert.equal(sent, 0); time += LEASE_MS + 1; await worker.flush(); assert.equal(sent, 1);
    assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
  });
  await t.test("crash-reclaimed exhausted jobs never exceed the five-attempt ceiling", async () => {
    let sent = 0; const item = await job({ attempts: 5, lockedUntil: new Date(time - 1) });
    const worker = createMailOutbox({ db, config, mail: { enabled: true, async send() { sent++; } }, audit, now: () => time });
    await worker.flush(); assert.equal(sent, 0); assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
    const event = await table(db, "audit_events").where({ entity_id: item.tokenId, action: "account_mail_failed" }).first(); assert.ok(JSON.stringify(event.event_metadata).includes("attempts_exhausted"));
  });
  await t.test("stale worker cannot delete or reschedule a job owned by its replacement", async () => {
    const item = await job(), firstStarted = deferred(), secondStarted = deferred(), releaseFirst = deferred(), releaseSecond = deferred();
    const first = createMailOutbox({ db, config, mail: { enabled: true, async send() { firstStarted.resolve(); await releaseFirst.promise; } }, audit, now: () => time });
    const second = createMailOutbox({ db, config, mail: { enabled: true, async send() { secondStarted.resolve(); await releaseSecond.promise; } }, audit, now: () => time });
    const firstRun = first.flush(); await firstStarted.promise; time += LEASE_MS + 1;
    const secondRun = second.flush(); await secondStarted.promise;
    const owner = await table(db, "registration_mail_outbox").where({ id: item.id }).first(); assert.equal(owner.attempts, 2);
    releaseFirst.resolve(); await firstRun;
    const afterStale = await table(db, "registration_mail_outbox").where({ id: item.id }).first(); assert.equal(afterStale.lease_id, owner.lease_id);
    releaseSecond.resolve(); await secondRun; assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
  });
  await t.test("invalid SMTP configuration preserves queued work without burning attempts", async () => {
    const item = await job(); let sent = 0;
    const worker = createMailOutbox({ db, config, mail: { enabled: true, diagnostics: () => ({ configured: false, issues: ["smtp_host"] }), async send() { sent++; } }, audit, now: () => time });
    await worker.flush(); assert.equal(sent, 0); assert.equal((await table(db, "registration_mail_outbox").where({ id: item.id }).first()).attempts, 0);
    const status = worker.status(); assert.equal(status.configuration.configured, false); assert.equal(status.last_error, null); assert.ok(status.last_success_at); assert.equal(status.polling, false);
    // The next case checks expiry cleanup for this row too.
    await table(db, "registration_mail_outbox").where({ id: item.id }).update({ expires_at: new Date(time - 1) });
  });
  await t.test("disabled SMTP still removes expired encrypted jobs and rate buckets without sending", async () => {
    const item = await job(); await table(db, "registration_mail_outbox").where({ id: item.id }).update({ expires_at: new Date(time - 1) });
    await table(db, "registration_rate_buckets").insert({ key_hash: "c".repeat(64), attempts: 1, expires_at: new Date(time - 1) });
    const worker = createMailOutbox({ db, config, mail: { enabled: false, async send() { throw new Error("Must not send"); } }, audit, now: () => time });
    await worker.flush(); assert.equal(await table(db, "registration_mail_outbox").where({ id: item.id }).first(), undefined);
    assert.equal(await table(db, "registration_rate_buckets").where({ key_hash: "c".repeat(64) }).first(), undefined);
  });
  await t.test("explicit operator grant coexists with authorization read locks and never replaces an existing membership", async () => {
    const organizationId = randomUUID();
    await table(db, "organizations").insert({ id: organizationId, name: "Synthetic operator company", external_id: "SMTP-OPERATOR-TEST", is_active: true });
    const authorization = await db.transaction();
    await table(authorization, "users").where({ id: userId }).forShare().first();
    await table(authorization, "organizations").where({ id: organizationId }).forShare().first();
    const args = { email, mode: "organization-admin", organizationId, createOrganization: false, apply: true };
    const grant = provision(db, args); let timeout;
    try {
      const result = await Promise.race([grant, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Operator write blocked on unrelated authorization read locks")), 2000); })]);
      assert.equal(result.applied, true);
    } finally { clearTimeout(timeout); await authorization.rollback(); await grant; }
    const member = await table(db, "memberships").where({ user_id: userId, organization_id: organizationId }).first();
    await assert.rejects(provision(db, args), /Membership already exists/);
    assert.equal((await table(db, "memberships").where({ id: member.id }).first()).role_id, member.role_id);
  });
  await t.test("audit never contains plaintext mail payloads, secrets or provider error strings", async () => {
    const serialized = JSON.stringify(await table(db, "audit_events").select());
    for (const secret of [email, password, config.registrationMail.pass, firstToken, "forbidden private detail", "#token="]) assert.ok(!serialized.includes(secret));
    assert.ok(serialized.includes("account_mail_accepted")); assert.ok(serialized.includes("account_mail_failed"));
  });
});
