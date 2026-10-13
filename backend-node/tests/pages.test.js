"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePageRequest, validatePage, validateBlocks, getPage, UID, FIELDS } = require("../src/domain/pages");
const body = [{ type: "paragraph", children: [{ type: "text", text: "Verified text" }] }];
test("public Page requests accept one exact locale and cannot tunnel Strapi queries", () => {
  const ctx = querystring => ({ params: { slug: "about" }, querystring });
  assert.deepEqual(parsePageRequest(ctx("")), { slug: "about", locale: "ru" });
  assert.equal(parsePageRequest(ctx("locale=kk")).locale, "kk");
  for (const query of ["locale=en&locale=ru", "locale[]=ru", "status=draft", "populate=*", "filters[slug]=about", "locale=kz", "locale="]) assert.throws(() => parsePageRequest(ctx(query)), error => error.status === 400);
  assert.throws(() => parsePageRequest({ params: { slug: "Bad_Slug" } }), error => error.status === 404);
});
test("Page Blocks reject unsafe protocols, unknown fields, media and excessive content", () => {
  const page = { slug: "about", title: "About", locale_code: "ru", body };
  assert.equal(validatePage(page), page);
  for (const url of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "https://u:p@example.com", "/\\evil.example", " https://example.com"]) assert.throws(() => validateBlocks([{ type: "paragraph", children: [{ type: "link", url, children: [{ type: "text", text: "link" }] }] }]));
  for (const invalid of [[{ type: "image", image: {} }], [{ type: "paragraph", html: "<b>x</b>", children: [] }], [{ type: "paragraph", children: [{ type: "text", text: "x".repeat(100001) }] }]]) assert.throws(() => validateBlocks(invalid));
});
test("Page serialized body budget rejects link-heavy content before Next's response limit", () => {
  const link = { type: "link", url: "https://example.com/" + "a".repeat(1900), children: [{ type: "text", text: "x" }] };
  assert.throws(() => validateBlocks(Array.from({ length: 3 }, () => ({ type: "paragraph", children: Array.from({ length: 100 }, () => link) }))), /budget/);
});
test("public Page reads select published exact-locale data and allowlist output", async () => {
  let selection;
  const strapi = { documents(uid) { assert.equal(uid, UID); return { async findFirst(params) { selection = params; return { slug: "about", title: "About", locale_code: "ru", body, secret: "must not leak", publishedAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" }; } }; } };
  const ctx = { method: "GET", params: { slug: "about" }, querystring: "locale=ru" };
  await getPage(strapi, ctx);
  assert.deepEqual(selection, { status: "published", filters: { slug: "about", locale_code: "ru" }, fields: [...FIELDS, "publishedAt", "updatedAt"] });
  assert.deepEqual(Object.keys(ctx.body).sort(), [...FIELDS, "published_at", "updated_at"].sort());
  await assert.rejects(() => getPage({ documents: () => ({ findFirst: async () => null }) }, ctx), error => error.status === 404 && error.code === "page_not_found");
});
