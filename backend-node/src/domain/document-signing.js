"use strict";
const { randomUUID } = require("node:crypto");
const { AppError } = require("./errors");
const { table, privateResponse, assertActiveContext, strictObject, uuid } = require("./auth");
const { documentId } = require("./documents");
const policy = require("./document-signing-policy");
const READ = "document.read", SIGN = "document.sign";
const error = (code, message, status = 409) => new AppError(code, message, status);
const notFound = () => error("document_not_found", "Document not found", 404);

async function currentVersion(tx, organization, document) {
  return table(tx, "document_versions").where({ "document_versions.organization_id": organization, "document_versions.document_id": document })
    .join("file_objects AS file", function () { this.on("file.id", "=", "document_versions.file_id").andOn("file.organization_id", "=", "document_versions.organization_id"); })
    .orderBy("document_versions.version", "desc").forShare().select("document_versions.*", "file.checksum_sha256", "file.size_bytes", "file.content_type").first();
}
async function documentAndSnapshot(tx, context, id, mutation = false) {
  const documentQuery = table(tx, "documents").where({ id, organization_id: context.organization_id });
  // FOR UPDATE also blocks the FK KEY SHARE used by concurrent version inserts.
  const document = await (mutation ? documentQuery.forUpdate() : documentQuery.forShare()).first();
  if (!document) throw notFound();
  if (mutation) {
    // Existing older rows can otherwise be renumbered without rechecking the
    // document FK. Lock the complete version set before selecting its maximum.
    await table(tx, "document_versions").where({ organization_id: context.organization_id, document_id: id }).orderBy("id").forShare().select("id");
  }
  const version = await currentVersion(tx, context.organization_id, id);
  const snapshot = version && await table(tx, "eds_snapshots").where({ organization_id: context.organization_id, document_id: id, document_version_id: version.id }).first();
  if (snapshot) {
    policy.assertSnapshot(snapshot);
    if (snapshot.file_id !== version.file_id || snapshot.version !== version.version || snapshot.sha256 !== version.checksum_sha256 || snapshot.size_bytes !== Number(version.size_bytes) || version.content_type !== "application/pdf")
      throw error("document_integrity_failed", "Document version changed after snapshot creation");
  }
  return snapshot || null;
}

