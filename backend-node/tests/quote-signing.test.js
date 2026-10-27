"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs"), path = require("node:path");
const q = require("../src/domain/quote-signing");
const organizationId = randomUUID(), managerId = randomUUID();
const routing = { organizationId, managerId };
const packet = { signing_organization_id: organizationId, assigned_manager_id: managerId, requested_at: new Date() };
const actor = { organization_id: organizationId, user: { id: managerId }, permissions: new Set(["document.read", "document.sign"]) };
test("routing never guesses a manager or accepts partial/invalid configuration", () => {
  assert.equal(q.routeConfig(), null);
  for (const bad of [{ organizationId }, { managerId }, { organizationId: "customer", managerId }]) assert.throws(() => q.routeConfig(bad));
  assert.deepEqual(q.routeConfig(routing), routing);
  assert.ok(Object.isFrozen(q.routeConfig(routing)));
});
test("assigned supplier manager, selected tenant, read/sign permissions and client request are all required", () => {
  q.assertAssignment(packet, actor, routing);
  for (const change of [{ organization_id: randomUUID() }, { user: { id: randomUUID() } }, { permissions: new Set(["document.read"]) }, { permissions: new Set(["document.sign"]) }]) {
    assert.throws(() => q.assertAssignment(packet, { ...actor, ...change }, routing), { code: "document_not_found" });
  }
  assert.throws(() => q.assertAssignment(packet, actor, null), { code: "quote_signing_configuration_required" });
  assert.throws(() => q.assertAssignment(packet, actor, { ...routing, managerId: randomUUID() }), { code: "quote_signing_configuration_required" });
  assert.throws(() => q.assertAssignment({ ...packet, requested_at: null }, actor, routing), { code: "quote_signing_not_requested" });
});
test("canonical saved catalog payload freezes values without deriving prices or legal terms", () => {
  const quote = { id: randomUUID(), organization_id: randomUUID(), mode: "catalog", comment: null };
  const item = { product_id: randomUUID(), quantity: "2.000", product_snapshot: { sku: "fixture", price: null, currency: "KZT", price_mode: "on_request", version: 1 } };
  const original = q.quotePayload(quote, [item]);
  assert.equal(original, q.quotePayload(quote, [{ ...item, product_snapshot: JSON.stringify(item.product_snapshot) }]));
  const parsed = JSON.parse(original);
  assert.equal(parsed.items[0].product_snapshot.price, null);
  assert.equal(Object.hasOwn(parsed, "total"), false);
  assert.equal(Object.hasOwn(parsed, "terms"), false);
  assert.notEqual(q.digest(original), q.digest(q.quotePayload(quote, [{ ...item, quantity: "3.000" }])));
  assert.notEqual(q.digest(original), q.digest(q.quotePayload({ ...quote, organization_id: randomUUID() }, [item])));
  assert.equal(q.canonical({ b: 1, a: { y: 2, x: 3 } }), q.canonical({ a: { x: 3, y: 2 }, b: 1 }));
  assert.throws(() => q.quotePayload({ ...quote, mode: "generic" }, [item]), { code: "quote_snapshot_unavailable" });
  assert.throws(() => q.quotePayload(quote, [{ ...item, product_snapshot: {} }]), { code: "quote_snapshot_unavailable" });
});
test("schema rejects update/delete of binding; only first request timestamp may transition", async () => {
  const sql = [];
  await q.ensureSchema({ transaction: fn => fn({ raw: async statement => { sql.push(statement); return { rows: [] }; } }) });
  const definition = sql.find(s => s.includes("CREATE TABLE"));
  assert.match(definition, /quote_id uuid NOT NULL UNIQUE/);
  assert.match(definition, /FOREIGN KEY\(snapshot_id, signing_organization_id\)/);
  assert.match(definition, /document_id uuid NOT NULL UNIQUE/);
  const guard = sql.find(s => s.includes("RETURNS trigger"));
  assert.match(guard, /TG_OP = 'DELETE'/);
  assert.match(guard, /OLD.requested_at IS NOT NULL OR NEW.requested_at IS NULL/);
  assert.match(guard, /IS DISTINCT FROM/);
});
test("production wiring retains unavailable crypto and applies assignment guard to existing signing paths", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/index.js"), "utf8");
  assert.match(source, /authorizeDocument: quoteSigning.authorizeDocument/);
  assert.doesNotMatch(source, /verifier:\s*\{/);
  const signing = fs.readFileSync(path.join(__dirname, "../src/domain/document-signing.js"), "utf8");
  assert.match(signing, /await authorizeDocument\(tx, actor, documentId\(ctx.params.id\)\)/);
  assert.match(signing, /await authorizeDocument\(tx, actor, id\)/);
  const routes = require("../src/api/compat/routes/compat").routes.filter(r => r.path.endsWith("/signature-request"));
  assert.deepEqual(routes.map(r => r.method), ["GET", "POST"]);
});
