"use strict";

// Pinned koa-body/co-body rejects JSON scalars before controller dispatch. The
// legacy quote dependency charges decoded input before model validation. Recover
// only that exact native structural error on this route; preserve the parser's
// limits, syntax failures, prototype protection and every other route unchanged.
function recoverQuoteJsonScalar(error, ctx) {
  if (ctx.method !== "POST" || !/^\/api\/v1\/quotes\/catalog\/?$/i.test(ctx.path) ||
      !(error instanceof SyntaxError) || error.status !== 400 ||
      error.message !== "invalid JSON, only supports object and array" ||
      typeof error.body !== "string") throw error;
  let decoded;
  try { decoded = JSON.parse(error.body); } catch { throw error; }
  // Objects and arrays must always pass through the native protected parser.
  if (decoded !== null && typeof decoded === "object") throw error;
  ctx.request.body = decoded;
}

module.exports = { recoverQuoteJsonScalar };
