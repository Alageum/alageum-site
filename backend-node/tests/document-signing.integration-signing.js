"use strict";
// Mock verification outcomes here exercise our boundaries, NOT real cryptography.
const { test } = require("node:test"), assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto"), jwt = require("jsonwebtoken"), knex = require("knex");
const authModule = require("../src/domain/auth"), auditModule = require("../src/domain/audit"), documents = require("../src/domain/documents");
const schema = require("../src/domain/document-signing-schema"), signing = require("../src/domain/document-signing"), policy = require("../src/domain/document-signing-policy");
const code = value => e => e.code === value;
const config = { env: "test", jwtSecret: "fictitious-tests-only-".repeat(3), jwtIssuer: "eds-test", jwtAudience: "eds-test", seedDemo: false };
const fakeCMS = () => Buffer.from(`fictitious CMS test bytes ${randomUUID()}`).toString("base64");
const approved = input => ({ status: "valid", content_sha256: input.sha256, signature_valid: true, chain_trusted: true, revocation: "good", certificate_time_valid: true, signing_usage_valid: true, organization_authorized: true, provider: "synthetic-test-verifier" });

test("isolated PostgreSQL document signing safety contract (synthetic verifier only)", { timeout: 90000 }, async t => {
  const connection = process.env.ALAGEUM_EDS_TEST_DATABASE_URL;
  if (!connection) throw Error("ALAGEUM_EDS_TEST_DATABASE_URL required");
  const url = new URL(connection);
  if (process.env.APP_ENV !== "test" || url.hostname !== "127.0.0.1" || url.pathname !== "/alageum_strapi_eds_test" || url.search) throw Error("Fresh isolated loopback test database required");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 16, afterCreate(c, done) { c.query("SET statement_timeout=8000; SET lock_timeout=5000", e => done(e, c)); } } });
  t.after(() => db.destroy());
  assert.equal((await db.raw("SELECT current_database() AS name")).rows[0].name, "alageum_strapi_eds_test");
  assert.equal((await db.raw("SELECT to_regnamespace('b2b') AS ns")).rows[0].ns, null, "Runner must provide a FRESH database; never destroy unknown data");
  await authModule.ensureSchema(db); await auditModule.ensureSchema(db); await documents.ensureSchema(db); await schema.ensureSchema(db);
  const table = name => authModule.table(db, name), orgA = randomUUID(), orgB = randomUUID(), type = randomUUID();
  await table("organizations").insert([{ id: orgA, name: "Fictitious A" }, { id: orgB, name: "Fictitious B" }]);
  await table("document_types").insert({ id: type, code: "synthetic", name: "Synthetic", is_active: true });
  const auth = authModule.createAuth({ db, config, audit: auditModule.audit });
  const domain = (provider = { available: true, verify: async input => approved(input) }, options = {}) => signing.createDocumentSigning({ db, auth, audit: auditModule.audit, enabled: true, verifier: provider, ...options });
  const api = domain();
  async function user(org = orgA, permissions = [signing.READ, signing.SIGN]) {
    const id = randomUUID(), role = randomUUID(), member = randomUUID();
    await table("users").insert({ id, email: `${id}@fixture.invalid`, display_name: "Synthetic", password_hash: "not-a-login-hash" });
    await table("roles").insert({ id: role, organization_id: org, code: role, name: "Synthetic", permissions: JSON.stringify(permissions) });
    await table("memberships").insert({ id: member, user_id: id, organization_id: org, role_id: role });
    const now = Math.floor(Date.now() / 1000), token = jwt.sign({ sub: id, type: "access", jti: randomUUID(), iat: now, nbf: now, exp: now + 3600 }, config.jwtSecret, { issuer: config.jwtIssuer, audience: config.jwtAudience });
    return { id, role, member, org, token };
  }
  const actor = await user(), peer = await user(), reader = await user(orgA, [signing.READ]), writer = await user(orgA, [signing.SIGN]), foreign = await user(orgB);
  function ctx(who, id, body, intentId) {
    const headers = { authorization: who ? `Bearer ${who.token}` : "", "x-organization-id": who?.org || "" };
    return { params: { id, intentId }, request: { body }, state: { requestId: randomUUID() }, query: {}, responseHeaders: {}, get: name => headers[name.toLowerCase()] || "", set(name, value) { this.responseHeaders[name] = value; } };
  }
  async function call(method, doc, body, intentId, who = actor, service = api) { const request = ctx(who, doc.id, body, intentId); await service[method](request); assert.equal(request.responseHeaders["Cache-Control"], "private, no-store"); return request.body; }
  async function doc(org = orgA, provision = true) {
    const id = randomUUID(), file = randomUUID(), version = randomUUID(), bytes = Buffer.from(`%PDF-1.7\nFictitious ${id}\n%%EOF\n`), now = new Date();
    await table("documents").insert({ id, organization_id: org, type_id: type, title: "Synthetic signing document", number: null, external_id: null, source: "test", created_at: now, updated_at: now });
    await table("file_objects").insert({ id: file, organization_id: org, storage_key: `fixture/${file}`, original_name: "synthetic.pdf", content_type: "application/pdf", size_bytes: bytes.length, checksum_sha256: policy.sha256(bytes), storage_backend: "fixture-not-a-storage-provider", created_at: now, updated_at: now });
    await table("document_versions").insert({ id: version, document_id: id, organization_id: org, file_id: file, version: 1, created_at: now, updated_at: now });
    const snapshot = provision && await signing.provisionSnapshot(db, { organizationId: org, documentVersionId: version, bytes });
    return { id, file, version, bytes, snapshot, org };
  }
  const prepare = (d, service = api, who = actor) => call("prepare", d, { version_id: d.snapshot.id }, null, who, service);
  const submit = (d, intent, cms = fakeCMS(), service = api, who = actor) => call("submit", d, { signature_base64: cms }, intent.id, who, service);
  const count = async action => Number((await table("audit_events").where({ action }).count("* AS count").first()).count);
  await t.test("repeat schema is additive; old seven-field document contract stays intact", async () => {
    await schema.ensureSchema(db); await schema.preflightSchema(db); await documents.verifySchema(db);
    const d = await doc(); const response = ctx(actor, d.id); await documents.createDocuments({ db, auth, audit: auditModule.audit }).detail(response);
    assert.equal(Object.keys(response.body).length, 7); assert.equal(response.body.latest_file_id, d.file);
  });
  await t.test("anonymous, reader-only, signer-only and foreign organization are denied", async () => {
    const d = await doc(), other = await doc(orgB);
    await assert.rejects(call("status", d, null, null, null), code("authentication_required"));
    for (const who of [reader, writer]) await assert.rejects(prepare(d, api, who), code("permission_denied"));
    await assert.rejects(prepare(other), code("document_not_found"));
    await assert.rejects(call("status", d, null, null, foreign), code("document_not_found"));
    const request = ctx(actor, d.id); request.get = name => name === "Authorization" ? "Bearer invalid.native.cms.token" : "";
    await assert.rejects(api.status(request), code("invalid_token"));
  });
  await t.test("default flags/provider and absent private bytes cannot enable signing", async () => {
    const d = await doc(), noBytes = await doc(orgA, false);
    const disabled = domain(undefined, { enabled: false });
    assert.equal((await call("status", d, null, null, actor, disabled)).reason, "disabled");
    await assert.rejects(prepare(d, disabled), code("signing_disabled"));
    const offline = domain(policy.unavailableVerifier);
    assert.equal((await call("status", d, null, null, actor, offline)).signing_allowed, false);
    await assert.rejects(prepare(d, offline), code("verifier_unavailable"));
    assert.equal((await call("status", noBytes)).reason, "file_unavailable");
  });
  await t.test("prepare binds exact private bytes, version/hash and five-minute expiry", async () => {
    const d = await doc(), intent = await prepare(d);
    assert.equal(intent.version_id, d.snapshot.id); assert.equal(intent.sha256, policy.sha256(d.bytes)); assert.deepEqual(Buffer.from(intent.content_base64, "base64"), d.bytes);
    assert.ok(new Date(intent.expires_at).getTime() - Date.now() <= policy.INTENT_TTL_MS);
    await assert.rejects(call("prepare", d, { version_id: randomUUID() }), code("document_version_changed"));
    await assert.rejects(call("prepare", d, { version_id: d.snapshot.id, organization_id: orgB }), code("validation_error"));
    await call("cancel", d, null, intent.id);
  });
  await t.test("canonical CMS only; client trust flags and oversize input never enter persistence", async () => {
    const d = await doc(), intent = await prepare(d);
    for (const value of [null, "", "abc", "YWJj\n", "x".repeat(350000)]) await assert.rejects(submit(d, intent, value), code("invalid_signature"));
    await assert.rejects(call("submit", d, { signature_base64: fakeCMS(), verified: true }, intent.id), code("validation_error"));
    assert.equal(await table("eds_signatures").where({ intent_id: intent.id }).first(), undefined);
    await call("cancel", d, null, intent.id);
  });
  await t.test("cancel is idempotent, prevents submit and is isolated by actor and tenant", async () => {
    const d = await doc(), intent = await prepare(d);
    await assert.rejects(call("cancel", d, null, intent.id, peer), code("signing_intent_not_found"));
    await assert.rejects(submit(d, intent, fakeCMS(), api, peer), code("signing_intent_not_found"));
    await call("cancel", d, null, intent.id); await call("cancel", d, null, intent.id);
    await assert.rejects(submit(d, intent), code("signing_cancelled"));
  });
  await t.test("expired intents never accept new signatures", async () => {
    const d = await doc(), expired = domain(undefined, { now: () => new Date(Date.now() - policy.INTENT_TTL_MS - 1000) }), intent = await prepare(d, expired);
    await assert.rejects(submit(d, intent), code("signing_intent_expired"));
  });
  await t.test("trusted test provider receives server bytes, exact retry is idempotent and delivery stays unconfigured", async () => {
    const d = await doc(); let calls = 0;
    const service = domain({ available: true, async verify(input) { calls++; assert.deepEqual(input.content, d.bytes); assert.equal(input.organizationId, orgA); assert.equal(input.actorUserId, actor.id); return approved(input); } });
    const intent = await prepare(d, service), cms = fakeCMS(), before = await count("document.signature_verified");
    const first = await submit(d, intent, cms, service), second = await submit(d, intent, cms, service);
    assert.deepEqual(second, first); assert.equal(first.status, "verified"); assert.equal(first.delivery_status, "not_configured"); assert.equal(calls, 1); assert.equal(await count("document.signature_verified"), before + 1);
    await assert.rejects(submit(d, intent, fakeCMS(), service), code("signing_intent_conflict"));
    await assert.rejects(call("cancel", d, null, intent.id), code("signing_already_submitted"));
    assert.equal((await call("status", d)).signature.id, first.id);
  });
  await t.test("substituted content, revoked cert and missing company authority reject signatures", async () => {
    for (const patch of [{ content_sha256: "0".repeat(64) }, { revocation: "revoked" }, { organization_authorized: false }, { chain_trusted: false }]) {
      const d = await doc(), service = domain({ available: true, verify: async input => ({ ...approved(input), ...patch }) }), intent = await prepare(d, service);
      assert.equal((await submit(d, intent, fakeCMS(), service)).status, "rejected");
    }
  });
  await t.test("same CMS cannot be replayed across documents/intents", async () => {
    const a = await doc(), b = await doc(), cms = fakeCMS(); await submit(a, await prepare(a), cms);
    const intent = await prepare(b); await assert.rejects(submit(b, intent, cms), code("signature_replay")); await call("cancel", b, null, intent.id);
  });
  await t.test("provider unavailable/timeout stays pending; same explicit retry can finish", async () => {
    const d = await doc(); let result = "unavailable";
    const service = domain({ available: true, verify: async input => result === "unavailable" ? { status: result } : approved(input) });
    const intent = await prepare(d, service), cms = fakeCMS();
    assert.equal((await submit(d, intent, cms, service)).status, "pending_verification");
    result = "valid"; assert.equal((await submit(d, intent, cms, service)).status, "verified");
    const hung = domain({ available: true, verify: () => new Promise(() => {}) }, { verificationTimeoutMs: 5 }), other = await doc();
    assert.equal((await submit(other, await prepare(other, hung), fakeCMS(), hung)).status, "pending_verification");
  });
  await t.test("concurrent identical submissions create one receipt and one verified audit", async () => {
    const d = await doc(); let calls = 0;
    const service = domain({ available: true, async verify(input) { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return approved(input); } });
    const intent = await prepare(d, service), cms = fakeCMS(), before = await count("document.signature_verified");
    const [a, b] = await Promise.all([submit(d, intent, cms, service), submit(d, intent, cms, service)]);
    assert.deepEqual(a, b); assert.equal(calls, 1); assert.equal(await count("document.signature_verified"), before + 1);
    assert.equal((await table("eds_signatures").where({ intent_id: intent.id })).length, 1);
  });
  await t.test("metadata substitution and new version fail closed before or during verification", async () => {
    const d = await doc(), intent = await prepare(d);
    await table("file_objects").where({ id: d.file }).update({ checksum_sha256: "0".repeat(64) });
    await assert.rejects(submit(d, intent), code("document_integrity_failed"));
    await table("file_objects").where({ id: d.file }).update({ checksum_sha256: policy.sha256(d.bytes) });
    const service = domain({ available: true, async verify(input) { await table("document_versions").insert({ id: randomUUID(), organization_id: orgA, document_id: d.id, file_id: d.file, version: 2, created_at: new Date(), updated_at: new Date() }); return approved(input); } });
    await assert.rejects(submit(d, intent, fakeCMS(), service), code("document_version_changed"));
    assert.equal((await table("eds_signatures").where({ intent_id: intent.id }).first()).status, "pending_verification");
  });
  await t.test("revocation during verification prevents trusted commit, even after initial authorization", async () => {
    const who = await user(), d = await doc(), service = domain({ available: true, async verify(input) { await table("memberships").where({ id: who.member }).update({ is_active: false }); return approved(input); } });
    const intent = await prepare(d, service, who);
    await assert.rejects(submit(d, intent, fakeCMS(), service, who), code("organization_access_denied"));
    assert.equal((await table("eds_signatures").where({ intent_id: intent.id }).first()).status, "pending_verification");
  });
  await t.test("audit failure rolls back prepare and trusted transition independently", async () => {
    const d = await doc(), before = (await table("eds_intents")).length;
    const failing = domain(undefined, { audit: async () => { throw Error("Synthetic audit failure"); } });
    await assert.rejects(prepare(d, failing), /Synthetic audit failure/); assert.equal((await table("eds_intents")).length, before);
    const service = domain(undefined, { audit: async (tx, ctx, event) => { if (event.action === "document.signature_verified") throw Error("Synthetic final audit failure"); await auditModule.audit(tx, ctx, event); } });
    const intent = await prepare(d, service); await assert.rejects(submit(d, intent, fakeCMS(), service), /Synthetic final audit failure/);
    assert.equal((await table("eds_signatures").where({ intent_id: intent.id }).first()).status, "pending_verification");
  });
  await t.test("database guards forbid snapshot rewrite/delete and terminal signature alteration", async () => {
    const d = await doc(), signature = await submit(d, await prepare(d));
    for (const action of [() => table("eds_snapshots").where({ id: d.snapshot.id }).update({ content: Buffer.from("changed") }), () => table("eds_snapshots").where({ id: d.snapshot.id }).del(), () => table("eds_signatures").where({ id: signature.id }).update({ status: "rejected" })]) await assert.rejects(action);
    assert.deepEqual(await signing.provisionSnapshot(db, { organizationId: orgA, documentVersionId: d.version, bytes: d.bytes }), d.snapshot);
    await assert.rejects(signing.provisionSnapshot(db, { organizationId: orgB, documentVersionId: d.version, bytes: d.bytes }), code("document_not_found"));
  });
  await t.test("pending verification can be retried after reload using stored evidence only", async () => {
    const d = await doc(), offline = domain({ available: true, verify: async () => ({ status: "unavailable" }) });
    const intent = await prepare(d, offline), received = await submit(d, intent, fakeCMS(), offline);
    const request = ctx(actor, d.id, {}); request.params.signatureId = received.id;
    await api.recheck(request); assert.equal(request.body.status, "verified");
    const stolen = ctx(peer, d.id, {}); stolen.params.signatureId = received.id;
    await assert.rejects(api.recheck(stolen), code("signature_not_found"));
    const forged = ctx(actor, d.id, { signature_base64: fakeCMS() }); forged.params.signatureId = received.id;
    await assert.rejects(api.recheck(forged), code("validation_error"));
  });
  await t.test("final verification holds version/file authority against concurrent changes until commit", async () => {
    for (const target of ["version", "file", "older-version-reorder"]) {
      const d = await doc(); let release, atFinal;
      let older;
      if (target === "older-version-reorder") {
        // Current is version 2, with its own immutable snapshot; existing row 1
        // can later be renumbered without changing any foreign-key columns.
        older = d.version;
        const next = randomUUID();
        await table("document_versions").insert({ id: next, organization_id: orgA, document_id: d.id, file_id: d.file, version: 2, created_at: new Date(), updated_at: new Date() });
        d.snapshot = await signing.provisionSnapshot(db, { organizationId: orgA, documentVersionId: next, bytes: d.bytes });
      }
      const reached = new Promise(resolve => { atFinal = resolve; }), barrier = new Promise(resolve => { release = resolve; });
      const service = domain(undefined, { audit: async (tx, ctx, event) => {
        await auditModule.audit(tx, ctx, event);
        if (event.action === "document.signature_verified") { atFinal(); await barrier; }
      } });
      const intent = await prepare(d, service), signingResult = submit(d, intent, fakeCMS(), service);
      await reached;
      let changed = false;
      const mutation = (target === "version"
        ? table("document_versions").insert({ id: randomUUID(), organization_id: orgA, document_id: d.id, file_id: d.file, version: 2, created_at: new Date(), updated_at: new Date() })
        : target === "older-version-reorder" ? table("document_versions").where({ id: older }).update({ version: 3 })
        : table("file_objects").where({ id: d.file }).update({ checksum_sha256: "0".repeat(64) }))
        .then(() => { changed = true; });
      await new Promise(resolve => setTimeout(resolve, 75));
      assert.equal(changed, false, `${target} mutation must wait for accepted verification`);
      release(); assert.equal((await signingResult).status, "verified"); await mutation;
      if (target === "file") await table("file_objects").where({ id: d.file }).update({ checksum_sha256: policy.sha256(d.bytes) });
    }
  });
  await t.test("concurrent prepares obey the five-active-intent limit across distinct documents", async () => {
    const who = await user(), docs = await Promise.all(Array.from({ length: 8 }, () => doc()));
    const attempts = await Promise.allSettled(docs.map(d => prepare(d, api, who)));
    assert.equal(attempts.filter(x => x.status === "fulfilled").length, 5);
    assert.equal(attempts.filter(x => x.status === "rejected" && x.reason.code === "signing_rate_limited").length, 3);
    for (let i = 0; i < attempts.length; i++) if (attempts[i].status === "fulfilled") await call("cancel", docs[i], {}, attempts[i].value.id, who);
  });
  await t.test("verified receipt takes precedence over a later rejected concurrent attempt", async () => {
    const d = await doc(), first = await prepare(d), second = await prepare(d);
    const accepted = await submit(d, first);
    const rejecting = domain({ available: true, verify: async input => ({ ...approved(input), chain_trusted: false }) });
    assert.equal((await submit(d, second, fakeCMS(), rejecting)).status, "rejected");
    assert.equal((await call("status", d)).signature.id, accepted.id);
    await assert.rejects(prepare(d), code("document_already_signed"));
  });
  await t.test("cookie logout during verifier work rejects trusted commit; final session lock serializes logout", async () => {
    await require("../src/domain/federated-schema").ensureSchema(db);
    const cookieConfig = { ...config, googleEnabled: true, googleClientId: "synthetic.apps.googleusercontent.com", googleClientSecret: "synthetic-only-client-secret", browserOrigin: "http://localhost:3099" };
    const federated = require("../src/domain/federated-auth").createFederatedAuth({ db, config: cookieConfig, audit: auditModule.audit, google: {} });
    const cookieAuth = authModule.createAuth({ db, config: cookieConfig, audit: auditModule.audit, browserSessions: federated });
    async function session() {
      const id = randomUUID(), raw = randomBytes(32).toString("base64url"), browserHash = policy.sha256(randomUUID());
      await table("federated_browsers").insert({ browser_hash: browserHash, state_hash: null, flow_id: randomUUID(), expires_at: new Date(Date.now() + 60000) });
      await table("browser_sessions").insert({ id, token_hash: policy.sha256(raw), browser_hash: browserHash, user_id: actor.id, expires_at: new Date(Date.now() + 60000) });
      return { id, raw };
    }
    function request(d, s, body = {}, intentId) {
      const value = ctx(actor, d.id, body, intentId);
      const headers = { origin: cookieConfig.browserOrigin, "x-browser-session": s.id, "x-organization-id": orgA };
      value.method = "POST"; value.get = name => headers[name.toLowerCase()] || "";
      const jar = new Map([["alageum_dev_session", s.raw]]);
      value.cookies = { get: name => jar.get(name), set: (name, val) => { if (val === null) jar.delete(name); else jar.set(name, val); } };
      return value;
    }
    const first = await session(), d = await doc();
    const revoked = domain({ available: true, async verify(input) { await federated.logout(request(d, first)); return approved(input); } }, { auth: cookieAuth });
    const preparation = request(d, first, { version_id: d.snapshot.id }); await revoked.prepare(preparation);
    await assert.rejects(revoked.submit(request(d, first, { signature_base64: fakeCMS() }, preparation.body.id)), code("authentication_required"));
    assert.equal((await table("eds_signatures").where({ intent_id: preparation.body.id }).first()).status, "pending_verification");
    const second = await session(), another = await doc(); let release, reached;
    const ready = new Promise(resolve => { reached = resolve; }), barrier = new Promise(resolve => { release = resolve; });
    const protectedDomain = domain(undefined, { auth: cookieAuth, audit: async (tx, ctx, event) => { await auditModule.audit(tx, ctx, event); if (event.action === "document.signature_verified") { reached(); await barrier; } } });
    const next = request(another, second, { version_id: another.snapshot.id }); await protectedDomain.prepare(next);
    const submission = request(another, second, { signature_base64: fakeCMS() }, next.body.id), pending = protectedDomain.submit(submission); await ready;
    let completed = false; const logout = federated.logout(request(another, second)).then(() => { completed = true; });
    let blocked = false;
    try {
      for (let i = 0; i < 100; i++) {
        if ((await db.raw("SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%browser_sessions%'")).rows.length) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(blocked, true); assert.equal(completed, false);
    } finally { release(); }
    await pending; assert.equal(submission.body.status, "verified"); await logout;
    await assert.rejects(protectedDomain.status(request(another, second)), code("authentication_required"));
  });
  await t.test("schema drift is refused rather than silently repaired", async () => {
    await db.raw("ALTER TABLE b2b.eds_snapshots DISABLE TRIGGER eds_snapshots_guard");
    await assert.rejects(schema.preflightSchema(db), /EDS schema mismatch/);
    await db.raw("ALTER TABLE b2b.eds_snapshots ENABLE TRIGGER eds_snapshots_guard");
    await schema.preflightSchema(db); await documents.verifySchema(db);
    for (const sql of ["ALTER TABLE b2b.eds_intents ALTER COLUMN actor_user_id DROP NOT NULL", "ALTER TABLE b2b.eds_snapshots ALTER COLUMN sha256 TYPE varchar(65)", "ALTER TABLE b2b.eds_signatures DROP CONSTRAINT eds_signatures_organization_id_signature_sha256_key", "DROP TRIGGER eds_snapshots_guard ON b2b.eds_snapshots; CREATE TRIGGER eds_snapshots_guard BEFORE UPDATE OR DELETE ON b2b.eds_snapshots FOR EACH ROW WHEN (false) EXECUTE FUNCTION b2b.eds_snapshots_immutable()"]) {
      const marker = new Error("rollback reviewed drift probe");
      await assert.rejects(db.transaction(async tx => { await tx.raw(sql); await assert.rejects(schema.preflightSchema(tx), /EDS schema mismatch/); throw marker; }), e => e === marker);
    }
  });
});
