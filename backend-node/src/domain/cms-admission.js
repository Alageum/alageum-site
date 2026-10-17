"use strict";
const { clientAddress } = require("./client-address");
const { createDistributedRateLimiter } = require("./distributed-rate-limit");
const { AppError } = require("./errors");
const AUTH_PATHS = new Set(["/admin/login", "/admin/register-admin", "/admin/register", "/admin/forgot-password", "/admin/reset-password"]);
function requestPolicy(ctx) {
  if (ctx.method !== "POST") return null;
  const path = String(ctx.path || "").toLowerCase().replace(/\/+$/, "");
  return AUTH_PATHS.has(path) ? "entry" : path === "/admin/access-token" ? "refresh" : null;
}
function createCmsAdmission({ db, config }) {
  const entry = createDistributedRateLimiter({ db, secret: config.jwtSecret, policy: "cms-auth-entry", limit: 20 });
  const refresh = createDistributedRateLimiter({ db, secret: config.jwtSecret, policy: "cms-auth-refresh", limit: 60 });
  const identity = createDistributedRateLimiter({ db, secret: config.jwtSecret, policy: "cms-auth-identity", limit: 20 });
  return {
    async address(ctx) {
      const policy = requestPolicy(ctx);
      if (policy) await (policy === "refresh" ? refresh : entry)(clientAddress(ctx), ctx);
    },
    async identity(ctx) {
      if (requestPolicy(ctx) !== "entry") return;
      const invalid = () => { throw new AppError("validation_error", "Use body-only string credentials", 422); };
      // Native passport-local can fall back to query credentials when a body
      // value is absent or non-string. This must not bypass the identity key
      // or put credentials in request URLs/logs.
      if (Object.hasOwn(ctx.query || {}, "email") || Object.hasOwn(ctx.query || {}, "password")) invalid();
      const body = ctx.request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
      const email = body.email;
      const login = String(ctx.path).toLowerCase().replace(/\/+$/, "") === "/admin/login";
      if ((login || email !== undefined) && (typeof email !== "string" || email.length > 320 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) invalid();
      if ((login || body.password !== undefined) && (typeof body.password !== "string" || !body.password || body.password.length > 256)) invalid();
      if (email) await identity(email.toLowerCase(), ctx);
    },
  };
}
module.exports = { createCmsAdmission, requestPolicy };
