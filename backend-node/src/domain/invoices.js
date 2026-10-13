"use strict";

const { table, privateResponse, assertActiveContext } = require("./auth");
const { requestPagination } = require("./support");
const READ = "finance.read";

function amount(value) {
  // Strapi installs a global parseFloat parser for NUMERIC. Only explicit
  // PostgreSQL text projections can preserve the legacy Decimal JSON string.
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value))
    throw new Error("Invoice amount must be an exact PostgreSQL numeric string");
  return value;
}
function invoiceOut(row) {
  return { id: row.id, number: row.number ?? null, amount: amount(row.amount), currency: row.currency, status: row.status ?? null, source: row.source };
}

// SQLAlchemy's UUID/timestamp/source defaults are client-side only. Both legacy
// foreign keys are single-column NO ACTION; order_id is never read or joined.
const shape = {
  id: ["uuid", "NO"], organization_id: ["uuid", "NO"], order_id: ["uuid", "YES"],
  number: ["character varying", "NO", 120], amount: ["numeric", "NO", null, 18, 2], currency: ["character varying", "NO", 3],
  status: ["character varying", "NO", 60], source: ["character varying", "NO", 60], external_id: ["character varying", "YES", 200],
  created_at: ["timestamp with time zone", "NO"], updated_at: ["timestamp with time zone", "NO"],
};
const constraints = ["PRIMARY KEY (id)", "UNIQUE (organization_id, source, external_id)", "CHECK ((amount >= (0)::numeric))", "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id)", "FOREIGN KEY (order_id) REFERENCES b2b.orders(id)"].sort();
const indexes = ["UNIQUE USING btree (id)", "UNIQUE USING btree (organization_id, source, external_id)", "USING btree (organization_id)", "USING btree (order_id)", "USING btree (organization_id, created_at)"].sort();
const mismatch = () => { throw new Error("Invoice schema mismatch: invoices requires reviewed migration"); };
async function relation(db) {
  return (await db.raw("SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='b2b' AND c.relname='invoices'")).rows;
}
async function verifySchema(db) {
  const relations = await relation(db);
  if (relations.length !== 1 || relations[0].relkind !== "r" || relations[0].relrowsecurity || relations[0].relforcerowsecurity) mismatch();
  const columns = await db("information_schema.columns").select("column_name", "data_type", "is_nullable", "character_maximum_length", "numeric_precision", "numeric_scale", "column_default", "datetime_precision", "collation_name", "is_identity", "is_generated").where({ table_schema: "b2b", table_name: "invoices" });
  if (columns.length !== Object.keys(shape).length || columns.some(column => {
    const spec = shape[column.column_name];
    return !spec || column.data_type !== spec[0] || column.is_nullable !== spec[1] || column.character_maximum_length !== (spec[2] ?? null) || column.numeric_precision !== (spec[3] ?? null) || column.numeric_scale !== (spec[4] ?? null) || column.column_default !== null || column.datetime_precision !== (spec[0] === "timestamp with time zone" ? 6 : null) || column.collation_name !== null || column.is_identity !== "NO" || column.is_generated !== "NEVER";
  })) mismatch();
  const actual = (await db.raw("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='b2b.invoices'::regclass")).rows.map(row => row.definition).sort();
  if (JSON.stringify(actual) !== JSON.stringify(constraints)) mismatch();
  const actualIndexes = (await db.raw("SELECT pg_get_indexdef(indexrelid) AS definition, indisvalid, indisready FROM pg_index WHERE indrelid='b2b.invoices'::regclass")).rows;
  if (actualIndexes.some(row => !row.indisvalid || !row.indisready) || JSON.stringify(actualIndexes.map(row => row.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON b2b\.invoices /, "$1")).sort()) !== JSON.stringify(indexes)) mismatch();
  if ((await db.raw("SELECT 1 FROM pg_trigger WHERE tgrelid='b2b.invoices'::regclass AND NOT tgisinternal UNION ALL SELECT 1 FROM pg_inherits WHERE inhrelid='b2b.invoices'::regclass OR inhparent='b2b.invoices'::regclass")).rows.length) mismatch();
}
async function preflightSchema(db) {
  // Called before any application schema synchronization or bootstrap writes.
  // Missing is the sole additive case; an existing relation must match exactly.
  if ((await relation(db)).length) await verifySchema(db);
}
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624130)");
    if (!(await relation(tx)).length) await tx.schema.withSchema("b2b").createTable("invoices", t => {
      t.uuid("id").primary(); t.uuid("organization_id").notNullable().references("id").inTable("b2b.organizations");
      t.uuid("order_id").references("id").inTable("b2b.orders");
      t.string("number", 120).notNullable(); t.decimal("amount", 18, 2).notNullable(); t.string("currency", 3).notNullable();
      t.string("status", 60).notNullable(); t.string("source", 60).notNullable(); t.string("external_id", 200);
      t.timestamp("created_at", { useTz: true }).notNullable(); t.timestamp("updated_at", { useTz: true }).notNullable();
      t.unique(["organization_id", "source", "external_id"]); t.check("amount >= 0", [], "invoices_amount_nonnegative");
      t.index("organization_id"); t.index("order_id"); t.index(["organization_id", "created_at"]);
    });
    await verifySchema(tx);
  });
}
function createInvoices({ db, auth }) {
  async function list(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), page = requestPagination(ctx);
    ctx.body = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, READ);
      const query = () => table(tx, "invoices").where({ organization_id: fresh.organization_id });
      const total = Number((await query().count("* AS count").first()).count);
      const rows = page.offset >= BigInt(total) ? [] : await query().select("id", "number", tx.raw("amount::text AS amount"), "currency", "status", "source")
        .orderBy("created_at", "desc").orderBy("id").offset(Number(page.offset)).limit(page.page_size);
      return { items: rows.map(invoiceOut), page: page.page, page_size: page.page_size, total };
    });
  }
  return { list };
}
module.exports = { READ, amount, invoiceOut, preflightSchema, ensureSchema, verifySchema, createInvoices };
