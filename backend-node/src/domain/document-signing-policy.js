"use strict";
const { createHash } = require("node:crypto");
const { AppError } = require("./errors");
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 256 * 1024;
const INTENT_TTL_MS = 5 * 60 * 1000;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (code, message, status = 422) => { throw new AppError(code, message, status); };
function decodeSignature(value) {
  if (typeof value !== "string" || !value.length || value.length > Math.ceil(MAX_SIGNATURE_BYTES / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    fail("invalid_signature", "A bounded canonical base64 CMS signature is required");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > MAX_SIGNATURE_BYTES || bytes.toString("base64") !== value)
    fail("invalid_signature", "Invalid CMS encoding");
  // This checks encoding only. No ASN.1 parser or client flag is a verifier.
  return bytes;
}
function validateDocumentBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > MAX_DOCUMENT_BYTES || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    fail("invalid_document_bytes", "A bounded, reviewed PDF snapshot is required");
  return { sha256: sha256(bytes), size_bytes: bytes.length };
}
function assertSnapshot(snapshot) {
  const value = validateDocumentBytes(snapshot.content);
  if (snapshot.sha256 !== value.sha256 || Number(snapshot.size_bytes) !== value.size_bytes || snapshot.media_type !== "application/pdf")
    fail("document_integrity_failed", "Document integrity could not be confirmed", 409);
}
// Intentionally not configurable to a remote endpoint or an unofficial service.
// Wire the reviewed official SDK plus company-signatory policy only after their
// contracts, trust roots, revocation policy and credentials are approved.
const unavailableVerifier = Object.freeze({
  available: false,
  async verify() { return { status: "unavailable" }; },
});
async function verifyBoundSignature(verifier, input, timeoutMs = 10000) {
  const controller = new AbortController();
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => verifier.verify({ ...input, signal: controller.signal })),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ status: "unavailable" }); }, timeoutMs); }),
    ]);
    if (result?.status === "unavailable") return { status: "pending_verification", reason: "verifier_unavailable" };
    // The adapter must prove ALL properties server-side; signer identity alone
    // never establishes authority to bind the selected company.
    if (result?.status !== "valid" || result.content_sha256 !== input.sha256 ||
        result.signature_valid !== true || result.chain_trusted !== true ||
        result.revocation !== "good" || result.certificate_time_valid !== true ||
        result.signing_usage_valid !== true || result.organization_authorized !== true ||
        typeof result.provider !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(result.provider))
      return { status: "rejected", reason: "signature_not_trusted" };
    return { status: "verified", reason: null, provider: result.provider };
  } catch {
    // Provider responses/exceptions may contain certificates or personal data.
    // They are neither returned nor logged.
    return { status: "pending_verification", reason: "verifier_unavailable" };
  } finally { clearTimeout(timer); controller.abort(); }
}
function versionOut(row) {
  return row ? { id: row.id, number: row.version, sha256: row.sha256, size_bytes: Number(row.size_bytes), media_type: row.media_type } : null;
}
function signatureOut(row) {
  return row ? { id: row.id, status: row.status, version_id: row.snapshot_id, sha256: row.content_sha256, delivery_status: "not_configured", created_at: new Date(row.created_at).toISOString() } : null;
}
module.exports = { MAX_DOCUMENT_BYTES, MAX_SIGNATURE_BYTES, INTENT_TTL_MS, sha256, decodeSignature, validateDocumentBytes, assertSnapshot, unavailableVerifier, verifyBoundSignature, versionOut, signatureOut };
