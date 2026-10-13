"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const p = require("../src/domain/document-signing-policy");
const content = Buffer.from("%PDF-1.7\nFictitious unsigned test bytes\n%%EOF\n");
const input = { content, signature: Buffer.from("not a cryptographic fixture"), sha256: p.sha256(content), organizationId: "fictional" };
const valid = { status: "valid", content_sha256: input.sha256, signature_valid: true, chain_trusted: true, revocation: "good", certificate_time_valid: true, signing_usage_valid: true, organization_authorized: true, provider: "test-only" };
const verifier = result => ({ available: true, async verify() { return result; } });
test("CMS parser checks bounded canonical encoding only, never claims verification", () => {
  assert.deepEqual(p.decodeSignature("YWJj"), Buffer.from("abc"));
  assert.equal(p.decodeSignature(Buffer.alloc(p.MAX_SIGNATURE_BYTES, 7).toString("base64")).length, p.MAX_SIGNATURE_BYTES);
  for (const value of [null, {}, "", "abc", "ab==", "YWJj\n", "-w==", "a".repeat(349528 + 4)]) assert.throws(() => p.decodeSignature(value), { code: "invalid_signature" });
});
test("private snapshot enforces bytes, bounds, hash and PDF metadata", () => {
  const snapshot = { content, ...p.validateDocumentBytes(content), media_type: "application/pdf" };
  p.assertSnapshot(snapshot);
  for (const patch of [{ sha256: "0".repeat(64) }, { size_bytes: 1 }, { media_type: "text/html" }, { content: Buffer.from("<script>bad</script>") }]) assert.throws(() => p.assertSnapshot({ ...snapshot, ...patch }));
  assert.throws(() => p.validateDocumentBytes(Buffer.alloc(p.MAX_DOCUMENT_BYTES + 1)));
});
test("default production provider fails closed and cannot mark a signature verified", async () => {
  assert.equal(p.unavailableVerifier.available, false);
  assert.deepEqual(await p.verifyBoundSignature(p.unavailableVerifier, input), { status: "pending_verification", reason: "verifier_unavailable" });
});
test("all independent verification and organization-authority claims are required", async () => {
  assert.equal((await p.verifyBoundSignature(verifier(valid), input)).status, "verified");
  for (const key of Object.keys(valid)) {
    const result = { ...valid }; delete result[key];
    assert.equal((await p.verifyBoundSignature(verifier(result), input)).status, "rejected", key);
  }
  for (const patch of [{ content_sha256: "0".repeat(64) }, { signature_valid: false }, { chain_trusted: false }, { revocation: "revoked" }, { revocation: "unknown" }, { certificate_time_valid: false }, { signing_usage_valid: false }, { organization_authorized: false }, { status: "valid", provider: "unsafe\nprovider" }])
    assert.equal((await p.verifyBoundSignature(verifier({ ...valid, ...patch }), input)).status, "rejected");
});
test("verifier exception and timeout stay pending and redact private diagnostics", async () => {
  const thrown = { async verify() { throw new Error("PRIVATE CERTIFICATE"); } };
  assert.deepEqual(await p.verifyBoundSignature(thrown, input), { status: "pending_verification", reason: "verifier_unavailable" });
  let signal;
  const hanging = { verify(arg) { signal = arg.signal; return new Promise(() => {}); } };
  assert.equal((await p.verifyBoundSignature(hanging, input, 5)).status, "pending_verification");
  assert.equal(signal.aborted, true);
});
test("outbound signature DTO never includes certificate, bytes, actor, storage or recipient", () => {
  const dto = p.signatureOut({ id: "x", status: "pending_verification", snapshot_id: "v", content_sha256: "hash", created_at: new Date(0), signature: input.signature, certificate: "PRIVATE" });
  assert.deepEqual(Object.keys(dto), ["id", "status", "version_id", "sha256", "delivery_status", "created_at"]);
  assert.equal(dto.delivery_status, "not_configured");
});
test("new EDS routes are additive and existing production interlock remains", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(r => r.path.includes("/signing"));
  assert.deepEqual(routes.map(r => r.method), ["GET", "POST", "POST", "POST", "POST"]);
  const config = require("../config/alageum");
  const env = (name, fallback) => name === "ALAGEUM_JWT_SECRET" ? "x".repeat(32) : fallback;
  assert.equal(config({ env }).documentSigningEnabled, false);
  assert.throws(() => config({ env: name => name === "APP_ENV" ? "production" : "x".repeat(32) }), /Production startup blocked/);
});
