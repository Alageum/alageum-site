#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
// Public, synthetic build fixtures, deliberately rejected by production checks.
// Do not substitute production secrets here. Only runtime injects real values.
const env = {
  ...process.env, NODE_ENV: "production", APP_ENV: "development",
  DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/alageum_strapi_build", DATABASE_SSL: "false",
  APP_KEYS: "build-only-example-secret-app-key-one,build-only-example-secret-app-key-two",
  ALAGEUM_SEED_DEMO: "0", ALAGEUM_IMPORT_CATALOG: "0", ALAGEUM_EDS_ENABLED: "0", ALAGEUM_GOOGLE_ENABLED: "0",
};
for (const name of ["ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"])
  env[name] = `build-only-example-secret-${name.toLowerCase()}-not-for-runtime`;
for (const name of ["ALAGEUM_MEDIA_PUBLIC_ROOT", "ALAGEUM_MEDIA_QUARANTINE_DIR", "NODE_EXTRA_CA_CERTS"])
  delete env[name];
const result = spawnSync("npm", ["run", "build"], { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
