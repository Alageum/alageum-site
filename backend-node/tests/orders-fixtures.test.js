"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateFixtureEnvironment, seedTestOrdersUsers, generateFixtureSecrets, GRANTS } = require("../scripts/seed-test-orders-users");
const valid = () => ({ APP_ENV: "test", ALAGEUM_TEST_ORDERS_FIXTURES: "1", DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_orders_test", E2E_ORDERS_PASSWORD: "Aa1!" + "x".repeat(40) });

test("orders fixtures reject non-test/shared/remote databases and missing explicit random password", () => {
  assert.equal(validateFixtureEnvironment(valid()).database, "alageum_strapi_orders_test");
  for (const change of [
    { APP_ENV: "production" }, { APP_ENV: "development" }, { ALAGEUM_TEST_ORDERS_FIXTURES: undefined },
    { DATABASE_URL: "postgresql://fixture@db.example.test/alageum_strapi_orders_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/customer" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_domain_test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_orders_test?host=remote.example.test" },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1/alageum_strapi_orders_test#hidden" },
    { DATABASE_URL: "https://127.0.0.1/alageum_strapi_orders_test" },
    { DATABASE_URL: undefined }, { E2E_ORDERS_PASSWORD: undefined }, { E2E_ORDERS_PASSWORD: "short" },
    { E2E_ORDERS_PASSWORD: "a".repeat(45) },
  ]) assert.throws(() => validateFixtureEnvironment({ ...valid(), ...change }));
});

test("orders fixtures reject mismatched runtime/database and existing CMS accounts before transactions", async () => {
  for (const options of [{ mode: "production" }, { seedDemo: true }, { database: "customer" }, { cms: true }]) {
    let writes = 0;
    const app = {
      config: { get: name => name === "alageum.env" ? options.mode || "test" : options.seedDemo || false },
      admin: { services: { user: { exists: async () => options.cms || false } } },
      db: { connection: { raw: async () => ({ rows: [{ database: options.database || "alageum_strapi_orders_test" }] }), transaction: async () => { writes++; } } },
    };
    await assert.rejects(seedTestOrdersUsers(app, valid()));
    assert.equal(writes, 0);
  }
});

test("orders fixture grants contain only read permission and denial", () => {
  assert.deepEqual(GRANTS, { reader: ["order.read"], denied: [] });
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
