"use strict";
const fs = require("node:fs/promises");
const { context, closeFiles } = require("../domain/media-temporary");
const { privateDirectory } = require("../domain/media-quarantine");
const { readMediaConfig } = require("../domain/media-policy");
module.exports = (_config, { strapi }) => async (ctx, next) => {
  if (!/^multipart\/form-data(?:;|$)/i.test(ctx.get("content-type") || "")) return next();
  const config = strapi.config.get("media-security") || readMediaConfig();
  const directory = await privateDirectory(config, strapi.dirs.static.public), files = new Set();
  try { return await context.run({ directory, files }, next); }
  finally {
    await closeFiles(files);
    await fs.rm(directory, { recursive: true, force: true });
  }
};
