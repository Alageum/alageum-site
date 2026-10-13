"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { filterOut, translations } = require("../src/domain/catalog-filters");
const { pagination } = require("../src/domain/catalog");

test("filter metadata retains exactly four fields and unrestricted legacy strings/objects", () => {
  const row = { code: "  Δ\n", data_type: "unknown vendor type", unit: "\n μΩ ", translations: '{"unknown-locale":{"options":[null,false,3.125]},"empty":""}', id: "private", category_id: "private", is_filterable: true, is_comparable: false, options: ["not exposed"] };
  assert.deepEqual(filterOut(row), { code: row.code, data_type: row.data_type, unit: row.unit, translations: { "unknown-locale": { options: [null, false, 3.125] }, empty: "" } });
  assert.deepEqual(filterOut({ code: "", data_type: "", unit: null, translations: "{}" }), { code: "", data_type: "", unit: null, translations: {} });
  assert.equal(filterOut({ ...row, unit: "" }).unit, "");
});
test("filter translations preserve nested arbitrary-size integer JSON numbers and ordinary fractional semantics", () => {
  const raw = '{"large":9007199254740993,"negative":-90071992547409931234567890123456789,"nested":[{"integer":99999999999999999999999999999999999999999999999}],"fraction":1.234567890123456789,"safe":9007199254740991}';
  const wire = JSON.stringify(translations(raw));
  for (const integer of ["9007199254740993", "-90071992547409931234567890123456789", "99999999999999999999999999999999999999999999999"]) assert.ok(wire.includes(`:${integer}`));
  assert.ok(wire.includes('"fraction":1.2345678901234567'));
  assert.equal(translations(raw).safe, 9007199254740991);
});
test("malformed selected filter metadata throws without coercion, double parsing or invented defaults", () => {
  const row = { code: "fixture", data_type: "arbitrary", unit: null, translations: "{}" };
  for (const field of ["code", "data_type", "unit", "translations"]) {
    const missing = { ...row }; delete missing[field]; assert.throws(() => filterOut(missing));
    assert.throws(() => filterOut({ ...row, [field]: 12 }));
  }
  for (const value of [null, [], {}, "null", "[]", '"{}"', '"plain string"', "true", "123", "9007199254740993", "{"])
    assert.throws(() => filterOut({ ...row, translations: value }));
  for (const field of ["code", "data_type"]) assert.throws(() => filterOut({ ...row, [field]: null }));
});
test("native catalog pagination retains default20 and original validation independently of compatibility reads", () => {
  assert.deepEqual(pagination({}), { page: 1, page_size: 20 });
  assert.deepEqual(pagination({ page: "1e1", page_size: "100" }), { page: 10, page_size: 100 });
  assert.throws(() => pagination({ page_size: "101" }), error => error.status === 422);
  assert.throws(() => pagination({ page: "9007199254740993" }), error => error.status === 422);
});
test("filters keep one public GET with no native definition authoring routes", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(route => route.path.includes("filter"));
  assert.deepEqual(routes.map(({ path, method, config }) => ({ path, method, auth: config.auth })), [{ path: "/catalog/filters", method: "GET", auth: false }]);
});
test("installed Strapi 5.56 native key naming and Knex string type match the reviewed category FK adapter", async () => {
  const path = require("node:path");
  const { identifiers } = require(path.join(path.dirname(require.resolve("@strapi/database")), "utils/identifiers/index.js"));
  assert.equal(require("../package.json").dependencies["@strapi/strapi"], "5.56.0");
  assert.equal(identifiers.getUniqueIndexName(["alageum_categories", "transport_id"]), "alageum_categories_transport_id_uq");
  const category = require("../src/api/category/content-types/category/schema.json");
  assert.equal(category.attributes.transport_id.column.unique, true); assert.equal(category.options.draftAndPublish, false);
  const knex = require("knex")({ client: "pg" });
  try { assert.match(knex.schema.createTable("fixture", t => t.string("transport_id")).toSQL()[0].sql, /"transport_id" varchar\(255\)/); }
  finally { await knex.destroy(); }
});
