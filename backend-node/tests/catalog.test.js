"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const v = require("../src/domain/catalog-validation");
const { readCatalog } = require("../src/domain/catalog-source");
const { NAMESPACE } = require("../src/domain/catalog");
const { v5: uuid5 } = require("uuid");
const valid = {
  public_key: "test-product",
  category_id: uuid5("category:transformers", NAMESPACE),
  slug: "test-product",
  translations: { ru: { name: "Товар" } },
};
test("all released source records and stable deterministic identities survive source integrity checks", () => {
  const rows = readCatalog();
  const expected = require("../data/catalog-release.json").recordCount;
  assert.equal(rows.length, expected);
  assert.equal(new Set(rows.map((r) => r.id)).size, expected);
  for (const row of rows) {
    const id = uuid5(`product:${row.id}`, NAMESPACE);
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.equal(
      v.parse(v.create, {
        ...valid,
        public_key: row.id,
        slug: row.id,
        translations: { ru: { name: row.name } },
      }).public_key,
      row.id,
    );
  }
});
test("strict create rejects server identity, unknown tenant and source evidence fields", () => {
  for (const field of [
    "id",
    "organization_id",
    "source_data",
    "version",
    "sort_order",
  ])
    assert.throws(() => v.parse(v.create, { ...valid, [field]: "x" }));
});
test("patch omits unspecified defaults and cannot mutate stable key", () => {
  assert.deepEqual(v.parse(v.patch, { version: 2, price: "12.10" }), {
    version: 2,
    price: "12.10",
  });
  assert.throws(() => v.parse(v.patch, { version: 2, public_key: "changed" }));
  assert.throws(() => v.parse(v.patch, { version: "2" }));
  assert.throws(() => v.parse(v.patch, { version: 2, translations: null }));
});
test("money uses exact two-place decimal string and valid ISO currency", () => {
  assert.equal(
    v.parse(v.create, {
      ...valid,
      price_mode: "fixed",
      price: "1200.10",
      currency: "USD",
    }).price,
    "1200.10",
  );
  for (const extra of [
    { price_mode: "fixed", price: null, currency: "USD" },
    { price: "20" },
    { price_mode: "fixed", price: "1.001", currency: "USD" },
    { price_mode: "fixed", price: "-1", currency: "USD" },
    { currency: "ZZZ" },
    { price_mode: "fixed", price: "10000000000000000", currency: "USD" },
  ])
    assert.throws(() => v.parse(v.create, { ...valid, ...extra }));
});
test("only allowlisted inert canonical media is accepted", () => {
  for (const path of [
    "https://example.com/a.png",
    "/catalog-products/../brand/logo.png",
    "//example.com/a.png",
    "/brand/missing.png",
    "/brand/logo.png?a=1",
    "/catalog-products/x.svg",
  ])
    assert.throws(() => v.parse(v.create, { ...valid, media: [{ path }] }));
  assert.equal(
    v.parse(v.create, { ...valid, media: [{ path: "/brand/logo.png" }] })
      .media[0].path,
    "/brand/logo.png",
  );
});
test("specification and provenance protect source boundary", () => {
  for (const extra of [
    { specs: { technicalSpecs: [{ label: "x", value: true }] } },
    { provenance: { sourceUrl: "javascript:alert(1)" } },
    { provenance: { sourceUrl: "https://user:secret@example.com" } },
    { specs: { power: Infinity } },
    { specs: { notes: [1] } },
    { provenance: { sourcePages: [0] } },
  ])
    assert.throws(() => v.parse(v.create, { ...valid, ...extra }));
});
test("database refuses accidental legacy database reuse", () => {
  const config = require("../config/database");
  const env = (name) =>
    name === "DATABASE_URL" ? "postgresql://localhost/alageum" : undefined;
  env.bool = () => false;
  assert.throws(() => config({ env }), /isolated/);
});
test("production transport guard is fail closed", () => {
  const config = require("../config/alageum");
  assert.throws(
    () =>
      config({
        env: (name, fallback) => (name === "APP_ENV" ? "production" : fallback),
      }),
    /Production startup blocked/,
  );
});

test("local login rate limiting is bounded and expires", () => {
  const { createRateLimiter } = require("../src/domain/rate-limit");
  let now = 0;
  const limit = createRateLimiter({
    limit: 2,
    windowMs: 100,
    now: () => now,
    maxKeys: 2,
  });
  limit("a");
  limit("a");
  assert.throws(
    () => limit("a"),
    (e) => e.code === "rate_limited",
  );
  now = 101;
  limit("a");
  limit("b");
  assert.throws(
    () => limit("c"),
    (e) => e.code === "rate_limited",
  );
});

test("case and trailing-slash aliases share login throttle and v1 envelope", async () => {
  const middleware = require("../src/middlewares/compat-errors")();
  const make = (path) => ({
    path,
    method: "POST",
    ip: "test-address",
    state: {},
    headers: {},
    set(name, value) {
      this.headers[name] = value;
    },
  });
  for (let i = 0; i < 20; i++)
    await middleware(make("/api/v1/auth/login"), async () => {});
  for (const path of ["/api/v1/auth/login/", "/API/v1/AUTH/LOGIN"]) {
    const ctx = make(path);
    await middleware(ctx, async () => {
      throw Error("must not reach auth");
    });
    assert.equal(ctx.status, 429);
    assert.equal(ctx.body.error.code, "rate_limited");
    assert.equal(ctx.headers["Cache-Control"], "no-store");
  }
});
