"use strict";
const { applyRequestSecurity, trustedProxyAddresses } = require("../domain/client-address");
const { AppError } = require("../domain/errors");
const { requestPolicy } = require("../domain/cms-admission");
module.exports = (_config, { strapi }) => {
  const trusted = trustedProxyAddresses(strapi.config.get("alageum.trustedProxyIps", []));
  return async (ctx, next) => {
    applyRequestSecurity(ctx, trusted);
    const path = ctx.path.toLowerCase().replace(/\/+$/, "");
    // An empty production database must never hand the first CMS administrator
    // role to the first anonymous HTTP visitor. Operators use the native local
    // Strapi admin:create-user command; existing login/invitations remain native.
    if (strapi.config.get("alageum.env") === "production" && path === "/admin/register-admin") {
      ctx.set("Cache-Control", "private, no-store");
      ctx.status = 403;
      ctx.body = { error: { status: 403, name: "ForbiddenError", message: "CMS administrator bootstrap requires the server operator" } };
      return;
    }
    if (ctx.method === "POST" && path === "/api/v1/auth/login") {
      if (!strapi.alageum?.auth?.chargeLogin) throw new AppError("rate_limit_unavailable", "Request admission is temporarily unavailable", 503);
      await strapi.alageum.auth.chargeLogin(ctx);
    }
    if (requestPolicy(ctx)) {
      if (!strapi.alageum?.cmsAdmission) throw new AppError("rate_limit_unavailable", "Request admission is temporarily unavailable", 503);
      await strapi.alageum.cmsAdmission.address(ctx);
    }
    await next();
  };
};
