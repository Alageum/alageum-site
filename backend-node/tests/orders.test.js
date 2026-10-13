"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decimal, configuration, itemOut, orderOut, orderId, createOrders } = require("../src/domain/orders");
const id = "40000000-0000-4000-8000-000000000001";

test("orders expose only two frozen read routes", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(route => route.path.startsWith("/orders"));
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [["GET", "/orders"], ["GET", "/orders/:id"]]);
  assert.throws(() => createOrders({}), /Transactional audit writer/);
});
test("orders preserve PostgreSQL decimal strings without Number coercion", () => {
  for (const value of ["0.00", "12.30", "9999999999999999.99"]) assert.equal(decimal(value, 2), value);
  for (const value of ["0.001", "1.000", "999999999999999.999"]) assert.equal(decimal(value, 3), value);
  for (const value of [0, 12.3, NaN, Infinity, "NaN", "Infinity", "-Infinity", null, undefined, "1", "1.2", "-1.00", "1e2", " 1.00"])
    assert.throws(() => decimal(value, 2), /exact PostgreSQL numeric string/);
});
test("configuration preserves raw unsafe integers recursively while retaining ordinary JSON types", () => {
  const source = '{"positive":9007199254740993,"negative":-9007199254740993,"nested":[null,true,{"array":[9007199254740993,-9007199254740993,1.25,0]}],"__proto__":{"safe":true}}';
  assert.equal(JSON.stringify(configuration(source)), source);
  assert.equal(JSON.stringify(configuration('{"fraction":9007199254740993.5}')), '{"fraction":9007199254740994}');
  assert.equal({}.safe, undefined);
  for (const source of ['null', '[]', '1', 'true', '"string"', '{"broken":}']) assert.throws(() => configuration(source));
});
test("order DTOs preserve nullable price/external ID and expose no internal fields", () => {
  const row = { id, external_id: null, number: "FICTITIOUS", currency: "KZT", amount: "0.00", status: "fixture_received", organization_id: "hidden", status_id: "hidden", created_at: "hidden" };
  const item = { id, description: "Fictitious item", quantity: "0.001", unit_price: null, configuration: { nested: [null] }, external_product_id: "hidden", order_id: "hidden", product_id: "hidden" };
  assert.deepEqual(orderOut(row, [item]), { id, external_id: null, number: "FICTITIOUS", currency: "KZT", amount: "0.00", status: "fixture_received", items: [{ id, description: "Fictitious item", quantity: "0.001", unit_price: null, configuration: { nested: [null] } }] });
  assert.deepEqual(orderOut(row, []).items, []);
  for (const value of [null, [], 2, "{}"] ) assert.throws(() => itemOut({ ...item, configuration: value }));
});
test("order UUID parsing retains Pydantic representations and structured 422 failures", () => {
  for (const value of [id, id.toUpperCase(), id.replaceAll("-", ""), `{${id}}`, `urn:uuid:${id}`]) assert.equal(orderId(value), id);
  for (const value of ["bad", ` ${id}`, `URN:UUID:${id}`, null]) assert.throws(() => orderId(value), error => error.status === 422 && error.code === "validation_error" && error.details[0].loc.join(".") === "path.order_id");
});
