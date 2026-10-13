"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ACTION, validateFixtureEnvironment, seedTestCmsAdmins, drainNativeAdminMetrics } = require("../scripts/seed-test-cms-admins");
const valid = () => ({
  APP_ENV: "test", ALAGEUM_TEST_ADMIN_FIXTURES: "1",
  DATABASE_URL: "postgresql://local@127.0.0.1:5432/alageum_strapi_browser_test",
  E2E_CMS_EDITOR_PASSWORD: "Aa1!" + "a".repeat(32),
  E2E_CMS_DENIED_PASSWORD: "Bb2!" + "b".repeat(32),
});
function fake({ existing = false, action = true, database = "alageum_strapi_browser_test", mode = "test" } = {}) {
  const calls = [], fixtureRoles = [];
  return { calls, config: { get: () => mode }, db: { connection: { raw: async () => ({ rows: [{ database }] }) } },
    admin: { services: {
      permission: { actionProvider: { values: () => action ? [{ actionId: ACTION }] : [] } },
      role: {
        findOne: async () => null,
        create: async data => { calls.push(["role.create", data]); const value = { ...data, id: fixtureRoles.length + 1 }; fixtureRoles.push(value); return value; },
        assignPermissions: async (...args) => { calls.push(["role.assignPermissions", ...args]); },
      },
      user: { exists: async () => existing, create: async data => { calls.push(["user.create", data]); return { ...data, id: data.roles[0] + 10 }; } },
    } },
  };
}
test("CMS fixture guard rejects production, remote/shared databases and absent disposable secrets", () => {
  assert.equal(validateFixtureEnvironment(valid()).database, "alageum_strapi_browser_test");
  for (const patch of [
    { APP_ENV: "production" }, { APP_ENV: "development" }, { ALAGEUM_TEST_ADMIN_FIXTURES: "0" },
    { DATABASE_URL: "postgresql://local@db.example.com/alageum_strapi_browser_test" },
    { DATABASE_URL: "postgresql://local@127.0.0.1/alageum_strapi" },
    { DATABASE_URL: "postgresql://local@127.0.0.1/alageum_strapi_ci?host=db.example.com" },
    { DATABASE_URL: "postgresql://local@127.0.0.1/alageum" },
    { E2E_CMS_EDITOR_PASSWORD: undefined }, { E2E_CMS_DENIED_PASSWORD: "short" },
    { E2E_CMS_DENIED_PASSWORD: valid().E2E_CMS_EDITOR_PASSWORD },
  ]) assert.throws(() => validateFixtureEnvironment({ ...valid(), ...patch }));
});
test("CMS fixtures refuse existing administrators, unloaded permission and mismatched runtime/database before writes", async () => {
  for (const options of [{ existing: true }, { action: false }, { database: "alageum" }, { mode: "production" }]) {
    const app = fake(options);
    await assert.rejects(seedTestCmsAdmins(app, valid()));
    assert.equal(app.calls.length, 0);
  }
});
test("CMS fixtures use native services, least permission and non-secret return values", async () => {
  const app = fake();
  const result = await seedTestCmsAdmins(app, valid());
  assert.equal(result.action, ACTION);
  const grants = app.calls.filter(([name]) => name === "role.assignPermissions");
  assert.deepEqual(grants.map(call => call[2].map(value => value.action)), [[ACTION], []]);
  const users = app.calls.filter(([name]) => name === "user.create").map(([, data]) => data);
  assert.equal(users.length, 2);
  assert.ok(users.every(user => user.isActive && user.roles.length === 1 && user.registrationToken === null));
  assert.equal(JSON.stringify(result).includes("password"), false);
  assert.ok(!app.calls.some(call => JSON.stringify(call).includes("strapi-super-admin")));
});
test("CMS cookie covers the native /admin API and /cms UI without disabling Secure or widening host scope", () => {
  const config = require("../config/admin")({ env: () => "x".repeat(40) });
  assert.equal(config.url, "/cms");
  assert.deepEqual(config.auth.cookie, { path: "/", sameSite: "lax" });
});
test("fixture shutdown waits for unawaited native metrics and restores the service", async () => {
  let release, finished = false, reads = 0;
  const original = async () => { await new Promise(resolve => { release = resolve; }); ++reads; };
  const app = { admin: { services: { metrics: { sendDidInviteUser: original } } } };
  const draining = drainNativeAdminMetrics(app, async () => {
    app.admin.services.metrics.sendDidInviteUser(); // Mirrors Strapi user.create.
    return "fixtures-created";
  }).then(result => { finished = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  release();
  assert.equal(await draining, "fixtures-created");
  assert.equal(reads, 1);
  assert.equal(app.admin.services.metrics.sendDidInviteUser, original);
});
test("fixture metric rejections are propagated without an unhandled rejection", async () => {
  const original = async () => { throw new Error("native metric read failed"); };
  const app = { admin: { services: { metrics: { sendDidInviteUser: original } } } };
  await assert.rejects(drainNativeAdminMetrics(app, async () => {
    app.admin.services.metrics.sendDidInviteUser();
  }), /native metric read failed/);
  assert.equal(app.admin.services.metrics.sendDidInviteUser, original);
});
