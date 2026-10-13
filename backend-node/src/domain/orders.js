"use strict";

const { AppError } = require("./errors");
const { table, privateResponse, assertActiveContext } = require("./auth");
const { categoryUuid, requestPagination } = require("./support");
const READ = "order.read";

function orderId(value) {
  const id = categoryUuid(value);
  if (!id) throw new AppError("validation_error", "Invalid request", 422, [{ type: "uuid_parsing", loc: ["path", "order_id"], msg: "Input should be a valid UUID", input: value }]);
  return id;
}
// pg returns NUMERIC as strings. Refuse a lossy parser override instead of
// silently accepting a rounded JavaScript Number anywhere in this DTO.
function decimal(value, scale) {
  if (typeof value !== "string" || !new RegExp(`^\\d+\\.\\d{${scale}}$`).test(value)) throw new Error("Order decimal must be an exact PostgreSQL numeric string");
  return value;
}
function configuration(value) {
  // Match Python's arbitrary-size JSON integers without converting their JSON
  // type to strings. Fractional JSON numbers retain the legacy float semantics.
  const result = JSON.parse(value, (_key, item, context) => typeof item === "number" && !Number.isSafeInteger(item) && /^-?\d+$/.test(context.source || "") ? JSON.rawJSON(context.source) : item);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Order configuration must be a stored object");
  return result;
}
function itemOut(row) {
  if (!row.configuration || typeof row.configuration !== "object" || Array.isArray(row.configuration)) throw new Error("Order configuration must be a stored object");
  return { id: row.id, description: row.description, quantity: decimal(row.quantity, 3), unit_price: row.unit_price === null ? null : decimal(row.unit_price, 2), configuration: row.configuration };
}
function orderOut(row, items) {
  return { id: row.id, external_id: row.external_id, number: row.number, currency: row.currency, amount: decimal(row.amount, 2), status: row.status, items: items.map(itemOut) };
}

// Isolated snapshot schema only; no catalog relationship or business workflow
// is inferred. external_product_id is retained as an unused snapshot reference.
const shape = {
  order_statuses: { id: ["uuid", "NO"], code: ["character varying", "NO", 80], label: ["character varying", "NO", 160], sort_order: ["integer", "NO", null, 32, 0] },
  orders: {
    id: ["uuid", "NO"], organization_id: ["uuid", "NO"], external_id: ["character varying", "YES", 200],
    number: ["character varying", "NO", 120], currency: ["character varying", "NO", 3], amount: ["numeric", "NO", null, 18, 2],
    status_id: ["uuid", "NO"], created_at: ["timestamp with time zone", "NO"], updated_at: ["timestamp with time zone", "NO"],
  },
  order_items: {
    id: ["uuid", "NO"], order_id: ["uuid", "NO"], external_product_id: ["character varying", "YES", 200],
    description: ["character varying", "NO", 500], quantity: ["numeric", "NO", null, 18, 3], unit_price: ["numeric", "YES", null, 18, 2], configuration: ["jsonb", "NO"],
  },
};
const constraints = {
  order_statuses: ["PRIMARY KEY (id)", "UNIQUE (code)"],
  orders: ["PRIMARY KEY (id)", "UNIQUE (organization_id, external_id)", "CHECK ((amount >= (0)::numeric))", "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id) ON DELETE CASCADE", "FOREIGN KEY (status_id) REFERENCES b2b.order_statuses(id)"],
  order_items: ["PRIMARY KEY (id)", "CHECK ((quantity > (0)::numeric))", "CHECK (((unit_price IS NULL) OR (unit_price >= (0)::numeric)))", "FOREIGN KEY (order_id) REFERENCES b2b.orders(id) ON DELETE CASCADE"],
};
async function verifySchema(db) {
  for (const [name, expected] of Object.entries(shape)) {
    const mismatch = () => { throw new Error(`Order schema mismatch: ${name} requires reviewed migration`); };
    const relations = (await db.raw("SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='b2b' AND c.relname=?", [name])).rows;
    if (relations.length !== 1 || relations[0].relkind !== "r") mismatch();
    const columns = await db("information_schema.columns").select("column_name", "data_type", "is_nullable", "character_maximum_length", "numeric_precision", "numeric_scale", "column_default").where({ table_schema: "b2b", table_name: name });
    if (columns.length !== Object.keys(expected).length || columns.some(column => {
      const spec = expected[column.column_name];
      return !spec || column.data_type !== spec[0] || column.is_nullable !== spec[1] || column.character_maximum_length !== (spec[2] ?? null) || column.numeric_precision !== (spec[3] ?? null) || column.numeric_scale !== (spec[4] ?? null) || column.column_default !== null;
    })) mismatch();
    const actual = (await db.raw("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=?::regclass", [`b2b.${name}`])).rows.map(row => row.definition).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...constraints[name]].sort())) mismatch();
    const indexes = (await db.raw("SELECT pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i WHERE i.indrelid=?::regclass AND i.indisunique", [`b2b.${name}`])).rows;
    if (indexes.length !== (name === "order_items" ? 1 : 2)) mismatch();
  }
}
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624120)");
    const schema = () => tx.schema.withSchema("b2b");
    if (!(await schema().hasTable("order_statuses"))) await schema().createTable("order_statuses", t => {
      t.uuid("id").primary(); t.string("code", 80).notNullable().unique(); t.string("label", 160).notNullable(); t.integer("sort_order").notNullable();
    });
    if (!(await schema().hasTable("orders"))) await schema().createTable("orders", t => {
      t.uuid("id").primary(); t.uuid("organization_id").notNullable().references("id").inTable("b2b.organizations").onDelete("CASCADE");
      t.string("external_id", 200); t.string("number", 120).notNullable(); t.string("currency", 3).notNullable(); t.decimal("amount", 18, 2).notNullable();
      t.uuid("status_id").notNullable().references("id").inTable("b2b.order_statuses");
      t.timestamp("created_at", { useTz: true }).notNullable(); t.timestamp("updated_at", { useTz: true }).notNullable();
      t.unique(["organization_id", "external_id"]); t.check("amount >= 0", [], "orders_amount_nonnegative"); t.index(["organization_id", "created_at", "id"]);
    });
    if (!(await schema().hasTable("order_items"))) await schema().createTable("order_items", t => {
      t.uuid("id").primary(); t.uuid("order_id").notNullable().references("id").inTable("b2b.orders").onDelete("CASCADE");
      t.string("external_product_id", 200); t.string("description", 500).notNullable(); t.decimal("quantity", 18, 3).notNullable(); t.decimal("unit_price", 18, 2); t.jsonb("configuration").notNullable();
      t.check("quantity > 0", [], "order_items_quantity_positive"); t.check("unit_price IS NULL OR unit_price >= 0", [], "order_items_unit_price_nonnegative"); t.index("order_id");
    });
    await verifySchema(tx);
  });
}

