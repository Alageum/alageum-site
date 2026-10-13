"use strict";
const ACTION = "plugin::alageum-catalog.manage";
const route = (method, path, handler) => ({
  method,
  path,
  handler: `catalog.${handler}`,
  config: {
    auth: { scope: [ACTION] },
    policies: [
      "admin::isAuthenticatedAdmin",
      { name: "admin::hasPermissions", config: { actions: [ACTION] } },
    ],
  },
});
module.exports = {
  type: "admin",
  routes: [
    route("GET", "/products", "list"),
    route("POST", "/products", "create"),
    route("GET", "/products/:id", "get"),
    route("GET", "/products/:id/media-options", "mediaOptions"),
    route("GET", "/products/:id/media-preview/:entryId", "mediaPreview"),
    route("PATCH", "/products/:id", "update"),
    route("PUT", "/products/:id", "update"),
    route("POST", "/products/:id/hide", "hide"),
    route("POST", "/products/:id/restore", "restore"),
    route("GET", "/categories", "categories"),
  ],
};
