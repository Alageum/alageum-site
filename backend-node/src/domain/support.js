"use strict";

const { randomUUID } = require("node:crypto");
const { AppError } = require("./errors");
const { pagination, requestPagination } = require("./legacy-query");
const { table, privateResponse, assertActiveContext } = require("./auth");
const READ = "ticket.read", CREATE = "ticket.create";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_UUID = /^[0-9a-f]{32}$/i;
const FIELDS = ["category_id", "subject", "message"];
const sensitive = key => /^(?:access_token|api_key|authorization|cookie|password|refresh_token|secret|set_cookie|token)$|_(?:password|secret|token)$/i.test(key.replaceAll("-", "_"));
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive(key) ? "[REDACTED]" : redact(item)]));
  return value;
}
function invalid(details) { throw new AppError("validation_error", "Invalid request", 422, redact(details)); }
function issue(type, loc, msg, input) { return { type, loc, msg, input: loc.some(part => sensitive(String(part))) ? "[REDACTED]" : input }; }

// Pydantic's UUID accepts canonical, simple, braced canonical and lowercase URN
// representations; all normalize to a canonical UUID without changing identity.
function categoryUuid(value) {
  if (typeof value !== "string") return null;
  let normalized = value;
  if (HEX_UUID.test(normalized)) normalized = `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
  else if (normalized.startsWith("{") && normalized.endsWith("}")) normalized = normalized.slice(1, -1);
  else if (normalized.startsWith("urn:uuid:")) normalized = normalized.slice(9);
  return UUID.test(normalized) ? normalized.toLowerCase() : null;
}
function validateTicket(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid([issue("model_attributes_type", ["body"], "Input should be a valid dictionary or object to extract fields from", input)]);
  const errors = [];
  for (const field of FIELDS) {
    if (!Object.hasOwn(input, field)) { errors.push(issue("missing", ["body", field], "Field required", input)); continue; }
    const value = input[field];
    if (field === "category_id") {
      if (!categoryUuid(value)) errors.push(issue(typeof value === "string" ? "uuid_parsing" : "uuid_type", ["body", field], "Input should be a valid UUID", value));
    } else if (typeof value !== "string") errors.push(issue("string_type", ["body", field], "Input should be a valid string", value));
    else {
      const length = Array.from(value).length, max = field === "subject" ? 300 : 10000;
      if (length < 1) errors.push(issue("string_too_short", ["body", field], "String should have at least 1 character", value));
      if (length > max) errors.push(issue("string_too_long", ["body", field], `String should have at most ${max} characters`, value));
    }
  }
  for (const key of Object.keys(input)) if (!FIELDS.includes(key)) errors.push(issue("extra_forbidden", ["body", key], "Extra inputs are not permitted", input[key]));
  if (errors.length) invalid(errors);
  return { category_id: categoryUuid(input.category_id), subject: input.subject, message: input.message };
}

const shape = {
  ticket_categories: { id: ["uuid", "NO", null], code: ["character varying", "NO", 80], label: ["character varying", "NO", 160] },
  ticket_statuses: { id: ["uuid", "NO", null], code: ["character varying", "NO", 80], label: ["character varying", "NO", 160] },
  tickets: {
    id: ["uuid", "NO", null], organization_id: ["uuid", "NO", null], created_by_id: ["uuid", "NO", null],
    category_id: ["uuid", "NO", null], status_id: ["uuid", "NO", null], subject: ["character varying", "NO", 300],
    created_at: ["timestamp with time zone", "NO", null], updated_at: ["timestamp with time zone", "NO", null],
  },
  ticket_messages: {
    id: ["uuid", "NO", null], ticket_id: ["uuid", "NO", null], author_user_id: ["uuid", "YES", null],
    body: ["text", "NO", null], source: ["character varying", "NO", 60],
    created_at: ["timestamp with time zone", "NO", null], updated_at: ["timestamp with time zone", "NO", null],
  },
};
const constraints = {
  ticket_categories: ["PRIMARY KEY (id)", "UNIQUE (code)"],
  ticket_statuses: ["PRIMARY KEY (id)", "UNIQUE (code)"],
  tickets: ["PRIMARY KEY (id)", "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id)", "FOREIGN KEY (created_by_id) REFERENCES b2b.users(id)", "FOREIGN KEY (category_id) REFERENCES b2b.ticket_categories(id)", "FOREIGN KEY (status_id) REFERENCES b2b.ticket_statuses(id)"],
  ticket_messages: ["PRIMARY KEY (id)", "FOREIGN KEY (ticket_id) REFERENCES b2b.tickets(id) ON DELETE CASCADE", "FOREIGN KEY (author_user_id) REFERENCES b2b.users(id)"],
};
async function verifySchema(db) {
  for (const [name, expected] of Object.entries(shape)) {
    const mismatch = () => { throw new Error(`Support schema mismatch: ${name} requires reviewed migration`); };
    const relations = (await db.raw("SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='b2b' AND c.relname=?", [name])).rows;
    if (relations.length !== 1 || relations[0].relkind !== "r") mismatch();
    const columns = await db("information_schema.columns").select("column_name", "data_type", "is_nullable", "character_maximum_length", "column_default").where({ table_schema: "b2b", table_name: name });
    if (columns.length !== Object.keys(expected).length || columns.some(column => {
      const spec = expected[column.column_name];
      return !spec || column.data_type !== spec[0] || column.is_nullable !== spec[1] || column.character_maximum_length !== spec[2] || column.column_default !== null;
    })) mismatch();
    const actual = (await db.raw("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=?::regclass", [`b2b.${name}`])).rows.map(row => row.definition).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...constraints[name]].sort())) mismatch();
    const indexes = (await db.raw("SELECT pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indrelid=?::regclass AND i.indisunique", [`b2b.${name}`])).rows;
    if (indexes.length !== (name === "ticket_categories" || name === "ticket_statuses" ? 2 : 1)) mismatch();
  }
}
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624110)");
    const schema = () => tx.schema.withSchema("b2b");
    for (const name of ["ticket_categories", "ticket_statuses"]) if (!(await schema().hasTable(name))) await schema().createTable(name, t => {
      t.uuid("id").primary(); t.string("code", 80).notNullable().unique(); t.string("label", 160).notNullable();
    });
    const timestamps = t => { t.timestamp("created_at", { useTz: true }).notNullable(); t.timestamp("updated_at", { useTz: true }).notNullable(); };
    if (!(await schema().hasTable("tickets"))) await schema().createTable("tickets", t => {
      t.uuid("id").primary();
      t.uuid("organization_id").notNullable().references("id").inTable("b2b.organizations");
      t.uuid("created_by_id").notNullable().references("id").inTable("b2b.users");
      t.uuid("category_id").notNullable().references("id").inTable("b2b.ticket_categories");
      t.uuid("status_id").notNullable().references("id").inTable("b2b.ticket_statuses");
      t.string("subject", 300).notNullable(); timestamps(t); t.index(["organization_id", "created_at", "id"]);
    });
    if (!(await schema().hasTable("ticket_messages"))) await schema().createTable("ticket_messages", t => {
      t.uuid("id").primary(); t.uuid("ticket_id").notNullable().references("id").inTable("b2b.tickets").onDelete("CASCADE");
      t.uuid("author_user_id").references("id").inTable("b2b.users"); t.text("body").notNullable(); t.string("source", 60).notNullable(); timestamps(t);
    });
    await verifySchema(tx);
  });
}
const summary = row => ({ id: row.id, subject: row.subject, category: row.category, status: row.status });
function createSupport({ db, auth, audit }) {
  if (typeof audit !== "function") throw new TypeError("Transactional audit writer is required");
  async function categories(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, CREATE), page = requestPagination(ctx);
    ctx.body = await db.transaction(async tx => {
      await assertActiveContext(tx, context, CREATE);
      const total = Number((await table(tx, "ticket_categories").count("* AS count").first()).count);
      const items = page.offset >= BigInt(total) ? [] : await table(tx, "ticket_categories").select("id", "code", "label").orderBy("code").orderBy("id").offset(Number(page.offset)).limit(page.page_size);
      return { items, page: page.page, page_size: page.page_size, total };
    });
  }
  async function list(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), page = requestPagination(ctx);
    ctx.body = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, READ);
      const query = () => table(tx, "tickets").where("tickets.organization_id", fresh.organization_id);
      const total = Number((await query().count("* AS count").first()).count);
      const items = page.offset >= BigInt(total) ? [] : await query()
        .join("ticket_categories AS category", "category.id", "tickets.category_id")
        .join("ticket_statuses AS status", "status.id", "tickets.status_id")
        .select("tickets.id", "tickets.subject", "category.code AS category", "status.code AS status")
        .orderBy("tickets.created_at", "desc").orderBy("tickets.id").offset(Number(page.offset)).limit(page.page_size);
      return { items: items.map(summary), page: page.page, page_size: page.page_size, total };
    });
  }
  async function create(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, CREATE), input = validateTicket(ctx.request.body);
    ctx.body = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, CREATE);
      const category = await table(tx, "ticket_categories").where({ id: input.category_id }).forShare().first();
      const status = await table(tx, "ticket_statuses").where({ code: "new" }).forShare().first();
      if (!category || !status) throw new AppError("ticket_configuration_missing", "Ticket category or initial status missing", 422);
      // PostgreSQL cannot preserve ill-formed UTF-16. Fail atomically rather than
      // letting the driver silently replace a lone surrogate with U+FFFD.
      if (!input.subject.isWellFormed() || !input.message.isWellFormed()) throw new Error("Ticket text cannot be represented as UTF-8");
      const id = randomUUID(), timestamp = new Date();
      await table(tx, "tickets").insert({ id, organization_id: fresh.organization_id, created_by_id: fresh.user.id,
        category_id: category.id, status_id: status.id, subject: input.subject, created_at: timestamp, updated_at: timestamp });
      await table(tx, "ticket_messages").insert({ id: randomUUID(), ticket_id: id, author_user_id: fresh.user.id,
        body: input.message, source: "portal", created_at: timestamp, updated_at: timestamp });
      await audit(tx, ctx, { action: CREATE, actor_user_id: fresh.user.id, organization_id: fresh.organization_id, entity_type: "ticket", entity_id: id });
      return summary({ id, subject: input.subject, category: category.code, status: status.code });
    });
    ctx.status = 201;
  }
  async function seedDemo(config) {
    if (!config.seedDemo) return;
    if (!["test", "development"].includes(config.env)) throw new Error("Demo ticket references require a non-production environment");
    await db.transaction(async tx => {
      for (const [name, code, label] of [["ticket_categories", "other", "DEV Other"], ["ticket_statuses", "new", "DEV New"]])
        await table(tx, name).insert({ id: randomUUID(), code, label }).onConflict("code").ignore();
    });
  }
  return { categories, list, create, seedDemo };
}
module.exports = { READ, CREATE, categoryUuid, validateTicket, pagination, requestPagination, verifySchema, ensureSchema, summary, createSupport };
