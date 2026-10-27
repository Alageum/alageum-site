"use strict";

const { AppError } = require("./errors");
const { table, privateResponse, assertActiveContext } = require("./auth");
const { categoryUuid, requestPagination } = require("./support");
const READ = "document.read", CREATE = "document.create";
const { randomUUID } = require("node:crypto");
const { BACKEND, validateInput, createDocumentStorage } = require("./document-files");

function documentId(value) {
  const id = categoryUuid(value);
  if (!id) throw new AppError("validation_error", "Invalid request", 422, [{ type: "uuid_parsing", loc: ["path", "document_id"], msg: "Input should be a valid UUID", input: value }]);
  return id;
}
function documentOut(row) {
  // Stored types follow the legacy Pydantic DTO. Fail closed if a driver or
  // unsupported schema change produces an invalid success payload.
  if (typeof row.id !== "string" || !categoryUuid(row.id) ||
      !["title", "source", "type_code"].every(key => typeof row[key] === "string") ||
      !["number", "external_id"].every(key => row[key] === null || typeof row[key] === "string") ||
      !(row.latest_file_id === null || typeof row.latest_file_id === "string" && categoryUuid(row.latest_file_id)))
    throw new TypeError("Invalid document metadata DTO");
  return { id: row.id, number: row.number, title: row.title, external_id: row.external_id, source: row.source, type_code: row.type_code, latest_file_id: row.latest_file_id };
}

