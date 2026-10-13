"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateFixtureEnvironment, seedTestMemberUsers, generateFixtureSecrets, GRANTS, TOTAL_A } = require("../scripts/seed-test-member-users");
const valid = () => ({ APP_ENV: "test", ALAGEUM_TEST_MEMBER_FIXTURES: "1", DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_member_test", E2E_MEMBER_PASSWORD: "Aa1!" + "x".repeat(40) });

test("member fixtures accept only explicit test guards and the exact loopback disposable database", () => {
  assert.equal(validateFixtureEnvironment(valid()).database, "alageum_strapi_member_test");
  for (const host of ["localhost", "[::1]"])
    assert.equal(validateFixtureEnvironment({ ...valid(), DATABASE_URL: `postgresql://fixture@${host}/alageum_strapi_member_test` }).database, "alageum_strapi_member_test");
  for (const change of [
    { APP_ENV: "production" }, { APP_ENV: "development" }, { ALAGEUM_TEST_MEMBER_FIXTURES: undefined },
    { DATABASE_URL: "postgresql://fixture@db.example.test/alageum_strapi_member_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1.example.test/alageum_strapi_member_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/customer" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_organization_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_member_test?host=remote.example.test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_member_test#hidden" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/%61lageum_strapi_member_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_member_test/" },
    { DATABASE_URL: "https://127.0.0.1/alageum_strapi_member_test" },
    { DATABASE_URL: undefined }, { E2E_MEMBER_PASSWORD: undefined }, { E2E_MEMBER_PASSWORD: "short" },
    { E2E_MEMBER_PASSWORD: "a".repeat(45) },
  ]) assert.throws(() => validateFixtureEnvironment({ ...valid(), ...change }));
});

test("member fixtures reject mismatched runtime/database and existing CMS accounts before transactions", async () => {
  for (const options of [{ mode: "production" }, { seedDemo: true }, { database: "customer" }, { cms: true }]) {
    let writes = 0;
    const app = {
      config: { get: name => name === "alageum.env" ? options.mode || "test" : options.seedDemo || false },
      admin: { services: { user: { exists: async () => options.cms || false } } },
      db: { connection: { raw: async () => ({ rows: [{ database: options.database || "alageum_strapi_member_test" }] }), transaction: async () => { writes++; } } },
    };
    await assert.rejects(seedTestMemberUsers(app, valid()));
    assert.equal(writes, 0);
  }
});

function fakeDatabase(existingTable) {
  const inserted = {};
  const tx = { raw: async () => {}, withSchema(name) {
    assert.equal(name, "b2b");
    return { table(name) { return {
      first: async () => existingTable === name ? { id: "already-exists" } : undefined,
      insert: async rows => { (inserted[name] ||= []).push(...(Array.isArray(rows) ? rows : [rows])); },
    }; } };
  } };
  const app = {
    config: { get: name => name === "alageum.env" ? "test" : false },
    admin: { services: { user: { exists: async () => false } } },
    db: { connection: { raw: async () => ({ rows: [{ database: "alageum_strapi_member_test" }] }), transaction: work => work(tx) } },
  };
  return { app, inserted };
}

test("member fixtures refuse an existing business or audit row before inserting any identities", async () => {
  for (const existing of ["users", "roles", "memberships", "refresh_sessions", "quote_requests", "orders", "documents", "tickets", "audit_events"]) {
    const { app, inserted } = fakeDatabase(existing);
    await assert.rejects(seedTestMemberUsers(app, valid()), /refuse existing B2B rows/);
    assert.deepEqual(inserted, {});
  }
});

test("member fixtures expose synthetic six-string ordered DTOs including inactive and global targets", async () => {
  const { app, inserted } = fakeDatabase();
  const manifest = await seedTestMemberUsers(app, valid());
  assert.deepEqual([manifest.members.a.length, manifest.members.b.length], [TOTAL_A, 2]);
  for (const row of [...manifest.members.a, ...manifest.members.b]) {
    assert.deepEqual(Object.keys(row).sort(), ["display_name", "email", "membership_id", "role_id", "role_name", "user_id"]);
    for (const value of Object.values(row)) assert.equal(typeof value, "string");
  }
  const aIds = new Set(manifest.members.a.map(row => row.membership_id));
  assert.ok(manifest.members.b.every(row => !aIds.has(row.membership_id)));
  assert.equal(inserted.memberships.find(row => row.id === manifest.targets.inactiveMembership.membership_id).is_active, false);
  assert.equal(inserted.users.find(row => row.id === manifest.targets.inactiveUser.user_id).is_active, false);
  assert.equal(inserted.roles.find(row => row.id === manifest.targets.global.role_id).organization_id, null);
  assert.deepEqual(JSON.parse(inserted.roles.find(row => row.id === manifest.roles.a.profile).permissions), ["organization.profile.read", "organization.profile.update"]);
  assert.equal(manifest.users.profile.email, "member-profile@fixture.invalid");
  assert.equal(manifest.targets.profile.membership_id.slice(-2), "12");
  assert.deepEqual(manifest.members.a.slice(50).map(row => row.membership_id.slice(-2)), ["55", "54", "53", "52", "51"]);
  assert.deepEqual([manifest.targets.blank.email, manifest.targets.blank.display_name, manifest.targets.blank.role_name], ["", "", ""]);
  assert.match(manifest.targets.html.display_name, /<img/);
  assert.match(manifest.targets.plainEmail.email, / /);
  const serialized = JSON.stringify(manifest);
  assert.ok(!serialized.includes(valid().E2E_MEMBER_PASSWORD));
  for (const forbidden of ["password_hash", "access_token", "refresh_token", "$argon2"]) assert.ok(!serialized.includes(forbidden));
  assert.deepEqual(Object.keys(inserted).sort(), ["memberships", "organizations", "roles", "users"]);
});

test("member fixture grants require exact manage_users and do not alter existing organization fixtures", () => {
  assert.deepEqual(GRANTS, { reader: ["organization.manage_users"], denied: [] });
  const original = require("../scripts/seed-test-organization-users").GRANTS;
  assert.deepEqual(original, { editor: ["organization.profile.read", "organization.profile.update"], readonly: ["organization.profile.read"], denied: [] });
});

test("member fixture secrets are generated afresh and disable all existing demo/catalog seeds", () => {
  const env = { ALAGEUM_SEED_DEMO: "1", ALAGEUM_IMPORT_CATALOG: "1", ALAGEUM_JWT_SECRET: "not-a-disposable-test-secret" };
  generateFixtureSecrets(env);
  assert.notEqual(env.ALAGEUM_JWT_SECRET, "not-a-disposable-test-secret");
  assert.equal(env.ALAGEUM_JWT_SECRET.length, 96);
  assert.equal(env.ALAGEUM_SEED_DEMO, "0");
  assert.equal(env.ALAGEUM_IMPORT_CATALOG, "0");
  const previous = env.ALAGEUM_JWT_SECRET;
  generateFixtureSecrets(env);
  assert.notEqual(env.ALAGEUM_JWT_SECRET, previous);
});
