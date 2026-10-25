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
function createQuoteSigning({ db, auth, audit, routing: inputRouting, storage = require("./document-files").createDocumentStorage(), renderPdf = payload => require("./quote-pdf").renderQuotePdf(payload) }) {
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
  async function receipt(tx, quote, packet, canPrepare = false) {
    const ready = await managerAvailable(tx, routing) && packet && packet.signing_organization_id === routing.organizationId && packet.assigned_manager_id === routing.managerId;
    const signature = packet?.requested_at && await table(tx, "eds_signatures").where({ snapshot_id: packet.snapshot_id, organization_id: packet.signing_organization_id, actor_user_id: packet.assigned_manager_id }).orderByRaw("CASE WHEN status='verified' THEN 0 ELSE 1 END").orderBy("created_at", "desc").first();
    return { quote_id: quote.id, status: packet?.requested_at ? "requested" : ready ? "ready" : canPrepare ? "preparation_available" : "configuration_required",
      prepare_allowed: Boolean(canPrepare && !packet), request_allowed: Boolean(ready && !packet.requested_at),
      pdf_sha256: packet?.pdf_sha256 || null, signature_status: signature?.status || "not_verified", external_delivery: "not_configured" };
  }
  async function status(ctx) {
    privateResponse(ctx);
    ctx.body = await db.transaction(async tx => {
      const { quote } = await owner(tx, ctx, "quote.read");
      const packet = await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).first();
      let canPrepare = false;
      if (!packet && await managerAvailable(tx, routing)) {
        try { await storage.ready(); canPrepare = true; } catch (error) { if (error.status !== 503) throw error; }
      }
      return receipt(tx, quote, packet, canPrepare);
    });
  }
  async function prepare(ctx) {
    privateResponse(ctx); strictObject(ctx.request.body, []);
    const initial = await db.transaction(async tx => {
      const { quote } = await owner(tx, ctx, "quote.create");
      if (!await managerAvailable(tx, routing)) fail("quote_signing_configuration_required", "Authorized supplier manager is not configured", 503);
      const packet = await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).first();
      if (packet) return { existing: await receipt(tx, quote, packet) };
      return savedQuote(tx, quote.id);
    });
    if (initial.existing) { ctx.body = initial.existing; return; }
    // Expensive rendering and real malware scan happen outside database locks.
    await storage.ready();
    const bytes = await renderPdf(initial.payload);
    const admitted = await storage.admitBytes({ bytes, name: `quote-${initial.quote.id}.pdf`, mime: "application/pdf" });
    // The file and the signed snapshot MUST contain the exact same bytes.
    if (!Buffer.isBuffer(admitted.bytes) || !admitted.bytes.equals(bytes) || admitted.checksum !== digest(bytes)) fail("document_integrity_failed", "PDF admission changed generated bytes");
    const storageKey = await storage.store(admitted);
    let used = false;
    try {
      ctx.body = await db.transaction(async tx => {
        const { quote, actor } = await owner(tx, ctx, "quote.create");
        if (!await managerAvailable(tx, routing)) fail("quote_signing_configuration_required", "Assigned manager access changed", 503);
        await tx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?,3))", [quote.id]);
        const existing = await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).first();
        if (existing) return receipt(tx, quote, existing);
        const current = await savedQuote(tx, quote.id);
        if (current.payload !== initial.payload) fail("quote_changed", "Saved catalog selection changed during PDF preparation");
        await table(tx, "document_types").insert({ id: randomUUID(), code: "quote_signing_packet", name: "КП: итоговый список клиента", is_active: true }).onConflict("code").ignore();
        const type = await table(tx, "document_types").where({ code: "quote_signing_packet", is_active: true }).forShare().first();
        if (!type) fail("document_type_unavailable", "Quote signing document type is disabled");
        const documentId = randomUUID(), fileId = randomUUID(), versionId = randomUUID(), now = new Date(), organization = routing.organizationId;
        await table(tx, "documents").insert({ id: documentId, organization_id: organization, type_id: type.id, title: `КП: итоговый список ${quote.id}`, number: null, external_id: null, source: "client_quote", created_at: now, updated_at: now });
        await table(tx, "file_objects").insert({ id: fileId, organization_id: organization, storage_key: storageKey, original_name: admitted.name, content_type: admitted.mime, size_bytes: bytes.length, checksum_sha256: admitted.checksum, storage_backend: require("./document-files").BACKEND, created_at: now, updated_at: now });
        await table(tx, "document_versions").insert({ id: versionId, organization_id: organization, document_id: documentId, file_id: fileId, version: 1, created_at: now, updated_at: now });
        const snapshot = await require("./document-signing").provisionSnapshot(tx, { organizationId: organization, documentVersionId: versionId, bytes });
        await provisionPacket(tx, { quoteId: quote.id, snapshotId: snapshot.id, renderedQuoteSha256: digest(current.payload), routing, audit, ctx });
        await audit(tx, ctx, { action: "quote.pdf_prepared", actor_user_id: actor.user.id, organization_id: actor.organization_id, entity_type: "quote", entity_id: quote.id });
        used = true;
        return receipt(tx, quote, await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).first());
      });
    } catch (error) { await storage.remove(storageKey); throw error; }
    if (!used) await storage.remove(storageKey); // Concurrent preparation won; discard private duplicate.
    ctx.status = used ? 201 : 200;
  }
  async function download(ctx) {
    privateResponse(ctx);
    ctx.body = await db.transaction(async tx => {
      const { quote } = await owner(tx, ctx, "quote.read");
      const packet = await table(tx, "quote_signing_packets").where({ quote_id: quote.id }).first();
      if (!packet) fail("file_unavailable", "Quote PDF is not prepared", 404);
      const snapshot = await table(tx, "eds_snapshots").where({ id: packet.snapshot_id, organization_id: packet.signing_organization_id }).first();
      if (!snapshot || snapshot.sha256 !== packet.pdf_sha256) fail("document_integrity_failed", "Quote PDF binding changed");
      policy.assertSnapshot(snapshot);
      return Buffer.from(snapshot.content);
    });
    ctx.type = "application/pdf";
    ctx.set("Content-Disposition", `attachment; filename="quote-${uuid(ctx.params.id)}.pdf"`);
    ctx.set("Content-Length", String(ctx.body.length)); ctx.set("X-Content-Type-Options", "nosniff");
  }
  async function inbox(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, "document.sign");
    const page = require("./legacy-query").requestQuoteQuery(ctx);
    ctx.body = await db.transaction(async tx => {
      await auth.assertActiveSession(tx, ctx, context.user.id);
      const actor = await assertActiveContext(tx, context, ["document.read", "document.sign"]);
      if (!routing || routing.organizationId !== actor.organization_id || routing.managerId !== actor.user.id) return { items: [], page: page.page, page_size: page.page_size, total: 0 };
      const scoped = () => table(tx, "quote_signing_packets").where({ signing_organization_id: actor.organization_id, assigned_manager_id: actor.user.id }).whereNotNull("requested_at");
      const total = Number((await scoped().count("* AS total").first()).total);
      const packets = page.offset >= BigInt(total) ? [] : await scoped().orderBy("requested_at", "desc").orderBy("id").limit(page.page_size).offset(Number(page.offset));
      const items = [];
      for (const packet of packets) {
        assertAssignment(packet, actor, routing);
        const signature = await table(tx, "eds_signatures").where({ snapshot_id: packet.snapshot_id, organization_id: actor.organization_id, actor_user_id: actor.user.id }).orderByRaw("CASE WHEN status='verified' THEN 0 ELSE 1 END").orderBy("created_at", "desc").first();
        items.push({ id: packet.id, quote_id: packet.quote_id, document_id: packet.document_id, title: `КП: итоговый список ${packet.quote_id}`, requested_at: new Date(packet.requested_at).toISOString(), pdf_sha256: packet.pdf_sha256, signature_status: signature?.status || "not_verified" });
      }
      return { items, page: page.page, page_size: page.page_size, total };
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
      return receipt(tx, quote, { ...packet, requested_at: packet.requested_at || new Date() });
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
  return { status, prepare, request, download, inbox, authorizeDocument };
}
module.exports = { routeConfig, canonical, quotePayload, digest, assertAssignment, ensureSchema, provisionPacket, createQuoteSigning };