// SERVER-INTERNAL provisioning seam only; no upload route, filesystem path, URL,
// CMS/public upload storage or arbitrary fetch. Its caller must supply reviewed,
// malware-cleared PDF bytes from a trusted server pipeline. Not called at runtime
// in this increment. Existing metadata/hash must match exact bytes.
async function provisionSnapshot(db, { organizationId, documentVersionId, bytes }) {
  uuid(organizationId); uuid(documentVersionId);
  const verified = policy.validateDocumentBytes(bytes);
  return db.transaction(async tx => {
    const version = await table(tx, "document_versions").where({ id: documentVersionId, organization_id: organizationId }).forShare().first();
    if (!version) throw notFound();
    const file = await table(tx, "file_objects").where({ id: version.file_id, organization_id: organizationId }).forShare().first();
    if (!file || file.content_type !== "application/pdf" || file.checksum_sha256 !== verified.sha256 || Number(file.size_bytes) !== verified.size_bytes)
      throw error("document_integrity_failed", "Source file metadata does not match reviewed bytes");
    const row = { id: randomUUID(), organization_id: organizationId, document_id: version.document_id, document_version_id: version.id, file_id: file.id, version: version.version, ...verified, media_type: "application/pdf", content: Buffer.from(bytes), created_at: new Date() };
    await table(tx, "eds_snapshots").insert(row).onConflict("document_version_id").ignore();
    const saved = await table(tx, "eds_snapshots").where({ document_version_id: version.id, organization_id: organizationId }).first();
    policy.assertSnapshot(saved);
    if (saved.sha256 !== verified.sha256) throw error("document_integrity_failed", "Immutable snapshot already exists");
    return policy.versionOut(saved);
  });
}
function createDocumentSigning({ db, auth, audit, enabled = false, verifier = policy.unavailableVerifier, now = () => new Date(), verificationTimeoutMs = 10000, authorizeDocument = async () => {} }) {
  if (typeof audit !== "function") throw new TypeError("Transactional audit writer is required");
  const available = () => enabled === true && verifier.available === true;
  const verificationCalls = new Map();
  function verifyOnce(id, input) {
    if (verificationCalls.has(id)) return verificationCalls.get(id);
    if (!available() || verificationCalls.size >= 4) return Promise.resolve({ status: "pending_verification", reason: "verifier_unavailable" });
    const pending = policy.verifyBoundSignature(verifier, input, verificationTimeoutMs).finally(() => verificationCalls.delete(id));
    verificationCalls.set(id, pending); return pending;
  }
  function requireEnabled() { if (!enabled) throw error("signing_disabled", "Document signing is disabled", 503); }
  function requireVerifier() { if (!available()) throw error("verifier_unavailable", "Trusted server verification is not configured", 503); }
  async function authorize(ctx, sign = false) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, sign ? SIGN : READ);
    return { context, id: documentId(ctx.params.id) };
  }
  async function fresh(tx, context, sign, ctx) {
    // Hold a cookie session through the domain transaction, including the final
    // commit after external verification. Logout/replacement must wait or reject.
    await auth.assertActiveSession(tx, ctx, context.user.id);
    const actor = await assertActiveContext(tx, context, sign ? [READ, SIGN] : READ);
    await authorizeDocument(tx, actor, documentId(ctx.params.id));
    return actor;
  }
  async function boundSnapshot(tx, actor, id, mutation = false) {
    const snapshot = await documentAndSnapshot(tx, actor, id, mutation);
    // Recheck after the document lock, closing provisioning/signing races.
    await authorizeDocument(tx, actor, id);
    return snapshot;
  }
  async function event(tx, ctx, context, action, id) {
    await audit(tx, ctx, { action, actor_user_id: context.user.id, organization_id: context.organization_id, entity_type: "document", entity_id: id });
  }
  async function status(ctx) {
    const { context, id } = await authorize(ctx);
    ctx.body = await db.transaction(async tx => {
      const actor = await fresh(tx, context, false, ctx), snapshot = await boundSnapshot(tx, actor, id);
      const signature = snapshot && await table(tx, "eds_signatures").where({ organization_id: actor.organization_id, document_id: id, snapshot_id: snapshot.id }).orderByRaw("CASE WHEN status = 'verified' THEN 0 ELSE 1 END").orderBy("created_at", "desc").orderBy("id").first();
      const reason = !enabled ? "disabled" : !available() ? "verifier_unavailable" : !snapshot ? "file_unavailable" : null;
      return { enabled: enabled === true, signing_allowed: reason === null && actor.permissions.has(SIGN), reason, document_id: id, version: policy.versionOut(snapshot), signature: policy.signatureOut(signature) };
    });
  }
  async function prepare(ctx) {
    const { context, id } = await authorize(ctx, true);
    const body = strictObject(ctx.request.body, ["version_id"]), versionId = uuid(body.version_id);
    requireEnabled(); requireVerifier();
    ctx.body = await db.transaction(async tx => {
      const actor = await fresh(tx, context, true, ctx), snapshot = await boundSnapshot(tx, actor, id, true);
      if (!snapshot) throw error("file_unavailable", "No reviewed document bytes are available", 503);
      if (snapshot.id !== versionId) throw error("document_version_changed", "Select the current document version again");
      if (await table(tx, "eds_signatures").where({ organization_id: actor.organization_id, snapshot_id: snapshot.id, status: "verified" }).first())
        throw error("document_already_signed", "This document version already has a verified signature");
      // Bounded per-user activity. Expired rows remain evidence; they cannot be
      // submitted. A future retention policy must be approved before deletion.
      await tx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 2))", [actor.user.id]);
      const active = await table(tx, "eds_intents").where({ organization_id: actor.organization_id, actor_user_id: actor.user.id, status: "open" }).where("expires_at", ">", now()).count("* AS count").first();
      if (Number(active.count) >= 5) throw error("signing_rate_limited", "Too many active signing requests", 429);
      const created = now(), row = { id: randomUUID(), organization_id: actor.organization_id, document_id: id, snapshot_id: snapshot.id, actor_user_id: actor.user.id, status: "open", expires_at: new Date(created.getTime() + policy.INTENT_TTL_MS), created_at: created };
      await table(tx, "eds_intents").insert(row);
      await event(tx, ctx, actor, "document.signing_prepared", id);
      return { id: row.id, document_id: id, version_id: snapshot.id, sha256: snapshot.sha256, expires_at: row.expires_at.toISOString(), content_base64: snapshot.content.toString("base64") };
    });
    ctx.status = 201;
  }
  async function ownedIntent(tx, actor, id, intentId) {
    const intent = await table(tx, "eds_intents").where({ id: intentId, organization_id: actor.organization_id, document_id: id, actor_user_id: actor.user.id }).forUpdate().first();
    if (!intent) throw error("signing_intent_not_found", "Signing request not found", 404);
    return intent;
  }
  async function cancel(ctx) {
    const { context, id } = await authorize(ctx, true), intentId = uuid(ctx.params.intentId);
    requireEnabled();
    await db.transaction(async tx => {
      const actor = await fresh(tx, context, true, ctx), intent = await ownedIntent(tx, actor, id, intentId);
      if (intent.status === "submitted") throw error("signing_already_submitted", "Signature was already submitted");
      if (intent.status === "open") {
        await table(tx, "eds_intents").where({ id: intent.id }).update({ status: "cancelled" });
        await event(tx, ctx, actor, "document.signing_cancelled", id);
      }
    });
    ctx.status = 204; ctx.body = null;
  }
  async function submit(ctx) {
    const { context, id } = await authorize(ctx, true), intentId = uuid(ctx.params.intentId);
    const body = strictObject(ctx.request.body, ["signature_base64"]), bytes = policy.decodeSignature(body.signature_base64), signatureHash = policy.sha256(bytes);
    requireEnabled();
    const accepted = await db.transaction(async tx => {
      const actor = await fresh(tx, context, true, ctx), intent = await ownedIntent(tx, actor, id, intentId);
      if (intent.status === "cancelled") throw error("signing_cancelled", "Signing request was cancelled");
      const existing = await table(tx, "eds_signatures").where({ intent_id: intent.id, organization_id: actor.organization_id }).first();
      if (existing) {
        if (existing.signature_sha256 !== signatureHash) throw error("signing_intent_conflict", "This signing request already has a different signature");
        if (existing.status !== "pending_verification") return { row: existing };
      } else if (new Date(intent.expires_at).getTime() <= now().getTime()) throw error("signing_intent_expired", "Signing request expired");
      const snapshot = await boundSnapshot(tx, actor, id, true);
      if (!snapshot || snapshot.id !== intent.snapshot_id) throw error("document_version_changed", "Document changed before signing completed");
      if (!existing) {
        // Serialize replay checks per tenant without holding any external call
        // inside a transaction. The unique index is the final concurrent guard.
        await tx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 1))", [actor.organization_id]);
        if (await table(tx, "eds_signatures").where({ organization_id: actor.organization_id, signature_sha256: signatureHash }).first())
          throw error("signature_replay", "Signature has already been submitted");
      }
      const row = existing || { id: randomUUID(), organization_id: actor.organization_id, document_id: id, snapshot_id: snapshot.id, intent_id: intent.id, actor_user_id: actor.user.id, signature: bytes, signature_sha256: signatureHash, content_sha256: snapshot.sha256, status: "pending_verification", reason: "verification_pending", provider: null, created_at: now(), verified_at: null };
      if (!existing) {
        await table(tx, "eds_signatures").insert(row);
        await table(tx, "eds_intents").where({ id: intent.id }).update({ status: "submitted" });
        await event(tx, ctx, actor, "document.signature_received", id);
      }
      return { row, snapshot, organizationId: actor.organization_id, actorId: actor.user.id };
    });
    if (!accepted.snapshot || accepted.row.status !== "pending_verification") { ctx.body = policy.signatureOut(accepted.row); return; }
    const result = await verifyOnce(accepted.row.id, {
      content: Buffer.from(accepted.snapshot.content), signature: Buffer.from(accepted.row.signature), sha256: accepted.snapshot.sha256,
      documentId: id, versionId: accepted.snapshot.id, organizationId: accepted.organizationId, actorUserId: accepted.actorId,
    });
    if (result.status === "pending_verification") {
      ctx.body = await db.transaction(async tx => {
        await fresh(tx, context, true, ctx);
        const row = await table(tx, "eds_signatures").where({ id: accepted.row.id, organization_id: accepted.organizationId }).first();
        return policy.signatureOut(row);
      });
      ctx.status = ctx.body.status === "pending_verification" ? 202 : 200; return;
    }
    ctx.body = await db.transaction(async tx => {
      const actor = await fresh(tx, context, true, ctx), snapshot = await boundSnapshot(tx, actor, id, true);
      if (!snapshot || snapshot.id !== accepted.row.snapshot_id) throw error("document_version_changed", "Document changed while the signature was being checked");
      const row = await table(tx, "eds_signatures").where({ id: accepted.row.id, organization_id: actor.organization_id, actor_user_id: actor.user.id }).forUpdate().first();
      if (row.status !== "pending_verification") return policy.signatureOut(row);
      const change = { status: result.status, reason: result.reason, provider: result.provider || null, verified_at: result.status === "verified" ? now() : null };
      await table(tx, "eds_signatures").where({ id: row.id }).update(change);
      await event(tx, ctx, actor, result.status === "verified" ? "document.signature_verified" : "document.signature_rejected", id);
      return policy.signatureOut({ ...row, ...change });
    });
  }
  async function recheck(ctx) {
    const { context, id } = await authorize(ctx, true), signatureId = uuid(ctx.params.signatureId);
    strictObject(ctx.request.body, []); requireEnabled();
    const row = await db.transaction(async tx => {
      const actor = await fresh(tx, context, true, ctx);
      const stored = await table(tx, "eds_signatures").where({ id: signatureId, document_id: id, organization_id: actor.organization_id, actor_user_id: actor.user.id }).first();
      if (!stored) throw error("signature_not_found", "Signature not found", 404);
      return stored;
    });
    // Reuse the same idempotent path with server-held evidence; the browser
    // cannot swap CMS bytes or reopen a key-selection dialog for this operation.
    const originalParams = ctx.params, originalBody = ctx.request.body;
    try {
      ctx.params = { ...ctx.params, intentId: row.intent_id };
      ctx.request.body = { signature_base64: row.signature.toString("base64") };
      await submit(ctx);
    } finally { ctx.params = originalParams; ctx.request.body = originalBody; }
  }
  return { status, prepare, submit, cancel, recheck };
}
module.exports = { READ, SIGN, provisionSnapshot, createDocumentSigning };
