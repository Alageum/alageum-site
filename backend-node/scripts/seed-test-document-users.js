"use strict";

// Disposable B2B fixtures only. Never imported by application bootstrap.
const { randomUUID, randomBytes } = require("node:crypto");
const argon2 = require("argon2");
const DATABASE = "alageum_strapi_document_test";
const EMAILS = Object.freeze(Object.fromEntries(
  ["reader", "peer", "denied", "other", "multi", "empty"]
    .map(kind => [kind, `document-${kind}@fixture.invalid`]),
));
const GRANTS = Object.freeze({ reader: ["document.read"], denied: [] });
const DOCUMENT_IDS = Object.freeze({
  versioned: "60000000-0000-4000-8000-000000000001",
  empty: "60000000-0000-4000-8000-000000000002",
  newest: "60000000-0000-4000-8000-000000000003",
  foreign: "60000000-0000-4000-8000-000000000004",
});
const FILE_IDS = Object.freeze({
  global: "61000000-0000-4000-8000-000000000001",
  version1: "61000000-0000-4000-8000-000000000002",
  version9: "61000000-0000-4000-8000-000000000003",
  newest: "61000000-0000-4000-8000-000000000004",
  foreign: "61000000-0000-4000-8000-000000000005",
});
const TYPE_IDS = Object.freeze({
  active: "62000000-0000-4000-8000-000000000001",
  inactive: "62000000-0000-4000-8000-000000000002",
});
const VERSION_IDS = Object.freeze({
  version1: "63000000-0000-4000-8000-000000000001",
  version9: "63000000-0000-4000-8000-000000000002",
  newest: "63000000-0000-4000-8000-000000000003",
  foreign: "63000000-0000-4000-8000-000000000004",
});
const table = (db, name) => db.withSchema("b2b").table(name);

function validateFixtureEnvironment(env = process.env) {
  if (env.APP_ENV !== "test" || env.ALAGEUM_TEST_DOCUMENT_FIXTURES !== "1") {
    throw new Error("Document fixtures require APP_ENV=test and ALAGEUM_TEST_DOCUMENT_FIXTURES=1");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("Document fixtures require an explicit disposable PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== DATABASE || url.search || url.hash) {
    throw new Error(`Document fixtures accept only the dedicated loopback ${DATABASE} database`);
  }
  const password = env.E2E_DOCUMENT_PASSWORD;
  if (typeof password !== "string" || password.length < 40 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("E2E_DOCUMENT_PASSWORD must be an explicitly generated disposable password of at least 40 characters");
  }
  return { database: DATABASE, url, password };
}

// Call before Strapi schema synchronization, including when invoked as a CLI.
async function requireFreshDocumentDatabase(env = process.env) {
  const { url, database } = validateFixtureEnvironment(env);
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    const actual = await client.query("SELECT current_database() AS database");
    if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved document fixture database");
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    if (tables.rows.length) throw new Error("Document fixtures refuse a reused database; create a fresh isolated database");
  } finally { await client.end(); }
}

