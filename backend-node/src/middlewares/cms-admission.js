"use strict";
const { requestPolicy } = require("../domain/cms-admission");
const { AppError } = require("../domain/errors");
module.exports = (_config, { strapi }) => async (ctx, next) => {
  if (requestPolicy(ctx)) {
    if (!strapi.alageum?.cmsAdmission) throw new AppError("rate_limit_unavailable", "Request admission is temporarily unavailable", 503);
    await strapi.alageum.cmsAdmission.identity(ctx);
  }
  await next();
};
