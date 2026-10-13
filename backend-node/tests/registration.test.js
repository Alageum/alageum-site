"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { emailValue, passwordValue, tokenValue, hashToken, assignableRole, requestOut, ACCEPTED } = require("../src/domain/registration");
const { seal, unseal, createRegistrationMail } = require("../src/domain/registration-mail");
const { options } = require("../scripts/provision-business-operator");
const secret = "test-only-registration-encryption-key-with-32-characters";

test("signup validates and normalizes credentials without accepting privilege fields", () => {
  assert.equal(emailValue(" A.User@EXAMPLE.COM "), "a.user@example.com");
  for (const invalid of [null, "", "a@", "a @example.com", "a\n@example.com"]) assert.throws(() => emailValue(invalid));
  assert.equal(passwordValue("long-test-password"), "long-test-password");
  for (const invalid of [null, "short", "a".repeat(129)]) assert.throws(() => passwordValue(invalid));
  assert.throws(() => tokenValue("short"));
  assert.equal(tokenValue("a".repeat(64)), "a".repeat(64));
  assert.equal(hashToken("a".repeat(64)).length, 64);
  assert.ok(!JSON.stringify(ACCEPTED).includes("exists"));
});
test("tenant roles cannot leak platform powers or grants unavailable to the approver", () => {
  const context = { organization_id: "tenant-a", permissions: new Set(["catalog.read", "quote.read", "organization.manage_users"]) };
  const role = { organization_id: "tenant-a", permissions: ["catalog.read"] };
  assert.equal(assignableRole(role, context), true);
  for (const changes of [{ organization_id: "tenant-b" }, { organization_id: null }, { permissions: ["catalog.manage"] }, { permissions: ["finance.read"] }, { permissions: "broken" }]) assert.equal(assignableRole({ ...role, ...changes }, context), false);
});
test("outbox encrypts the full payload; wrong keys and tampering fail closed", () => {
  const payload = { email: "private@example.test", token: "a".repeat(64) };
  const encrypted = seal(payload, secret);
  assert.ok(!encrypted.includes(payload.email));
  assert.ok(!encrypted.includes(payload.token));
  assert.deepEqual(unseal(encrypted, secret), payload);
  assert.throws(() => unseal(encrypted, secret + "x"));
  const pieces = encrypted.split("."); pieces[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => unseal(pieces.join("."), secret));
});
test("mail is unavailable until explicitly configured, never a successful no-op", async () => {
  const mail = createRegistrationMail({ config: {} });
  assert.throws(() => mail.assertConfigured(), { code: "mail_unavailable", status: 503 });
  await assert.rejects(mail.send({}), { code: "mail_unavailable" });
});
test("SMTP enforces TLS, rejects filesystem/URL content, and checks provider acceptance", async () => {
  let settings, message;
  const mail = createRegistrationMail({ config: { registrationMail: { provider: "smtp", host: "smtp.example.test", port: 587, from: "noreply@example.test" } }, transportFactory: opts => {
    settings = opts; return { sendMail: async value => { message = value; return { accepted: ["recipient@example.test"] }; } };
  } });
  await mail.send({ email: "recipient@example.test", purpose: "verify", url: "https://example.test/verify-email#token=synthetic" });
  assert.equal(settings.requireTLS, true);
  assert.equal(settings.tls.rejectUnauthorized, true);
  assert.equal(settings.disableFileAccess, true);
  assert.equal(settings.disableUrlAccess, true);
  assert.equal(message.disableFileAccess, true);
  assert.equal(message.disableUrlAccess, true);
  assert.match(message.text, /#token=synthetic/);
});
test("public company request DTO never discloses routing, actor identities or membership IDs", () => {
  const result = requestOut({ id: "request", company_name: "Company", company_identifier: "BIN", message: "Hi", status: "pending", organization_id: "secret", user_id: "secret", decided_by: "secret" });
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("operator provisioning is explicit, dry-run by default, and refuses ambiguous arguments", () => {
  const args = options(["--email", "operator@example.test", "--mode", "organization-admin", "--create-organization", "--organization-name", "Test company", "--organization-identifier", "TEST"]);
  assert.equal(args.apply, false);
  assert.equal(args.createOrganization, true);
  assert.throws(() => options(["--email", "operator@example.test"]));
  assert.throws(() => options(["--email", "a@example.test", "--email", "b@example.test"]));
  assert.throws(() => options(["--email", "a@example.test", "--mode", "superuser"]));
});

test("routing pending requests needs an explicit company and cannot combine privilege grants", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  assert.deepEqual(options(["--route-pending", "--organization-id", id]), { routePending: true, organizationId: id, apply: false });
  assert.throws(() => options(["--route-pending", "--organization-id", id, "--email", "operator@example.test"]));
});
