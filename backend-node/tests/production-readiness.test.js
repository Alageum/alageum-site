"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { mkdtempSync, mkdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { inspectProductionConfiguration, assertProductionStartup } = require("../src/domain/production-readiness");
const secret = key => createHash("sha256").update(`synthetic-readiness-only:${key}`).digest("hex");
const valid = () => ({ APP_ENV: "production", NODE_ENV: "production", HOST: "127.0.0.1",
  ALAGEUM_SEED_DEMO: "0", ALAGEUM_IMPORT_CATALOG: "0", ALAGEUM_EDS_ENABLED: "0", ALAGEUM_GOOGLE_ENABLED: "0",
  ALAGEUM_BROWSER_ORIGIN: "https://accounts.example.test", CORS_ORIGINS: "https://accounts.example.test",
  ALAGEUM_TRUSTED_PROXY_IPS: "127.0.0.1", DATABASE_URL: "postgresql://synthetic:local-only@127.0.0.1/alageum_strapi_readiness", DATABASE_SSL: "false",
  APP_KEYS: `${secret("key1")},${secret("key2")}`,
  ...Object.fromEntries(["ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"].map(key => [key, secret(key)])),
  ALAGEUM_MEDIA_CLAMAV_HOST: "127.0.0.1", ALAGEUM_MEDIA_PUBLIC_ROOT: "/var/lib/alageum/public", ALAGEUM_MEDIA_QUARANTINE_DIR: "/var/lib/alageum/private-quarantine", ALAGEUM_REGISTRATION_MAIL_PROVIDER: "smtp", ALAGEUM_SMTP_HOST: "smtp.example.test",
  ALAGEUM_SMTP_PORT: "587", ALAGEUM_MAIL_FROM: "noreply@example.test",
});
const env = values => (name, fallback) => values[name] ?? fallback;
const inspect = changes => inspectProductionConfiguration(env({ ...valid(), ...changes }));
const has = (report, code) => report.issues.some(issue => issue.code === code);
test("validated production configuration is admitted without claiming release evidence", () => {
  const report = inspect({});
  assert.equal(report.configuration_valid, true);
  assert.equal(report.configuration_admitted, true);
  assert.equal(report.release_verified, false);
  assert.deepEqual(report.runtime_checks_required, ["supported_database_version_and_schema", "configured_media_storage"]);
  assert.deepEqual(report.implementation_blockers, []);
  assert.ok(report.release_evidence_required.includes("database_backup_restore_and_schema_rollback"));
  assert.deepEqual(assertProductionStartup(env(valid())), report);
  assert.deepEqual(inspect({ ALAGEUM_APPROVE_PRODUCTION: "true", ALAGEUM_SKIP_RELEASE_GATES: "1" }), report);
});
test("no approval flag admits missing or unsafe production configuration", () => {
  const invalid = [{ ALAGEUM_JWT_SECRET: "" }, { ALAGEUM_BROWSER_ORIGIN: "http://localhost" }, { DATABASE_SSL: "false", DATABASE_URL: "postgresql://u:p@remote.example.test/alageum_strapi" },
    { ALAGEUM_SEED_DEMO: "1" }, { ALAGEUM_MEDIA_CLAMAV_HOST: "" }, { ALAGEUM_REGISTRATION_MAIL_PROVIDER: "disabled" }];
  for (const changes of invalid) {
    const values = { ...valid(), ...changes, ALAGEUM_APPROVE_PRODUCTION: "true", ALAGEUM_SKIP_RELEASE_GATES: "1" };
    assert.equal(inspectProductionConfiguration(env(values)).configuration_admitted, false);
    assert.throws(() => assertProductionStartup(env(values)), /Production startup blocked/);
    assert.throws(() => require("../config/alageum")({ env: env(values) }), /Production startup blocked/);
  }
});
test("production origins, exact proxy trust and CORS cannot accept development or wildcard settings", () => {
  for (const value of ["http://accounts.example.test", "https://localhost", "https://accounts.example.test/path", "https://user:pass@accounts.example.test", "https://accounts.example.test/"])
    assert.ok(has(inspect({ ALAGEUM_BROWSER_ORIGIN: value }), "exact_https_browser_origin_required"));
  assert.ok(has(inspect({ ALAGEUM_TRUSTED_PROXY_IPS: "" }), "explicit_tls_proxy_peer_required"));
  assert.ok(has(inspect({ ALAGEUM_TRUSTED_PROXY_IPS: "10.0.0.0/8" }), "invalid_trusted_proxy_peers"));
  assert.ok(has(inspect({ CORS_ORIGINS: "*" }), "only_browser_origin_allowed"));
  assert.ok(has(inspect({ CORS_ORIGINS: `${valid().CORS_ORIGINS},https://other.example.test` }), "only_browser_origin_allowed"));
  for (const port of ["not-a-port", "0", "65536", "8.5", "-1"])
    assert.ok(has(inspect({ PORT: port }), "valid_listen_port_required"));
  assert.equal(inspect({ PORT: "8000" }).configuration_valid, true);
});
test("database isolation and TLS reject connection-string query overrides", () => {
  for (const value of ["postgresql://u:p@127.0.0.1/legacy", "postgresql://u:p@127.0.0.1/alageum_strapi?sslmode=no-verify", "postgresql://u:p@127.0.0.1/alageum_strapi?host=other", "postgresql://u:p@127.0.0.1/alageum_strapi#fragment", "postgresql://u@127.0.0.1/alageum_strapi"])
    assert.ok(has(inspect({ DATABASE_URL: value }), "dedicated_database_url_without_overrides_required"));
  assert.ok(has(inspect({ DATABASE_URL: "postgresql://u:p@database.internal/alageum_strapi" }), "verified_database_tls_required"));
  assert.equal(inspect({ DATABASE_URL: "postgresql://u:p@database.internal/alageum_strapi", DATABASE_SSL: "true" }).configuration_valid, true);
});
test("independent strong secrets reject reuse, placeholders and missing key rotation material", () => {
  for (const value of ["a".repeat(64), "development-secret-".repeat(4), "short", ` ${secret("secret")}`])
    assert.ok(has(inspect({ ALAGEUM_JWT_SECRET: value }), "independent_strong_secret_required"));
  assert.ok(has(inspect({ ALAGEUM_JWT_SECRET: valid().ADMIN_JWT_SECRET }), "secret_reuse_forbidden"));
  assert.ok(has(inspect({ APP_KEYS: secret("only") }), "multiple_strong_app_keys_required"));
  assert.ok(has(inspect({ APP_KEYS: `${secret("key")},${secret("key")}` }), "secret_reuse_forbidden"));
});
test("seed, import, signing, scanner and account mail are reported explicitly without enabling features", () => {
  for (const name of ["ALAGEUM_SEED_DEMO", "ALAGEUM_IMPORT_CATALOG", "ALAGEUM_EDS_ENABLED"])
    assert.ok(has(inspect({ [name]: "1" }), "explicit_disabled_required"));
  assert.ok(has(inspect({ ALAGEUM_MEDIA_CLAMAV_HOST: "" }), "media_scanner_required"));
  assert.ok(has(inspect({ ALAGEUM_MEDIA_CLAMAV_HOST: "203.0.113.1" }), "invalid_media_configuration"));
  assert.ok(has(inspect({ ALAGEUM_MEDIA_PUBLIC_ROOT: "" }), "explicit_persistent_media_root_required"));
  assert.ok(has(inspect({ ALAGEUM_MEDIA_PUBLIC_ROOT: "relative/path" }), "invalid_media_storage_root"));
  assert.ok(has(inspect({ ALAGEUM_MEDIA_QUARANTINE_DIR: "" }), "explicit_private_quarantine_required"));
  assert.ok(has(inspect({ ALAGEUM_REGISTRATION_MAIL_PROVIDER: "disabled" }), "mail_disabled"));
  assert.ok(has(inspect({ ALAGEUM_SMTP_USER: "provided", ALAGEUM_SMTP_PASSWORD: "" }), "smtp_credentials"));
  assert.ok(has(inspect({ ALAGEUM_GOOGLE_ENABLED: "1" }), "google_credentials_required_when_enabled"));
  assert.ok(has(inspect({ ALAGEUM_GOOGLE_ENABLED: "1", ALAGEUM_GOOGLE_CLIENT_ID: "anything", ALAGEUM_GOOGLE_CLIENT_SECRET: "short" }), "google_credentials_required_when_enabled"));
  assert.equal(inspect({ ALAGEUM_GOOGLE_ENABLED: "1", ALAGEUM_GOOGLE_CLIENT_ID: "synthetic.apps.googleusercontent.com", ALAGEUM_GOOGLE_CLIENT_SECRET: "synthetic-only-secret" }).configuration_valid, true);
});
test("operator command admits valid local checks without certifying services or recovery", t => {
  const injected = valid();
  const root = mkdtempSync(join(tmpdir(), "alageum-production-readiness-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  injected.ALAGEUM_MEDIA_PUBLIC_ROOT = join(root, "public");
  injected.ALAGEUM_MEDIA_QUARANTINE_DIR = join(root, "quarantine");
  mkdirSync(injected.ALAGEUM_MEDIA_PUBLIC_ROOT, { mode: 0o750 });
  mkdirSync(join(injected.ALAGEUM_MEDIA_PUBLIC_ROOT, "uploads"), { mode: 0o750 });
  mkdirSync(injected.ALAGEUM_MEDIA_QUARANTINE_DIR, { mode: 0o700 });
  const result = spawnSync(process.execPath, [join(__dirname, "../scripts/check-production-readiness.js")], { env: { ...injected }, encoding: "utf8" });
  assert.equal(result.status, 0); assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).local_startup_checks_passed, true);
  assert.equal(JSON.parse(result.stdout).release_verified, false);
  assert.equal(JSON.parse(result.stdout).media_storage.directories_ready, true);
  assert.equal(JSON.parse(result.stdout).media_storage.volume_persistence_verified, false);
  for (const key of ["DATABASE_URL", "ALAGEUM_JWT_SECRET", "APP_KEYS", "ALAGEUM_SMTP_HOST", "ALAGEUM_BROWSER_ORIGIN"])
    assert.ok(!result.stdout.includes(injected[key]), key);
  const invalid = spawnSync(process.execPath, [join(__dirname, "../scripts/check-production-readiness.js")], { env: {}, encoding: "utf8" });
  assert.equal(invalid.status, 1); assert.equal(JSON.parse(invalid.stdout).configuration_valid, false);
  const missing = spawnSync(process.execPath, [join(__dirname, "../scripts/check-production-readiness.js")], { env: { ...injected, ALAGEUM_MEDIA_PUBLIC_ROOT: join(root, "missing") }, encoding: "utf8" });
  assert.equal(missing.status, 1); assert.equal(JSON.parse(missing.stdout).media_storage.directories_ready, false);
  assert.ok(!missing.stdout.includes(root));
});
test("config preserves test/development startup and reports unsupported modes precisely", () => {
  const config = require("../config/alageum");
  for (const mode of ["test", "development", "production"]) assert.equal(config({ env: env({ ...valid(), APP_ENV: mode }) }).env, mode);
  assert.throws(() => config({ env: env({ ...valid(), APP_ENV: "prod" }) }), /Unsupported APP_ENV/);
  assert.throws(() => config({ env: env({ ...valid(), ALAGEUM_SEED_DEMO: "1" }) }), /Production startup blocked/);
});
test("production refuses anonymous first-admin takeover before native handlers", async () => {
  const factory = require("../src/middlewares/request-security");
  for (const path of ["/admin/register-admin", "/ADMIN/register-admin/"]) {
    let called = false;
    const middleware = factory({}, { strapi: { config: { get: key => key === "alageum.env" ? "production" : [] } } });
    const ctx = { method: "POST", path, req: { socket: { remoteAddress: "127.0.0.1" } }, set() {} };
    await middleware(ctx, async () => { called = true; });
    assert.equal(ctx.status, 403); assert.equal(called, false);
  }
  let called = false;
  const middleware = factory({}, { strapi: { config: { get: key => key === "alageum.env" ? "production" : [] } } });
  await middleware({ method: "GET", path: "/cms", req: { socket: { remoteAddress: "127.0.0.1" } } }, async () => { called = true; });
  assert.equal(called, true);
});
test("production database versions are checked before schema migration", async () => {
  const { assertProductionDatabaseVersion } = require("../src/domain/production-readiness");
  for (const value of ["160000", "160011", "170010"]) {
    const calls = [];
    await assertProductionDatabaseVersion({ async raw(sql) { calls.push(sql); return { rows: [{ server_version: value }] }; } });
    assert.deepEqual(calls, ["SELECT current_setting('server_version_num') AS server_version"]);
  }
  for (const value of ["150000", "180004", "invalid", undefined, "170000.5"])
    await assert.rejects(assertProductionDatabaseVersion({ async raw() { return { rows: [{ server_version: value }] }; } }), /Unsupported production PostgreSQL major/);
  await assert.rejects(assertProductionDatabaseVersion({ async raw() { throw new Error("Database unavailable"); } }), /Database unavailable/);
});

