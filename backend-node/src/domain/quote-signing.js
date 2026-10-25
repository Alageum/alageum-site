"use strict";
// Additive handoff foundation. No public PDF upload/provisioning or crypto substitute.
const { createHash, randomUUID } = require("node:crypto");
const { AppError } = require("./errors");
const { table, uuid, UUID, strictObject, privateResponse, assertActiveContext, effectivePermissions } = require("./auth");
const policy = require("./document-signing-policy");
const fail = (code, message, status = 409) => { throw new AppError(code, message, status); };
const missing = () => fail("quote_not_found", "Request not found", 404);
function routeConfig(value = {}) {
  const organizationId = value.organizationId || "", managerId = value.managerId || "";
  if (!organizationId && !managerId) return null;
  if (!UUID.test(organizationId) || !UUID.test(managerId)) throw new Error("Quote signing requires explicit supplier organization and assigned manager UUIDs");
  return Object.freeze({ organizationId: organizationId.toLowerCase(), managerId: managerId.toLowerCase() });
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function quotePayload(quote, items) {
  if (quote.mode !== "catalog" || !items.length) fail("quote_snapshot_unavailable", "A saved catalog selection is required");
  return canonical({ schema: "alageum.quote-signing.v1", quote_id: quote.id, customer_organization_id: quote.organization_id,
    comment: quote.comment, items: items.map(item => {
      const product = typeof item.product_snapshot === "string" ? JSON.parse(item.product_snapshot) : item.product_snapshot;
      if (!product || !Object.keys(product).length) fail("quote_snapshot_unavailable", "Historical product data is required");
      return { product_id: item.product_id, quantity: String(item.quantity), product_snapshot: product };
    }) });
}
const digest = value => createHash("sha256").update(value).digest("hex");
function assertAssignment(packet, actor, routing) {
  if (!routing || packet.signing_organization_id !== routing.organizationId || packet.assigned_manager_id !== routing.managerId)
    fail("quote_signing_configuration_required", "Signing routing requires operator configuration", 503);
  if (actor.organization_id !== packet.signing_organization_id || actor.user.id !== packet.assigned_manager_id ||
      !actor.permissions.has("document.sign") || !actor.permissions.has("document.read"))
    fail("document_not_found", "Document not found", 404);
  if (!packet.requested_at) fail("quote_signing_not_requested", "Client has not requested signing");
}
const packetGuard = `BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Quote signing packets are immutable'; END IF;
      IF OLD.requested_at IS NOT NULL OR NEW.requested_at IS NULL OR
        (to_jsonb(NEW) - 'requested_at') IS DISTINCT FROM (to_jsonb(OLD) - 'requested_at') THEN
        RAISE EXCEPTION 'Quote signing packets are immutable'; END IF; RETURN NEW; END`;
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(hashtextextended('alageum.quote-signing.schema.v1',0))");
    const existing = (await tx.raw("SELECT to_regclass('b2b.quote_signing_packets') AS relation")).rows[0]?.relation;
    if (existing) {
      // Do not silently repair an unknown/changed signing schema at startup.
      const columns = (await tx.raw("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='b2b' AND table_name='quote_signing_packets' ORDER BY ordinal_position")).rows;
      const ids = "id quote_id customer_organization_id customer_user_id signing_organization_id assigned_manager_id document_id snapshot_id".split(" ");
      const expected = [...ids.map(name => [name, "uuid", "NO"]), ["quote_payload", "text", "NO"], ["quote_sha256", "character varying", "NO"], ["pdf_sha256", "character varying", "NO"], ["created_at", "timestamp with time zone", "NO"], ["requested_at", "timestamp with time zone", "YES"]];
      const guard = (await tx.raw("SELECT p.prosrc,t.tgtype,t.tgenabled FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='b2b.quote_signing_packets'::regclass AND NOT t.tgisinternal")).rows;
      const constraints = (await tx.raw("SELECT contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='b2b.quote_signing_packets'::regclass")).rows;
      const expectedConstraints = ["PRIMARY KEY (id)", "UNIQUE (quote_id)", "UNIQUE (document_id)", "UNIQUE (snapshot_id)",
        "FOREIGN KEY (quote_id) REFERENCES b2b.quote_requests(id)", "FOREIGN KEY (customer_organization_id) REFERENCES b2b.organizations(id)",
        "FOREIGN KEY (customer_user_id) REFERENCES b2b.users(id)", "FOREIGN KEY (signing_organization_id) REFERENCES b2b.organizations(id)",
        "FOREIGN KEY (assigned_manager_id) REFERENCES b2b.users(id)",
        "FOREIGN KEY (snapshot_id, signing_organization_id) REFERENCES b2b.eds_snapshots(id, organization_id)",
        "FOREIGN KEY (document_id, signing_organization_id) REFERENCES b2b.documents(id, organization_id)",
        "CHECK (((quote_sha256)::text ~ '^[0-9a-f]{64}$'::text))", "CHECK (((pdf_sha256)::text ~ '^[0-9a-f]{64}$'::text))",
        "CHECK (((requested_at IS NULL) OR (requested_at >= created_at)))"].sort();
      if (JSON.stringify(columns.map(c => [c.column_name,c.data_type,c.is_nullable])) !== JSON.stringify(expected) ||
          guard.length !== 1 || guard[0].prosrc.trim() !== packetGuard || Number(guard[0].tgtype) !== 27 || guard[0].tgenabled !== "O" ||
          constraints.some(c => !c.convalidated) || JSON.stringify(constraints.map(c => c.definition).sort()) !== JSON.stringify(expectedConstraints))
        throw new Error("Quote signing schema mismatch; reviewed migration required");
      return;
    }
    await tx.raw(`CREATE TABLE b2b.quote_signing_packets (
      id uuid PRIMARY KEY, quote_id uuid NOT NULL UNIQUE REFERENCES b2b.quote_requests(id),
      customer_organization_id uuid NOT NULL REFERENCES b2b.organizations(id), customer_user_id uuid NOT NULL REFERENCES b2b.users(id),
      signing_organization_id uuid NOT NULL REFERENCES b2b.organizations(id), assigned_manager_id uuid NOT NULL REFERENCES b2b.users(id),
      document_id uuid NOT NULL UNIQUE, snapshot_id uuid NOT NULL UNIQUE,
      quote_payload text NOT NULL, quote_sha256 varchar(64) NOT NULL CHECK (quote_sha256 ~ '^[0-9a-f]{64}$'),
      pdf_sha256 varchar(64) NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL, requested_at timestamptz,
      FOREIGN KEY(snapshot_id, signing_organization_id) REFERENCES b2b.eds_snapshots(id, organization_id),
      FOREIGN KEY(document_id, signing_organization_id) REFERENCES b2b.documents(id, organization_id),
      CHECK (requested_at IS NULL OR requested_at >= created_at))`);
    await tx.raw(`CREATE FUNCTION b2b.guard_quote_signing_packet() RETURNS trigger LANGUAGE plpgsql AS $$ ${packetGuard} $$`);
    await tx.raw("CREATE TRIGGER guard_quote_signing_packet BEFORE UPDATE OR DELETE ON b2b.quote_signing_packets FOR EACH ROW EXECUTE FUNCTION b2b.guard_quote_signing_packet()");
  });
}
async function managerAvailable(tx, routing) {
  if (!routing) return false;
  const member = await table(tx, "memberships").where({ organization_id: routing.organizationId, user_id: routing.managerId, is_active: true }).forShare().first();
  if (!member) return false;
  const user = await table(tx, "users").where({ id: routing.managerId, is_active: true }).forShare().first();
  const org = await table(tx, "organizations").where({ id: routing.organizationId, is_active: true }).forShare().first();
  const role = await table(tx, "roles").where({ id: member.role_id }).forShare().first();
  if (!user || !org || !role || (role.organization_id !== null && role.organization_id !== routing.organizationId)) return false;
  const permissions = effectivePermissions(role);
  return permissions.has("document.read") && permissions.has("document.sign");
}
async function savedQuote(tx, id) {
  const quote = await table(tx, "quote_requests").where({ id }).forShare().first();
  if (!quote) missing();
  const items = await table(tx, "quote_request_items").where({ quote_request_id: id }).orderBy("position").orderBy("id").forShare().select("*");
  return { quote, payload: quotePayload(quote, items) };
}
// Trusted rendering pipeline ONLY. The renderer must have rendered exactly this
// canonical catalog payload, without invented commercial terms, into the reviewed
// PDF already provisioned through document-signing.provisionSnapshot. Not exposed
// over HTTP. Hash binding is evidence, not proof of renderer correctness.
async function provisionPacket(db, { quoteId, snapshotId, renderedQuoteSha256, routing: inputRouting, audit, ctx = {} }) {
  uuid(quoteId); uuid(snapshotId);
  const routing = routeConfig(inputRouting);
  if (typeof audit !== "function") throw new TypeError("Transactional audit required");
  return db.transaction(async tx => {
    if (!await managerAvailable(tx, routing)) fail("quote_signing_configuration_required", "Authorized supplier manager is not configured", 503);
    await tx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?,3))", [quoteId]);
    const { quote, payload } = await savedQuote(tx, quoteId), hash = digest(payload);
    if (renderedQuoteSha256 !== hash) fail("quote_changed", "Rendered PDF does not bind current saved catalog selection");
    const snapshot = await table(tx, "eds_snapshots").where({ id: snapshotId, organization_id: routing.organizationId }).first();
    if (!snapshot) fail("file_unavailable", "Reviewed supplier PDF snapshot is required", 503);
    policy.assertSnapshot(snapshot);
    await table(tx, "documents").where({ id: snapshot.document_id, organization_id: routing.organizationId }).forUpdate().first();
    const existing = await table(tx, "quote_signing_packets").where({ quote_id: quoteId }).first();
    if (existing) {
      if (existing.quote_sha256 !== hash || existing.snapshot_id !== snapshotId || existing.assigned_manager_id !== routing.managerId || existing.signing_organization_id !== routing.organizationId)
        fail("quote_signing_conflict", "An immutable signing packet already exists");
      return existing.id;
    }
    if (await table(tx, "eds_intents").where({ document_id: snapshot.document_id }).first())
      fail("quote_signing_conflict", "A previously used signing document cannot become a quote packet");
    const row = { id: randomUUID(), quote_id: quoteId, customer_organization_id: quote.organization_id, customer_user_id: quote.created_by_id,
      signing_organization_id: routing.organizationId, assigned_manager_id: routing.managerId, document_id: snapshot.document_id,
      snapshot_id: snapshot.id, quote_payload: payload, quote_sha256: hash, pdf_sha256: snapshot.sha256, created_at: new Date(), requested_at: null };
    await table(tx, "quote_signing_packets").insert(row);
    await audit(tx, ctx, { action: "quote.signing_packet_prepared", actor_user_id: null, organization_id: quote.organization_id, entity_type: "quote", entity_id: quoteId });
    return row.id;
  });
}
function createQuoteSigning({ db, auth, audit, routing: inputRouting }) {
  const routing = routeConfig(inputRouting);
  async function owner(tx, ctx, permission) {
    const context = await auth.permission(ctx, permission);
    await auth.assertActiveSession(tx, ctx, context.user.id);
    const actor = await assertActiveContext(tx, context, permission);
    const id = uuid(ctx.params.id);
    const quote = await table(tx, "quote_requests").where({ id, organization_id: actor.organization_id, created_by_id: actor.user.id }).forShare().first();
    if (!quote) missing();
    return { actor, quote };
  }
  async function status(ctx) {
    privateResponse(ctx);
    ctx.body = await db.transaction(async tx => {
      const { quote } = await owner(tx, ctx, "quote.read");
      const packet = await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).first();
      const ready = await managerAvailable(tx, routing) && packet && packet.signing_organization_id === routing.organizationId && packet.assigned_manager_id === routing.managerId;
      return { quote_id: quote.id, status: packet?.requested_at ? "requested" : ready ? "ready" : "configuration_required",
        request_allowed: Boolean(ready && !packet.requested_at), signature_status: "not_verified", external_delivery: "not_configured" };
    });
  }
  async function request(ctx) {
    privateResponse(ctx); strictObject(ctx.request.body, []);
    ctx.body = await db.transaction(async tx => {
      const { quote, actor } = await owner(tx, ctx, "quote.create");
      const packet = await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).forUpdate().first();
      if (!packet || !await managerAvailable(tx, routing) || packet.signing_organization_id !== routing.organizationId || packet.assigned_manager_id !== routing.managerId)
        fail("quote_signing_configuration_required", "Supplier manager and immutable rendered PDF must be configured", 503);
      const { payload } = await savedQuote(tx, quote.id);
      if (digest(payload) !== packet.quote_sha256 || packet.quote_payload !== payload) fail("quote_changed", "Saved selection no longer matches immutable packet");
      if (!packet.requested_at) {
        await table(tx, "quote_signing_packets").where({ id: packet.id }).update({ requested_at: new Date() });
        await audit(tx, ctx, { action: "quote.signing_requested", actor_user_id: actor.user.id, organization_id: actor.organization_id, entity_type: "quote", entity_id: quote.id });
      }
      return { quote_id: quote.id, status: "requested", request_allowed: false, signature_status: "not_verified", external_delivery: "not_configured" };
    });
  }
  async function authorizeDocument(tx, actor, documentId) {
    const packet = await table(tx, "quote_signing_packets").where({ document_id: documentId }).first();
    if (!packet) return; // Existing non-quote document semantics remain unchanged.
    assertAssignment(packet, actor, routing);
    const snapshot = await table(tx, "eds_snapshots").where({ id: packet.snapshot_id, organization_id: actor.organization_id }).first();
    const version = await table(tx, "document_versions").where({ document_id: documentId, organization_id: actor.organization_id }).orderBy("version", "desc").forShare().first();
    if (!snapshot || snapshot.sha256 !== packet.pdf_sha256 || snapshot.document_id !== documentId || version?.id !== snapshot.document_version_id)
      fail("document_integrity_failed", "Signing packet PDF binding changed");
    policy.assertSnapshot(snapshot);
  }
  return { status, request, authorizeDocument };
}
module.exports = { routeConfig, canonical, quotePayload, digest, assertAssignment, ensureSchema, provisionPacket, createQuoteSigning };