function createOrders({ db, auth, audit }) {
  if (typeof audit !== "function") throw new TypeError("Transactional audit writer is required");
  const query = (tx, organization) => table(tx, "orders").where("orders.organization_id", organization).join("order_statuses AS status", "status.id", "orders.status_id");
  async function readItems(tx, rows) {
    if (!rows.length) return [];
    // Item order is deliberately unspecified, as in the frozen Python route.
    // Strapi globally parses PostgreSQL NUMERIC using parseFloat. Explicit text
    // projections bypass that parser and JSONB's lossy default JSON.parse.
    const items = (await table(tx, "order_items").select("id", "order_id", "description", tx.raw("quantity::text AS quantity, unit_price::text AS unit_price, configuration::text AS configuration")).whereIn("order_id", rows.map(row => row.id)))
      .map(row => ({ ...row, configuration: configuration(row.configuration) }));
    return rows.map(row => orderOut(row, items.filter(item => item.order_id === row.id)));
  }
  async function list(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), page = requestPagination(ctx);
    ctx.body = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, READ);
      const total = Number((await table(tx, "orders").where({ organization_id: fresh.organization_id }).count("* AS count").first()).count);
      const rows = page.offset >= BigInt(total) ? [] : await query(tx, fresh.organization_id).select("orders.id", "orders.external_id", "orders.number", "orders.currency", tx.raw("orders.amount::text AS amount"), "status.code AS status")
        .orderBy("orders.created_at", "desc").orderBy("orders.id").offset(Number(page.offset)).limit(page.page_size);
      return { items: await readItems(tx, rows), page: page.page, page_size: page.page_size, total };
    });
  }
  async function detail(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), id = orderId(ctx.params.id);
    ctx.body = await db.transaction(async tx => {
      const fresh = await assertActiveContext(tx, context, READ);
      const row = await query(tx, fresh.organization_id).where("orders.id", id).select("orders.id", "orders.external_id", "orders.number", "orders.currency", tx.raw("orders.amount::text AS amount"), "status.code AS status").first();
      if (!row) throw new AppError("order_not_found", "Order not found", 404);
      const [result] = await readItems(tx, [row]);
      await audit(tx, ctx, { action: "order.view", actor_user_id: fresh.user.id, organization_id: fresh.organization_id, entity_type: "order", entity_id: id });
      return result;
    });
  }
  return { list, detail };
}
module.exports = { READ, orderId, decimal, configuration, itemOut, orderOut, ensureSchema, verifySchema, createOrders };
