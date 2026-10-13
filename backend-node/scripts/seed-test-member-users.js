"use strict";

// Disposable B2B fixtures only. Never imported by application bootstrap.
const { randomUUID, randomBytes } = require("node:crypto");
const argon2 = require("argon2");
const DATABASE = "alageum_strapi_member_test";
const EMAILS = Object.freeze(Object.fromEntries(
  ["reader", "peer", "denied", "other", "multi", "profile"].map(kind => [kind, `member-${kind}@fixture.invalid`]),
));
const GRANTS = Object.freeze({ reader: Object.freeze(["organization.manage_users"]), denied: Object.freeze([]) });
const TOTAL_A = 55;
const table = (db, name) => db.withSchema("b2b").table(name);
const memberId = (organization, ordinal) => `${organization === "a" ? "70000000" : "71000000"}-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;

function validateFixtureEnvironment(env = process.env) {
  if (env.APP_ENV !== "test" || env.ALAGEUM_TEST_MEMBER_FIXTURES !== "1") {
    throw new Error("Member fixtures require APP_ENV=test and ALAGEUM_TEST_MEMBER_FIXTURES=1");
  }
  let url;
  try { url = new URL(env.DATABASE_URL); }
  catch { throw new Error("Member fixtures require an explicit disposable PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.pathname !== `/${DATABASE}` || url.search || url.hash) {
    throw new Error(`Member fixtures accept only the dedicated loopback ${DATABASE} database`);
  }
  const password = env.E2E_MEMBER_PASSWORD;
  if (typeof password !== "string" || password.length < 40 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("E2E_MEMBER_PASSWORD must be an explicitly generated disposable password of at least 40 characters");
  }
  return { database: DATABASE, url, password };
}

// Call before Strapi schema synchronization, including when invoked as a CLI.
async function requireFreshMemberDatabase(env = process.env) {
  const { url, database } = validateFixtureEnvironment(env);
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    const actual = await client.query("SELECT current_database() AS database");
    if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved member fixture database");
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    if (tables.rows.length) throw new Error("Member fixtures refuse a reused database; create a fresh isolated database");
  } finally { await client.end(); }
}

async function seedTestMemberUsers(strapi, env = process.env) {
  const { database, password } = validateFixtureEnvironment(env);
  if (strapi.config.get("alageum.env") !== "test" || strapi.config.get("alageum.seedDemo") === true) {
    throw new Error("Member fixtures require test mode with demo seeding disabled");
  }
  const db = strapi.db.connection;
  const actual = await db.raw("SELECT current_database() AS database");
  if (actual.rows[0]?.database !== database) throw new Error("Connected database differs from the approved member fixture database");
  if (await strapi.admin.services.user.exists()) throw new Error("Member fixtures refuse existing CMS administrators");
  const passwordHash = await argon2.hash(password);
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624140)");
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions", "quote_requests", "quote_request_items", "order_statuses", "orders", "order_items", "invoices", "document_types", "documents", "document_versions", "file_objects", "tickets", "ticket_messages", "audit_events"]) {
      if (await table(tx, name).first("id")) throw new Error("Member fixtures refuse existing B2B rows; create a fresh isolated database");
    }
    const organizations = {
      a: { id: randomUUID(), name: "Fictitious Member Workshop A", external_id: "DISPOSABLE-MEMBER-A" },
      b: { id: randomUUID(), name: "Fictitious Member Workshop B", external_id: "DISPOSABLE-MEMBER-B" },
    };
    await table(tx, "organizations").insert(Object.values(organizations));
    const roles = {}, roleNames = new Map();
    async function role(organization, kind, name, grants = []) {
      const id = randomUUID();
      await table(tx, "roles").insert({ id, organization_id: organization?.id || null,
        code: `member_fixture_${kind}`, name, permissions: JSON.stringify(grants) });
      roleNames.set(id, name);
      return id;
    }
    for (const [key, organization] of Object.entries(organizations)) {
      roles[key] = {};
      for (const [kind, grants] of Object.entries(GRANTS))
        roles[key][kind] = await role(organization, kind, `Fictitious member ${kind}`, grants);
    }
    roles.a.profile = await role(organizations.a, "profile", "Fictitious member profile editor", ["organization.profile.read", "organization.profile.update"]);
    roles.a.blank = await role(organizations.a, "blank", "");
    roles.a.unicode = await role(organizations.a, "unicode", "Синтетикалық рөл 東京");
    roles.a.html = await role(organizations.a, "html", "<img src=x onerror=alert('fixture-role')>");
    roles.global = await role(null, "global", "Fictitious global member role");
    const users = {}, members = { a: [], b: [] }, targets = {}, ordinals = { a: 0, b: 0 };
    async function addMembership(user, key, roleId, active = true) {
      const ordinal = ++ordinals[key], id = memberId(key, ordinal);
      // First 50 tie by time and must be ordered by membership ID. Last five
      // deliberately have older timestamps as ordinal increases, proving that
      // created_at precedes the ID tie-breaker rather than ordering by ID alone.
      const created = key === "a" && ordinal > 50 ? `2026-02-${String(56 - ordinal).padStart(2, "0")}T00:00:00Z` : "2026-01-01T00:00:00Z";
      await table(tx, "memberships").insert({ id, user_id: user.id, organization_id: organizations[key].id,
        role_id: roleId, is_active: active, created_at: created, updated_at: created });
      const item = { membership_id: id, user_id: user.id, email: user.email, display_name: user.display_name,
        role_id: roleId, role_name: roleNames.get(roleId) };
      members[key].push({ item, created });
      return item;
    }
    for (const [kind, email] of Object.entries(EMAILS).filter(([kind]) => kind !== "profile")) {
      const user = { id: randomUUID(), email, display_name: `Fictitious Member ${kind}` };
      await table(tx, "users").insert({ ...user, password_hash: passwordHash });
      const keys = kind === "multi" ? ["a", "b"] : [kind === "other" ? "b" : "a"];
      users[kind] = { ...user, organizations: keys.map(key => organizations[key].id) };
      for (const key of keys) {
        const item = await addMembership(user, key, roles[key][kind === "denied" ? "denied" : "reader"]);
        if (kind === "reader") targets.regular = item;
      }
    }
    const special = [
      { key: "inactiveMembership", name: "Fictitious inactive membership", email: "member-inactive-membership@fixture.invalid", membershipActive: false },
      { key: "inactiveUser", name: "Fictitious inactive user", email: "member-inactive-user@fixture.invalid", userActive: false },
      { key: "global", name: "Fictitious global role member", email: "member-global-role@fixture.invalid", roleId: roles.global },
      { key: "plainEmail", name: "Fictitious plain email text", email: "fictitious member email text" },
      { key: "blank", name: "", email: "", roleId: roles.a.blank },
      { key: "unicode", name: "Синтетикалық қатысушы 東京", email: "синтетикалық-東京@fixture.invalid", roleId: roles.a.unicode },
      { key: "html", name: "<img src=x onerror=alert('fixture-member')>", email: "<script>fixture-email</script>", roleId: roles.a.html },
      { key: "profile", name: "Fictitious Member profile", email: EMAILS.profile, roleId: roles.a.profile },
    ];
    for (let index = 0; ordinals.a < TOTAL_A; index++) {
      const target = special[index] || { name: `Fictitious Member Row ${String(ordinals.a + 1).padStart(2, "0")}`,
        email: `member-row-${String(ordinals.a + 1).padStart(2, "0")}@fixture.invalid` };
      const user = { id: randomUUID(), email: target.email, display_name: target.name };
      await table(tx, "users").insert({ ...user, password_hash: passwordHash, is_active: target.userActive !== false });
      const item = await addMembership(user, "a", target.roleId || roles.a.denied, target.membershipActive !== false);
      if (target.key) targets[target.key] = item;
      if (target.key === "profile") users.profile = { ...user, organizations: [organizations.a.id] };
    }
    for (const key of Object.keys(members)) members[key] = members[key]
      .sort((left, right) => left.created.localeCompare(right.created) || left.item.membership_id.localeCompare(right.item.membership_id))
      .map(row => row.item);
    // No passwords, hashes, access tokens, or refresh tokens leave this helper.
    return { fixture: "disposable-organization-members", organizations, roles, users, members, targets };
  });
}

function generateFixtureSecrets(env = process.env) {
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"])
    env[key] = randomBytes(48).toString("hex");
  env.ALAGEUM_SEED_DEMO = "0";
  env.ALAGEUM_IMPORT_CATALOG = "0";
  env.STRAPI_TELEMETRY_DISABLED = "true";
  env.STRAPI_HIDE_UPDATE_MESSAGE = "true";
}

module.exports = { DATABASE, EMAILS, GRANTS, TOTAL_A, validateFixtureEnvironment, requireFreshMemberDatabase, seedTestMemberUsers, generateFixtureSecrets };

if (require.main === module) {
  (async () => {
    await requireFreshMemberDatabase();
    generateFixtureSecrets();
    const app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    try { await app.load(); console.log(JSON.stringify(await seedTestMemberUsers(app))); }
    finally { await app.destroy(); }
  })().catch(() => {
    // Startup/database exceptions may contain the URL. Never print raw errors.
    console.error("Disposable member fixture setup failed; verify the isolated database, test guards and runtime password");
    process.exitCode = 1;
  });
}
