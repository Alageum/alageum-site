"use strict";
const { isIP } = require("node:net");
const { trustedProxyAddresses } = require("./client-address");
const { readMediaConfig } = require("./media-policy");
const { inspectMailConfiguration } = require("./registration-mail");

const SECRET_NAMES = Object.freeze(["ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]);
// These remain operator evidence, not environment flags. Configuration admission
// never certifies service health, a recovery rehearsal or approval to cut over.
const RELEASE_REQUIREMENTS = Object.freeze([
  "https_same_origin_cookie_acceptance",
  "trusted_proxy_network_isolation",
  "database_backup_restore_and_schema_rollback",
  "persistent_media_backup_restore",
  "clamav_engine_signatures_and_admission_acceptance",
  "smtp_verification_and_reset_delivery",
  "dependency_security_review",
  "exact_commit_browser_acceptance_and_operator_cutover",
]);
const enabled = value => ["1", "true"].includes(value);
const disabled = value => ["0", "false"].includes(value);
function secretValid(value) {
  return typeof value === "string" && value.length >= 32 && value.length <= 4096 &&
    !/[\s\x00-\x1f\x7f]/.test(value) && new Set(value).size >= 12 &&
    !/(?:change[-_]?me|replace[-_]?me|example[-_]?secret|development[-_]?secret|test[-_]?secret)/i.test(value);
}
function exactHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && !url.username && !url.password &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}
function inspectProductionConfiguration(env = (name, fallback) => process.env[name] ?? fallback) {
  const issues = [];
  const add = (code, setting, category = "configuration") => issues.push({ code, setting, category });
  if (env("APP_ENV") !== "production") add("production_mode_required", "APP_ENV");
  if (env("NODE_ENV") !== "production") add("production_node_mode_required", "NODE_ENV");
  for (const name of ["ALAGEUM_SEED_DEMO", "ALAGEUM_IMPORT_CATALOG", "ALAGEUM_EDS_ENABLED"])
    if (!disabled(env(name))) add("explicit_disabled_required", name);
  const values = [];
  for (const name of SECRET_NAMES) {
    const value = env(name);
    if (!secretValid(value)) add("independent_strong_secret_required", name);
    else values.push([name, value]);
  }
  const appKeys = String(env("APP_KEYS", "")).split(",");
  if (appKeys.length < 2 || appKeys.length > 8 || appKeys.some(value => !secretValid(value)))
    add("multiple_strong_app_keys_required", "APP_KEYS");
  else appKeys.forEach(value => values.push(["APP_KEYS", value]));
  const seen = new Set();
  for (const [name, value] of values) {
    if (seen.has(value)) add("secret_reuse_forbidden", name);
    seen.add(value);
  }
  const origin = env("ALAGEUM_BROWSER_ORIGIN", "");
  if (!exactHttpsOrigin(origin)) add("exact_https_browser_origin_required", "ALAGEUM_BROWSER_ORIGIN");
  // This backend serves HTTP. Secure cookies therefore require a reviewed TLS
  // terminator, rather than blanket Koa trust or a forged forwarding header.
  try {
    const peers = trustedProxyAddresses(String(env("ALAGEUM_TRUSTED_PROXY_IPS", "")).split(",").map(x => x.trim()).filter(Boolean));
    if (!peers.length) add("explicit_tls_proxy_peer_required", "ALAGEUM_TRUSTED_PROXY_IPS");
  } catch { add("invalid_trusted_proxy_peers", "ALAGEUM_TRUSTED_PROXY_IPS"); }
  if (!isIP(env("HOST", ""))) add("explicit_listen_address_required", "HOST");
  const port = String(env("PORT", "8000"));
  if (!/^\d+$/.test(port) || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)
    add("valid_listen_port_required", "PORT");
  const cors = String(env("CORS_ORIGINS", "")).split(",").map(x => x.trim()).filter(Boolean);
  if (!exactHttpsOrigin(origin) || cors.length !== 1 || cors[0] !== origin)
    add("only_browser_origin_allowed", "CORS_ORIGINS");
  try {
    const url = new URL(env("DATABASE_URL", ""));
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !/^\/alageum_strapi[a-zA-Z0-9_]*$/.test(url.pathname) ||
        !url.hostname || !url.username || !url.password || url.search || url.hash) throw new Error("invalid");
    // Query parameters can override node-postgres host/database/TLS options.
    // Only the explicit, certificate-verifying DATABASE_SSL setting is used.
    const local = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
    if (!enabled(env("DATABASE_SSL")) && !(local && disabled(env("DATABASE_SSL"))))
      add("verified_database_tls_required", "DATABASE_SSL");
  } catch { add("dedicated_database_url_without_overrides_required", "DATABASE_URL"); }
  if (!env("ALAGEUM_MEDIA_QUARANTINE_DIR", "")) add("explicit_private_quarantine_required", "ALAGEUM_MEDIA_QUARANTINE_DIR", "media");
  try {
    const media = readMediaConfig(env);
    if (!media.scanner.host && !media.scanner.socketPath) add("media_scanner_required", "ALAGEUM_MEDIA_CLAMAV_HOST|ALAGEUM_MEDIA_CLAMAV_SOCKET", "media");
    if (!media.storage.publicRoot) add("explicit_persistent_media_root_required", "ALAGEUM_MEDIA_PUBLIC_ROOT", "media");
  } catch (error) {
    if (error?.message === "media_storage_root_invalid") add("invalid_media_storage_root", "ALAGEUM_MEDIA_PUBLIC_ROOT", "media");
    else add("invalid_media_configuration", "ALAGEUM_MEDIA_*", "media");
  }
  const mail = inspectMailConfiguration({ env: "production", browserOrigin: origin, registrationMail: {
    provider: env("ALAGEUM_REGISTRATION_MAIL_PROVIDER", "disabled"), host: env("ALAGEUM_SMTP_HOST", ""),
    port: Number(env("ALAGEUM_SMTP_PORT", "587")), from: env("ALAGEUM_MAIL_FROM", ""),
    user: env("ALAGEUM_SMTP_USER", ""), pass: env("ALAGEUM_SMTP_PASSWORD", ""),
    tlsServername: env("ALAGEUM_SMTP_TLS_SERVERNAME", ""),
  } });
  for (const code of mail.issues) add(code, "ALAGEUM_REGISTRATION_MAIL_PROVIDER|ALAGEUM_SMTP_*|ALAGEUM_MAIL_FROM", "registration_mail");
  if (enabled(env("ALAGEUM_GOOGLE_ENABLED"))) {
    const clientId = env("ALAGEUM_GOOGLE_CLIENT_ID"), clientSecret = env("ALAGEUM_GOOGLE_CLIENT_SECRET");
    if (typeof clientId !== "string" || !clientId.endsWith(".apps.googleusercontent.com") ||
        typeof clientSecret !== "string" || clientSecret.length < 16)
      add("google_credentials_required_when_enabled", "ALAGEUM_GOOGLE_CLIENT_ID|ALAGEUM_GOOGLE_CLIENT_SECRET", "optional_google");
  } else if (!disabled(env("ALAGEUM_GOOGLE_ENABLED"))) add("explicit_google_mode_required", "ALAGEUM_GOOGLE_ENABLED", "optional_google");
  return {
    schema_version: 2, configuration_valid: issues.length === 0,
    configuration_admitted: issues.length === 0, release_verified: false,
    issues,
    implementation_blockers: [],
    runtime_checks_required: ["supported_database_version_and_schema", "configured_media_storage"],
    release_evidence_required: [...RELEASE_REQUIREMENTS],
    limitations: ["binary_media_replacement_unavailable", "new_public_uploads_png_jpeg_webp_only"],
  };
}
function assertProductionStartup(env) {
  const report = inspectProductionConfiguration(env);
  // No approval/skip flag bypasses invalid configuration. Real storage checks
  // still run in the upload plugin before provider registration, and Strapi
  // awaits the database/schema bootstrap before accepting HTTP connections.
  const codes = [...new Set(report.issues.map(issue => issue.code)), ...report.implementation_blockers];
  if (!report.configuration_valid || codes.length)
    throw new Error(`Production startup blocked: ${codes.join(", ")}; run node scripts/check-production-readiness.js for safe diagnostics.`);
  return report;
}
async function assertProductionDatabaseVersion(db) {
  const result = await db.raw("SELECT current_setting('server_version_num') AS server_version");
  const value = Number(result?.rows?.[0]?.server_version);
  // Constraint representation is verified on these majors. PostgreSQL18 changes
  // it; reject before any application migration rather than relax the checks.
  if (!Number.isInteger(value) || ![16, 17].includes(Math.floor(value / 10000)))
    throw new Error("Unsupported production PostgreSQL major; use PostgreSQL 16 or 17");
}
module.exports = { inspectProductionConfiguration, assertProductionStartup, assertProductionDatabaseVersion, RELEASE_REQUIREMENTS };
