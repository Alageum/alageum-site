"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  ACTION,
  unconstrained,
  validateSessionChain,
  MAX_SESSION_CHAIN,
} = require("../src/domain/cms-catalog");
test("CMS global management grants are exact and fail closed for constrained or malformed permissions", () => {
  assert.ok(
    unconstrained({
      action: ACTION,
      conditions: "[]",
      properties: "{}",
      actionParameters: "{}",
    }),
  );
  for (const grant of [
    { action: "catalog.manage" },
    { action: ACTION, conditions: '["admin::is-creator"]' },
    { action: ACTION, conditions: "invalid-json" },
    { action: ACTION, properties: '{"fields":["sku"]}' },
    { action: ACTION, actionParameters: '{"scope":"restricted"}' },
    { action: ACTION, subject: "api::product.product" },
    { action: ACTION, properties: "true" },
    { action: ACTION, actionParameters: "false" },
  ])
    assert.ok(!unconstrained(grant));
});

test("CMS session chains fail closed for revoked/missing terminals, cycles and cross-account grafts", async () => {
  const now = Date.now();
  const base = {
    userId: "1",
    origin: "admin",
    deviceId: "device",
    status: "active",
    expiresAt: new Date(now + 60000),
    absoluteExpiresAt: new Date(now + 120000),
    childId: null,
  };
  const verify = (rows, sessionId = "root") =>
    validateSessionChain({
      read: async (id) => rows[id],
      sessionId,
      adminId: 1,
      now,
    });
  assert.equal((await verify({ root: base })).status, "active");
  assert.equal(
    (
      await verify({
        root: { ...base, status: "rotated", childId: "child" },
        child: base,
      })
    ).status,
    "active",
  );
  for (const child of [
    undefined,
    { ...base, status: "revoked" },
    { ...base, userId: "2" },
    { ...base, origin: "users-permissions" },
    { ...base, deviceId: "other" },
    { ...base, expiresAt: new Date(now - 1) },
    { ...base, expiresAt: "invalid" },
    { ...base, absoluteExpiresAt: "invalid" },
  ]) {
    await assert.rejects(
      verify({ root: { ...base, status: "rotated", childId: "child" }, child }),
      (error) => error.code === "authentication_required",
    );
  }
  await assert.rejects(
    verify({ root: { ...base, status: "rotated", childId: "root" } }),
  );
  await assert.rejects(
    verify({
      root: { ...base, status: "active", childId: "child" },
      child: base,
    }),
  );
  const long = Object.fromEntries(
    Array.from({ length: MAX_SESSION_CHAIN + 1 }, (_, i) => [
      String(i),
      { ...base, status: "rotated", childId: String(i + 1) },
    ]),
  );
  await assert.rejects(verify(long, "0"));
});
