"use strict";
// No network or messages by default. The explicit probe authenticates with SMTP
// but never sends mail; use only with approved provider/account configuration.
const { createRegistrationMail, inspectMailConfiguration } = require("../src/domain/registration-mail");
function mailConfig(env = process.env) {
  return { env: env.APP_ENV || "development", browserOrigin: env.ALAGEUM_BROWSER_ORIGIN || "", registrationMail: {
    provider: env.ALAGEUM_REGISTRATION_MAIL_PROVIDER || "disabled", host: env.ALAGEUM_SMTP_HOST || "", port: Number(env.ALAGEUM_SMTP_PORT || 587),
    tlsServername: env.ALAGEUM_SMTP_TLS_SERVERNAME || "", from: env.ALAGEUM_MAIL_FROM || "", user: env.ALAGEUM_SMTP_USER || "", pass: env.ALAGEUM_SMTP_PASSWORD || "",
  } };
}
function probeFailure(error) {
  if (error?.code === "EAUTH") return "smtp_authentication_failed";
  if (error?.code === "ETIMEDOUT") return "smtp_connection_timed_out";
  if (error?.code === "ESOCKET" || error?.code === "ECONNECTION") return "smtp_tls_or_connection_failed";
  return "smtp_connection_failed";
}
async function check({ args = [], env = process.env, factory = createRegistrationMail } = {}) {
  if (args.length > 1 || (args.length && !["--config-only", "--verify-connection"].includes(args[0]))) return { exitCode: 2, result: { error: "Use --config-only or --verify-connection" } };
  const config = mailConfig(env), configuration = inspectMailConfiguration(config);
  if (!configuration.configured) return { exitCode: 2, result: { configuration, connection_checked: false, email_sent: false } };
  if (args[0] !== "--verify-connection") return { exitCode: 0, result: { configuration, connection_checked: false, email_sent: false } };
  try {
    await factory({ config }).verifyConnection();
    return { exitCode: 0, result: { configuration, connection_checked: true, connection_verified: true, email_sent: false,
      note: "TLS and SMTP authentication passed. Sender acceptance, DNS authentication and inbox delivery still require a separately authorized smoke test." } };
  } catch (error) {
    return { exitCode: 1, result: { configuration, connection_checked: true, connection_verified: false, failure: probeFailure(error), email_sent: false } };
  }
}
if (require.main === module) check({ args: process.argv.slice(2) }).then(({ exitCode, result }) => { console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode; }).catch(() => { console.error("SMTP readiness check failed; no provider details were logged"); process.exitCode = 1; });
module.exports = { check, mailConfig, probeFailure };
