"use strict";

const { performance } = require("node:perf_hooks");
const { AppError } = require("./errors");

// One instance per application, shared by all quote_create callers. This is a
// bounded, single-process adaptation of the frozen MemoryRateLimiter, not a
// distributed limiter. The existing login limiter is a separate policy.
function createQuoteRateLimiter({
  now = () => performance.now() / 1000,
  maxKeys = 10000,
} = {}) {
  const buckets = new Map();
  return (key) => {
    // Injectable clocks use monotonic seconds, just like time.monotonic().
    const time = now();
    const bucket = buckets.get(key) ?? [];
    // Reads, including denied attempts, refresh the key's LRU position.
    buckets.delete(key);
    buckets.set(key, bucket);
    while (bucket.length && bucket[0] <= time - 60) bucket.shift();
    if (bucket.length >= 10)
      throw new AppError("rate_limit_exceeded", "Too many requests", 429);
    bucket.push(time);
    while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
  };
}

// Legacy client_key with its default empty trusted_proxy_ips returns the socket
// peer verbatim. Keep Koa proxy trust disabled: forwarded headers and ctx.ip are
// not an authority here. Configured legacy trusted-proxy parity is out of scope.
function quoteClientKey(ctx) {
  return ctx.req?.socket?.remoteAddress ?? "unknown";
}

module.exports = { createQuoteRateLimiter, quoteClientKey };
