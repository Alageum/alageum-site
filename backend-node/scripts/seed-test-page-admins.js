"use strict";
// Reimplemented disposable native Page fixtures; never used by bootstrap.
const { randomBytes } = require("node:crypto");
const { UID, FIELDS } = require("../src/domain/pages");
const { drainNativeAdminMetrics } = require("./seed-test-cms-admins");
const { pageFixtureUrl, validatePageProbeOptIn } = require("./page-test-guards");
async function seedTestPageAdmins(strapi, { fastSaveProbe = false } = {}, env = process.env) {
  pageFixtureUrl(env);
  validatePageProbeOptIn(fastSaveProbe, env);
  if (strapi.config.get("alageum.env") !== "test") throw new Error("Loaded Strapi instance is not in test mode");
  const actual = await strapi.db.connection.raw("select current_database() as database");
  if (actual.rows[0].database !== "alageum_strapi_pages_test" || await strapi.admin.services.user.exists()) throw new Error("Page fixtures require a fresh isolated database without CMS administrators");
  return drainNativeAdminMetrics(strapi, async () => {
    const users = {};
    const roles = { editor: ["read", "create", "update"], publisher: ["read", "publish"], denied: [] };
    if (fastSaveProbe) roles.probe = ["read", "create", "update", "publish"];
    for (const [kind, actions] of Object.entries(roles)) {
      const role = await strapi.admin.services.role.create({ name: `Disposable Page ${kind}`, code: `alageum-page-test-${kind}`, description: "Isolated Page verification only" });
      await strapi.admin.services.role.assignPermissions(role.id, actions.map(action => ({ action: `plugin::content-manager.explorer.${action}`, subject: UID, conditions: [], properties: ["read", "create", "update"].includes(action) ? { fields: FIELDS } : {} })));
      const password = `Aa1!${randomBytes(32).toString("hex")}`;
      const email = `page-${kind}@node-ci.example`;
      const user = await strapi.admin.services.user.create({ firstname: "Disposable", lastname: `Page ${kind}`, email, password, isActive: true, blocked: false, registrationToken: null, preferedLanguage: "en", roles: [role.id] });
      users[kind] = { id: user.id, email, password, role: role.id };
    }
    return users; // Keep generated passwords only in caller memory.
  });
}
module.exports = { seedTestPageAdmins };
