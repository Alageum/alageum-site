"use strict";

const { requestFilterQuery } = require("./legacy-query");
const TABLE = "product_attribute_definitions";
const CATEGORY = "alageum_categories";
// Installed Strapi 5.56 identifiers shorten the unique suffix to _uq.
const CATEGORY_KEY = "alageum_categories_transport_id_uq";

function translations(value) {
  // A JSONB text projection is essential: pg's normal JSON parser has already
  // rounded large integers before a DTO mapper gets a chance to preserve them.
  if (typeof value !== "string") throw new TypeError("Filter translations must be JSONB text");
  const parsed = JSON.parse(value, (_key, item, context) =>
    typeof item === "number" && !Number.isSafeInteger(item) && /^-?\d+$/.test(context.source || "")
      ? JSON.rawJSON(context.source) : item);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || JSON.isRawJSON(parsed))
    throw new TypeError("Filter translations must be a stored object");
  return parsed;
}
function filterOut(row) {
  if (!row || typeof row.code !== "string" || typeof row.data_type !== "string" ||
      !(row.unit === null || typeof row.unit === "string"))
    throw new TypeError("Invalid filter metadata DTO");
  return { code: row.code, data_type: row.data_type, unit: row.unit, translations: translations(row.translations) };
}

const columns = ["column_name", "data_type", "is_nullable", "character_maximum_length", "numeric_precision", "numeric_scale", "column_default", "datetime_precision", "collation_name", "is_identity", "is_generated", "domain_name", "domain_schema"];
const shape = {
  id: ["uuid", "NO"], category_id: ["character varying", "NO", 255],
  code: ["character varying", "NO", 120], data_type: ["character varying", "NO", 40], unit: ["character varying", "YES", 50],
  translations: ["jsonb", "NO"], is_filterable: ["boolean", "NO"], is_comparable: ["boolean", "NO"],
};
const constraints = ["PRIMARY KEY (id)", "UNIQUE (category_id, code)", "FOREIGN KEY (category_id) REFERENCES alageum_categories(transport_id)"].sort();
const indexes = ["UNIQUE USING btree (id)", "UNIQUE USING btree (category_id, code)", "USING btree (category_id)"].sort();
const mismatch = (name = TABLE) => { throw new Error(`Catalog filter schema mismatch: ${name} requires reviewed migration`); };
async function relation(db, schema, name) {
  return (await db.raw("SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=?", [schema, name])).rows;
}
function plainColumn(column, spec) {
  return spec && column.data_type === spec[0] && column.is_nullable === spec[1] &&
    column.character_maximum_length === (spec[2] ?? null) && column.numeric_precision === null && column.numeric_scale === null &&
    column.column_default === null && column.datetime_precision === null && column.collation_name === null &&
    column.is_identity === "NO" && column.is_generated === "NEVER" && column.domain_name === null && column.domain_schema === null;
}
async function categoryReference(db, required = true, allowMissingUnique = false) {
  const rows = await relation(db, "public", CATEGORY);
  if (!rows.length && !required) return null;
  if (rows.length !== 1 || rows[0].relkind !== "r" || rows[0].relrowsecurity || rows[0].relforcerowsecurity) mismatch(CATEGORY);
  const target = await db("information_schema.columns").select(columns)
    .where({ table_schema: "public", table_name: CATEGORY, column_name: "transport_id" }).first();
  // Installed Strapi string -> Knex string() -> varchar(255). Strapi's
  // required flag is application validation, so do not rewrite native nullable
  // metadata. Verify the real SQL column and immediate unique key before any FK.
  if (!target || !plainColumn(target, ["character varying", target.is_nullable, 255]) || !["YES", "NO"].includes(target.is_nullable)) mismatch(CATEGORY);
  const namedKey = await relation(db, "public", CATEGORY_KEY);
  if (namedKey.length && (namedKey.length !== 1 || namedKey[0].relkind !== "i")) mismatch(CATEGORY);
  const candidates = (await db.raw(`SELECT ci.relname AS index_name, pg_get_indexdef(i.indexrelid) AS definition,
      i.indisunique, i.indisvalid, i.indisready, i.indimmediate
    FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='transport_id'
    WHERE i.indrelid='public.alageum_categories'::regclass AND (ci.relname=? OR a.attnum=ANY(i.indkey)
      OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=i.indexrelid
        AND d.refclassid='pg_class'::regclass AND d.refobjid=i.indrelid AND d.refobjsubid=a.attnum))`, [CATEGORY_KEY])).rows;
  // Distinguish a genuinely absent initial key from a partial, expression,
  // deferrable, invalid, wrongly named or otherwise drifted existing candidate.
  if (candidates.length === 0) { if (!allowMissingUnique) mismatch(CATEGORY); }
  else if (candidates.length !== 1 || candidates[0].index_name !== CATEGORY_KEY ||
    !candidates[0].indisunique || !candidates[0].indisvalid || !candidates[0].indisready || !candidates[0].indimmediate ||
    candidates[0].definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON (?:public\.)?alageum_categories /, "$1") !== "UNIQUE USING btree (transport_id)") mismatch(CATEGORY);
  // The only initial transition is the reviewed native-owned UNIQUE index.
  // Reject dirty identities before Strapi may create that index or write other
  // bootstrap data; never normalize, drop duplicates, or assign replacement IDs.
  if (await db.withSchema("public").table(CATEGORY).whereNull("transport_id")
    .orWhereRaw("transport_id !~ ?", ["^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"]).first("id")) mismatch(CATEGORY);
  if (await db.withSchema("public").table(CATEGORY).select("transport_id").groupBy("transport_id").havingRaw("count(*) > 1").first()) mismatch(CATEGORY);
  return target;
}
async function verifySchema(db) {
  const target = await categoryReference(db), relations = await relation(db, "b2b", TABLE);
  if (relations.length !== 1 || relations[0].relkind !== "r" || relations[0].relrowsecurity || relations[0].relforcerowsecurity) mismatch();
  const actualColumns = await db("information_schema.columns").select(columns).where({ table_schema: "b2b", table_name: TABLE });
  const expected = { ...shape, category_id: [target.data_type, "NO", target.character_maximum_length] };
  if (actualColumns.length !== Object.keys(expected).length || actualColumns.some(column => !plainColumn(column, expected[column.column_name]))) mismatch();
  const keys = (await db.raw("SELECT pg_get_constraintdef(oid) AS definition, convalidated, condeferrable, condeferred FROM pg_constraint WHERE conrelid=?::regclass", [`b2b.${TABLE}`])).rows;
  if (keys.some(key => !key.convalidated || key.condeferrable || key.condeferred) ||
      JSON.stringify(keys.map(key => key.definition.replace("REFERENCES public.alageum_categories", "REFERENCES alageum_categories")).sort()) !== JSON.stringify(constraints)) mismatch();
  const actualIndexes = (await db.raw("SELECT pg_get_indexdef(indexrelid) AS definition, indisvalid, indisready FROM pg_index WHERE indrelid=?::regclass", [`b2b.${TABLE}`])).rows;
  if (actualIndexes.some(index => !index.indisvalid || !index.indisready) ||
      JSON.stringify(actualIndexes.map(index => index.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON b2b\.product_attribute_definitions /, "$1")).sort()) !== JSON.stringify(indexes)) mismatch();
  if ((await db.raw("SELECT 1 FROM pg_trigger WHERE tgrelid=?::regclass AND NOT tgisinternal UNION ALL SELECT 1 FROM pg_inherits WHERE inhrelid=?::regclass OR inhparent=?::regclass", Array(3).fill(`b2b.${TABLE}`))).rows.length) mismatch();
}
async function preflightSchema(db) {
  // register() runs this before Strapi schema sync. An absent fresh store is
  // additive; an existing category target/store must already be valid.
  const existing = await relation(db, "b2b", TABLE);
  // Older native schemas had application-level unique:true without an SQL
  // unique key. Only an absent definition store permits the additive native
  // column.unique adapter. An existing store always requires its complete FK.
  await categoryReference(db, existing.length > 0, existing.length === 0);
  if (existing.length) await verifySchema(db);
}
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624160)");
    await preflightSchema(tx);
    const target = await categoryReference(tx);
    if (!(await relation(tx, "b2b", TABLE)).length) await tx.schema.withSchema("b2b").createTable(TABLE, t => {
      t.uuid("id").primary();
      t.string("category_id", target.character_maximum_length).notNullable().references("transport_id").inTable(`public.${CATEGORY}`);
      t.string("code", 120).notNullable(); t.string("data_type", 40).notNullable(); t.string("unit", 50);
      t.jsonb("translations").notNullable(); t.boolean("is_filterable").notNullable(); t.boolean("is_comparable").notNullable();
      t.unique(["category_id", "code"]); t.index("category_id");
    });
    await verifySchema(tx);
  });
}
function createCatalogFilters({ db }) {
  const query = () => db({ definition: `b2b.${TABLE}` }).join({ category: `public.${CATEGORY}` }, "category.transport_id", "definition.category_id")
    .where("category.is_published", true).where("definition.is_filterable", true);
  async function list(ctx) {
    const page = requestFilterQuery(ctx);
    const selected = query().where("definition.category_id", page.category_id);
    const total = Number((await selected.clone().count({ count: "definition.id" }).first()).count);
    const rows = page.offset >= BigInt(total) ? [] : await selected
      .select("definition.code", "definition.data_type", "definition.unit", db.raw("definition.translations::text AS translations"))
      .orderBy("definition.id").offset(Number(page.offset)).limit(page.page_size);
    ctx.body = { items: rows.map(filterOut), page: page.page, page_size: page.page_size, total };
  }
  return { list };
}
module.exports = { TABLE, translations, filterOut, categoryReference, preflightSchema, verifySchema, ensureSchema, createCatalogFilters };
