"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { amount, invoiceOut, createInvoices, READ } = require("../src/domain/invoices");
const id = "50000000-0000-4000-8000-000000000001";
test("invoice metadata exposes only the frozen list route and finance.read permission", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(route => route.path.startsWith("/finance"));
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [["GET", "/finance/invoices"]]);
  assert.equal(READ, "finance.read"); assert.deepEqual(Object.keys(createInvoices({})), ["list"]);
});
test("invoice nominal amount retains zero, fractions and full precision as Decimal JSON strings", () => {
  for (const value of ["0.00", "0.01", "12.30", "9999999999999999.99"]) assert.equal(amount(value), value);
  for (const value of [0, 12.3, NaN, Infinity, "NaN", "Infinity", "-Infinity", null, undefined, "1", "1.2", "-1.00", "1e2", " 1.00", "00.00", "10000000000000000.00"])
    assert.throws(() => amount(value), /exact PostgreSQL numeric string/);
});
test("invoice DTO contains exactly six fields, preserves opaque codes and frozen nullable defaults", () => {
  const row = { id, number: "FICTITIOUS", amount: "0.00", currency: "KZT", status: "opaque-status", source: "opaque-source", organization_id: "hidden", order_id: "hidden", external_id: "hidden", created_at: "hidden", updated_at: "hidden" };
  assert.deepEqual(invoiceOut(row), { id, number: "FICTITIOUS", amount: "0.00", currency: "KZT", status: "opaque-status", source: "opaque-source" });
  for (const value of [null, undefined]) assert.deepEqual(invoiceOut({ ...row, number: value, status: value }), { id, number: null, amount: "0.00", currency: "KZT", status: null, source: "opaque-source" });
});
