"use strict";
// Local/CI disposable fixtures only. Never a production bootstrap or credential setup.
const { randomBytes } = require("node:crypto");
if (process.env.APP_ENV !== "test") throw new Error("APP_ENV=test is required");
for (const key of [
  "APP_KEYS",
  "ADMIN_JWT_SECRET",
  "API_TOKEN_SALT",
  "TRANSFER_TOKEN_SALT",
  "ENCRYPTION_KEY",
  "ALAGEUM_JWT_SECRET",
])
  process.env[key] ||= randomBytes(48).toString("hex");
process.env.STRAPI_TELEMETRY_DISABLED = "true";
require("@strapi/strapi")
  .createStrapi({ appDir: process.cwd(), distDir: process.cwd() })
  .start();
