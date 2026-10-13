"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DATABASE, EMAILS, GRANTS, validateFixtureEnvironment, seedTestOrganizationUsers, generateFixtureSecrets } = require("../scripts/seed-test-organization-users");
const valid = () => ({ APP_ENV: "test", ALAGEUM_TEST_ORGANIZATION_FIXTURES: "1", DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_organization_test", E2E_ORGANIZATION_PASSWORD: "Aa1!" + "x".repeat(40) });

test("organization fixtures reject non-test, shared, remote and passwordless environments", () => {
  assert.equal(validateFixtureEnvironment(valid()).database, DATABASE);
  for (const change of [
    { APP_ENV: "production" }, { APP_ENV: "development" }, { ALAGEUM_TEST_ORGANIZATION_FIXTURES: undefined },
    { DATABASE_URL: "postgresql://fixture@db.example.test/alageum_strapi_organization_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/customer" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_profile_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_domain_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_organization_test?host=remote.example.test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_organization_test#hidden" },
    { DATABASE_URL: "https://127.0.0.1/alageum_strapi_organization_test" },
    { DATABASE_URL: undefined }, { E2E_ORGANIZATION_PASSWORD: undefined }, { E2E_ORGANIZATION_PASSWORD: "short" },
    { E2E_ORGANIZATION_PASSWORD: "a".repeat(45) },
  ]) assert.throws(() => validateFixtureEnvironment({ ...valid(), ...change }));
});

test("organization fixtures reject mismatched runtime/database and existing CMS before writing", async () => {
  for (const options of [{ mode: "production" }, { seedDemo: true }, { database: "customer" }, { cms: true }]) {
    let writes = 0;
    const app = {
      config: { get: name => name === "alageum.env" ? options.mode || "test" : options.seedDemo || false },
      admin: { services: { user: { exists: async () => options.cms || false } } },
      db: { connection: { raw: async () => ({ rows: [{ database: options.database || DATABASE }] }), transaction: async () => { writes++; } } },
    };
    await assert.rejects(seedTestOrganizationUsers(app, valid()));
    assert.equal(writes, 0);
  }
});

function fakeApp(existingTable) {
  const rows = {};
  const tx = { raw: async () => ({}), withSchema: schema => {
    assert.equal(schema, "b2b");
    return { table: name => ({ select: () => ({ limit: async () => existingTable === name ? [{ id: "existing" }] : [] }), insert: async value => { (rows[name] ||= []).push(...(Array.isArray(value) ? value : [value])); } }) };
  } };
  return { rows, app: {
    config: { get: name => name === "alageum.env" ? "test" : false },
    admin: { services: { user: { exists: async () => false } } },
    db: { connection: { raw: async () => ({ rows: [{ database: DATABASE }] }), transaction: async callback => callback(tx) } },
  } };
}

test("organization fixture seeding fails before inserts if any protected B2B table has data", async () => {
  for (const table of ["users", "organizations", "roles", "memberships", "refresh_sessions"]) {
    const { app, rows } = fakeApp(table);
    await assert.rejects(seedTestOrganizationUsers(app, valid()), /existing B2B rows/);
    assert.deepEqual(rows, {});
  }
});

test("organization fixtures cover zero, one and duplicate-name memberships without leaking credentials", async () => {
  const { app, rows } = fakeApp();
  const manifest = await seedTestOrganizationUsers(app, valid());
  assert.equal(manifest.organizations.a.name, manifest.organizations.b.name);
  assert.notEqual(manifest.organizations.a.id, manifest.organizations.b.id);
  assert.equal(manifest.users.single.organizations.length, 1);
  assert.equal(manifest.users.multi.organizations.length, 2);
  assert.equal(manifest.users.none.organizations.length, 0);
  assert.equal(rows.users.length, Object.keys(EMAILS).length);
  assert.equal(rows.memberships.length, 7);
  assert.equal(rows.roles.length, 6);
  assert.ok(rows.users.every(user => user.email.endsWith("@fixture.invalid") && user.password_hash.startsWith("$argon2")));
  assert.doesNotMatch(JSON.stringify(manifest), /password|token|\$argon2/);
  for (const user of Object.values(manifest.users)) assert.equal(rows.memberships.filter(member => member.user_id === user.id).length, user.organizations.length);
});

test("fixture roles hold only explicit profile grants and no default or platform authority", () => {
  assert.deepEqual(GRANTS, { editor: ["organization.profile.read", "organization.profile.update"], readonly: ["organization.profile.read"], denied: [] });
});

test("organization fixture runtime secrets rotate and demo/catalog seeds remain disabled", () => {
  const env = { ALAGEUM_SEED_DEMO: "1", ALAGEUM_IMPORT_CATALOG: "1", ALAGEUM_JWT_SECRET: "not-a-disposable-test-secret" };
  generateFixtureSecrets(env);
  assert.equal(env.ALAGEUM_JWT_SECRET.length, 96);
  assert.equal(env.ALAGEUM_SEED_DEMO, "0");
  assert.equal(env.ALAGEUM_IMPORT_CATALOG, "0");
  const previous = env.ALAGEUM_JWT_SECRET;
  generateFixtureSecrets(env);
  assert.notEqual(env.ALAGEUM_JWT_SECRET, previous);
});
