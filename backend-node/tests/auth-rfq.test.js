"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const {
  createAuth,
  effectivePermissions,
  DEMO,
} = require("../src/domain/auth");
const {
  validateBody,
  quantity,
  fingerprint,
  snapshot,
  snapshotOut,
} = require("../src/domain/quotes");

const config = {
  jwtSecret: "unit-only-key-with-at-least-thirty-two-characters",
  jwtIssuer: "alageum-tests",
  jwtAudience: "alageum-business",
  accessTokenMinutes: 15,
  refreshTokenDays: 14,
  seedDemo: false,
  env: "test",
};
const auth = createAuth({ db: {}, config, audit: async () => {} });
const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const item = (value = 1) => ({ product_id: id, quantity: value });
const status = (code) => (error) => error.code === code && error.status >= 400;

test("RFQ body is strict; ownership, status, snapshots and price cannot be supplied", () => {
  for (const body of [
    null,
    [],
    {},
    { items: [] },
    { items: [item()], status: "approved" },
    { items: [{ ...item(), price: 5 }] },
    { items: [{ ...item(), product_snapshot: {} }] },
    { items: [item()], organization_id: DEMO.organizationB },
    { items: [item()], created_by_id: DEMO.users.admin },
  ]) {
    assert.throws(() => validateBody(body), status("validation_error"));
  }
  assert.equal(
    validateBody({
      items: Array.from({ length: 100 }, () => ({
        product_id: randomUUID(),
        quantity: 1,
      })),
    }).items.length,
    100,
  );
  assert.throws(
    () =>
      validateBody({
        items: Array.from({ length: 101 }, (_, i) => ({
          product_id: randomUUID(),
          quantity: i + 1,
        })),
      }),
    status("validation_error"),
  );
  assert.throws(
    () => validateBody({ items: [item()], comment: "x".repeat(4001) }),
    status("validation_error"),
  );
  assert.throws(
    () => validateBody({ items: [item()], comment: "nul\0byte" }),
    status("validation_error"),
  );
  assert.throws(
    () => validateBody({ items: [{ product_id: "not-a-uuid", quantity: 1 }] }),
    status("validation_error"),
  );
});

test("quantity range and precision are enforced without floating-point fingerprints", () => {
  assert.equal(quantity("001.020"), "1.02");
  assert.equal(quantity(0.001), "0.001");
  assert.equal(quantity(1000000), "1000000");
  assert.equal(quantity("999999999999999.999"), "999999999999999.999");
  assert.equal(quantity("1e2"), "100");
  assert.equal(quantity("1.0000"), "1");
  assert.equal(quantity(".5"), "0.5");
  for (const value of [
    0,
    -1,
    false,
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    "",
    0.0001,
    "1000000000000000",
    {},
    [],
    "9".repeat(33),
  ]) {
    assert.throws(
      () => quantity(value),
      status("validation_error"),
      String(value),
    );
  }
});

test("duplicate UUID products fail, including case variations", () => {
  assert.throws(
    () =>
      validateBody({
        items: [item(), { product_id: id.toUpperCase(), quantity: 2 }],
      }),
    status("quote_duplicate_product"),
  );
});

test("semantic decimal and item-order retries hash identically; edits conflict", () => {
  const second = randomUUID();
  const left = validateBody({
    items: [item("1.000"), { product_id: second, quantity: "0.010" }],
    comment: "Request",
  });
  const right = validateBody({
    items: [{ product_id: second, quantity: 0.01 }, item(1)],
    comment: "Request",
  });
  assert.equal(fingerprint(left), fingerprint(right));
  assert.notEqual(
    fingerprint(left),
    fingerprint({ ...left, comment: "Changed" }),
  );
  assert.notEqual(
    fingerprint(left),
    fingerprint(validateBody({ ...left, items: [item(2)] })),
  );
  assert.equal(
    fingerprint(validateBody({ items: [item()] })),
    fingerprint(validateBody({ comment: null, items: [item()] })),
  );
});

