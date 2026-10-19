"use strict";
const { createHmac } = require("node:crypto");
const { AppError } = require("./errors");
const TABLE = "rate_limit_buckets";
const table = db => db.withSchema("b2b").table(TABLE);
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624144)");
    await tx.raw("CREATE SCHEMA IF NOT EXISTS b2b");
    if (!(await tx.schema.withSchema("b2b").hasTable(TABLE))) {
      await tx.schema.withSchema("b2b").createTable(TABLE, t => {
        t.string("key_hash", 64).primary();
        t.string("policy", 64).notNullable();
        t.integer("quota").notNullable();
        t.integer("window_ms").notNullable();
        t.jsonb("attempts").notNullable();
        t.timestamp("expires_at", { useTz: true }).notNullable();
        t.index(["policy", "expires_at"]);
      });
      await tx.raw("ALTER TABLE b2b.rate_limit_buckets ADD CONSTRAINT rate_limit_attempts_array CHECK (jsonb_typeof(attempts) = 'array' AND jsonb_array_length(attempts) <= 1000)");
    }
    const columns = (await tx.raw("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='b2b' AND table_name='rate_limit_buckets'")).rows;
    const expected = { key_hash: "character varying", policy: "character varying", quota: "integer", window_ms: "integer", attempts: "jsonb", expires_at: "timestamp with time zone" };
    if (Object.entries(expected).some(([name, type]) => !columns.some(column => column.column_name === name && column.data_type === type && column.is_nullable === "NO"))) throw new Error("Distributed rate-limit schema is incompatible");
    const primary = (await tx.raw("SELECT count(*)::integer AS count FROM pg_constraint c WHERE c.conrelid='b2b.rate_limit_buckets'::regclass AND c.contype='p' AND array_length(c.conkey, 1)=1 AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attnum=c.conkey[1])='key_hash'")).rows;
    if (Number(primary[0]?.count) !== 1) throw new Error("Distributed rate-limit key constraint is incompatible");
  });
}
const databaseTime = async tx => Number((await tx.raw("SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS milliseconds")).rows[0].milliseconds);
function parseAttempts(value, limit) {
  const items = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(items) || items.length > limit || items.some(time => !Number.isSafeInteger(time) || time < 0)) throw new Error("Invalid rate-limit state");
  return items;
}
function createDistributedRateLimiter({ db, secret, policy, limit = 20, windowMs = 60000, maxKeys = 10000,
  code = "rate_limited", message = "Too many attempts. Try again later." }) {
  if (!db || typeof secret !== "string" || secret.length < 32 || !/^[a-z][a-z0-9:_-]{0,63}$/.test(policy || "") ||
      !Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(windowMs) || windowMs < 1 || windowMs > 86400000 ||
      !Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 100000) throw new TypeError("Invalid distributed rate-limit policy");
  return async function charge(key, ctx) {
    if (typeof key !== "string" || !key || key.length > 1024) throw new TypeError("Invalid rate-limit key");
    const keyHash = createHmac("sha256", secret).update(`${policy}\0${key}`).digest("hex");
    let result;
    try {
      result = await db.transaction(async tx => {
        await tx.raw("SET LOCAL lock_timeout = '2000ms'");
        await tx.raw("SET LOCAL statement_timeout = '3000ms'");
        let row = await table(tx).where({ key_hash: keyHash }).forUpdate().first();
        if (!row) {
          // Only new identities take the policy admission lock. Existing keys
          // cannot be evicted by an attacker allocating a fresh key.
          await tx.raw("SELECT pg_advisory_xact_lock(hashtextextended(?, 731624144))", [policy]);
          row = await table(tx).where({ key_hash: keyHash }).forUpdate().first();
          if (!row) {
            const time = await databaseTime(tx);
            await table(tx).where({ policy }).where("expires_at", "<=", new Date(time)).delete();
            const count = Number((await table(tx).where({ policy }).count({ count: "*" }).first()).count);
            if (count >= maxKeys) return { allowed: false, retry: Math.ceil(windowMs / 1000) };
            row = { key_hash: keyHash, policy, quota: limit, window_ms: windowMs, attempts: [], expires_at: new Date(time + windowMs) };
            await table(tx).insert({ ...row, attempts: "[]" });
          }
        }
        const time = await databaseTime(tx);
        if (!Number.isSafeInteger(time) || row.policy !== policy || row.quota !== limit || row.window_ms !== windowMs) throw new Error("Invalid rate-limit clock/policy");
        const attempts = parseAttempts(row.attempts, limit).filter(stamp => stamp > time - windowMs);
        // DB time, row locks and a shared secret make the quota survive restarts
        // and hold across independent application replicas.
        if (attempts.length >= limit) return { allowed: false, retry: Math.max(1, Math.ceil((attempts[0] + windowMs - time) / 1000)) };
        attempts.push(time);
        await table(tx).where({ key_hash: keyHash }).update({ attempts: JSON.stringify(attempts), expires_at: new Date(time + windowMs) });
        return { allowed: true };
      });
    } catch {
      // Database loss, lock exhaustion or corrupt quota state never falls back
      // to a fresh per-process bucket or admits work without charging it.
      throw new AppError("rate_limit_unavailable", "Request admission is temporarily unavailable", 503);
    }
    if (!result.allowed) { ctx?.set?.("Retry-After", String(result.retry)); throw new AppError(code, message, 429); }
  };
}
module.exports = { ensureSchema, createDistributedRateLimiter, parseAttempts, TABLE };
