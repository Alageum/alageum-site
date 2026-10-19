"use strict";
// Native Content Manager is the only write surface. No generic content API exists.
module.exports = { routes: [
  { method: "GET", path: "/news", handler: "news-article.findPublished", config: { auth: false } },
  { method: "GET", path: "/news/:slug", handler: "news-article.findPublishedOne", config: { auth: false } },
] };