test("production operator CLI pins the validated runtime DB and certificate-verifying TLS", () => {
  const { connectionForEnvironment, options } = require("../scripts/provision-business-operator");
  const remote = { ...valid(), DATABASE_URL: "postgresql://operator:synthetic@postgres/alageum_strapi", DATABASE_SSL: "true" };
  assert.deepEqual(connectionForEnvironment(remote), { host: "postgres", port: 5432, user: "operator", password: "synthetic", database: "alageum_strapi", ssl: { rejectUnauthorized: true } });
  assert.throws(() => connectionForEnvironment({ ...remote, DATABASE_SSL: "false" }), /Production startup blocked/);
  assert.throws(() => connectionForEnvironment({ ...remote, ALAGEUM_OPERATOR_DATABASE_URL: "postgresql://operator:synthetic@other/alageum_strapi" }), /override is forbidden/);
  assert.throws(() => connectionForEnvironment({ ...remote, DATABASE_URL: remote.DATABASE_URL + "?sslmode=no-verify" }), /Production startup blocked/);
  assert.throws(() => connectionForEnvironment({ APP_ENV: "staging" }), /Explicit APP_ENV/);
  assert.equal(options(["--email", "operator@example.test", "--mode", "organization-admin", "--organization-id", "10000000-0000-4000-8000-000000000001"]).apply, false);
});

