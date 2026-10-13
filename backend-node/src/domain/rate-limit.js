"use strict";
const { AppError } = require("./errors");
// Local/test only. Production startup remains blocked until distributed limits exist.
function createRateLimiter({
  limit = 20,
  windowMs = 60000,
  maxKeys = 10000,
  now = Date.now,
} = {}) {
  const windows = new Map();
  return (key) => {
    const time = now();
    for (const [k, value] of windows)
      if (value.reset <= time) windows.delete(k);
    let value = windows.get(key);
    if (!value) {
      if (windows.size >= maxKeys)
        throw new AppError("rate_limited", "Try again later", 429);
      value = { count: 0, reset: time + windowMs };
      windows.set(key, value);
    }
    if (++value.count > limit)
      throw new AppError("rate_limited", "Try again later", 429);
  };
}
module.exports = { createRateLimiter };