// Exact metadata-only legacy schema through c24e3a19f4b1. UUID, timestamps,
// source=manual and is_active=true are ORM defaults, never server defaults.
const timestamps = { created_at: ["timestamp with time zone", "NO"], updated_at: ["timestamp with time zone", "NO"] };
const shape = {
  document_types: { id: ["uuid", "NO"], code: ["character varying", "NO", 100], name: ["character varying", "NO", 200], is_active: ["boolean", "NO"] },
  documents: { id: ["uuid", "NO"], organization_id: ["uuid", "NO"], type_id: ["uuid", "NO"], number: ["character varying", "YES", 120], title: ["character varying", "NO", 300], external_id: ["character varying", "YES", 200], source: ["character varying", "NO", 60], ...timestamps },
  file_objects: { id: ["uuid", "NO"], organization_id: ["uuid", "YES"], storage_key: ["character varying", "NO", 500], original_name: ["character varying", "NO", 255], content_type: ["character varying", "NO", 150], size_bytes: ["bigint", "NO", null, 64, 0], checksum_sha256: ["character varying", "NO", 64], storage_backend: ["character varying", "NO", 40], ...timestamps },
  document_versions: { id: ["uuid", "NO"], organization_id: ["uuid", "NO"], document_id: ["uuid", "NO"], file_id: ["uuid", "NO"], version: ["integer", "NO", null, 32, 0], ...timestamps },
};
const constraints = {
  document_types: ["PRIMARY KEY (id)", "UNIQUE (code)"],
  documents: ["PRIMARY KEY (id)", "UNIQUE (organization_id, source, external_id)", "UNIQUE (id, organization_id)", "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id) ON DELETE CASCADE", "FOREIGN KEY (type_id) REFERENCES b2b.document_types(id)"],
  file_objects: ["PRIMARY KEY (id)", "UNIQUE (storage_key)", "UNIQUE (id, organization_id)", "CHECK ((size_bytes >= 0))", "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id) ON DELETE CASCADE"],
  document_versions: ["PRIMARY KEY (id)", "UNIQUE (document_id, version)", "CHECK ((version > 0))", "FOREIGN KEY (document_id, organization_id) REFERENCES b2b.documents(id, organization_id) ON DELETE CASCADE", "FOREIGN KEY (file_id, organization_id) REFERENCES b2b.file_objects(id, organization_id)"],
};
const indexes = {
  document_types: ["UNIQUE USING btree (id)", "UNIQUE USING btree (code)"],
  documents: ["UNIQUE USING btree (id)", "UNIQUE USING btree (organization_id, source, external_id)", "UNIQUE USING btree (id, organization_id)", "USING btree (organization_id)", "USING btree (external_id)"],
  file_objects: ["UNIQUE USING btree (id)", "UNIQUE USING btree (storage_key)", "UNIQUE USING btree (id, organization_id)", "USING btree (organization_id)"],
  document_versions: ["UNIQUE USING btree (id)", "UNIQUE USING btree (document_id, version)", "USING btree (organization_id)", "USING btree (document_id)"],
};
async function relation(db, name) {
  return (await db.raw("SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='b2b' AND c.relname=?", [name])).rows;
}
async function verifyTable(db, name) {
  const mismatch = () => { throw new Error(`Document schema mismatch: ${name} requires reviewed migration`); };
  const relations = await relation(db, name), expected = shape[name];
  if (relations.length !== 1 || relations[0].relkind !== "r" || relations[0].relrowsecurity || relations[0].relforcerowsecurity) mismatch();
  const columns = await db("information_schema.columns").select("column_name", "data_type", "is_nullable", "character_maximum_length", "numeric_precision", "numeric_scale", "column_default", "datetime_precision", "collation_name", "is_identity", "is_generated", "domain_name", "domain_schema").where({ table_schema: "b2b", table_name: name });
  if (columns.length !== Object.keys(expected).length || columns.some(column => {
    const spec = expected[column.column_name];
    return !spec || column.data_type !== spec[0] || column.is_nullable !== spec[1] || column.character_maximum_length !== (spec[2] ?? null) || column.numeric_precision !== (spec[3] ?? null) || column.numeric_scale !== (spec[4] ?? null) || column.column_default !== null || column.datetime_precision !== (spec[0] === "timestamp with time zone" ? 6 : null) || column.collation_name !== null || column.is_identity !== "NO" || column.is_generated !== "NEVER" || column.domain_name !== null || column.domain_schema !== null;
  })) mismatch();
  const actual = (await db.raw("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=?::regclass", [`b2b.${name}`])).rows.map(row => row.definition).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...constraints[name]].sort())) mismatch();
  const actualIndexes = (await db.raw("SELECT pg_get_indexdef(indexrelid) AS definition, indisvalid, indisready FROM pg_index WHERE indrelid=?::regclass", [`b2b.${name}`])).rows;
  if (actualIndexes.some(row => !row.indisvalid || !row.indisready) || JSON.stringify(actualIndexes.map(row => row.definition.replace(new RegExp(`^CREATE (UNIQUE )?INDEX \\S+ ON b2b\\.${name} `), "$1")).sort()) !== JSON.stringify([...indexes[name]].sort())) mismatch();
  if ((await db.raw("SELECT 1 FROM pg_trigger WHERE tgrelid=?::regclass AND NOT tgisinternal UNION ALL SELECT 1 FROM pg_inherits WHERE inhrelid=?::regclass OR inhparent=?::regclass", Array(3).fill(`b2b.${name}`))).rows.length) mismatch();
}
async function verifySchema(db) {
  for (const name of Object.keys(shape)) await verifyTable(db, name);
}
async function preflightSchema(db) {
  // Before ANY Strapi/Page synchronization. Missing tables are additive, but
  // every existing relation must match; in particular version ties are invalid.
  for (const name of Object.keys(shape)) if ((await relation(db, name)).length) await verifyTable(db, name);
}
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624140)");
    await preflightSchema(tx);
    const schema = () => tx.schema.withSchema("b2b");
    const stamp = t => { t.timestamp("created_at", { useTz: true, precision: 6 }).notNullable(); t.timestamp("updated_at", { useTz: true, precision: 6 }).notNullable(); };
    if (!(await relation(tx, "document_types")).length) await schema().createTable("document_types", t => {
      t.uuid("id").primary(); t.string("code", 100).notNullable().unique(); t.string("name", 200).notNullable(); t.boolean("is_active").notNullable();
    });
    if (!(await relation(tx, "documents")).length) await schema().createTable("documents", t => {
      t.uuid("id").primary(); t.uuid("organization_id").notNullable().references("id").inTable("b2b.organizations").onDelete("CASCADE");
      t.uuid("type_id").notNullable().references("id").inTable("b2b.document_types");
      t.string("number", 120); t.string("title", 300).notNullable(); t.string("external_id", 200); t.string("source", 60).notNullable(); stamp(t);
      t.unique(["organization_id", "source", "external_id"]); t.unique(["id", "organization_id"]); t.index("organization_id"); t.index("external_id");
    });
    if (!(await relation(tx, "file_objects")).length) await schema().createTable("file_objects", t => {
      t.uuid("id").primary(); t.uuid("organization_id").references("id").inTable("b2b.organizations").onDelete("CASCADE");
      t.string("storage_key", 500).notNullable().unique(); t.string("original_name", 255).notNullable(); t.string("content_type", 150).notNullable();
      t.bigInteger("size_bytes").notNullable(); t.string("checksum_sha256", 64).notNullable(); t.string("storage_backend", 40).notNullable(); stamp(t);
      t.unique(["id", "organization_id"]); t.check("size_bytes >= 0", [], "file_objects_size_nonnegative"); t.index("organization_id");
    });
    if (!(await relation(tx, "document_versions")).length) await schema().createTable("document_versions", t => {
      t.uuid("id").primary(); t.uuid("organization_id").notNullable(); t.uuid("document_id").notNullable(); t.uuid("file_id").notNullable(); t.integer("version").notNullable(); stamp(t);
      t.unique(["document_id", "version"]); t.check("version > 0", [], "document_versions_version_positive");
      t.foreign(["document_id", "organization_id"]).references(["id", "organization_id"]).inTable("b2b.documents").onDelete("CASCADE");
      t.foreign(["file_id", "organization_id"]).references(["id", "organization_id"]).inTable("b2b.file_objects");
      t.index("organization_id"); t.index("document_id");
    });
    await verifySchema(tx);
  });
}