async function seedTestDocumentUsers(strapi, env = process.env) {
  const { database, password } = validateFixtureEnvironment(env);
  if (strapi.config.get("alageum.env") !== "test" || strapi.config.get("alageum.seedDemo") === true) {
    throw new Error("Document fixtures require test mode with demo seeding disabled");
  }
  const db = strapi.db.connection;
  const actual = await db.raw("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved document fixture database");
  if (await strapi.admin.services.user.exists()) throw new Error("Document fixtures refuse existing CMS administrators");
  const passwordHash = await argon2.hash(password);
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624139)");
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions", "order_statuses", "orders", "order_items", "invoices", "document_types", "documents", "document_versions", "file_objects", "audit_events"]) {
      if (await table(tx, name).first("id")) throw new Error("Document fixtures refuse existing B2B rows; create a fresh isolated database");
    }
    const organizations = {
      a: { id: randomUUID(), name: "Fictitious Document Workshop A", external_id: "DISPOSABLE-DOCUMENT-A" },
      b: { id: randomUUID(), name: "Fictitious Document Workshop B", external_id: "DISPOSABLE-DOCUMENT-B" },
      c: { id: randomUUID(), name: "Fictitious Empty Document Workshop", external_id: "DISPOSABLE-DOCUMENT-C" },
    };
    await table(tx, "organizations").insert(Object.values(organizations));
    const roles = {};
    for (const [organizationKey, organization] of Object.entries(organizations)) {
      roles[organizationKey] = {};
      for (const [kind, grants] of Object.entries(GRANTS)) {
        const id = randomUUID();
        await table(tx, "roles").insert({ id, organization_id: organization.id,
          code: `document_fixture_${kind}`, name: `Fictitious document ${kind}`,
          permissions: JSON.stringify(grants) });
        roles[organizationKey][kind] = id;
      }
    }
    const users = {};
    for (const [kind, email] of Object.entries(EMAILS)) {
      const id = randomUUID(), displayName = `Fictitious Document ${kind}`;
      await table(tx, "users").insert({ id, email, display_name: displayName, password_hash: passwordHash });
      const memberships = kind === "multi" ? ["a", "b"] : [kind === "other" ? "b" : kind === "empty" ? "c" : "a"];
      const role = kind === "denied" ? "denied" : "reader";
      for (const key of memberships) await table(tx, "memberships").insert({
        id: randomUUID(), user_id: id, organization_id: organizations[key].id, role_id: roles[key][role],
      });
      users[kind] = { id, email, display_name: displayName, organizations: memberships.map(key => organizations[key].id) };
    }
    const types = {
      active: { id: TYPE_IDS.active, code: "fixture_active", name: "Fictitious active type", is_active: true },
      inactive: { id: TYPE_IDS.inactive, code: "fixture_inactive", name: "Fictitious inactive type", is_active: false },
    };
    await table(tx, "document_types").insert(Object.values(types));
    const document = (id, organization_id, type_id, number, title, external_id, created_at) => ({
      id, organization_id, type_id, number, title, external_id, source: "FIXTURE", created_at, updated_at: created_at,
    });
    await table(tx, "documents").insert([
      document(DOCUMENT_IDS.versioned, organizations.a.id, types.inactive.id, "FIXTURE-DOC-001", "Fictitious versioned document", "DISPOSABLE-DOCUMENT-001", "2026-01-01T00:00:00Z"),
      document(DOCUMENT_IDS.empty, organizations.a.id, types.active.id, null, "Fictitious unversioned document", null, "2026-01-01T00:00:00Z"),
      document(DOCUMENT_IDS.newest, organizations.a.id, types.active.id, "FIXTURE-DOC-003", "Fictitious newest document", null, "2026-02-01T00:00:00Z"),
      document(DOCUMENT_IDS.foreign, organizations.b.id, types.active.id, "FIXTURE-OTHER-001", "Fictitious other document", "DISPOSABLE-OTHER-001", "2026-01-01T00:00:00Z"),
    ]);
    const file = (key, organization_id, created_at) => ({
      id: FILE_IDS[key], organization_id, storage_key: `disposable/document-metadata/${key}`,
      original_name: `fictitious-${key}.pdf`, content_type: "application/pdf", size_bytes: "0",
      checksum_sha256: "0".repeat(64), storage_backend: "fixture-metadata-only", created_at, updated_at: created_at,
    });
    // These are inert metadata records. No bytes, storage providers or signed URLs
    // are created. Global metadata remains unreferenced by tenant versions.
    await table(tx, "file_objects").insert([
      file("global", null, "2025-01-01T00:00:00Z"),
      file("version1", organizations.a.id, "2026-03-01T00:00:00Z"),
      file("version9", organizations.a.id, "2025-01-01T00:00:00Z"),
      file("newest", organizations.a.id, "2026-02-01T00:00:00Z"),
      file("foreign", organizations.b.id, "2026-01-01T00:00:00Z"),
    ]);
    const version = (key, organization_id, document_id, number, created_at) => ({
      id: VERSION_IDS[key], organization_id, document_id, file_id: FILE_IDS[key], version: number, created_at, updated_at: created_at,
    });
    // Greatest integer version wins even when both version and file timestamps
    // are older. The inactive type is intentionally still visible to readers.
    await table(tx, "document_versions").insert([
      version("version1", organizations.a.id, DOCUMENT_IDS.versioned, 1, "2026-03-01T00:00:00Z"),
      version("version9", organizations.a.id, DOCUMENT_IDS.versioned, 9, "2025-01-01T00:00:00Z"),
      version("newest", organizations.a.id, DOCUMENT_IDS.newest, 1, "2026-02-01T00:00:00Z"),
      version("foreign", organizations.b.id, DOCUMENT_IDS.foreign, 1, "2026-01-01T00:00:00Z"),
    ]);
    // No passwords, hashes, access tokens, or refresh tokens leave this helper.
    return { fixture: "disposable-document-metadata", organizations, roles, users, types,
      documents: DOCUMENT_IDS, files: FILE_IDS, versions: VERSION_IDS };

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

module.exports = { DATABASE, EMAILS, GRANTS, validateFixtureEnvironment, requireFreshDocumentDatabase, seedTestDocumentUsers, generateFixtureSecrets, DOCUMENT_IDS, FILE_IDS, TYPE_IDS, VERSION_IDS };

if (require.main === module) {
  (async () => {
    await requireFreshDocumentDatabase();
    generateFixtureSecrets();
    const app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    try {
      await app.load();
      console.log(JSON.stringify(await seedTestDocumentUsers(app)));
    } finally { await app.destroy(); }
  })().catch(() => {
    // Startup/database exceptions may contain the URL. Never print raw errors.
    console.error("Disposable document fixture setup failed; verify the isolated database, test guards and runtime password");
    process.exitCode = 1;
  });
}
