"use strict";
const { trustedProxyAddresses } = require("../src/domain/client-address");
function required(env, name) {
  const value = env(name);
  if (!value || value.length < 32)
    throw new Error(
      `${name} must be explicitly supplied (at least 32 characters)`,
    );
  return value;
}
module.exports = ({ env }) => {
  const mode = env("APP_ENV", "development");
  if (mode === "production") require("../src/domain/production-readiness").assertProductionStartup(env);
  if (!["test", "development"].includes(mode)) throw new Error("Unsupported APP_ENV; use test, development or the validated production release process");
  return {
    env: mode,
    jwtSecret: required(env, "ALAGEUM_JWT_SECRET"),
    jwtIssuer: "alageum",
    jwtAudience: "alageum-web",
    accessTokenMinutes: 15,
    refreshTokenDays: 7,
    seedDemo: ["1", "true"].includes(env("ALAGEUM_SEED_DEMO", "false")),
    importCatalog: ["1", "true"].includes(
      env("ALAGEUM_IMPORT_CATALOG", "false"),
    ),
    documentSigningEnabled: env("ALAGEUM_EDS_ENABLED", "0") === "1",
    maxRequestBytes: 1024 * 1024,
    googleEnabled: ["1", "true"].includes(env("ALAGEUM_GOOGLE_ENABLED", "false")),
    browserOrigin: env("ALAGEUM_BROWSER_ORIGIN", ""),
    trustedProxyIps: trustedProxyAddresses(env("ALAGEUM_TRUSTED_PROXY_IPS", "").split(",").map(value => value.trim()).filter(Boolean)),
    registrationMail: {
      provider: env("ALAGEUM_REGISTRATION_MAIL_PROVIDER", "disabled"),
      host: env("ALAGEUM_SMTP_HOST", ""),
      tlsServername: env("ALAGEUM_SMTP_TLS_SERVERNAME", ""),
      port: Number(env("ALAGEUM_SMTP_PORT", "587")),
      user: env("ALAGEUM_SMTP_USER", ""),
      pass: env("ALAGEUM_SMTP_PASSWORD", ""),
      from: env("ALAGEUM_MAIL_FROM", ""),
    },
    googleClientId: env("ALAGEUM_GOOGLE_CLIENT_ID", ""),
    googleClientSecret: env("ALAGEUM_GOOGLE_CLIENT_SECRET", ""),
  };
};
