"use strict";
// Test-only evidence validation. No quota reset or application override.
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const keyHash = (secret, policy, address) => createHmac("sha256", secret).update(`${policy}\0${address}`).digest("hex");
const policies = Object.freeze({ "quote-create": 10, "auth-entry": 20 });
function assertAdmissionRows(rows, expected, { secret, time }) {
  assert.ok(Number.isSafeInteger(time) && time > 0);
  assert.equal(rows.length, expected.length, "Every quota row must be accounted for");
  const keys = expected.map(({ policy, address, attempts }) => {
    assert.ok(Object.hasOwn(policies, policy));
    assert.ok(["127.0.0.1", "127.0.0.2"].includes(address));
    assert.ok(Number.isInteger(attempts) && attempts > 0 && attempts <= policies[policy]);
    return keyHash(secret, policy, address);
  });
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(rows.map(row => row.key_hash).sort(), [...keys].sort(), "No unexpected identity or policy bucket is allowed");
  for (const [index, expectation] of expected.entries()) {
    const row = rows.find(item => item.key_hash === keys[index]);
    assert.deepEqual(Object.keys(row).sort(), ["attempts", "expires_at", "key_hash", "policy", "quota", "window_ms"]);
    assert.equal(row.policy, expectation.policy);
    assert.equal(row.quota, policies[expectation.policy]);
    assert.equal(row.window_ms, 60000);
    // Strapi deliberately returns raw JSONB strings to preserve integer
    // precision; plain pg domain tests return decoded arrays. Decode once.
    const attempts = typeof row.attempts === "string" ? JSON.parse(row.attempts) : row.attempts;
    assert.ok(Array.isArray(attempts));
    assert.equal(attempts.length, expectation.attempts);
    for (const [position, stamp] of attempts.entries()) {
      assert.ok(Number.isSafeInteger(stamp) && stamp > 0 && stamp <= time);
      if (position) assert.ok(stamp >= attempts[position - 1], "Attempts retain database-clock ordering");
      assert.ok(stamp > attempts.at(-1) - row.window_ms, "Retained attempts fit one sliding window");
    }
    assert.equal(new Date(row.expires_at).getTime(), attempts.at(-1) + row.window_ms);
  }
  return rows;
}
module.exports = { assertAdmissionRows, keyHash };