function createDocuments({ db, auth, audit, storage = createDocumentStorage() }) {
  if (typeof audit !== "function") throw new TypeError("Transactional audit writer is required");
  const query = (tx, organization) => table(tx, "documents").where("documents.organization_id", organization)
    .join("document_types AS type", "type.id", "documents.type_id")
    .select("documents.id", "documents.number", "documents.title", "documents.external_id", "documents.source", "type.code AS type_code",
      tx.raw("(SELECT v.file_id FROM b2b.document_versions AS v WHERE v.document_id=documents.id AND v.organization_id=documents.organization_id ORDER BY v.version DESC LIMIT 1) AS latest_file_id"));
  async function list(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), page = requestPagination(ctx);
    ctx.body = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, READ);
      const total = Number((await table(tx, "documents").where({ organization_id: fresh.organization_id }).count("* AS count").first()).count);
      const rows = page.offset >= BigInt(total) ? [] : await query(tx, fresh.organization_id)
        .orderBy("documents.created_at", "desc").orderBy("documents.id").offset(Number(page.offset)).limit(page.page_size);
      return { items: rows.map(documentOut), page: page.page, page_size: page.page_size, total };
    });
  }
  async function detail(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), id = documentId(ctx.params.id);
    const row = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, READ);
      const item = await query(tx, fresh.organization_id).where("documents.id", id).first();
      if (!item) throw new AppError("document_not_found", "Document not found", 404);
      await audit(tx, ctx, { action: "document.view", actor_user_id: fresh.user.id, organization_id: fresh.organization_id, entity_type: "document", entity_id: id });
      return item;
    });
    // The legacy route commits document.view before response serialization.
    // Preserve that ordering: audit failures roll back, a later DTO failure does
    // not erase the completed view event. Business rows are never modified.
    ctx.body = documentOut(row);
  }
  async function fileContext(tx, ctx, context, permission) {
    await auth.assertActiveSession(tx, ctx, context.user.id);
    return assertActiveContext(tx, context, permission);
  }
  async function types(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, CREATE);
    ctx.body = await db.transaction(async tx => {
      await fileContext(tx, ctx, context, CREATE);
      const rows = await table(tx, "document_types").where({ is_active: true }).select("code", "name").orderBy("code");
      const builtin = await table(tx, "document_types").where({ code: "manual_attachment" }).first();
      return { items: builtin ? rows : [...rows, { code: "manual_attachment", name: "Файл" }] };
    });
  }
  async function upload(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, CREATE), input = validateInput(ctx);
    await storage.ready();
    // Check type and current access before the expensive scanner, then check again
    // within the committing transaction to reject revocation during scanning.
    await db.transaction(async tx => {
      await fileContext(tx, ctx, context, CREATE);
      const type = await table(tx, "document_types").where({ code: input.type_code }).first();
      if ((!type && input.type_code !== "manual_attachment") || (type && !type.is_active)) throw new AppError("document_type_unavailable", "Document type is unavailable", 422);
    });
    const admitted = await storage.admit(input.file);
    const storageKey = await storage.store(admitted);
    try {
      ctx.body = await db.transaction(async tx => {
        const fresh = await fileContext(tx, ctx, context, CREATE);
        if (input.type_code === "manual_attachment") await table(tx, "document_types").insert({ id: randomUUID(), code: "manual_attachment", name: "Файл", is_active: true }).onConflict("code").ignore();
        const type = await table(tx, "document_types").where({ code: input.type_code, is_active: true }).forShare().first();
        if (!type) throw new AppError("document_type_unavailable", "Document type is unavailable", 422);
        const id = randomUUID(), fileId = randomUUID(), now = new Date(), organization = fresh.organization_id;
        await table(tx, "documents").insert({ id, organization_id: organization, type_id: type.id, title: input.title, number: input.number, external_id: null, source: "manual", created_at: now, updated_at: now });
        await table(tx, "file_objects").insert({ id: fileId, organization_id: organization, storage_key: storageKey, original_name: admitted.name, content_type: admitted.mime, size_bytes: admitted.bytes.length, checksum_sha256: admitted.checksum, storage_backend: BACKEND, created_at: now, updated_at: now });
        await table(tx, "document_versions").insert({ id: randomUUID(), organization_id: organization, document_id: id, file_id: fileId, version: 1, created_at: now, updated_at: now });
        await audit(tx, ctx, { action: "document.upload", actor_user_id: fresh.user.id, organization_id: organization, entity_type: "document", entity_id: id });
        return documentOut({ id, title: input.title, number: input.number, external_id: null, source: "manual", type_code: type.code, latest_file_id: fileId });
      });
    } catch (error) {
      // Never make a failed transaction's file downloadable. An unlink failure is
      // surfaced as failure and leaves a private orphan for operator reconciliation.
      await storage.remove(storageKey);
      throw error;
    }
    ctx.status = 201;
  }
  async function download(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), id = documentId(ctx.params.id);
    const result = await db.transaction(async tx => {
      const fresh = await fileContext(tx, ctx, context, READ);
      const document = await query(tx, fresh.organization_id).where("documents.id", id).first();
      if (!document || !document.latest_file_id) throw new AppError("document_not_found", "Document not found", 404);
      const file = await table(tx, "file_objects").where({ id: document.latest_file_id, organization_id: fresh.organization_id }).first();
      if (!file) throw new AppError("document_not_found", "Document not found", 404);
      const bytes = await storage.read(file);
      await audit(tx, ctx, { action: "document.download", actor_user_id: fresh.user.id, organization_id: fresh.organization_id, entity_type: "document", entity_id: id });
      return { bytes, file };
    });
    ctx.set("Content-Type", result.file.content_type);
    ctx.set("Content-Length", String(result.bytes.length));
    ctx.set("X-Content-Type-Options", "nosniff");
    ctx.set("Content-Security-Policy", "sandbox; default-src 'none'");
    ctx.set("Content-Disposition", "attachment; filename=\"document\"; filename*=UTF-8''" + encodeURIComponent(result.file.original_name).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()));
    ctx.body = result.bytes;
  }
  return { list, detail, types, upload, download };
}
module.exports = { READ, CREATE, documentId, documentOut, preflightSchema, ensureSchema, verifySchema, createDocuments };
