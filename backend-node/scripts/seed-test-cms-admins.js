"use strict";

// Disposable verification fixtures only. This module is never imported from
// application bootstrap and does not create a native CMS Super Admin.
const ACTION = "plugin::alageum-catalog.manage";
const EMAILS = Object.freeze({
  editor: "cms-editor@node-ci.example",
  denied: "cms-denied@node-ci.example",
});
const DATABASES = new Set([
  "alageum_strapi_ci",
  "alageum_strapi_test",
  "alageum_strapi_cms_test",
  "alageum_strapi_browser_test",
]);

function validateFixtureEnvironment(env = process.env) {
  if (env.APP_ENV !== "test" || env.ALAGEUM_TEST_ADMIN_FIXTURES !== "1") {
    throw new Error("CMS fixtures require APP_ENV=test and ALAGEUM_TEST_ADMIN_FIXTURES=1");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("CMS fixtures require an explicit disposable PostgreSQL URL"); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !DATABASES.has(database) || url.search || url.hash) {
    throw new Error("CMS fixtures accept only named disposable loopback PostgreSQL databases");
  }
  const passwords = {};
  for (const kind of ["editor", "denied"]) {
    const name = `E2E_CMS_${kind.toUpperCase()}_PASSWORD`;
    const value = env[name];
    if (typeof value !== "string" || value.length < 32 ||
        !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
      throw new Error(`${name} must be an explicitly generated disposable password of at least 32 characters`);
    }
    passwords[kind] = value;
  }
  if (passwords.editor === passwords.denied) {
    throw new Error("CMS editor and denied-role passwords must be distinct");
  }
  return { database, passwords };
}

async function seedTestCmsAdmins(strapi, env = process.env) {
  const { database, passwords } = validateFixtureEnvironment(env);
  if (strapi.config.get("alageum.env") !== "test") {
    throw new Error("Loaded Strapi instance is not in test mode");
  }
  const actual = await strapi.db.connection.raw("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database) {
    throw new Error("Connected database differs from the approved CMS fixture database");
  }
  const { user, role, permission } = strapi.admin.services;
  if (await user.exists()) {
    throw new Error("CMS fixtures refuse databases with existing administrators; create a fresh test database");
  }
  if (!permission.actionProvider.values().some(action => action.actionId === ACTION)) {
    throw new Error("ALAGEUM catalog CMS permission has not been registered");
  }
  const fixtureRoles = {};
  for (const kind of ["editor", "denied"]) {
    const code = `alageum-cms-test-${kind}`;
    if (await role.findOne({ code })) {
      throw new Error("CMS fixture role already exists; create a fresh test database");
    }
  }
  for (const kind of ["editor", "denied"]) {
    fixtureRoles[kind] = await role.create({
      name: `ALAGEUM disposable CMS ${kind}`,
      code: `alageum-cms-test-${kind}`,
      description: "Temporary local/CI verification only; never a production role",
    });
    await role.assignPermissions(fixtureRoles[kind].id,
      kind === "editor" ? [{ action: ACTION, conditions: [], properties: {} }] : []);
  }
  const users = {};
  for (const kind of ["editor", "denied"]) {
    users[kind] = await user.create({
      firstname: "Disposable",
      lastname: kind === "editor" ? "CMS Editor" : "CMS Denied",
      email: EMAILS[kind],
      password: passwords[kind],
      isActive: true,
      registrationToken: null,
      preferedLanguage: "en",
      roles: [fixtureRoles[kind].id],
    });
  }
  // No passwords, tokens, password hashes or session material leave this helper.
  return {
    action: ACTION,
    editor: { id: users.editor.id, email: EMAILS.editor },
    denied: { id: users.denied.id, email: EMAILS.denied },
    roles: { editor: fixtureRoles.editor.id, denied: fixtureRoles.denied.id },
  };
}

// Pinned Strapi user.create fires this native metric without awaiting it. The
// metric performs database reads even when telemetry is disabled. Track only
// this fixture-triggered work so app.destroy cannot close the pool underneath it.
// No metric is suppressed; failures are observed and propagated after draining.
async function drainNativeAdminMetrics(strapi, work) {
  const metrics = strapi.admin.services.metrics;
  const original = metrics.sendDidInviteUser;
  const pending = new Set();
  const failures = [];
  metrics.sendDidInviteUser = (...args) => {
    const task = Promise.resolve().then(() => original.apply(metrics, args));
    pending.add(task);
    task.then(() => pending.delete(task), error => {
      pending.delete(task);
      failures.push(error);
    });
    return task;
  };
  let result, failure;
  try { result = await work(); }
  catch (error) { failure = error; }
  finally {
    while (pending.size) await Promise.allSettled([...pending]);
    metrics.sendDidInviteUser = original;
  }
  if (failure) throw failure;
  if (failures.length) throw failures[0];
  return result;
}

module.exports = { ACTION, EMAILS, validateFixtureEnvironment, seedTestCmsAdmins, drainNativeAdminMetrics };

if (require.main === module) {
  (async () => {
    validateFixtureEnvironment(); // Must precede Strapi loading/schema sync.
    const app = require("@strapi/strapi").createStrapi({
      appDir: process.cwd(), distDir: process.cwd(),
    });
    try {
      await app.load();
      const result = await drainNativeAdminMetrics(app, () => seedTestCmsAdmins(app));
      console.log(JSON.stringify({ fixture: "disposable-native-cms", ...result }));
    } finally {
      await app.destroy();
    }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