test("reviewed catalog CLI is non-mutating by default and only explicit apply reaches native bootstrap", async () => {
  const { bootstrap, options } = require("../scripts/bootstrap-reviewed-catalog");
  for (const args of [["--apply", "--apply"], ["--force"], ["--apply=false"]]) assert.throws(() => options(args));
  let loaded = 0, destroyed = 0, imported = 0;
  const records = [{ id: "synthetic", category: "transformers" }];
  const createApp = () => ({ async load() { loaded++; }, async destroy() { destroyed++; }, alageum: { catalog: { async importRecords(input, policy) {
    assert.equal(input, records); assert.deepEqual(policy, { requireEmpty: true }); imported++; return { created: 1, categories_created: 1, skipped: 0 };
  } } } });
  const summary = await bootstrap({ env: valid(), read: () => records, createApp });
  assert.equal(summary.applied, false); assert.equal(summary.database_checked, false); assert.equal(loaded, 0); assert.equal(imported, 0);
  const result = await bootstrap({ args: ["--apply"], env: valid(), read: () => records, createApp });
  assert.equal(result.applied, true); assert.equal(loaded, 1); assert.equal(imported, 1); assert.equal(destroyed, 1);
  await assert.rejects(bootstrap({ args: ["--apply"], env: { ...valid(), ALAGEUM_IMPORT_CATALOG: "1" }, read: () => records, createApp }), /Production startup blocked/);
  assert.equal(loaded, 1);
  await assert.rejects(bootstrap({ args: ["--apply"], env: valid(), read: () => { throw new Error("Source hash mismatch"); }, createApp }), /Source hash/);
  assert.equal(loaded, 1);
  await assert.rejects(bootstrap({ args: ["--apply"], env: valid(), read: () => records, createApp: () => ({ async load() { throw new Error("Storage refused"); }, async destroy() { destroyed++; } }) }), /Storage refused/);
  assert.equal(destroyed, 2);
});
