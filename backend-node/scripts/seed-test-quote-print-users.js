"use strict";

// Disposable acceptance fixtures only; never imported by application bootstrap.
const { randomUUID, randomBytes } = require("node:crypto");
const DATABASE = "alageum_strapi_quote_print_test";
const EMAILS = Object.freeze(Object.fromEntries(["owner", "peer", "other"].map(kind => [kind, `quote-print-${kind}@demo.example`])));
const GRANTS = Object.freeze(["quote.create", "quote.read"]);
const PRODUCTS = Object.freeze([
  { id: "quote-print-frozen-fixed", category: "transformers", sku: "FIXTURE-FROZEN-001", name: "Исторический тестовый трансформатор", description: "Fictitious disposable product" },
  { id: "quote-print-on-request", category: "transformers", sku: "FIXTURE-REQUEST-002", name: "Тестовый трансформатор по запросу", description: "Fictitious disposable product" },
]);
const table = (db, name) => db.withSchema("b2b").table(name);

function validateFixtureEnvironment(env = process.env) {
  if (env.APP_ENV !== "test" || env.ALAGEUM_TEST_QUOTE_PRINT_FIXTURES !== "1" || env.ALAGEUM_SEED_DEMO !== "0" || env.ALAGEUM_IMPORT_CATALOG !== "0") {
    throw new Error("Quote print fixtures require explicit test mode with demo/catalog bootstrap disabled");
  }
  if (!env.DATABASE_URL || env.DATABASE_URL !== env.ALAGEUM_QUOTE_PRINT_DATABASE_URL) {
    throw new Error("Quote print fixtures require the exact independently authorized disposable database URL");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("Invalid disposable quote print database URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1" ||
      decodeURIComponent(url.pathname.slice(1)) !== DATABASE || decodeURIComponent(url.username) !== "alageum_quote_print_test" || !url.password || !url.port || url.search || url.hash) {
    throw new Error("Quote print fixtures accept only the dedicated loopback database and fixture role");
  }
  const password = env.E2E_QUOTE_PRINT_PASSWORD;
  if (typeof password !== "string" || password.length < 40 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Quote print fixture password must be generated for this invocation");
  }
  return { database: DATABASE, url, password };
}

async function withFixtureDatabase(work, env = process.env) {
  const { url, database } = validateFixtureEnvironment(env);
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    const actual = await client.query("SELECT current_database() AS database");
    if (actual.rows[0]?.database !== database) throw new Error("Connected database is not the authorized quote print fixture database");
    return await work(client);
  } finally { await client.end(); }
}

async function requireFreshQuotePrintDatabase(env = process.env) {
  return withFixtureDatabase(async client => {
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    if (tables.rows.length) throw new Error("Quote print fixtures refuse reused databases");
  }, env);
}

async function seedTestQuotePrintUsers(strapi, env = process.env) {
  const { database, password } = validateFixtureEnvironment(env);
  if (strapi.config.get("alageum.env") !== "test" || strapi.config.get("alageum.seedDemo") === true || strapi.config.get("alageum.importCatalog") === true) {
    throw new Error("Quote print fixtures require test bootstrap without demo/catalog seeding");
  }
  const db = strapi.db.connection;
  const actual = await db.raw("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database) throw new Error("Unexpected quote print database");
  if (await strapi.admin.services.user.exists()) throw new Error("Quote print fixtures refuse existing CMS administrators");
  const passwordHash = await require("argon2").hash(password);
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624122)");
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions", "quote_requests", "quote_request_items", "audit_events"]) {
      if ((await table(tx, name).select("id").limit(1)).length) throw new Error("Quote print fixtures refuse existing B2B rows");
    }
    if ((await tx.table("alageum_products").select("id").limit(1)).length) throw new Error("Quote print fixtures refuse existing catalog rows");
    const organizations = {
      a: { id: randomUUID(), name: "Fictitious Print Workshop A", external_id: "DISPOSABLE-QUOTE-PRINT-A" },
      b: { id: randomUUID(), name: "Fictitious Print Workshop B", external_id: "DISPOSABLE-QUOTE-PRINT-B" },
    };
    await table(tx, "organizations").insert(Object.values(organizations));
    const users = {};
    for (const [kind, email] of Object.entries(EMAILS)) {
      const id = randomUUID(), roleId = randomUUID(), organizationId = organizations[kind === "other" ? "b" : "a"].id;
      await table(tx, "roles").insert({ id: roleId, organization_id: organizationId, code: `quote_print_fixture_${kind}`, name: `Fictitious quote print ${kind}`, permissions: JSON.stringify(GRANTS) });
      await table(tx, "users").insert({ id, email, display_name: `Fictitious Print ${kind}`, password_hash: passwordHash });
      await table(tx, "memberships").insert({ id: randomUUID(), user_id: id, organization_id: organizationId, role_id: roleId });
      users[kind] = { id, email, roleId, organizationId };
    }
    const legacy = { id: randomUUID(), comment: "Fictitious legacy print request: missing and partial historical snapshots" };
    // Explicit catalog-fixture provenance preserves partial snapshot print
    // coverage without assigning a mode to any imported/customer data.
    await table(tx, "quote_requests").insert({ id: legacy.id, organization_id: organizations.a.id, created_by_id: users.owner.id, mode: "catalog", comment: legacy.comment, idempotency_key: randomUUID(), request_hash: "0".repeat(64) });
    await table(tx, "quote_request_items").insert([
      { id: randomUUID(), quote_request_id: legacy.id, product_id: randomUUID(), mode: "catalog", parameters: "{}", quantity: "0.001", position: 0, product_snapshot: "{}" },
      { id: randomUUID(), quote_request_id: legacy.id, product_id: randomUUID(), mode: "catalog", parameters: "{}", quantity: "999999999999999.999", position: 1, product_snapshot: JSON.stringify({ sku: "FIXTURE-LEGACY-PARTIAL", price_mode: "fixed", price: "123456789012345.678" }) },
    ]);
    // This manifest contains only fictitious labels and IDs, never credentials.
    return { fixture: "disposable-quote-print", organizations, users, quotes: { legacy } };
  });
}

// Invoked by the Playwright Node process, never a browser/test-only HTTP route.
// Change only this invocation's distinct fixture owner role, restoring in finally.
async function setOwnerRead(manifest, allowed, env = process.env) {
  if (manifest?.fixture !== "disposable-quote-print" || typeof allowed !== "boolean") throw new Error("Invalid fixture grant update");
  const owner = manifest.users.owner;
  return withFixtureDatabase(async client => {
    const result = await client.query("UPDATE b2b.roles r SET permissions = $1::jsonb FROM b2b.memberships m, b2b.users u WHERE r.id = $2 AND r.organization_id = $3 AND r.code = 'quote_print_fixture_owner' AND m.role_id = r.id AND m.user_id = $4 AND u.id = m.user_id AND u.email = $5", [JSON.stringify(allowed ? GRANTS : ["quote.create"]), owner.roleId, owner.organizationId, owner.id, EMAILS.owner]);
    if (result.rowCount !== 1) throw new Error("Fixture owner role update did not affect exactly one authorized row");
  }, env);
}

function generateFixtureSecrets(env = process.env) {
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) env[key] = randomBytes(48).toString("hex");
  env.STRAPI_TELEMETRY_DISABLED = "true";
  env.STRAPI_HIDE_UPDATE_MESSAGE = "true";
}

module.exports = { DATABASE, EMAILS, GRANTS, PRODUCTS, validateFixtureEnvironment, requireFreshQuotePrintDatabase, seedTestQuotePrintUsers, setOwnerRead, generateFixtureSecrets };
