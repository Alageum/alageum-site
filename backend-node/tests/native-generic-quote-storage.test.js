"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const schema = require("../src/domain/quote-schema");

// Narrow register/post-sync API fixture. Real pg_catalog definitions and native
// lifecycle/DDL retention are covered by native-generic-quote-storage.cjs.
function emptyStartup() {
  const state = { objects: [], product: false, identity: "owned-test", writes: [] };
  const ordinary = { relkind: "r", relpersistence: "p", relrowsecurity: false, relforcerowsecurity: false, relispartition: false, relreplident: "d" };
  const column = { column_name: "transport_id", data_type: "character varying", is_nullable: "YES", character_maximum_length: 255,
    numeric_precision: null, numeric_scale: null, column_default: null, datetime_precision: null, collation_name: null,
    is_identity: "NO", is_generated: "NEVER", generation_expression: null, domain_name: null, domain_schema: null };
  const db = name => {
    assert.equal(name, "information_schema.columns");
    return { select() { return this; }, where() { return this; }, async first() { return column; } };
  };
  db.withSchema = () => ({ table() { return this; }, whereNull() { return this; }, orWhereRaw() { return this; }, select() { return this; }, groupBy() { return this; }, havingRaw() { return this; }, async first() { return undefined; } });
  db.raw = async (sql, args) => {
    if (sql.startsWith("SELECT c.relkind")) return { rows: args[1] === "alageum_products" && state.product ? [ordinary] : [] };
    if (sql.startsWith("SELECT current_database")) return { rows: [{ identity: state.identity }] };
    if (sql.startsWith("SELECT 1 FROM pg_namespace")) return { rows: state.objects };
    if (sql.startsWith("SELECT 1 FROM pg_trigger")) return { rows: [] };
    if (sql.startsWith("SELECT ci.relname")) return { rows: [{ name: "alageum_products_transport_id_uq", definition: "CREATE UNIQUE INDEX alageum_products_transport_id_uq ON public.alageum_products USING btree (transport_id)", indisunique: true, indisvalid: true, indisready: true, indimmediate: true, indislive: true, indnullsnotdistinct: false }] };
    if (sql.startsWith("SELECT n.nspname")) return { rows: [] };
    if (sql.startsWith("SELECT pg_advisory")) return { rows: [] };
    state.writes.push(sql); throw new Error("Unexpected fixture write");
  };
  db.transaction = callback => callback(db);
  return { db, state };
}

test("native product ordinary-column NULL generation metadata passes fresh post-sync verification", async () => {
  const { db, state } = emptyStartup();
  await schema.preflightSchema(db);
  state.product = true;
  await schema.verifyAfterSync(db);
  assert.deepEqual(state.writes, []);
  schema.invalidateAdmission(db);
  await assert.rejects(schema.verifyAfterSync(db), /missing pre-sync fresh-store admission/);
});
test("fresh admission is database-bound, invalidated by failure, and never inferred from an existing empty store", async () => {
  const { db, state } = emptyStartup();
  state.objects = [{ existing: true }];
  await assert.rejects(schema.preflightSchema(db), /existing store without candidate/);
  state.objects = []; await schema.preflightSchema(db); state.product = true;
  state.identity = "another-database";
  await assert.rejects(schema.verifyAfterSync(db), /database identity changed/);
  state.identity = "owned-test";
  await assert.rejects(schema.verifyAfterSync(db), /missing pre-sync fresh-store admission/);
  assert.deepEqual(state.writes, []);
});
test("failed initial ensure consumes fresh admission before a caller can retry", async () => {
  const { db, state } = emptyStartup();
  await schema.preflightSchema(db);
  await assert.rejects(schema.ensureSchema(db), /alageum_products/);
  state.product = true;
  await assert.rejects(schema.ensureSchema(db), /missing pre-sync fresh-store admission/);
  assert.deepEqual(state.writes, []);
});
test("pinned native product key naming matches the native-owned adapter", () => {
  const { identifiers } = require(path.join(path.dirname(require.resolve("@strapi/database")), "utils/identifiers/index.js"));
  assert.equal(identifiers.getUniqueIndexName(["alageum_products", "transport_id"]), "alageum_products_transport_id_uq");
  const product = require("../src/api/product/content-types/product/schema.json");
  assert.equal(product.attributes.transport_id.column.unique, true);
  assert.equal(product.options.draftAndPublish, false);
});
