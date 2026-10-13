"use strict";

// Disposable B2B fixtures only. Never imported by application bootstrap.
const { randomUUID, randomBytes } = require("node:crypto");
const argon2 = require("argon2");
const DATABASE = "alageum_strapi_orders_test";
const EMAILS = Object.freeze(Object.fromEntries(
  ["reader", "peer", "denied", "other", "multi", "empty"]
    .map(kind => [kind, `orders-${kind}@fixture.invalid`]),
));
const GRANTS = Object.freeze({ reader: ["order.read"], denied: [] });
const ORDER_IDS = Object.freeze({
  precise: "40000000-0000-4000-8000-000000000001",
  empty: "40000000-0000-4000-8000-000000000002",
  newest: "40000000-0000-4000-8000-000000000003",
  foreign: "40000000-0000-4000-8000-000000000004",
});
const CONFIGURATION = '{"fixture":"Fictitious configuration","positive":9007199254740993,"negative":-9007199254740993,"nested":[null,true,{"integers":[9007199254740993,-9007199254740993],"fraction":1.25}],"empty":{}}';
const table = (db, name) => db.withSchema("b2b").table(name);

function validateFixtureEnvironment(env = process.env) {
  if (env.APP_ENV !== "test" || env.ALAGEUM_TEST_ORDERS_FIXTURES !== "1") {
    throw new Error("Orders fixtures require APP_ENV=test and ALAGEUM_TEST_ORDERS_FIXTURES=1");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("Orders fixtures require an explicit disposable PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== DATABASE || url.search || url.hash) {
    throw new Error(`Orders fixtures accept only the dedicated loopback ${DATABASE} database`);
  }
  const password = env.E2E_ORDERS_PASSWORD;
  if (typeof password !== "string" || password.length < 40 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("E2E_ORDERS_PASSWORD must be an explicitly generated disposable password of at least 40 characters");
  }
  return { database: DATABASE, url, password };
}

// Call before Strapi schema synchronization, including when invoked as a CLI.
async function requireFreshOrdersDatabase(env = process.env) {
  const { url, database } = validateFixtureEnvironment(env);
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    const actual = await client.query("SELECT current_database() AS database");
    if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved orders fixture database");
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    if (tables.rows.length) throw new Error("Orders fixtures refuse a reused database; create a fresh isolated database");
  } finally { await client.end(); }
}

async function seedTestOrdersUsers(strapi, env = process.env) {
  const { database, password } = validateFixtureEnvironment(env);
  if (strapi.config.get("alageum.env") !== "test" || strapi.config.get("alageum.seedDemo") === true) {
    throw new Error("Orders fixtures require test mode with demo seeding disabled");
  }
  const db = strapi.db.connection;
  const actual = await db.raw("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved orders fixture database");
  if (await strapi.admin.services.user.exists()) throw new Error("Orders fixtures refuse existing CMS administrators");
  const passwordHash = await argon2.hash(password);
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624119)");
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions", "order_statuses", "orders", "order_items", "audit_events"]) {
      if (await table(tx, name).first("id")) throw new Error("Orders fixtures refuse existing B2B rows; create a fresh isolated database");
    }
    const organizations = {
      a: { id: randomUUID(), name: "Fictitious Orders Workshop A", external_id: "DISPOSABLE-ORDERS-A" },
      b: { id: randomUUID(), name: "Fictitious Orders Workshop B", external_id: "DISPOSABLE-ORDERS-B" },
      c: { id: randomUUID(), name: "Fictitious Empty Orders Workshop", external_id: "DISPOSABLE-ORDERS-C" },
    };
    await table(tx, "organizations").insert(Object.values(organizations));
    const roles = {};
    for (const [organizationKey, organization] of Object.entries(organizations)) {
      roles[organizationKey] = {};
      for (const [kind, grants] of Object.entries(GRANTS)) {
        const id = randomUUID();
        await table(tx, "roles").insert({ id, organization_id: organization.id,
          code: `orders_fixture_${kind}`, name: `Fictitious orders ${kind}`,
          permissions: JSON.stringify(grants) });
        roles[organizationKey][kind] = id;
      }
    }
    const users = {};
    for (const [kind, email] of Object.entries(EMAILS)) {
      const id = randomUUID(), displayName = `Fictitious Orders ${kind}`;
      await table(tx, "users").insert({ id, email, display_name: displayName, password_hash: passwordHash });
      const memberships = kind === "multi" ? ["a", "b"] : [kind === "other" ? "b" : kind === "empty" ? "c" : "a"];
      const role = kind === "denied" ? "denied" : "reader";
      for (const key of memberships) await table(tx, "memberships").insert({
        id: randomUUID(), user_id: id, organization_id: organizations[key].id, role_id: roles[key][role],
      });
      users[kind] = { id, email, display_name: displayName, organizations: memberships.map(key => organizations[key].id) };
    }
    const status = { id: randomUUID(), code: "fixture_received", label: "Fictitious received", sort_order: 0 };
    await table(tx, "order_statuses").insert(status);
    const snapshot = (id, organization_id, number, amount, external_id, created_at) => ({ id, organization_id, number, amount, external_id, currency: "KZT", status_id: status.id, created_at, updated_at: created_at });
    const orders = [
      snapshot(ORDER_IDS.precise, organizations.a.id, "FIXTURE-ORD-001", "9999999999999999.99", "DISPOSABLE-ORDER-001", "2026-01-01T00:00:00Z"),
      snapshot(ORDER_IDS.empty, organizations.a.id, "FIXTURE-ORD-002", "0.00", null, "2026-01-01T00:00:00Z"),
      snapshot(ORDER_IDS.newest, organizations.a.id, "FIXTURE-ORD-003", "12.30", null, "2026-02-01T00:00:00Z"),
      snapshot(ORDER_IDS.foreign, organizations.b.id, "FIXTURE-OTHER-001", "34.50", "DISPOSABLE-OTHER-001", "2026-01-01T00:00:00Z"),
    ];
    await table(tx, "orders").insert(orders);
    await table(tx, "order_items").insert([
      { id: randomUUID(), order_id: ORDER_IDS.precise, external_product_id: "DISPOSABLE-SNAPSHOT-ONLY", description: "Fictitious precise item", quantity: "999999999999999.999", unit_price: "9999999999999999.99", configuration: CONFIGURATION },
      { id: randomUUID(), order_id: ORDER_IDS.precise, external_product_id: null, description: "Fictitious nullable item", quantity: "0.001", unit_price: null, configuration: '{"nullable":null,"list":[null,{"enabled":false}]}' },
      { id: randomUUID(), order_id: ORDER_IDS.newest, external_product_id: null, description: "Fictitious newest item", quantity: "1.000", unit_price: "12.30", configuration: '{}' },
    ]);
    // No passwords, hashes, access tokens, or refresh tokens leave this helper.
    return { fixture: "disposable-customer-orders", organizations, roles, users, status, orders: ORDER_IDS };

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

module.exports = { DATABASE, EMAILS, GRANTS, validateFixtureEnvironment, requireFreshOrdersDatabase, seedTestOrdersUsers, generateFixtureSecrets, ORDER_IDS, CONFIGURATION };

if (require.main === module) {
  (async () => {
    await requireFreshOrdersDatabase();
    generateFixtureSecrets();
    const app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    try {
      await app.load();
      console.log(JSON.stringify(await seedTestOrdersUsers(app)));
    } finally { await app.destroy(); }
  })().catch(() => {
    // Startup/database exceptions may contain the URL. Never print raw errors.
    console.error("Disposable orders fixture setup failed; verify the isolated database, test guards and runtime password");
    process.exitCode = 1;
  });
}
