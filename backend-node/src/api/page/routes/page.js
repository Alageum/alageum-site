"use strict";
// This is the entire public Page surface; no generic create/update/delete routes.
module.exports = { routes: [{ method: "GET", path: "/pages/:slug", handler: "page.findPublished", config: { auth: false } }] };
