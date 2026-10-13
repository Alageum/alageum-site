"use strict";
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
  if (!["test", "development"].includes(mode)) {
    throw new Error(
      "Production startup blocked: browser session transport, distributed rate limits, media scanner and cutover have not been approved or implemented",
    );
  }
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
    registrationMail: {
      provider: env("ALAGEUM_REGISTRATION_MAIL_PROVIDER", "disabled"),
      host: env("ALAGEUM_SMTP_HOST", ""),
      port: Number(env("ALAGEUM_SMTP_PORT", "587")),
      user: env("ALAGEUM_SMTP_USER", ""),
      pass: env("ALAGEUM_SMTP_PASSWORD", ""),
      from: env("ALAGEUM_MAIL_FROM", ""),
    },
    googleClientId: env("ALAGEUM_GOOGLE_CLIENT_ID", ""),
    googleClientSecret: env("ALAGEUM_GOOGLE_CLIENT_SECRET", ""),
  };
};
