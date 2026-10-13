"use strict";
// Authentication callbacks contain one-time codes and state in their query.
// Log paths only for ALL requests, including errors before controller dispatch.
module.exports = (_config, { strapi }) => async (ctx, next) => {
  const started = Date.now();
  try { await next(); }
  finally {
    const path = String(ctx.path || "/").replace(/[\r\n\x00-\x1f]/g, "").slice(0, 500);
    strapi.log.http(`${ctx.method} ${path} (${Date.now() - started} ms) ${ctx.status}`);
  }
};
