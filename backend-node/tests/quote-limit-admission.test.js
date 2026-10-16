"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertAdmissionRows, keyHash } = require("./quote-limit-admission");
const secret = "synthetic-quote-evidence-only-secret", time = 1700000000000;
const expected = [{ policy: "quote-create", address: "127.0.0.1", attempts: 2 }];
const row = () => ({ key_hash: keyHash(secret, "quote-create", "127.0.0.1"), policy: "quote-create", quota: 10,
  window_ms: 60000, attempts: [time - 10, time], expires_at: new Date(time + 60000) });
const verify = rows => assertAdmissionRows(rows, expected, { secret, time });
test("quota evidence binds every stored row to its exact policy socket identity and attempt count", () => {
  assert.deepEqual(verify([row()]), [row()]);
  const raw = row(); raw.attempts = JSON.stringify(raw.attempts);
  assert.deepEqual(verify([raw]), [raw]);
  assert.throws(() => verify([])); assert.throws(() => verify([row(), row()]));
  for (const mutate of [r => r.key_hash = keyHash(secret, "quote-create", "127.0.0.2"),
    r => r.policy = "auth-entry", r => r.quota++, r => r.window_ms++, r => r.attempts.pop(),
    r => r.address = "127.0.0.1", r => r.attempts = JSON.stringify(JSON.stringify(r.attempts)),
    r => r.attempts = "{", r => r.attempts = "{}"]) {
    const changed = row(); mutate(changed); assert.throws(() => verify([changed]));
  }
});
test("quota evidence rejects corrupt clocks ordering expiry and cross-window attempts", () => {
  for (const mutate of [r => r.attempts[0] = 0, r => r.attempts[0] = 1.5, r => r.attempts[1] = time + 1,
    r => r.attempts.reverse(), r => r.attempts[0] = time - 60000, r => r.expires_at = new Date(time + 60001)]) {
    const changed = row(); mutate(changed); assert.throws(() => verify([changed]));
  }
  // Expired inactive buckets may remain until allocation cleanup, but their
  // complete retained state still has to satisfy the same integrity contract.
  assert.equal(assertAdmissionRows([row()], expected, { secret, time: time + 120000 }).length, 1);
});
