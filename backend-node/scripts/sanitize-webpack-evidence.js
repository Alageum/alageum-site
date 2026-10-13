"use strict";
// Only top-level text evidence is publishable; never copy fixture databases,
// password files, browser profiles or traces into the compatibility artifact.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const directory = path.resolve(process.argv[2]);
const names = ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET", "E2E_CMS_EDITOR_PASSWORD", "E2E_CMS_DENIED_PASSWORD", "DATABASE_URL", "WEBPACK_SANITIZE_PG_PASSWORD"];
const secrets = [...new Set(names.flatMap(name => (process.env[name] || "").split(",")).filter(value => value.length >= 8))];
const staging = path.join(directory, `.sanitized-${randomUUID()}`);
const publishable = path.join(directory, "publishable");
if (fs.existsSync(publishable)) throw new Error("Refusing to replace an existing publishable evidence snapshot");
fs.mkdirSync(staging, { mode: 0o700 });
try {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:log|json)$/.test(entry.name)) continue;
    let value = fs.readFileSync(path.join(directory, entry.name), "utf8");
    for (const secret of secrets) for (const variant of [secret, encodeURIComponent(secret)]) value = value.split(variant).join("[disposable fixture secret]");
    value = value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[disposable fixture token]");
    fs.writeFileSync(path.join(staging, entry.name), value, { flag: "wx", mode: 0o600 });
  }
  // Marker is last; only a complete redacted snapshot becomes publishable.
  fs.writeFileSync(path.join(staging, "sanitized.ok"), "Complete redacted top-level logs/JSON; raw fixtures must never be uploaded.\n", { flag: "wx", mode: 0o600 });
  fs.renameSync(staging, publishable);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
