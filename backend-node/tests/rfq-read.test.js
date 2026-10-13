"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { summary, createQuotes } = require("../src/domain/quotes");

const saved = () => ({
  id: "70000000-0000-4000-8000-000000000001",
  status: "submitted",
  comment: "Saved peer comment",
  created_at: new Date("2026-01-02T03:04:05.123Z"),
  organization_id: "70000000-0000-4000-8000-000000000002",
  created_by_id: "70000000-0000-4000-8000-000000000003",
  request_hash: "hidden",
  idempotency_key: "hidden",
  items: [{ product_snapshot: { sku: "hidden" } }],
});

test("RFQ summary allowlist preserves saved comments and zero child count", () => {
  assert.deepEqual(summary(saved(), 0), {
    id: saved().id, status: "submitted", comment: "Saved peer comment", item_count: 0,
    created_at: "2026-01-02T03:04:05.123Z",
  });
  for (const comment of [null, "", " Plain <script>text</script> "])
    assert.equal(summary({ ...saved(), comment }, 2).comment, comment);
  // DTO validation does not invent new status or historical-creator requirements.
  for (const status of ["", "legacy_opaque_status"])
    assert.equal(summary({ ...saved(), status, created_by_id: undefined }, 2).status, status);
});

test("malformed selected RFQ summaries fail the response without leaking stored values", () => {
  for (const field of ["id", "status", "comment", "created_at"]) {
    for (const value of [undefined, 123, {}, []])
      assert.throws(() => summary({ ...saved(), [field]: value }, 0), {
        name: "TypeError", message: "Invalid quote summary DTO",
      });
  }
  for (const patch of [{ id: "bad" }, { id: null }, { status: null }, { created_at: null }, { created_at: "invalid" }, { created_at: new Date(NaN) }])
    assert.throws(() => summary({ ...saved(), ...patch }, 0), /Invalid quote summary DTO/);
  for (const count of [-1, 1.5, "2", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => summary(saved(), count), /Invalid quote summary DTO/);
});

test("both RFQ reads mark rejected authentication private before database access", async () => {
  const rejected = new Error("Fixture authentication rejection");
  let transactions = 0;
  const quotes = createQuotes({
    db: { transaction() { transactions++; } },
    catalog: { getForQuote() { throw new Error("Read must not consult catalog"); } },
    audit() { throw new Error("Read must not write audit"); },
    auth: { permission: async (_ctx, code) => {
      assert.equal(code, "quote.read");
      throw rejected;
    } },
  });
  for (const method of ["list", "detail"]) {
    const headers = {};
    await assert.rejects(quotes[method]({ set: (key, value) => { headers[key] = value; } }), error => error === rejected);
    assert.equal(headers["Cache-Control"], "private, no-store");
  }
  assert.equal(transactions, 0);
});

test("invalid raw RFQ query aggregates errors before starting a read transaction", async () => {
  const quotes = createQuotes({
    db: { transaction() { throw new Error("Invalid query must not reach data"); } },
    catalog: { getForQuote() {} }, audit() {},
    auth: { permission: async () => ({}) },
  });
  const headers = {};
  await assert.rejects(quotes.list({
    querystring: "mine=FALSE&mine=invalid&page=0&page_size=one", query: { mine: "true" },
    set: (key, value) => { headers[key] = value; },
  }), error => {
    assert.equal(error.code, "validation_error");
    assert.equal(error.status, 422);
    assert.equal(error.message, "Invalid request");
    assert.deepEqual(error.details.map(item => item.loc), [["query", "page"], ["query", "page_size"], ["query", "mine"]]);
    assert.equal(error.details.at(-1).input, "invalid");
    return true;
  });
  assert.equal(headers["Cache-Control"], "private, no-store");
});
