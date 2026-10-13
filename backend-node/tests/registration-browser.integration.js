"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const knex = require("knex");
const authModule = require("../src/domain/auth");
const { createBrowserSessions } = require("../src/domain/browser-sessions");
const { ensureSchema: federatedSchema } = require("../src/domain/federated-schema");
const { ensureSchema: registrationSchema } = require("../src/domain/registration-schema");
const { ensureSchema: auditSchema, audit } = require("../src/domain/audit");
const { createRegistration } = require("../src/domain/registration");
const { unseal } = require("../src/domain/registration-mail");
const { provision } = require("../scripts/provision-business-operator");
const config = { env: "test", googleEnabled: false, jwtSecret: "synthetic-integrated-registration-key-with-at-least-32-chars", browserOrigin: "https://site.example.test", jwtIssuer: "alageum-test", jwtAudience: "alageum-test" };
const password = "Synthetic-combined-password!";
function context({ jar = new Map(), method = "POST", body = {}, boundary = "", organizationId = "", params = {}, origin = config.browserOrigin } = {}) {
  const headers = { origin, "x-browser-session": boundary, "x-organization-id": organizationId };
  return { jar, method, request: { body }, req: { socket: { remoteAddress: "127.0.0.14" } }, query: {}, params, state: {}, ip: randomUUID(), headers,
    get: name => headers[name.toLowerCase()] || "", set() {}, cookies: { get: name => jar.get(name), set(name, value) { if (value === null) jar.delete(name); else jar.set(name, value); } } };
}
test("integrated registration, real cookie authentication, company approval and credential reset", { timeout: 90000 }, async t => {
  const connection = process.env.ALAGEUM_REGISTRATION_BROWSER_TEST_DATABASE_URL;
  if (!connection || !/^\/alageum_registration_browser_test(?:_[a-z0-9]+)?$/.test(new URL(connection).pathname)) throw new Error("Use a dedicated ALAGEUM_REGISTRATION_BROWSER_TEST_DATABASE_URL database");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 12 } }); t.after(() => db.destroy());
  if ((await db.raw("SELECT 1 FROM information_schema.schemata WHERE schema_name='b2b'")).rows.length) throw new Error("Use a fresh database; refusing to overwrite existing schema");
  await authModule.ensureSchema(db); await federatedSchema(db); await registrationSchema(db); await auditSchema(db);
  const table = name => db.withSchema("b2b").table(name);
  const sessions = createBrowserSessions({ db, config, audit });
  const auth = authModule.createAuth({ db, config, audit, browserSessions: sessions });
  const service = createRegistration({ db, config, audit, auth, browserSessions: sessions, mail: { enabled: false, assertConfigured() {}, async send() { throw Error("No external mail allowed in tests"); } } });
  async function token(email, purpose) {
    const user = await table("users").where({ email }).first();
    const row = await table("account_tokens").where({ user_id: user.id, purpose }).whereNull("consumed_at").first();
    const job = await table("registration_mail_outbox").where({ token_id: row.id }).first();
    return new URLSearchParams(new URL(unseal(job.payload, config.jwtSecret).url).hash.slice(1)).get("token");
  }
  async function signup(email) { await service.register(context({ body: { email, password, display_name: "Synthetic user" } })); }
  async function verify(email) { await service.verifyEmail(context({ body: { token: await token(email, "verify") } })); }
  async function login(email, suppliedPassword = password) {
    const jar = new Map(), prepare = context({ jar }); await sessions.prepare(prepare);
    const result = context({ jar, body: { email, password: suppliedPassword, flow_id: prepare.body.flow_id } }); await auth.browserLogin(result);
    return { jar, boundary: result.body.session_id };
  }
  let applicant, admin, organizationId, requestId;
  await t.test("unverified user cannot obtain a cookie; verified user gets personal account only", async () => {
    await signup("customer@combined.test");
    await assert.rejects(login("customer@combined.test"), { code: "invalid_credentials" });
    await verify("customer@combined.test"); applicant = await login("customer@combined.test");
    const current = context({ ...applicant, method: "GET" }); await service.account(current);
    assert.equal(current.body.onboarding_status, "no_company"); assert.deepEqual(current.body.permissions, []);
    await assert.rejects(auth.me(context({ ...applicant, method: "GET" })), { code: "organization_access_denied" });
    assert.ok(applicant.jar.has("__Host-alageum_session"));
  });
  await t.test("explicitly provisioned verified manager approves a pending local-company role", async () => {
    await signup("manager@combined.test"); await verify("manager@combined.test");
    const output = await provision(db, { email: "manager@combined.test", mode: "organization-admin", createOrganization: true, organizationName: "Synthetic combined company", organizationIdentifier: "COMBINED-BIN", apply: true });
    organizationId = output.organization.id; admin = await login("manager@combined.test");
    const request = context({ ...applicant, body: { company_name: "Supplied name", company_identifier: "COMBINED-BIN" } }); await service.requestCompanyAccess(request); requestId = request.body.request.id;
    await assert.rejects(auth.me(context({ ...applicant, method: "GET", organizationId })), { code: "organization_access_denied" });
    const roles = context({ ...admin, organizationId, method: "GET" }); await service.accessRoles(roles);
    const member = roles.body.items.find(row => row.code === "company_member"); assert.ok(member);
    const approval = context({ ...admin, organizationId, params: { id: requestId }, body: { role_id: member.id } }); await service.approveAccess(approval);
    const current = context({ ...applicant, method: "GET", organizationId }); await auth.me(current);
    assert.equal(current.body.organization.id, organizationId); assert.ok(current.body.permissions.includes("quote.create"));
    assert.ok(!current.body.permissions.includes("catalog.manage"));
    await assert.rejects(auth.permission(context({ ...applicant, method: "GET", organizationId }), "catalog.manage"), { code: "permission_denied" });
  });
  await t.test("forged origin, missing boundary and revoked manager are rejected", async () => {
    await assert.rejects(service.requestCompanyAccess(context({ ...applicant, origin: "https://evil.test", body: { company_name: "Other", company_identifier: "OTHER" } })), { code: "origin_denied" });
    await assert.rejects(service.account(context({ jar: applicant.jar, method: "GET" })), { code: "authentication_required" });
    const manager = await table("users").where({ email: "manager@combined.test" }).first();
    await table("memberships").where({ user_id: manager.id }).update({ is_active: false });
    await assert.rejects(service.accessRequests(context({ ...admin, organizationId, method: "GET" })), { code: "organization_access_denied" });
  });
  await t.test("reset atomically invalidates issued cookie, bearer and refresh credentials", async () => {
    const legacy = context({ body: { email: "customer@combined.test", password } }); await auth.login(legacy);
    await service.forgotPassword(context({ body: { email: "customer@combined.test" } }));
    const raw = await token("customer@combined.test", "reset");
    await service.resetPassword(context({ body: { token: raw, password: "Changed-combined-password!" } }));
    await assert.rejects(service.account(context({ ...applicant, method: "GET" })), { code: "authentication_required" });
    const bearer = context({ method: "GET" }); bearer.headers.authorization = `Bearer ${legacy.body.access_token}`;
    await assert.rejects(auth.currentUser(bearer), { code: "authentication_required" });
    await assert.rejects(auth.refresh(context({ body: { refresh_token: legacy.body.refresh_token } })), { code: "invalid_token" });
    await assert.rejects(login("customer@combined.test"), { code: "invalid_credentials" });
    applicant = await login("customer@combined.test", "Changed-combined-password!");
    const current = context({ ...applicant, method: "GET" }); await service.account(current); assert.equal(current.body.onboarding_status, "approved");
  });
});
