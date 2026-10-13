"use strict";

const { performance } = require("node:perf_hooks");

module.exports = (_config, { strapi }) => {
  // Registered per application before Strapi instantiates middleware. Capturing
  // this instance prevents later applications in the same process sharing it.
  const metrics = strapi.alageumMetrics;
  if (!metrics || typeof metrics.recordHttp !== "function")
    throw new Error("Compatibility HTTP metrics must be registered before middleware");

  return async (ctx, next) => {
    const path = ctx.path.toLowerCase().replace(/\/+$/, "");
    if (path !== "/api/v1" && !path.startsWith("/api/v1/")) return next();
    const started = performance.now();
    let rejected = false;
    try {
      await next();
    } catch (error) {
      rejected = true;
      throw error;
    } finally {
      // This middleware surrounds compat-errors, so ordinary 4xx/5xx have their
      // final status. An exception left for Strapi's outer error formatter also
      // counts as an error. No path, query, header, body or tenant is recorded.
      metrics.recordHttp(rejected ? 500 : ctx.status, (performance.now() - started) / 1000);
    }
  };
};
