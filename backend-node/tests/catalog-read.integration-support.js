"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createCatalog, CATEGORY, PRODUCT } = require("../src/domain/catalog");
const parseExact = text => JSON.parse(text, (_key, value, context) => typeof value === "number" && !Number.isSafeInteger(value) && /^-?\d+$/.test(context.source || "") ? JSON.rawJSON(context.source) : value);
const reference = parseExact(require("node:fs").readFileSync(require("node:path").join(__dirname, "reference/legacy-query.json"), "utf8"));

async function runCatalogReadTests(t, app, { manager }) {
  const db = app.db.connection, base = `http://127.0.0.1:${app.server.httpServer.address().port}/api/v1`;
  const prefix = `finite-read-${randomUUID()}`, uuidPrefix = randomUUID().slice(0, 24), now = new Date();
  const categories = Array.from({ length: 106 }, (_, i) => ({ transport_id: `${uuidPrefix}${String(i + 1).padStart(12, "0")}`, document_id: randomUUID().replaceAll("-", "").slice(0, 24), public_key: `${prefix}-c-${String(106 - i).padStart(3, "0")}`, slug: `${prefix}-c-${i}`, translations: { ru: { name: `Fictitious category ${i}` } }, sort_order: -1000, is_published: i < 105, created_at: now, updated_at: now, published_at: now }));
  const products = Array.from({ length: 106 }, (_, i) => ({ transport_id: randomUUID(), document_id: randomUUID().replaceAll("-", "").slice(0, 24), public_key: `${prefix}-p-${String(i).padStart(3, "0")}`, slug: `${prefix}-p-${i}`, category_id: categories[i === 105 ? 105 : 0].transport_id, translations: { ru: { name: `Fictitious product ${i}` } }, sort_order: -1000, status: "published", comparable: false, price: null, currency: null, price_mode: "on_request", version: 1, specs: {}, provenance: {}, media: "[]", source_data: {}, attributes_data: "[]", created_at: now, updated_at: now, published_at: now }));
  const categoryIds = categories.map(row => row.transport_id), productIds = products.map(row => row.transport_id);
  await db(CATEGORY).insert(categories); await db(PRODUCT).insert(products);
  const snapshot = async () => JSON.stringify({ categories: await db(CATEGORY).orderBy("id"), products: await db(PRODUCT).orderBy("id"), audit: await db.withSchema("b2b").table("audit_events").orderBy("id") });
  const before = await snapshot();
  async function get(path, query = "", status = 200, raw = false) {
    const response = await fetch(`${base}${path}${query ? `?${query}` : ""}`, { headers: path.startsWith("/admin/") ? { Authorization: `Bearer ${manager}` } : {} });
    const text = await response.text(); assert.equal(response.status, status, `${path}?${query}: ${text}`); return raw ? text : JSON.parse(text);
  }
  try {
    await t.test("four catalog HTTP handlers match every pinned frozen pagination reference vector", async () => {
      for (const path of ["/catalog/categories", "/catalog/products", "/admin/catalog/categories", "/admin/catalog/products"]) {
        for (const vector of reference.cases.filter(vector => vector.endpoint === "pagination")) {
          const actual = parseExact(await get(path, vector.query, vector.expected.status, true)), expected = vector.expected.body;
          if (vector.expected.status === 200) {
            assert.deepEqual(actual.page, expected.page, `${path}: ${vector.id}`); assert.equal(actual.page_size, expected.page_size, `${path}: ${vector.id}`);
            assert.deepEqual(Object.keys(actual).sort(), ["items", "page", "page_size", "total"]);
          } else {
            assert.deepEqual({ ...actual.error, request_id: null }, expected.error, `${path}: ${vector.id}`);
          }
        }
      }
    });
    await t.test("compatibility catalog pagination defaults50/caps100 and only public categories use UUID tie order", async () => {
      const publicRows = [...categories].filter(row => row.is_published).sort((a, b) => a.transport_id.localeCompare(b.transport_id));
      const adminRows = [...categories].sort((a, b) => a.public_key.localeCompare(b.public_key));
      for (const [path, expected] of [["/catalog/categories", publicRows], ["/admin/catalog/categories", adminRows]]) {
        const page = await get(path); assert.equal(page.page_size, 50); assert.equal(page.items.length, 50);
        assert.deepEqual(Object.keys(page).sort(), ["items", "page", "page_size", "total"]);
        assert.deepEqual(page.items.map(row => row.id), expected.slice(0, 50).map(row => row.transport_id));
        const next = await get(path, "page=2&page_size=50"); assert.deepEqual(next.items.map(row => row.id), expected.slice(50, 100).map(row => row.transport_id));
        assert.equal((await get(path, "page_size=101")).items.length, 100);
        assert.equal((await get(path, "page=999")).total, page.total);
      }
      for (const path of ["/catalog/products", "/admin/catalog/products"]) {
        const page = await get(path, `q=${prefix}`), expected = path.startsWith("/admin/") ? 106 : 105;
        assert.deepEqual([page.page, page.page_size, page.total, page.items.length], [1, 50, expected, 50]);
        assert.deepEqual(page.items.map(row => row.public_key), products.slice(0, 50).map(row => row.public_key));
        const capped = await get(path, `q=${prefix}&page_size=999`); assert.equal(capped.page_size, 100); assert.equal(capped.items.length, 100);
      }
    });
    await t.test("all four catalog lists use raw last exact scalars, full query length and exact huge-page envelopes", async () => {
      for (const path of ["/catalog/categories", "/catalog/products", "/admin/catalog/categories", "/admin/catalog/products"]) {
        const first = await get(path, "page_size=1"), second = await get(path, "page=2&page_size=1");
        for (const query of ["page=invalid&page=2&page_size=1", "page[]=9&page=2&page_size=1&page_size[]=99", `${"ignored=x&".repeat(1001)}page=2&page_size=1`])
          assert.deepEqual(await get(path, query), second);
        for (const query of ["page[]=2&page_size=1", "page[0]=2&page_size=1", "page[x]=2&page_size=1", "page=1&page[]=2&page_size=1", "page=%2B01.00&page_size=1", "page=%C2%A01%E3%80%80&page_size=1"])
          assert.deepEqual(await get(path, query), first);
        for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "", "1.5", "1e1", "1__1", "NaN"]) {
          const error = (await get(path, `${field}=${value}`, 422)).error;
          assert.equal(error.code, "validation_error"); assert.deepEqual(error.details[0].loc, ["query", field]);
        }
        for (const page of ["9007199254740993", "999999999999999999999999999999999999999999"]) {
          const raw = await get(path, `page=${page}`, 200, true); assert.ok(raw.includes(`"page":${page}`));
          const empty = JSON.parse(raw); assert.deepEqual(empty.items, []); assert.equal(empty.total, first.total); assert.equal(Object.hasOwn(empty, "offset"), false);
        }
      }
    });
    await t.test("native catalog list behavior stays default20/current validation and public-key tie order", async () => {
      const native = createCatalog({ db, authorizer: { manager: async () => ({}) } });
      for (const method of ["list", "categoryList"]) {
        const ctx = { query: {}, querystring: "page_size=101" }; await native[method](ctx, true);
        assert.equal(ctx.body.page_size, 20); assert.equal(ctx.body.items.length, 20);
        await assert.rejects(native[method]({ query: { page_size: "101" } }, true), error => error.status === 422);
      }
      const ctx = { query: {} }; await native.categoryList(ctx, true);
      assert.deepEqual(ctx.body.items.map(row => row.id), [...categories].sort((a, b) => a.public_key.localeCompare(b.public_key)).slice(0, 20).map(row => row.transport_id));
      assert.equal(await snapshot(), before);
    });
  } finally {
    await db(PRODUCT).whereIn("transport_id", productIds).delete(); await db(CATEGORY).whereIn("transport_id", categoryIds).delete();
  }
}
module.exports = { runCatalogReadTests };
