"use strict";
const { randomUUID } = require("node:crypto");
const { AppError } = require("../domain/errors");
module.exports = (_config, { strapi } = {}) => {
  return async (ctx, next) => {
    const requestId = randomUUID();
    const apiPath = ctx.path.toLowerCase().replace(/\/+$/, "");
    ctx.state.requestId = requestId;
    ctx.set("X-Request-ID", requestId);
    if (apiPath.startsWith("/api/v1/") || apiPath === "/api/v1")
      ctx.set("Cache-Control", "no-store");
    try {
      if (ctx.method === "POST" && (apiPath === "/api/v1/support/tickets" || /^\/api\/v1\/documents\/[^/]+\/signing\/(?:intents(?:\/[^/]+(?:\/cancel)?)?|signatures\/[^/]+\/verify)$/.test(apiPath))) {
        // FastAPI TicketIn consumes JSON (including absent Content-Type and
        // application/*+json), never form fields or uploaded files. Reject before
        // Strapi's multipart parser can write temporary uploads.
        ctx.set("Cache-Control", "private, no-store");
        const contentType = (ctx.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
        if (contentType && contentType !== "application/json" && !/^application\/[^\s;]+\+json$/.test(contentType))
          throw new AppError("validation_error", "Invalid request", 422);
        if (contentType !== "application/json") ctx.request.headers["content-type"] = "application/json";
      }
      await next();
      if (
        (apiPath.startsWith("/api/v1/") || apiPath === "/api/v1") &&
        ctx.status === 404 &&
        !ctx.body?.error?.request_id
      ) {
        ctx.body = {
          error: {
            code: "route_not_available",
            message:
              "This endpoint is not available in the bounded Node migration",
            details: null,
            request_id: requestId,
          },
        };
        ctx.status = 404;
      }
    } catch (error) {
      if (!(apiPath.startsWith("/api/v1/") || apiPath === "/api/v1"))
        throw error;
      const known = error instanceof AppError;
      const status = known
        ? error.status
        : error.status === 413
          ? 413
          : error.status === 400
            ? 422
            : 500;
      if (status === 500)
        strapi?.log?.error?.("API request failed", {
          request_id: requestId,
          code: error.code,
        });
      ctx.status = status;
      ctx.body = {
        error: {
          code: known
            ? error.code
            : status === 413
              ? "request_too_large"
              : status === 422
                ? "validation_error"
                : "internal_error",
          message: known
            ? error.message
            : status === 413
              ? "Request body too large"
              : status === 422
                ? "Invalid request body"
                : "Request failed",
          details: known ? error.details : null,
          request_id: requestId,
        },
      };
    }
  };
};