test("server snapshot is a deep-copy public allowlist", () => {
  const product = {
    id,
    public_key: "public-key",
    slug: "transformer",
    sku: "T1",
    translations: { en: { name: "Transformer" } },
    specs: { power: 400 },
    category_public_key: "cat",
    version: 2,
    price: "123.45",
    currency: "KZT",
    price_mode: "fixed",
    secret: "do-not-copy",
    createdBy: { email: "admin@private.example" },
  };
  const result = snapshot(product);
  assert.equal(result.price, "123.45");
  assert.equal(result.category_public_key, "cat");
  assert.equal(result.secret, undefined);
  assert.equal(result.createdBy, undefined);
  product.translations.en.name = "Changed";
  assert.equal(result.translations.en.name, "Transformer");
});

test("tenant roles never confer catalog.manage even with poisoned permission JSON", () => {
  assert.deepEqual(
    [
      ...effectivePermissions({
        organization_id: DEMO.organizationA,
        permissions: ["catalog.read", "catalog.manage", "quote.create"],
      }),
    ],
    ["catalog.read", "quote.create"],
  );
  assert.equal(
    effectivePermissions({
      organization_id: null,
      permissions: ["catalog.manage"],
    }).has("catalog.manage"),
    true,
  );
  assert.equal(
    effectivePermissions({
      organization_id: DEMO.organizationA,
      permissions: null,
    }).size,
    0,
  );
});

function token(changes = {}, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: DEMO.users.buyer,
    jti: randomUUID(),
    type: "access",
    iat: now,
    nbf: now,
    exp: now + 900,
    ...changes,
  };
  for (const key of Object.keys(payload))
    if (payload[key] === undefined) delete payload[key];
  return jwt.sign(payload, options.key || config.jwtSecret, {
    algorithm: options.algorithm || "HS256",
    issuer: options.issuer || config.jwtIssuer,
    audience: options.audience || config.jwtAudience,
    ...(options.noTimestamp ? { noTimestamp: true } : {}),
  });
}
test("business JWTs require HS256, business issuer/audience/type, UUID IDs and time claims", () => {
  assert.equal(auth.decodeAccess(token()).sub, DEMO.users.buyer);
  const now = Math.floor(Date.now() / 1000);
  for (const value of [
    token({ type: "refresh" }),
    token({}, { key: "different-key" }),
    token({}, { algorithm: "HS384" }),
    token({}, { issuer: "strapi-admin" }),
    token({}, { audience: "strapi" }),
    token({ exp: now - 1 }),
    token({ nbf: now + 30 }),
    token({ iat: now + 30 }),
    token({ nbf: undefined }),
    token({ exp: undefined }),
    token({ jti: undefined }),
    token({ sub: "not-a-uuid" }),
    token({ jti: [randomUUID()] }),
    token({}, { noTimestamp: true }),
    "malformed",
  ]) {
    assert.throws(() => auth.decodeAccess(value), status("invalid_token"));
  }
});

test("Strapi JSONB text parser preserves permissions and public RFQ snapshots", () => {
  assert.equal(
    effectivePermissions({
      organization_id: null,
      permissions: '["catalog.manage"]',
    }).has("catalog.manage"),
    true,
  );
  assert.deepEqual(
    [
      ...effectivePermissions({
        organization_id: DEMO.organizationA,
        permissions: '["quote.create","catalog.manage"]',
      }),
    ],
    ["quote.create"],
  );
  assert.equal(
    effectivePermissions({ organization_id: null, permissions: "not-json" })
      .size,
    0,
  );
  assert.equal(
    effectivePermissions({
      organization_id: null,
      permissions: '{"catalog.manage":true}',
    }).size,
    0,
  );
  assert.deepEqual(
    snapshotOut(
      '{"sku":"SERVER-SKU","translations":{"en":{"name":"Product"}}}',
    ),
    { sku: "SERVER-SKU", translations: { en: { name: "Product" } } },
  );
  assert.deepEqual(snapshotOut({ sku: "SERVER-SKU" }), { sku: "SERVER-SKU" });
  assert.throws(() => snapshotOut("null"), /invalid/);
  assert.throws(() => snapshotOut("[]"), /invalid/);
});

test("demo seed is explicit opt-in and denied outside development/test", async () => {
  assert.deepEqual(await auth.seed(), { seeded: false });
  const production = createAuth({
    db: {},
    config: { ...config, env: "production", seedDemo: true },
    audit: async () => {},
  });
  await assert.rejects(production.seed(), /disabled outside development\/test/);
});
