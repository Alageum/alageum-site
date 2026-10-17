"use strict";
const { createMediaAdmission } = require("../../domain/media-admission");
const { readMediaConfig, fail } = require("../../domain/media-policy");
const { assertConfiguredMediaStorage } = require("../../domain/media-storage");
module.exports = plugin => {
  const originalRegister = plugin.register, originalUpload = plugin.services.upload;
  const instances = new WeakMap();
  function admission(strapi) {
    if (!instances.has(strapi)) instances.set(strapi, createMediaAdmission({
      config: strapi.config.get("media-security") || readMediaConfig(), publicRoot: strapi.dirs.static.public,
    }));
    return instances.get(strapi);
  }
  plugin.services.upload = context => admission(context.strapi).wrapUpload(originalUpload(context));
  plugin.register = async function (context) {
    const config = context.strapi.config.get("media-security") || readMediaConfig();
    await assertConfiguredMediaStorage({ publicRoot: config.storage?.publicRoot, quarantineRoot: config.quarantineRoot,
      effectivePublicRoot: context.strapi.dirs.static.public });
    await originalRegister.call(this, context);
    admission(context.strapi).wrapProvider(context.strapi.plugin("upload").provider);
  };
  // Remote URL ingestion has a different transport/SSRF boundary. Deliberately
  // refuse it until reviewed; local file admission remains available to CMS RBAC.
  plugin.controllers["admin-upload"].uploadFromUrls = async () =>
    fail("media_remote_import_disabled", "Remote media import is disabled. Upload a local PNG, JPEG or WebP file.");
  return plugin;
};
