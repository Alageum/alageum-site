"use strict";
const { AppError } = require("../../../../domain/errors");
module.exports = ({ strapi }) => {
  const handler =
    (method, ...args) =>
    async (ctx) => {
      ctx.set("Cache-Control", "private, no-store");
      try {
        await strapi.alageum.cmsCatalog[method](ctx, ...args);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        ctx.status = error.status;
        ctx.body = {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            request_id: ctx.state.requestId || null,
          },
        };
      }
    };
  return {
    list: handler("list", true),
    get: handler("get", true),
    categories: handler("categoryList", true),
    create: handler("create"),
    update: handler("update"),
    hide: handler("update", "hide"),
    restore: handler("update", "restore"),
    mediaOptions: handler("mediaOptions"),
    mediaPreview: handler("mediaPreview"),
  };
};
