"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRegistrationMail, inspectMailConfiguration, mailbox, validPayload } = require("../src/domain/registration-mail");
const config = { env: "test", browserOrigin: "https://site.example.test", registrationMail: { provider: "smtp", host: "smtp.example.test", port: 587, from: "noreply@example.test", user: "synthetic", pass: "synthetic-password" } };
const payload = { email: "recipient@example.test", purpose: "verify", url: config.browserOrigin + "/verify-email#token=" + "a".repeat(64) };
test("mail configuration diagnostics identify missing fields without disclosing credentials", () => {
  assert.deepEqual(inspectMailConfiguration({}), { enabled: false, configured: false, issues: ["mail_disabled"] });
  assert.deepEqual(inspectMailConfiguration(config), { enabled: true, configured: true, issues: [] });
  const result = inspectMailConfiguration({ ...config, browserOrigin: "https://site.example.test/", registrationMail: { ...config.registrationMail, host: "smtp://host", port: 25, from: "Name <user@example.test>", pass: "", tlsServername: "127.0.0.1" } });
  assert.deepEqual(result.issues.sort(), ["browser_origin", "mail_from", "smtp_credentials", "smtp_host", "smtp_port", "smtp_tls_servername"]);
  assert.ok(!JSON.stringify(result).includes("synthetic"));
});
test("configured SMTP recipient is exactly one bare mailbox and links stay on approved origin", () => {
  for (const value of ["a\0@example.test", "a\u0001@example.test", "a\u007f@example.test", "a,b@example.test", "Name <a@example.test>", "a@example.test\r\nBcc:b@example.test", "a@example.test;other", "a@-example.test"]) assert.equal(mailbox(value), false);
  assert.equal(mailbox("user+tag@example.test"), true);
  assert.equal(validPayload(payload, config), true);
  for (const change of [{ email: "Name <recipient@example.test>" }, { purpose: "other" }, { url: "https://evil.example.test/verify-email#token=" + "a".repeat(64) }, { url: config.browserOrigin + "/verify-email?token=" + "a".repeat(64) }, { url: config.browserOrigin + "/reset-password#token=" + "a".repeat(64) }]) assert.equal(validPayload({ ...payload, ...change }, config), false);
});
test("SMTP preflight verifies connection without sending email and fixes TLS options", async () => {
  let options, sends = 0, verifies = 0;
  const mail = createRegistrationMail({ config: { ...config, registrationMail: { ...config.registrationMail, host: "127.0.0.1", tlsServername: "smtp.example.test", port: 465 } }, transportFactory: value => { options = value; return { verify: async () => { verifies++; return true; }, sendMail: async () => { sends++; return { accepted: [payload.email] }; } }; } });
  assert.equal(await mail.verifyConnection(), true); assert.equal(verifies, 1); assert.equal(sends, 0);
  assert.equal(options.secure, true); assert.equal(options.requireTLS, false); assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.tls.servername, "smtp.example.test");
  assert.equal(options.logger, false); assert.equal(options.debug, false);
});
test("payload validation and provider non-acceptance cannot masquerade as successful mail", async () => {
  let message;
  const mail = createRegistrationMail({ config, transportFactory: () => ({ sendMail: async value => { message = value; return { accepted: [] }; } }) });
  await assert.rejects(mail.send({ ...payload, email: "first@example.test,second@example.test" }), { code: "INVALID_MAIL_PAYLOAD" });
  await assert.rejects(mail.send(payload, { messageId: "<stable@alageum.invalid>" }), { code: "MAIL_NOT_ACCEPTED" });
  assert.deepEqual(message.to, { address: payload.email }); assert.deepEqual(message.from, { address: config.registrationMail.from }); assert.equal(message.messageId, "<stable@alageum.invalid>");
});

test("operator mail readiness is read-only by default and redacts provider errors", async () => {
  const { check } = require("../scripts/check-registration-mail");
  const env = { APP_ENV: "test", ALAGEUM_BROWSER_ORIGIN: config.browserOrigin, ALAGEUM_REGISTRATION_MAIL_PROVIDER: "smtp", ALAGEUM_SMTP_HOST: "smtp.example.test", ALAGEUM_MAIL_FROM: "noreply@example.test", ALAGEUM_SMTP_USER: "synthetic", ALAGEUM_SMTP_PASSWORD: "private-test-value" };
  let calls = 0;
  const factory = () => ({ async verifyConnection() { calls++; const error = new Error("provider reflected private-test-value"); error.code = "EAUTH"; throw error; } });
  const local = await check({ env, factory }); assert.equal(local.exitCode, 0); assert.equal(calls, 0); assert.equal(local.result.email_sent, false);
  const external = await check({ args: ["--verify-connection"], env, factory }); assert.equal(external.exitCode, 1); assert.equal(calls, 1);
  assert.equal(external.result.failure, "smtp_authentication_failed"); assert.ok(!JSON.stringify(external).includes("private-test-value"));
  assert.equal((await check({ args: ["--send-test-mail"], env, factory })).exitCode, 2); assert.equal(calls, 1);
});

test("operator provisioning rejects ambiguous apply values and blank companies before database access", async () => {
  const { provision, routePending } = require("../scripts/provision-business-operator");
  const forbiddenDb = { transaction() { throw new Error("Database must not be accessed"); } };
  await assert.rejects(provision(forbiddenDb, { mode: "organization-admin", email: "operator@example.test", apply: "false" }), /boolean/);
  await assert.rejects(provision(forbiddenDb, { mode: "unexpected", email: "operator@example.test", apply: true }), /Explicit operator mode/);
  await assert.rejects(provision(forbiddenDb, { mode: "organization-admin", email: "operator@example.test", createOrganization: true, organizationName: "  ", organizationIdentifier: "BIN", apply: true }), { code: "validation_error" });
  await assert.rejects(routePending(forbiddenDb, { organizationId: "10000000-0000-4000-8000-000000000001", apply: "false" }), /boolean/);
});

test("local operator database URLs cannot override the approved loopback destination", () => {
  const { connectionSettings } = require("../scripts/provision-business-operator");
  assert.deepEqual(connectionSettings("postgres://operator:synthetic@127.0.0.1:55441/local_test"), { host: "127.0.0.1", port: 55441, user: "operator", password: "synthetic", database: "local_test", ssl: false });
  assert.equal(connectionSettings("postgres://operator@[::1]/local_test").host, "::1");
  for (const url of ["postgres://operator@localhost/local?host=evil.example.test", "postgres://operator@127.0.0.1/local?database=other", "postgres://operator@remote.example.test/local", "postgres://operator@localhost/local#fragment", "postgres://localhost/local", "postgres://operator@localhost/"]) assert.throws(() => connectionSettings(url));
});

test("registration rejects SMTP-invalid and control-character addresses before storage", () => {
  const { emailValue } = require("../src/domain/registration");
  for (const email of ["a\0@example.test", "a\u0001@example.test", "a\u007f@example.test", "first,last@example.test", "Name <user@example.test>", "a@-example.test"])
    assert.throws(() => emailValue(email), { code: "validation_error" });
  assert.equal(emailValue(" User+Tag@Example.test "), "user+tag@example.test");
});
