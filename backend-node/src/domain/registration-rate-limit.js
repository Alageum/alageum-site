"use strict";
const { createHmac } = require("node:crypto");
const { AppError } = require("./errors");
const WINDOW_MS = 15 * 60 * 1000;
function createRegistrationRateLimiter({ db, secret, now = Date.now }) {
  if (typeof secret !== "string" || secret.length < 32) throw new TypeError("Rate-limit secret is required");
  return async function limit(ctx, purpose, email = "") {
    // No untrusted Forwarded/X-Forwarded-For header can bypass the limiter.
    const address = ctx.req?.socket?.remoteAddress || ctx.request?.socket?.remoteAddress || "unknown";
    const time = now(), window = Math.floor(time / WINDOW_MS);
    const keys = [
      { scope: `ip:${purpose}:${address}`, max: purpose === "token" ? 30 : 20 },
      ...(email ? [{ scope: `email:mail:${email}`, max: 5 }] : []),
    ].map(item => ({ ...item, hash: createHmac("sha256", secret).update(`registration:${window}:${item.scope}`).digest("hex") }));
    // Always lock IP before email; over-quota IPs cannot allocate unlimited email buckets.
    const allowed = await db.transaction(async tx => {
      let result = true;
      for (const key of keys) {
        const rows = await tx.withSchema("b2b").table("registration_rate_buckets").insert({ key_hash: key.hash, attempts: 1, expires_at: new Date((window + 1) * WINDOW_MS) })
          .onConflict("key_hash").merge({ attempts: tx.raw("registration_rate_buckets.attempts + 1") }).returning("attempts");
        if (Number(rows[0].attempts) > key.max) { result = false; break; }
      }
      return result;
    });
    if (!allowed) {
      ctx.set?.("Retry-After", String(Math.ceil(((window + 1) * WINDOW_MS - time) / 1000)));
      throw new AppError("rate_limited", "Too many attempts. Try again later.", 429);
    }
  };
}
module.exports = { createRegistrationRateLimiter, WINDOW_MS };
