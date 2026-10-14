"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const knex = require("knex");
const argon2 = require("argon2");
const { ensureSchema: authSchema, table, createAuth } = require("../src/domain/auth");
const { ensureSchema: federatedSchema } = require("../src/domain/federated-schema");
const { ensureSchema: registrationSchema } = require("../src/domain/registration-schema");
const { ensureSchema: auditSchema, audit } = require("../src/domain/audit");
const { createRegistration, ACCEPTED } = require("../src/domain/registration");
const { createRegistrationRateLimiter } = require("../src/domain/registration-rate-limit");
const { unseal } = require("../src/domain/registration-mail");
const { provision, routePending } = require("../scripts/provision-business-operator");
const config = { env: "test", jwtSecret: "synthetic-registration-test-key-at-least-32-characters", browserOrigin: "https://site.example.test", jwtIssuer: "alageum-test", jwtAudience: "alageum-test" };
const password = "Synthetic-password-123!";
function ctx(body = {}, user, params = {}, origin = config.browserOrigin) {
  return { request: { body }, req: { socket: { remoteAddress: "127.0.0.10" } }, params, headers: { origin }, state: {}, responseHeaders: {}, user,
    get(name) { return this.headers[name.toLowerCase()] || ""; }, set(name, value) { this.responseHeaders[name] = value; } };
}
const errorCode = code => error => error.code === code;
test("real PostgreSQL registration, single-use tokens, concurrency, tenancy and admin approval", { timeout: 90000 }, async t => {
  const connection = process.env.ALAGEUM_REGISTRATION_TEST_DATABASE_URL;
  if (!connection || !/^\/alageum_registration_test(?:_[a-z0-9]+)?$/.test(new URL(connection).pathname)) throw new Error("An explicitly dedicated ALAGEUM_REGISTRATION_TEST_DATABASE_URL is required");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 16 } });
  t.after(() => db.destroy());
  const existing = await db.raw("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'b2b'");
  if (existing.rows.length) throw new Error("Integration setup refuses a nonempty domain schema. Use a fresh test database.");
  await authSchema(db); await federatedSchema(db); await registrationSchema(db); await registrationSchema(db); await auditSchema(db);
  const delivered = [], mail = { enabled: true, assertConfigured() {}, async send(payload) { delivered.push(payload); } };
  const auth = {
    async currentUser(context) { const user = context.user && await table(db, "users").where({ id: context.user.id, is_active: true }).first(); if (!user) { const e = new Error(); e.code = "authentication_required"; throw e; } return user; },
    async assertActiveSession(_tx, _context, _id) {},
    async permission(context, permission) {
      const user = await this.currentUser(context);
      const membership = await table(db, "memberships").where({ user_id: user.id, organization_id: context.organizationId, is_active: true }).first();
      if (!membership) { const e = new Error(); e.code = "organization_access_denied"; throw e; }
      const role = await table(db, "roles").where({ id: membership.role_id }).first();
      const permissions = new Set(typeof role.permissions === "string" ? JSON.parse(role.permissions) : role.permissions);
      if (!permissions.has(permission)) { const e = new Error(); e.code = "permission_denied"; throw e; }
      return { user, membership, organization_id: membership.organization_id, permissions };
    },
  };
  const browserSessions = { assertOrigin(context) { if (context.get("Origin") !== config.browserOrigin) { const e = new Error(); e.code = "csrf_rejected"; throw e; } } };
  const service = createRegistration({ db, auth, config, audit, browserSessions, mail, rateLimit: async () => {}, passwordHash: value => argon2.hash(value, { memoryCost: 8192, timeCost: 1 }) });
  const userByEmail = email => table(db, "users").where({ email }).first();
  async function rawToken(email, purpose) {
    const user = await userByEmail(email), token = await table(db, "account_tokens").where({ user_id: user.id, purpose }).whereNull("consumed_at").first();
    const job = await table(db, "registration_mail_outbox").where({ token_id: token.id }).first();
    const payload = unseal(job.payload, config.jwtSecret);
    return new URLSearchParams(new URL(payload.url).hash.slice(1)).get("token");
  }
  async function signup(email) { const context = ctx({ email, password, display_name: "Synthetic applicant" }); await service.register(context); return userByEmail(email); }
  async function verify(email) { const token = await rawToken(email, "verify"); await service.verifyEmail(ctx({ token })); return userByEmail(email); }
  let applicant, orgA, orgB, adminA, adminB, roleA, roleB, globalRole, request;
  await t.test("CSRF and unsupported role/org fields are rejected", async () => {
    await assert.rejects(service.register(ctx({ email: "csrf@example.test", password, display_name: "X" }, null, {}, "https://evil.example.test")), errorCode("csrf_rejected"));
    await assert.rejects(service.register(ctx({ email: "privilege@example.test", password, display_name: "X", role_id: randomUUID() })), errorCode("validation_error"));
    assert.equal(Number((await table(db, "users").count("* AS total").first()).total), 0);
  });
  await t.test("concurrent normalized duplicate signup yields one inactive identity and one token", async () => {
    const contexts = [ctx({ email: " Applicant@Example.Test ", password, display_name: "First" }), ctx({ email: "applicant@example.test", password, display_name: "Second" })];
    await Promise.all(contexts.map(context => service.register(context)));
    assert.deepEqual(contexts[0].body, ACCEPTED); assert.deepEqual(contexts[1].body, ACCEPTED);
    applicant = await userByEmail("applicant@example.test");
    assert.equal(applicant.is_active, false);
    assert.equal(Number((await table(db, "users").count("* AS total").first()).total), 1);
    assert.equal(Number((await table(db, "account_tokens").count("* AS total").first()).total), 1);
    assert.equal(Number((await table(db, "memberships").count("* AS total").first()).total), 0);
    const legacy = createAuth({ db, config, audit });
    await assert.rejects(legacy.login(ctx({ email: applicant.email, password })), errorCode("invalid_credentials"));
  });
  await t.test("only hashed tokens persisted outside encrypted outbox; verify single-winner race", async () => {
    const raw = await rawToken(applicant.email, "verify"), row = await table(db, "account_tokens").where({ user_id: applicant.id }).first();
    assert.notEqual(row.token_hash, raw); assert.equal(row.token_hash.length, 64);
    const outcomes = await Promise.allSettled([service.verifyEmail(ctx({ token: raw })), service.verifyEmail(ctx({ token: raw }))]);
    assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(x => x.status === "rejected").reason.code, "invalid_token");
    applicant = await userByEmail(applicant.email); assert.equal(applicant.is_active, true);
    const account = ctx({}, applicant); await service.account(account);
    assert.equal(account.body.onboarding_status, "no_company"); assert.deepEqual(account.body.permissions, []);
    assert.equal(Number((await table(db, "memberships").count("* AS total").first()).total), 0);
  });
  await t.test("expired and superseded email tokens never activate users", async () => {
    await signup("expired@example.test"); const expired = await rawToken("expired@example.test", "verify");
    await table(db, "account_tokens").where({ user_id: (await userByEmail("expired@example.test")).id }).update({ expires_at: new Date(0) });
    await assert.rejects(service.verifyEmail(ctx({ token: expired })), errorCode("invalid_token"));
    const resend = ctx({ email: "expired@example.test" }); await service.resendVerification(resend);
    const fresh = await rawToken("expired@example.test", "verify"); assert.notEqual(fresh, expired);
    await assert.rejects(service.verifyEmail(ctx({ token: expired })), errorCode("invalid_token"));
    await service.verifyEmail(ctx({ token: fresh }));
  });
  await t.test("known, unknown and disabled reset requests share exact generic response", async () => {
    for (const email of [applicant.email, "missing@example.test", "unknown-disabled@example.test"]) {
      const context = ctx({ email }); await service.forgotPassword(context); assert.equal(context.status, 202); assert.deepEqual(context.body, ACCEPTED);
    }
  });
  await t.test("password reset is single-use and increments revocation version atomically", async () => {
    const raw = await rawToken(applicant.email, "reset");
    const outcomes = await Promise.allSettled([service.resetPassword(ctx({ token: raw, password: "New-synthetic-password!" })), service.resetPassword(ctx({ token: raw, password: "New-synthetic-password!" }))]);
    assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(x => x.status === "rejected").reason.code, "invalid_token");
    applicant = await userByEmail(applicant.email); assert.equal(applicant.credential_version, 1);
    assert.equal(await argon2.verify(applicant.password_hash, "New-synthetic-password!"), true);
    assert.equal(await argon2.verify(applicant.password_hash, password), false);
  });
  await t.test("mail outbox does not deliver consumed tokens; valid jobs use token fragments", async () => {
    await signup("mail@example.test"); await service.flushMail();
    assert.equal(delivered.length, 1); assert.equal(delivered[0].email, "mail@example.test");
    assert.equal(new URL(delivered[0].url).search, ""); assert.match(new URL(delivered[0].url).hash, /^#token=/);
    assert.equal(Number((await table(db, "registration_mail_outbox").count("* AS total").first()).total), 0);
  });
  await t.test("operator CLI cannot bypass verification and is dry-run by default", async () => {
    await signup("admina@example.test");
    const args = { email: "admina@example.test", mode: "organization-admin", createOrganization: true, organizationName: "Synthetic A", organizationIdentifier: "ORG-A", apply: false };
    await assert.rejects(provision(db, args), /email-verified/);
    adminA = await verify("admina@example.test");
    const preview = await provision(db, args); assert.equal(preview.applied, false);
    assert.equal(Number((await table(db, "organizations").count("* AS total").first()).total), 0);
    const actual = await provision(db, { ...args, apply: true }); orgA = actual.organization.id;
    await signup("adminb@example.test"); adminB = await verify("adminb@example.test");
    orgB = (await provision(db, { ...args, email: adminB.email, organizationName: "Synthetic B", organizationIdentifier: "ORG-B", apply: true })).organization.id;
    roleA = await table(db, "roles").where({ organization_id: orgA, code: "company_member" }).first();
    roleB = await table(db, "roles").where({ organization_id: orgB, code: "company_member" }).first();
    globalRole = { id: randomUUID(), organization_id: null, code: "synthetic_platform", name: "Platform", permissions: JSON.stringify(["catalog.manage"]) }; await table(db, "roles").insert(globalRole);
  });
  await t.test("company names/domains never grant access; concurrent requests deduplicate", async () => {
    const body = { company_name: "Untrusted supplied name", company_identifier: "ORG-A", message: "Please review" };
    const contexts = [ctx(body, applicant), ctx(body, applicant)]; await Promise.all(contexts.map(context => service.requestCompanyAccess(context)));
    assert.equal(contexts[0].body.request.id, contexts[1].body.request.id); request = contexts[0].body.request;
    assert.equal(Number((await table(db, "memberships").where({ user_id: applicant.id }).count("* AS total").first()).total), 0);
    const account = ctx({}, applicant); await service.account(account); assert.equal(account.body.onboarding_status, "pending");
    const unknown = ctx({ company_name: "Unknown", company_identifier: "UNKNOWN" }, applicant); await service.requestCompanyAccess(unknown);
    assert.equal(unknown.body.request.status, "pending"); assert.ok(!Object.hasOwn(unknown.body.request, "organization_id"));
  });
  await t.test("operator can route unresolved requests to an explicitly created company without granting access", async () => {
    const org = { id: randomUUID(), name: "Newly created company", external_id: "UNKNOWN", is_active: true };
    await table(db, "organizations").insert(org);
    const preview = await routePending(db, { organizationId: org.id, apply: false });
    assert.equal(preview.request_ids.length, 1);
    assert.equal((await table(db, "company_access_requests").where({ company_identifier: "UNKNOWN" }).first()).organization_id, null);
    await routePending(db, { organizationId: org.id, apply: true });
    const routed = await table(db, "company_access_requests").where({ company_identifier: "UNKNOWN" }).first();
    assert.equal(routed.organization_id, org.id); assert.equal(routed.status, "pending");
    assert.equal(Number((await table(db, "memberships").where({ user_id: applicant.id, organization_id: org.id }).count("* AS total").first()).total), 0);
  });
  await t.test("cross-tenant readers and approvals cannot disclose requests", async () => {
    const context = ctx({}, adminB); context.organizationId = orgB; await service.accessRequests(context); assert.deepEqual(context.body.items, []);
    const approve = ctx({ role_id: roleB.id }, adminB, { id: request.id }); approve.organizationId = orgB;
    await assert.rejects(service.approveAccess(approve), errorCode("not_found"));
    const noMember = ctx({}, applicant); noMember.organizationId = orgA; await assert.rejects(service.accessRequests(noMember), errorCode("organization_access_denied"));
  });
  await t.test("approval rejects foreign/global roles and requires fresh manager authorization", async () => {
    for (const role of [roleB, globalRole]) {
      const context = ctx({ role_id: role.id }, adminA, { id: request.id }); context.organizationId = orgA;
      await assert.rejects(service.approveAccess(context), errorCode("permission_denied"));
    }
    const roles = ctx({}, adminA); roles.organizationId = orgA; await service.accessRoles(roles);
    assert.ok(roles.body.items.some(role => role.id === roleA.id)); assert.ok(!roles.body.items.some(role => role.id === globalRole.id || role.id === roleB.id));
  });
  await t.test("simultaneous admin approvals create exactly one membership", async () => {
    const contexts = [ctx({ role_id: roleA.id }, adminA, { id: request.id }), ctx({ role_id: roleA.id }, adminA, { id: request.id })]; contexts.forEach(c => c.organizationId = orgA);
    const outcomes = await Promise.allSettled(contexts.map(context => service.approveAccess(context)));
    assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1); assert.equal(outcomes.find(x => x.status === "rejected").reason.code, "request_already_decided");
    assert.equal(Number((await table(db, "memberships").where({ user_id: applicant.id }).count("* AS total").first()).total), 1);
    const account = ctx({}, applicant); await service.account(account); assert.equal(account.body.onboarding_status, "approved");
    const membership = await table(db, "memberships").where({ user_id: applicant.id }).first(); assert.equal(membership.role_id, roleA.id);
  });
  await t.test("managers reviewing each other reject existing memberships without reciprocal row-lock deadlock", async () => {
    await signup("second-admin@example.test"); const second = await verify("second-admin@example.test");
    await provision(db, { email: second.email, mode: "organization-admin", createOrganization: false, organizationId: orgA, apply: true });
    const a = ctx({ company_name: "Synthetic A", company_identifier: "ORG-A" }, adminA), b = ctx({ company_name: "Synthetic A", company_identifier: "ORG-A" }, second);
    await service.requestCompanyAccess(a); await service.requestCompanyAccess(b);
    const decisions = [ctx({ role_id: roleA.id }, adminA, { id: b.body.request.id }), ctx({ role_id: roleA.id }, second, { id: a.body.request.id })]; decisions.forEach(context => context.organizationId = orgA);
    // Hold both request rows until both approval transactions hold their own
    // authorization rows. Releasing together reproduces the reciprocal-lock case.
    const blocker = await db.transaction();
    await table(blocker, "company_access_requests").whereIn("id", [a.body.request.id, b.body.request.id]).forUpdate().select();
    const outcomesPromise = Promise.allSettled(decisions.map(context => service.approveAccess(context)));
    let waiting = 0;
    try {
      for (let attempt = 0; attempt < 200; attempt++) {
        const result = await db.raw("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%company_access_requests%'");
        waiting = result.rows[0].count;
        if (waiting >= 2) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally { await blocker.commit(); }
    const outcomes = await outcomesPromise;
    assert.equal(waiting, 2, "Both decisions reached the controlled request-row barrier");
    assert.deepEqual(outcomes.map(result => result.status === "rejected" ? result.reason.code : "unexpected_success"), ["membership_exists", "membership_exists"]);
  });
  await t.test("distributed rate limiter atomically charges concurrent attempts and ignores spoofed forwarding", async () => {
    const limit = createRegistrationRateLimiter({ db, secret: config.jwtSecret }), context = ctx(); context.req.socket.remoteAddress = "127.0.0.77"; context.headers["x-forwarded-for"] = "attacker-controlled";
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => limit(context, "mail", "limited@example.test")));
    assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 5);
    assert.equal(outcomes.filter(x => x.status === "rejected" && x.reason.code === "rate_limited").length, 3);
    assert.ok(Number(context.responseHeaders["Retry-After"]) > 0);
  });
  await t.test("blocked IPs cannot allocate new email buckets after their quota", async () => {
    const limit = createRegistrationRateLimiter({ db, secret: config.jwtSecret }), context = ctx(); context.req.socket.remoteAddress = "127.0.0.88";
    for (let i = 0; i < 20; i++) await limit(context, "mail", `quota-${i}@example.test`);
    const before = Number((await table(db, "rate_limit_buckets").count("* AS total").first()).total);
    for (let i = 0; i < 10; i++) await assert.rejects(limit(context, "mail", `blocked-${i}@example.test`), errorCode("rate_limited"));
    const after = Number((await table(db, "rate_limit_buckets").count("* AS total").first()).total);
    assert.equal(after, before);
  });
  await t.test("audit has no passwords, email tokens or plaintext email delivery payloads", async () => {
    const rows = await table(db, "audit_events").select(); const json = JSON.stringify(rows);
    assert.ok(!json.includes(password)); assert.ok(!json.includes("New-synthetic-password!")); assert.ok(!json.includes("#token="));
    assert.ok(rows.some(row => row.action === "company_access_approved")); assert.ok(rows.some(row => row.action === "password_reset"));
  });
});
