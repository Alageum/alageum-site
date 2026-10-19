"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { UID, FIELDS, requestOptions, validateNews, coverDto, getNews, listNews } = require("../src/domain/news");
const fixture = () => ({ slug: "factory-news", title: "Factory news", locale_code: "ru", summary: "Published summary", body: [{ type: "paragraph", children: [{ type: "text", text: "Article body" }] }], publishedAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z", cover: null });
test("news query cannot select drafts, relations, arbitrary sort or unbounded pagination", () => {
  assert.deepEqual(requestOptions({ method: "GET", querystring: "locale=en&page=2&page_size=3" }), { locale: "en", page: 2, pageSize: 3 });
  for (const querystring of ["status=draft", "populate=*", "filters[slug]=x", "page=0", "page=1&page=2", "page_size=51", "page=10001", "locale=RU"]) assert.throws(() => requestOptions({ method: "GET", querystring }), error => error.status === 400);
});
test("news body uses bounded safe Blocks and cover only admits local raster Media Library records", () => {
  validateNews(fixture());
  assert.throws(() => validateNews({ ...fixture(), summary: "" }));
  assert.throws(() => validateNews({ ...fixture(), publication_date: "2026-02-31" }));
  assert.throws(() => validateNews({ ...fixture(), body: [{ type: "image", image: { url: "https://evil.example" } }] }));
  const cover = { provider: "local", url: "/uploads/image_123.png", mime: "image/png", width: 20, height: 10 };
  assert.deepEqual(coverDto(cover, "Cover"), { url: cover.url, alt: "Cover", width: 20, height: 10 });
  for (const change of [{ provider: "remote" }, { url: "https://evil.example/x.png" }, { url: "/uploads/../x.png" }, { mime: "image/svg+xml" }, { width: 0 }]) assert.throws(() => coverDto({ ...cover, ...change }));
});
test("public news list and detail select published exact-locale records and strip admin metadata", async () => {
  const selections = [], row = { ...fixture(), secret: "private", createdBy: { email: "private" } };
  const strapi = { documents(uid) { assert.equal(uid, UID); return { async findMany(options) { selections.push(options); return [row]; }, async count(options) { selections.push(options); return 1; }, async findFirst(options) { selections.push(options); return row; } }; } };
  const list = { method: "GET", querystring: "locale=ru&page_size=3" };
  await listNews(strapi, list); assert.equal(list.body.pagination.total, 1); assert.equal(list.body.data[0].body, undefined); assert.equal(list.body.data[0].secret, undefined);
  const detail = { method: "GET", params: { slug: row.slug }, querystring: "" }; await getNews(strapi, detail); assert.deepEqual(detail.body.body, row.body); assert.equal(detail.body.createdBy, undefined);
  assert.ok(selections.every(item => item.status === "published" && item.filters.locale_code === "ru"));
  row.publishedAt = null; await assert.rejects(() => getNews(strapi, detail), /Unpublished/);
});
test("News is visible in native Content Manager with draft/publish and no generic write API", async () => {
  const schema = require("../src/api/news-article/content-types/news-article/schema.json");
  assert.equal(schema.options.draftAndPublish, true); assert.equal(schema.attributes.cover.type, "media");
  const routes = require("../src/api/news-article/routes/news-article").routes; assert.equal(routes.length, 2); assert.ok(routes.every(route => route.method === "GET"));
  assert.deepEqual(Object.keys(schema.attributes).sort(), [...FIELDS].sort());
  const { isPageBodyField } = await import("../src/admin/page-editor-options.mjs"); assert.equal(isPageBodyField(UID, "body"), true);
});
