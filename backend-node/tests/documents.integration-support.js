"use strict";
// Only the fresh isolated document runner invokes these HTTP/PostgreSQL checks.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { table } = require("../src/domain/auth");
const { audit } = require("../src/domain/audit");
const { createDocuments, ensureSchema, preflightSchema, READ } = require("../src/domain/documents");
const fixtures = require("../scripts/seed-test-document-users");
const code = value => error => error.code === value;
const pause = ms => new Promise(done => setTimeout(done, ms));
function request(actor, organization, id) {
  const headers = { authorization: `Bearer ${actor.access_token}`, "x-organization-id": organization || "" };
  return { request: {}, query: {}, params: { id }, state: {}, get: name => headers[name.toLowerCase()] || "", set() {} };
}
async function snapshot(db) {
  return (await db.raw("SELECT jsonb_build_object('types',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.document_types x),'documents',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.documents x),'files',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.file_objects x),'versions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.document_versions x),'invoices',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.invoices x),'orders',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.orders x),'items',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.order_items x),'quotes',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.quote_requests x),'quote_items',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.quote_request_items x),'tickets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.tickets x),'messages',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM b2b.ticket_messages x))::text AS value")).rows[0].value;
}
module.exports = async function verifyDocuments({ app, api, check, manifest, password, rememberSecret }) {
  const db = app.db.connection, a = manifest.organizations.a.id, b = manifest.organizations.b.id, c = manifest.organizations.c.id;
  const ids = manifest.documents, actors = {}, initialRoles = await table(db, "roles").orderBy("id"), initialRows = await snapshot(db);
  const countAudit = async () => Number((await table(db, "audit_events").where({ action: "document.view" }).count("* AS count").first()).count);
  const countAllAudit = async () => Number((await table(db, "audit_events").count("* AS count").first()).count);
  const list = (kind = "reader", organization = a, suffix = "", expected = 200) => api(`/documents${suffix}`, { actor: actors[kind], organization, expected });
  const detail = (id = ids.versioned, kind = "reader", organization = a, expected = 200) => api(`/documents/${id}`, { actor: actors[kind], organization, expected });
  async function rollback(work) {
    const marker = new Error("disposable fixture rollback");
    await assert.rejects(db.transaction(async tx => { await work(tx); throw marker; }), error => error === marker);
  }
  await check("repeat additive schema preserves all metadata and original grants", async () => {
    await preflightSchema(db); await ensureSchema(db); await ensureSchema(db);
    for (const name of ["document_types", "documents", "file_objects", "document_versions"]) assert.equal(await db.schema.withSchema("public").hasTable(name), false);
    assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.equal(await snapshot(db), initialRows); assert.equal(await countAllAudit(), 0);
  });
  await check("real logins retain only document.read fixture permissions", async () => {
    for (const kind of Object.keys(fixtures.EMAILS)) {
      actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password } });
      rememberSecret(actors[kind].access_token); rememberSecret(actors[kind].refresh_token);
      assert.deepEqual((await api("/auth/me", { actor: actors[kind], organization: kind === "other" ? b : kind === "empty" ? c : a })).permissions, kind === "denied" ? [] : [READ]);
    }
  });
  await check("seven-field list/detail DTOs retain nulls, inactive types and greatest positive version", async () => {
    const before = await countAudit(), result = await list();
    assert.deepEqual(Object.keys(result).sort(), ["items", "page", "page_size", "total"]);
    assert.deepEqual([result.page, result.page_size, result.total], [1, 50, 3]);
    assert.deepEqual(result.items.map(item => item.id), [ids.newest, ids.versioned, ids.empty]);
    for (const item of result.items) assert.deepEqual(Object.keys(item).sort(), ["external_id", "id", "latest_file_id", "number", "source", "title", "type_code"]);
    const versioned = result.items[1], empty = result.items[2];
    assert.equal(versioned.type_code, manifest.types.inactive.code); assert.equal(manifest.types.inactive.is_active, false);
    assert.equal(versioned.latest_file_id, manifest.files.version9);
    const versions = await table(db, "document_versions").where({ document_id: ids.versioned }).orderBy("version");
    assert.deepEqual(versions.map(row => row.version), [1, 9]); assert.ok(versions[1].created_at < versions[0].created_at);
    assert.deepEqual([empty.number, empty.external_id, empty.latest_file_id], [null, null, null]);
    assert.equal(await countAudit(), before);
    for (const item of result.items) assert.deepEqual(await detail(item.id), item);
    assert.deepEqual(await list("empty", c), { items: [], page: 1, page_size: 50, total: 0 });
  });
  await check("raw wire exposes metadata only without file storage keys or version internals", async () => {
    for (const path of ["/documents", `/documents/${ids.versioned}`]) {
      const raw = await api(path, { actor: actors.reader, organization: a, raw: true });
      for (const field of ["organization_id", "type_id", "storage_key", "original_name", "content_type", "size_bytes", "checksum_sha256", "storage_backend", "created_at", "updated_at", "version", "file_id", "download_url", "url"]) assert.equal(raw.includes(`"${field}"`), false);
      assert.ok(raw.includes(`"latest_file_id":"${manifest.files.version9}"`));
    }
  });
  await check("organization peers see the same documents while selected tenants remain isolated", async () => {
    assert.deepEqual(await list("peer"), await list()); assert.deepEqual(await detail(ids.versioned, "peer"), await detail());
    assert.deepEqual((await list("other", b)).items.map(item => item.id), [ids.foreign]);
    assert.deepEqual((await list("multi", a)).items.map(item => item.id), [ids.newest, ids.versioned, ids.empty]);
    assert.deepEqual((await list("multi", b)).items.map(item => item.id), [ids.foreign]);
    for (const [id, kind, org] of [[ids.foreign, "reader", a], [ids.versioned, "other", b], [randomUUID(), "reader", a]]) {
      const error = (await detail(id, kind, org, 404)).error;
      assert.equal(error.code, "document_not_found"); assert.equal(error.message, "Document not found");
    }
  });
  await check("pagination preserves raw scalar defaults, cap, sorting, duplicate and huge integer semantics", async () => {
    assert.equal((await list("reader", a, "?page=2&page_size=1")).items[0].id, ids.versioned);
    for (const suffix of ["?page=%2B01.00&page_size=999", "?page=%20%091%20&page_size=9999999999999999999999999", "?page=0__1&page_size=100", "?page=%C2%A01%E3%80%80&page_size=100"]) {
      const page = await list("reader", a, suffix); assert.equal(page.page, 1); assert.equal(page.page_size, 100);
    }
    for (const raw of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2"]) assert.equal((await list("reader", a, `?${raw}`)).page, 1);
    assert.equal((await list("reader", a, "?page=bad&page=2&page_size=1")).items[0].id, ids.versioned);
    assert.equal((await list("reader", a, `?${"ignored=x&".repeat(1000)}page=2`)).page, 2);
    const huge = await api("/documents?page=9007199254740993", { actor: actors.reader, organization: a, raw: true });
    assert.match(huge, /"page":9007199254740993(?:,|})/); assert.deepEqual(JSON.parse(huge).items, []);
    for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "1.5", "1e2", "", "one", "%EF%BB%BF1", "1".repeat(4301)])
      assert.equal((await list("reader", a, `?${field}=${value}`, 422)).error.code, "validation_error");
    assert.deepEqual((await list("reader", a, `?organization_id=${b}&mine=true&unknown=ignored`)).items.map(item => item.id), [ids.newest, ids.versioned, ids.empty]);
  });
  await check("UUID normalization and invalid-path 422 preserve the frozen document error contract", async () => {
    for (const id of [ids.versioned.toUpperCase(), ids.versioned.replaceAll("-", ""), `{${ids.versioned}}`, `urn:uuid:${ids.versioned}`]) assert.equal((await detail(id)).id, ids.versioned);
    for (const value of ["invalid-uuid", "null", "123"]) {
      const error = (await detail(value, "reader", a, 422)).error;
      assert.deepEqual(Object.keys(error).sort(), ["code", "details", "message", "request_id"]); assert.equal(error.code, "validation_error");
      assert.deepEqual(error.details[0].loc, ["path", "document_id"]); assert.equal(error.details[0].input, value);
    }
  });
  await check("detail appends exactly one core document.view audit; list and failed reads append none", async () => {
    const before = await countAllAudit(); await list(); await list("denied", a, "", 403); await detail(randomUUID(), "reader", a, 404); await detail("invalid", "reader", a, 422); await detail(ids.foreign, "reader", a, 404);
    assert.equal(await countAllAudit(), before); await detail(); assert.equal(await countAllAudit(), before + 1);
    const event = await table(db, "audit_events").where({ action: "document.view" }).orderBy("created_at", "desc").first();
    assert.equal(event.actor_user_id, manifest.users.reader.id); assert.equal(event.organization_id, a); assert.equal(event.entity_type, "document"); assert.equal(event.entity_id, ids.versioned);
    assert.deepEqual(typeof event.event_metadata === "string" ? JSON.parse(event.event_metadata) : event.event_metadata, {}); assert.match(event.request_id, /^[0-9a-f-]{36}$/); assert.ok(event.created_at);
    assert.equal(Object.hasOwn(event, "ip_address"), false); assert.equal(Object.hasOwn(event, "source"), false);
  });
  await check("private authentication failures reject missing login, native CMS tokens and unauthorized tenants", async () => {
    const before = await countAllAudit();
    for (const path of ["/documents", `/documents/${ids.versioned}`]) {
      await api(path, { expected: 401 });
      for (const secret of [app.config.get("admin.auth.secret"), app.config.get("plugin::users-permissions.jwtSecret")].filter(Boolean)) {
        const native = jwt.sign({ id: 1, type: "access" }, secret, { expiresIn: "15m" }); rememberSecret(native);
        await api(path, { actor: { access_token: native }, organization: a, expected: 401 });
      }
      assert.equal((await api(path, { actor: actors.reader, organization: b, expected: 403 })).error.code, "organization_access_denied");
      assert.equal((await api(path, { actor: actors.denied, organization: a, expected: 403 })).error.code, "permission_denied");
      assert.equal((await api(path, { actor: actors.multi, expected: 400 })).error.code, "organization_required");
    }
    assert.equal(await countAllAudit(), before);
  });
  await check("document mutations, bytes, uploads, signing and provider paths stay unavailable", async () => {
    const before = await countAllAudit();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) for (const path of ["/documents", `/documents/${ids.versioned}`]) await api(path, { actor: actors.reader, organization: a, method, data: {}, expected: 405 });
    for (const path of [`/documents/${ids.versioned}/download`, `/documents/${ids.versioned}/versions`, `/documents/${ids.versioned}/sign`, `/files/${manifest.files.version9}`, `/files/${manifest.files.version9}/download`, "/files", "/storage/providers"]) {
      await api(path, { actor: actors.reader, organization: a, expected: 404 });
      await api(path, { actor: actors.reader, organization: a, method: "POST", data: {}, expected: 405 });
    }
    assert.equal(await countAllAudit(), before); assert.equal(await snapshot(db), initialRows);
  });
  await check("HTTP audit insert and post-insert failures roll back completely without business changes", async () => {
    const before = await countAllAudit();
    await db.raw("CREATE FUNCTION b2b.reject_fixture_document_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'document.view' THEN RAISE EXCEPTION 'Fictitious document audit failure'; END IF; RETURN NEW; END $$");
    await db.raw("CREATE TRIGGER reject_fixture_document_audit AFTER INSERT ON b2b.audit_events FOR EACH ROW EXECUTE FUNCTION b2b.reject_fixture_document_audit()");
    try { await list(); assert.equal((await detail(ids.versioned, "reader", a, 500)).error.code, "internal_error"); }
    finally { await db.raw("DROP TRIGGER reject_fixture_document_audit ON b2b.audit_events"); await db.raw("DROP FUNCTION b2b.reject_fixture_document_audit()"); }
    const failing = createDocuments({ db, auth: app.alageum.auth, audit: async (tx, ctx, event) => { await audit(tx, ctx, event); throw new Error("Fictitious post-insert audit failure"); } });
    await assert.rejects(failing.detail(request(actors.reader, a, ids.versioned)), /Fictitious post-insert audit failure/);
    assert.equal(await countAllAudit(), before); assert.equal(await snapshot(db), initialRows);
  });
  await check("DTO failure after committed detail audit preserves legacy sequencing and never repairs rows", async () => {
    const before = await countAllAudit(), pgTypes = require("pg").types, parser = pgTypes.getTypeParser(1043, "text");
    const title = (await table(db, "documents").where({ id: ids.versioned }).first("title")).title;
    // Simulate a corrupted driver projection without weakening or mutating the
    // actual database schema; only the exact fictional title is affected.
    pgTypes.setTypeParser(1043, "text", value => value === title ? 123 : parser(value));
    try {
      assert.equal((await list("reader", a, "", 500)).error.code, "internal_error"); assert.equal(await countAllAudit(), before);
      assert.equal((await detail(ids.versioned, "reader", a, 500)).error.code, "internal_error"); assert.equal(await countAllAudit(), before + 1);
    } finally { pgTypes.setTypeParser(1043, "text", parser); }
    assert.equal(await snapshot(db), initialRows);
  });
  await check("legacy metadata storage retains bounds, positive versions, BIGINT size and no SQL defaults", async () => {
    const document = await table(db, "documents").where({ id: ids.versioned }).first();
    for (const [patch, expected] of [[{ number: "x".repeat(121) }, "22001"], [{ title: "x".repeat(301) }, "22001"], [{ external_id: "x".repeat(201) }, "22001"], [{ source: "x".repeat(61) }, "22001"], [{ type_id: randomUUID() }, "23503"], [{ organization_id: randomUUID() }, "23503"]])
      await assert.rejects(table(db, "documents").insert({ ...document, id: randomUUID(), external_id: null, ...patch }), code(expected));
    const file = await table(db, "file_objects").where({ id: manifest.files.version9 }).first();
    for (const [patch, expected] of [[{ size_bytes: "-1" }, "23514"], [{ size_bytes: "9223372036854775808" }, "22003"], [{ storage_key: "x".repeat(501) }, "22001"], [{ original_name: "x".repeat(256) }, "22001"], [{ content_type: "x".repeat(151) }, "22001"], [{ checksum_sha256: "x".repeat(65) }, "22001"], [{ storage_backend: "x".repeat(41) }, "22001"]])
      await assert.rejects(table(db, "file_objects").insert({ ...file, id: randomUUID(), storage_key: randomUUID(), ...patch }), code(expected));
    const version = await table(db, "document_versions").where({ id: manifest.versions.version9 }).first();
    for (const value of [0, -1]) await assert.rejects(table(db, "document_versions").insert({ ...version, id: randomUUID(), version: value }), code("23514"));
    await assert.rejects(table(db, "document_versions").insert({ ...version, id: randomUUID(), version: 1.5 }), code("22P02"));
    for (const [name, source, fields] of [
      ["documents", document, ["id", "organization_id", "type_id", "title", "source", "created_at", "updated_at"]],
      ["file_objects", file, ["id", "storage_key", "original_name", "content_type", "size_bytes", "checksum_sha256", "storage_backend", "created_at", "updated_at"]],
      ["document_versions", version, ["id", "organization_id", "document_id", "file_id", "version", "created_at", "updated_at"]],
      ["document_types", manifest.types.active, ["id", "code", "name", "is_active"]],
    ]) for (const field of fields) {
      const candidate = { ...source, id: randomUUID(), ...(name === "file_objects" ? { storage_key: randomUUID() } : name === "document_types" ? { code: randomUUID() } : name === "documents" ? { external_id: null } : { version: 77 }) };
      delete candidate[field]; await assert.rejects(table(db, name).insert(candidate), code("23502"));
    }
    await rollback(async tx => {
      await table(tx, "file_objects").insert({ ...file, id: randomUUID(), storage_key: randomUUID(), size_bytes: "9223372036854775807" });
      await table(tx, "documents").insert([{ ...document, id: randomUUID(), external_id: null }, { ...document, id: randomUUID(), external_id: null }]);
    });
    await assert.rejects(table(db, "documents").insert({ ...document, id: randomUUID() }), code("23505"));
    await assert.rejects(table(db, "file_objects").insert({ ...file, id: randomUUID() }), code("23505"));
    await assert.rejects(table(db, "document_versions").insert({ ...version, id: randomUUID() }), code("23505"));
    await assert.rejects(table(db, "document_types").insert({ ...manifest.types.active, id: randomUUID() }), code("23505"));
  });
  await check("database rejects foreign and global-file tenant linkage while retaining null-org metadata", async () => {
    const version = await table(db, "document_versions").where({ id: manifest.versions.version9 }).first();
    assert.equal((await table(db, "file_objects").where({ id: manifest.files.global }).first()).organization_id, null);
    for (const patch of [{ file_id: manifest.files.foreign }, { file_id: manifest.files.global }, { document_id: ids.foreign }, { organization_id: b }, { document_id: randomUUID() }, { file_id: randomUUID() }])
      await assert.rejects(table(db, "document_versions").insert({ ...version, id: randomUUID(), version: 77, ...patch }), code("23503"));
    await assert.rejects(table(db, "document_versions").insert({ ...version, id: randomUUID(), version: 77, organization_id: null }), code("23502"));
    await assert.rejects(table(db, "file_objects").where({ id: manifest.files.version9 }).update({ organization_id: null }), code("23503"));
    await assert.rejects(table(db, "documents").where({ id: ids.versioned }).update({ organization_id: b }), code("23503"));
    assert.equal(await snapshot(db), initialRows);
  });
  await check("legacy deletion rules retain document and organization cascades with type/file NO ACTION", async () => {
    await assert.rejects(table(db, "document_types").where({ id: manifest.types.inactive.id }).delete(), code("23503"));
    await assert.rejects(table(db, "file_objects").where({ id: manifest.files.version9 }).delete(), code("23503"));
    await rollback(async tx => {
      await table(tx, "documents").where({ id: ids.versioned }).delete();
      assert.equal(await table(tx, "document_versions").where({ document_id: ids.versioned }).first(), undefined);
      assert.ok(await table(tx, "file_objects").where({ id: manifest.files.version9 }).first());
    });
    await rollback(async tx => {
      await table(tx, "organizations").where({ id: b }).delete();
      for (const name of ["documents", "file_objects", "document_versions"]) assert.equal(await table(tx, name).where({ organization_id: b }).first(), undefined);
      assert.ok(await table(tx, "file_objects").where({ id: manifest.files.global }).first());
    });
    assert.equal(await snapshot(db), initialRows);
  });
  await check("fresh transaction authority denies revoked user, membership, organization and role", async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a)), before = await countAllAudit();
    const guarded = createDocuments({ db, auth: { permission: async () => context }, audit });
    for (const [name, id, revoked, restored, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["organizations", a, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, "permission_denied"],
      ["roles", context.membership.role.id, { organization_id: b, code: "document_fixture_moved_role" }, { organization_id: a, code: context.membership.role.code }, "organization_access_denied"],
    ]) {
      await table(db, name).where({ id }).update(revoked);
      try {
        for (const method of ["list", "detail"]) await assert.rejects(guarded[method](request(actors.reader, a, ids.versioned)), code(expected));
        for (const path of ["/documents", `/documents/${ids.versioned}`]) assert.equal((await api(path, { actor: actors.reader, organization: a, expected: expected === "authentication_required" ? 401 : 403 })).error.code, expected);
      } finally { await table(db, name).where({ id }).update(restored); }
    }
    assert.equal(await countAllAudit(), before);
  });
  await check("expired access and revoked refresh sessions preserve existing stateless auth behavior", async () => {
    const now = Math.floor(Date.now() / 1000), payload = jwt.decode(actors.peer.access_token);
    const expired = jwt.sign({ ...payload, iat: now - 120, nbf: now - 120, exp: now - 1 }, app.config.get("alageum.jwtSecret"), { algorithm: "HS256" }); rememberSecret(expired);
    for (const path of ["/documents", `/documents/${ids.versioned}`]) await api(path, { actor: { access_token: expired }, organization: a, expected: 401 });
    await api("/auth/logout", { method: "POST", data: { refresh_token: actors.peer.refresh_token }, expected: 204 });
    await api("/auth/refresh", { method: "POST", data: { refresh_token: actors.peer.refresh_token }, expected: 401 });
    // Existing access tokens remain valid until expiry; this metadata slice does
    // not introduce a session table or claim immediate access-token revocation.
    assert.deepEqual(await list("peer"), await list()); assert.equal((await detail(ids.versioned, "peer")).id, ids.versioned);
  });
  await check("list and detail hold all authority locks until commit before later revocation takes effect", async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    for (const method of ["list", "detail"]) for (const [name, id, patch, restore, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, 401],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, 403],
      ["organizations", a, { is_active: false }, { is_active: true }, 403],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, 403],
    ]) {
      let release, entered;
      const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
      const held = createDocuments({ db: { transaction: work => db.transaction(async tx => { const result = await work(tx); entered(); await barrier; return result; }) }, auth: app.alageum.auth, audit });
      const ctx = request(actors.reader, a, ids.versioned), reading = held[method](ctx), watchdog = setTimeout(release, 12000); let revoke;
      try {
        await ready; revoke = table(db, name).where({ id }).update(patch).then(() => {});
        const deadline = Date.now() + 8000; let blocked = false;
        while (Date.now() < deadline) {
          const waiting = await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?", [`update%${name}%`]);
          if (waiting.rows.length) { blocked = true; break; } await pause(20);
        }
        assert.equal(blocked, true, `${method} must hold ${name} authority until commit`);
        release(); await reading; await revoke; assert.ok(ctx.body);
        await api(method === "list" ? "/documents" : `/documents/${ids.versioned}`, { actor: actors.reader, organization: a, expected });
      } finally { release(); await reading; if (revoke) await revoke; clearTimeout(watchdog); await table(db, name).where({ id }).update(restore); }
    }
  });
  await check("preflight rejects drift including missing version uniqueness, domains and timestamp precision before any additions", async () => {
    const changes = [
      tx => tx.raw("ALTER TABLE b2b.document_types ALTER COLUMN is_active SET DEFAULT true"),
      tx => tx.raw("ALTER TABLE b2b.documents ALTER COLUMN source SET DEFAULT 'manual'"),
      tx => tx.raw("ALTER TABLE b2b.documents ALTER COLUMN created_at TYPE timestamptz(0)"),
      tx => tx.raw("ALTER TABLE b2b.file_objects ALTER COLUMN updated_at TYPE timestamptz(0)"),
      tx => tx.raw("ALTER TABLE b2b.document_versions ALTER COLUMN created_at TYPE timestamptz(0)"),
      tx => tx.raw("ALTER TABLE b2b.documents ALTER COLUMN title DROP NOT NULL"),
      tx => tx.raw("ALTER TABLE b2b.document_types ADD COLUMN created_at timestamptz"),
      tx => tx.raw("ALTER TABLE b2b.documents ALTER COLUMN title TYPE varchar(300) COLLATE \"C\""),
      tx => tx.raw("ALTER TABLE b2b.file_objects ADD CONSTRAINT fixture_extra CHECK (original_name <> '') NOT VALID"),
      tx => tx.raw("CREATE INDEX fixture_extra ON b2b.documents(title)"),
      tx => tx.raw("ALTER TABLE b2b.documents ENABLE ROW LEVEL SECURITY"),
      async tx => {
        await tx.raw("CREATE DOMAIN b2b.fixture_document_title AS varchar(300) CHECK (VALUE <> '')");
        await tx.raw("ALTER TABLE b2b.documents ALTER COLUMN title TYPE b2b.fixture_document_title");
        const column = await tx("information_schema.columns").where({ table_schema: "b2b", table_name: "documents", column_name: "title" }).first();
        assert.equal(column.data_type, "character varying"); assert.equal(column.character_maximum_length, 300);
        assert.equal(column.domain_schema, "b2b"); assert.equal(column.domain_name, "fixture_document_title");
      },
      async tx => {
        const row = (await tx.raw("SELECT conname FROM pg_constraint WHERE conrelid='b2b.document_versions'::regclass AND pg_get_constraintdef(oid)='UNIQUE (document_id, version)'")).rows[0];
        await tx.raw("ALTER TABLE b2b.document_versions DROP CONSTRAINT ??", [row.conname]);
      },
      async tx => { await tx.raw("ALTER TABLE b2b.document_versions RENAME TO fixture_saved_versions"); await tx.raw("CREATE VIEW b2b.document_versions AS SELECT * FROM b2b.fixture_saved_versions"); },
      async tx => { await tx.raw("DROP TABLE b2b.document_versions"); await tx.raw("ALTER TABLE b2b.documents ALTER COLUMN source SET DEFAULT 'manual'"); },
    ];
    for (const change of changes) await rollback(async tx => {
      await change(tx); const before = await tx("information_schema.tables").select("table_name").where({ table_schema: "b2b" }).orderBy("table_name");
      await assert.rejects(preflightSchema(tx), /Document schema mismatch/); await assert.rejects(ensureSchema(tx), /Document schema mismatch/);
      assert.deepEqual(await tx("information_schema.tables").select("table_name").where({ table_schema: "b2b" }).orderBy("table_name"), before);
    });
    await ensureSchema(db); assert.equal(await snapshot(db), initialRows);
  });
  await check("all metadata reads and denied paths preserve every business row and original role grant", async () => {
    assert.equal(await snapshot(db), initialRows); assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.ok(await countAudit() > 0);
  });
  return actors;
};
module.exports.snapshot = snapshot;
