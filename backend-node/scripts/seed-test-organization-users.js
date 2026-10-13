"use strict";

// Disposable B2B fixtures only. Never imported by application bootstrap.
const { randomUUID, randomBytes } = require("node:crypto");
const argon2 = require("argon2");
const DATABASE = "alageum_strapi_organization_test";
const EMAILS = Object.freeze(Object.fromEntries(
  ["single", "multi", "none", "readonly", "denied", "revoked"]
    .map(kind => [kind, `organization-${kind}@fixture.invalid`]),
));
const GRANTS = Object.freeze({
  editor: ["organization.profile.read", "organization.profile.update"],
  readonly: ["organization.profile.read"],
  denied: [],
});
const table = (db, name) => db.withSchema("b2b").table(name);

function validateFixtureEnvironment(env = process.env) {
  if (env.APP_ENV !== "test" || env.ALAGEUM_TEST_ORGANIZATION_FIXTURES !== "1") {
    throw new Error("Organization fixtures require APP_ENV=test and ALAGEUM_TEST_ORGANIZATION_FIXTURES=1");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("Organization fixtures require an explicit disposable PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== DATABASE || url.search || url.hash) {
    throw new Error(`Organization fixtures accept only the dedicated loopback ${DATABASE} database`);
  }
  const password = env.E2E_ORGANIZATION_PASSWORD;
  if (typeof password !== "string" || password.length < 40 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("E2E_ORGANIZATION_PASSWORD must be an explicitly generated disposable password of at least 40 characters");
  }
  return { database: DATABASE, url, password };
}

// Call before Strapi schema synchronization, including when invoked as a CLI.
async function requireFreshOrganizationDatabase(env = process.env) {
  const { url, database } = validateFixtureEnvironment(env);
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    const actual = await client.query("SELECT current_database() AS database");
    if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved organization fixture database");
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    if (tables.rows.length) throw new Error("Organization fixtures refuse a reused database; create a fresh isolated database");
  } finally { await client.end(); }
}

async function seedTestOrganizationUsers(strapi, env = process.env) {
  const { database, password } = validateFixtureEnvironment(env);
  if (strapi.config.get("alageum.env") !== "test" || strapi.config.get("alageum.seedDemo") === true) {
    throw new Error("Organization fixtures require test mode with demo seeding disabled");
  }
  const db = strapi.db.connection;
  const actual = await db.raw("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved organization fixture database");
  if (await strapi.admin.services.user.exists()) throw new Error("Organization fixtures refuse existing CMS administrators");
  const passwordHash = await argon2.hash(password);
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624120)");
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions"]) {
      if ((await table(tx, name).select("id").limit(1)).length) throw new Error("Organization fixtures refuse existing B2B rows; create a fresh isolated database");
    }
    const organizations = {
      a: { id: randomUUID(), name: "Fictitious Organization Workshop", external_id: "DISPOSABLE-ORGANIZATION-A" },
      b: { id: randomUUID(), name: "Fictitious Organization Workshop", external_id: "DISPOSABLE-ORGANIZATION-B" },
    };
    await table(tx, "organizations").insert(Object.values(organizations));
    const roles = {};
    for (const [organizationKey, organization] of Object.entries(organizations)) {
      roles[organizationKey] = {};
      for (const [kind, grants] of Object.entries(GRANTS)) {
        const id = randomUUID();
        await table(tx, "roles").insert({ id, organization_id: organization.id,
          code: `organization_fixture_${kind}`, name: `Fictitious organization ${kind}`,
          permissions: JSON.stringify(grants) });
        roles[organizationKey][kind] = id;
      }
    }
    const users = {};
    for (const [kind, email] of Object.entries(EMAILS)) {
      const id = randomUUID(), displayName = `Fictitious Organization ${kind}`;
      await table(tx, "users").insert({ id, email, display_name: displayName, password_hash: passwordHash });
      const memberships = kind === "none" ? [] : ["multi", "revoked"].includes(kind) ? ["a", "b"] : ["a"];
      const role = ["readonly", "denied"].includes(kind) ? kind : "editor";
      for (const key of memberships) await table(tx, "memberships").insert({
        id: randomUUID(), user_id: id, organization_id: organizations[key].id, role_id: roles[key][role],
      });
      users[kind] = { id, email, display_name: displayName, organizations: memberships.map(key => organizations[key].id) };
    }
    // No passwords, hashes, access tokens, or refresh tokens leave this helper.
    return { fixture: "disposable-organization-selection", organizations, roles, users };
  });
}

function generateFixtureSecrets(env = process.env) {
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) {
    env[key] = randomBytes(48).toString("hex");
  }
  env.ALAGEUM_SEED_DEMO = "0";
  env.ALAGEUM_IMPORT_CATALOG = "0";
  env.STRAPI_TELEMETRY_DISABLED = "true";
  env.STRAPI_HIDE_UPDATE_MESSAGE = "true";
}

module.exports = { DATABASE, EMAILS, GRANTS, validateFixtureEnvironment, requireFreshOrganizationDatabase, seedTestOrganizationUsers, generateFixtureSecrets };

if (require.main === module) {
  (async () => {
    await requireFreshOrganizationDatabase();
    generateFixtureSecrets();
    const app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    try {
      await app.load();
      console.log(JSON.stringify(await seedTestOrganizationUsers(app)));
    } finally { await app.destroy(); }
  })().catch(() => {
    // Startup/database exceptions may contain the URL. Never print raw errors.
    console.error("Disposable organization fixture setup failed; verify the isolated database, test guards and runtime password");
    process.exitCode = 1;
  });
}
