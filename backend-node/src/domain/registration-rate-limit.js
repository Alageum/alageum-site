"use strict";
const { createDistributedRateLimiter } = require("./distributed-rate-limit");
const { clientAddress } = require("./client-address");
const WINDOW_MS = 15 * 60 * 1000;
function createRegistrationRateLimiter({ db, secret }) {
  const policies = Object.fromEntries(["mail", "token", "company"].map(purpose => [purpose,
    createDistributedRateLimiter({ db, secret, policy: `registration-ip:${purpose}`, limit: purpose === "token" ? 30 : 20, windowMs: WINDOW_MS }),
  ]));
  const identity = createDistributedRateLimiter({ db, secret, policy: "registration-identity", limit: 5, windowMs: WINDOW_MS });
  return async function limit(ctx, purpose, email = "") {
    if (!Object.hasOwn(policies, purpose)) throw new TypeError("Unknown registration admission purpose");
    // IP admission commits first: an already-blocked address cannot allocate
    // fresh identity buckets. All clocks/capacity/locks live in shared PostgreSQL.
    await policies[purpose](clientAddress(ctx), ctx);
    if (email) await identity(email, ctx);
  };
}
module.exports = { createRegistrationRateLimiter, WINDOW_MS };
