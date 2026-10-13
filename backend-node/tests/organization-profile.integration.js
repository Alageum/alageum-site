"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const knex = require("knex");
const { ensureSchema: authSchema, createAuth, table, DEMO } = require("../src/domain/auth");
const { ensureSchema: auditSchema, audit } = require("../src/domain/audit");
const { ensureSchema, createOrganizationProfile, READ, UPDATE } = require("../src/domain/organization-profile");
const config = { jwtSecret: "profile-test-only-key-with-at-least-thirty-two-characters", jwtIssuer: "alageum-tests", jwtAudience: "alageum-business", accessTokenMinutes: 15, refreshTokenDays: 14, seedDemo: true, env: "test" };
const code = (value) => error => error.code === value;
function ctx(body = null, token = "", organizationId) {
  const headers = { authorization: token ? `Bearer ${token}` : "", "x-organization-id": organizationId || "" };
  return { request: { body }, query: {}, state: {}, responseHeaders: {}, get: name => headers[name.toLowerCase()] || "", set(name, value) { this.responseHeaders[name] = value; } };
}

test("isolated PostgreSQL company profile schema, authority and atomic version contract", { timeout: 90000 }, async (t) => {
  const connection = process.env.ALAGEUM_DOMAIN_TEST_DATABASE_URL;
  if (!connection || !new URL(connection).pathname.endsWith("/alageum_strapi_domain_test")) throw new Error("Dedicated ALAGEUM_DOMAIN_TEST_DATABASE_URL ending /alageum_strapi_domain_test is required");
  const db = knex({ client: "pg", connection, pool: { min: 0, max: 16, afterCreate(connection, done) { connection.query("SET statement_timeout=8000; SET lock_timeout=5000", error => done(error, connection)); } } });
  t.after(() => db.destroy());
  assert.equal((await db.raw("select current_database() AS name")).rows[0].name, "alageum_strapi_domain_test");
  await db.raw("DROP SCHEMA IF EXISTS b2b CASCADE");
  await authSchema(db);
  await auditSchema(db);
  const auth = createAuth({ db, config, audit });
  await auth.seed();
  const initialOrganizations = await table(db, "organizations").orderBy("id");
  const initialRoles = await table(db, "roles").orderBy("id");
  const domain = createOrganizationProfile({ db, auth, audit });
  const passwordHash = (await table(db, "users").where({ id: DEMO.users.buyer }).first()).password_hash;
  async function fixture(permissions = [READ, UPDATE], organizationId = DEMO.organizationA) {
    const id = randomUUID(), roleId = randomUUID(), membershipId = randomUUID();
    await table(db, "roles").insert({ id: roleId, organization_id: organizationId, code: `fixture-${roleId}`, name: "Fictitious profile test role", permissions: JSON.stringify(permissions) });
    await table(db, "users").insert({ id, email: `fixture-${id}@example.test`, display_name: "Fictitious profile tester", password_hash: passwordHash });
    await table(db, "memberships").insert({ id: membershipId, user_id: id, organization_id: organizationId, role_id: roleId });
    const request = ctx({ email: `fixture-${id}@example.test`, password: "ChangeMe123!" });
    await auth.login(request);
    return { id, roleId, membershipId, organizationId, token: request.body.access_token };
  }
  const read = async (user, org) => { const request = ctx(null, user.token, org); await domain.get(request); assert.equal(request.responseHeaders["Cache-Control"], "private, no-store"); return request.body; };
  const write = async (user, body, org, api = domain) => { const request = ctx(body, user.token, org); await api.update(request); assert.equal(request.responseHeaders["Cache-Control"], "private, no-store"); return request.body; };

  await t.test("additive schema preserves every existing organization and default role; repeat bootstrap is safe", async () => {
    await ensureSchema(db); await ensureSchema(db);
    assert.deepEqual(await table(db, "organizations").orderBy("id"), initialOrganizations);
    assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.deepEqual(await table(db, "organization_profiles"), []);
    assert.equal(await db.schema.withSchema("public").hasTable("organization_profiles"), false);
  });
  const editor = await fixture(), reader = await fixture([READ]), writerOnly = await fixture([UPDATE]), denied = await fixture(["organization.manage_users"]), otherTenant = await fixture([READ, UPDATE], DEMO.organizationB);
  await t.test("GET absent profile is version zero and never creates data", async () => {
    const profile = await read(editor);
    assert.equal(profile.version, 0); assert.equal(profile.business_contact_email, null);
    assert.deepEqual(await table(db, "organization_profiles"), []);
  });
  await t.test("read and write grants remain distinct; manage_users and default admin confer neither", async () => {
    await read(reader);
    for (const user of [writerOnly, denied]) await assert.rejects(read(user), code("permission_denied"));
    for (const user of [reader, writerOnly, denied]) await assert.rejects(write(user, { version: 0, name: "Denied" }), code("permission_denied"));
    const request = ctx({ email: "admin@demo.example", password: "ChangeMe123!" }); await auth.login(request);
    await assert.rejects(read({ token: request.body.access_token }), code("permission_denied"));
    assert.deepEqual(await table(db, "roles").whereIn("id", initialRoles.map(role => role.id)).orderBy("id"), initialRoles);
  });
  await t.test("private response headers are present even when authentication fails; native CMS credentials are rejected", async () => {
    const native = jwt.sign({ id: 1, type: "access" }, "native-cms-test-only-key-with-32-characters", { expiresIn: "15m" });
    for (const method of ["get", "update"]) for (const token of ["", native]) {
      const request = ctx({ version: 0, name: "Forbidden" }, token);
      await assert.rejects(domain[method](request), error => error.status === 401);
      assert.equal(request.responseHeaders["Cache-Control"], "private, no-store");
    }
  });
  await t.test("strict extra query/body fields fail without changing records", async () => {
    const request = ctx(null, editor.token); request.query.organization_id = DEMO.organizationB;
    await assert.rejects(domain.get(request), code("validation_error"));
    await assert.rejects(write(editor, { version: 0, name: "Bad", organization_id: DEMO.organizationB }), code("validation_error"));
    assert.deepEqual(await table(db, "organization_profiles"), []);
  });
  await t.test("cross-tenant access fails and multiple memberships require explicit valid selection", async () => {
    await assert.rejects(read(editor, DEMO.organizationB), code("organization_access_denied"));
    await assert.rejects(write(editor, { version: 0, name: "Other" }, DEMO.organizationB), code("organization_access_denied"));
    await table(db, "memberships").insert({ id: randomUUID(), user_id: reader.id, organization_id: DEMO.organizationB, role_id: otherTenant.roleId });
    await assert.rejects(read(reader), code("organization_required"));
    assert.equal((await read(reader, DEMO.organizationA)).organization_id, DEMO.organizationA);
    assert.equal((await read(reader, DEMO.organizationB)).organization_id, DEMO.organizationB);
    await assert.rejects(read(reader, randomUUID()), code("organization_access_denied"));
  });
  await t.test("no-op preserves version/time and writes no audit; first change persists one full before/after audit", async () => {
    const original = await read(editor);
    assert.deepEqual(await write(editor, { version: 0, name: original.name, business_contact_phone: " " }), original);
    assert.deepEqual(await table(db, "organization_profiles"), []);
    const saved = await write(editor, { version: 0, name: " Fictional Switchgear Company ", business_contact_name: "Fixture Contact", business_contact_email: "Fixture.Contact@Example.TEST", business_contact_phone: "+000 (000) 00 ext. 1", business_address: "Fictitious Lane\nDemo City" });
    assert.equal(saved.version, 1); assert.equal(saved.name, "Fictional Switchgear Company");
    assert.deepEqual(await read(editor), saved);
    assert.equal((await table(db, "organizations").where({ id: DEMO.organizationA }).first()).name, saved.name);
    const events = await table(db, "audit_events").where({ action: UPDATE }); assert.equal(events.length, 1);
    const metadata = typeof events[0].event_metadata === "string" ? JSON.parse(events[0].event_metadata) : events[0].event_metadata;
    assert.deepEqual(JSON.parse(JSON.stringify(metadata.before)), JSON.parse(JSON.stringify(original)));
    assert.deepEqual(JSON.parse(JSON.stringify(metadata.after)), JSON.parse(JSON.stringify(saved)));
    assert.equal(events[0].actor_user_id, editor.id);
    assert.deepEqual(await write(editor, { version: 1, name: saved.name }), saved);
    await assert.rejects(write(editor, { version: 0, name: saved.name }), code("version_conflict"));
    assert.equal((await table(db, "audit_events").where({ action: UPDATE })).length, 1);
  });
  await t.test("null/blank clear optional fields, omitted fields remain, and name stays authoritative", async () => {
    const saved = await write(editor, { version: 1, business_contact_name: null, business_contact_phone: "  " });
    assert.equal(saved.version, 2); assert.equal(saved.business_contact_name, null); assert.equal(saved.business_contact_phone, null);
    assert.equal(saved.business_contact_email, "Fixture.Contact@Example.TEST"); assert.equal(saved.business_address, "Fictitious Lane\nDemo City");
    const me = ctx(null, editor.token); await auth.me(me); assert.equal(me.body.organization.name, saved.name);
  });
  await t.test("two writers at the same version serialize without a lock upgrade or deadlock", async () => {
    const before = await read(editor);
    const results = await Promise.allSettled([write(editor, { version: before.version, name: "Concurrent fictional A" }), write(editor, { version: before.version, name: "Concurrent fictional B" })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "version_conflict");
    assert.equal((await read(editor)).version, before.version + 1);
    assert.equal((await table(db, "audit_events").where({ action: UPDATE })).length, 3);
  });
  await t.test("two first writers also serialize on the existing organization row", async () => {
    const results = await Promise.allSettled([write(otherTenant, { version: 0, name: "First fictional A" }), write(otherTenant, { version: 0, name: "First fictional B" })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "version_conflict");
    assert.equal((await read(otherTenant)).version, 1);
  });
  await t.test("audit failure rolls back both organization name and all contact fields/version", async () => {
    const before = await read(editor), organization = await table(db, "organizations").where({ id: DEMO.organizationA }).first();
    const failing = createOrganizationProfile({ db, auth, audit: async (tx, context, event) => { await audit(tx, context, event); throw new Error("injected profile audit failure"); } });
    const count = (await table(db, "audit_events")).length;
    await assert.rejects(write(editor, { version: before.version, name: "Rollback Fiction", business_contact_email: "rollback@example.test" }, undefined, failing), /injected profile audit failure/);
    assert.deepEqual(await read(editor), before); assert.deepEqual(await table(db, "organizations").where({ id: DEMO.organizationA }).first(), organization);
    assert.equal((await table(db, "audit_events")).length, count);
  });
  await t.test("authority is revalidated inside transaction after previously valid context", async () => {
    const stale = await auth.context(ctx(null, editor.token));
    const staleAuth = { permission: async () => stale };
    const guarded = createOrganizationProfile({ db, auth: staleAuth, audit });
    const before = await read(editor);
    const cases = [
      ["users", editor.id, { is_active: false }, { is_active: true }, "authentication_required"],
      ["memberships", editor.membershipId, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["organizations", DEMO.organizationA, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["roles", editor.roleId, { permissions: "[]" }, { permissions: JSON.stringify([READ, UPDATE]) }, "permission_denied"],
      ["roles", editor.roleId, { organization_id: DEMO.organizationB }, { organization_id: DEMO.organizationA }, "organization_access_denied"],
    ];
    for (const [tableName, id, revoked, restore, expected] of cases) {
      await table(db, tableName).where({ id }).update(revoked);
      try {
        await assert.rejects(write(editor, { version: before.version, name: "Revoked Fiction" }, undefined, guarded), code(expected));
        const request = ctx(null, editor.token); await assert.rejects(guarded.get(request), code(expected));
      } finally { await table(db, tableName).where({ id }).update(restore); }
    }
    assert.deepEqual(await read(editor), before);
  });
  await t.test("schema mismatch preflight refuses to repair or modify existing records", async () => {
    const before = await table(db, "organization_profiles").orderBy("organization_id");
    await db.schema.withSchema("b2b").alterTable("organization_profiles", t => t.string("unexpected_column", 10));
    await assert.rejects(ensureSchema(db), /schema mismatch/);
    assert.deepEqual((await table(db, "organization_profiles").orderBy("organization_id")).map(({ unexpected_column, ...row }) => row), before);
    assert.equal(await db.schema.withSchema("b2b").hasColumn("organization_profiles", "unexpected_column"), true);
    await db.schema.withSchema("b2b").alterTable("organization_profiles", t => t.dropColumn("unexpected_column"));
    await db.raw("ALTER TABLE b2b.organization_profiles DROP CONSTRAINT organization_profiles_positive_version");
    await assert.rejects(ensureSchema(db), /schema mismatch/);
    await db.raw("ALTER TABLE b2b.organization_profiles ADD CONSTRAINT organization_profiles_positive_version CHECK (version > 0)");
    await db.raw("ALTER TABLE b2b.organization_profiles ADD CONSTRAINT unsupported_required_email CHECK (business_contact_email IS NOT NULL) NOT VALID");
    await assert.rejects(ensureSchema(db), /schema mismatch/);
    await db.raw("ALTER TABLE b2b.organization_profiles DROP CONSTRAINT unsupported_required_email");
    await db.raw("CREATE UNIQUE INDEX unsupported_unique_phone ON b2b.organization_profiles (business_contact_phone)");
    await assert.rejects(ensureSchema(db), /schema mismatch/);
    await db.raw("DROP INDEX b2b.unsupported_unique_phone");
    await ensureSchema(db);
    assert.deepEqual(await table(db, "organization_profiles").orderBy("organization_id"), before);
  });
});
