"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateFixtureEnvironment, seedTestSupportUsers, generateFixtureSecrets, GRANTS } = require("../scripts/seed-test-support-users");
const valid = () => ({ APP_ENV: "test", ALAGEUM_TEST_SUPPORT_FIXTURES: "1", DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_support_test", E2E_SUPPORT_PASSWORD: "Aa1!" + "x".repeat(40) });

test("support fixtures reject non-test/shared/remote databases and missing explicit random password", () => {
  assert.equal(validateFixtureEnvironment(valid()).database, "alageum_strapi_support_test");
  for (const change of [
    { APP_ENV: "production" }, { APP_ENV: "development" }, { ALAGEUM_TEST_SUPPORT_FIXTURES: undefined },
    { DATABASE_URL: "postgresql://fixture@db.example.test/alageum_strapi_support_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/customer" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_domain_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_support_test?host=remote.example.test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_support_test#hidden" },
    { DATABASE_URL: "https://127.0.0.1/alageum_strapi_support_test" },
    { DATABASE_URL: undefined }, { E2E_SUPPORT_PASSWORD: undefined }, { E2E_SUPPORT_PASSWORD: "short" },
    { E2E_SUPPORT_PASSWORD: "a".repeat(45) },
  ]) assert.throws(() => validateFixtureEnvironment({ ...valid(), ...change }));
});

test("support fixtures reject mismatched runtime/database and existing CMS accounts before transactions", async () => {
  for (const options of [{ mode: "production" }, { seedDemo: true }, { database: "customer" }, { cms: true }]) {
    let writes = 0;
    const app = {
      config: { get: name => name === "alageum.env" ? options.mode || "test" : options.seedDemo || false },
      admin: { services: { user: { exists: async () => options.cms || false } } },
      db: { connection: { raw: async () => ({ rows: [{ database: options.database || "alageum_strapi_support_test" }] }), transaction: async () => { writes++; } } },
    };
    await assert.rejects(seedTestSupportUsers(app, valid()));
    assert.equal(writes, 0);
  }
});

test("support fixture grants are independent read/write subsets with no unrelated authority", () => {
  assert.deepEqual(GRANTS, { editor: ["ticket.read", "ticket.create"], readonly: ["ticket.read"], createonly: ["ticket.create"], denied: [] });
});

test("fixture secrets are generated afresh and existing demo/catalog seeds disabled", () => {
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
