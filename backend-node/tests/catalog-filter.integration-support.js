const reviewedRecordCount = require("../data/catalog-release.json").recordCount;
"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const filters = require("../src/domain/catalog-filters");
const { CATEGORY, PRODUCT, NAMESPACE } = require("../src/domain/catalog");
const { readCatalog } = require("../src/domain/catalog-source");
const { v5: uuid5 } = require("uuid");
const parseExact = text => JSON.parse(text, (_key, value, context) => typeof value === "number" && !Number.isSafeInteger(value) && /^-?\d+$/.test(context.source || "") ? JSON.rawJSON(context.source) : value);
const reference = parseExact(require("node:fs").readFileSync(require("node:path").join(__dirname, "reference/legacy-query.json"), "utf8"));
const table = db => db.withSchema("b2b").table(filters.TABLE);
const code = expected => error => error.code === expected;
const categoryRow = (key, published, parent = null) => ({ transport_id: randomUUID(), document_id: randomUUID().replaceAll("-", "").slice(0, 24), public_key: key, slug: key, translations: { ru: { name: "Fictitious filter category" } }, sort_order: 10000, parent_id: parent, is_published: published, created_at: new Date(), updated_at: new Date(), published_at: new Date() });
async function definitionsSnapshot(db) { return JSON.stringify(await table(db).select("*", db.raw("translations::text AS translations")).orderBy("id")); }
async function reviewedIdentities(db) {
  const rows = await db(PRODUCT).whereIn("public_key", readCatalog().map(row => row.id)).select("transport_id", "public_key").orderBy("public_key");
  assert.equal(rows.length, reviewedRecordCount);
  for (const row of rows) assert.equal(row.transport_id, uuid5(`product:${row.public_key}`, NAMESPACE));
  return rows;
}
async function runCatalogFilterTests(t, app) {
  const db = app.db.connection, base = `http://127.0.0.1:${app.server.httpServer.address().port}/api/v1`;
  const prefix = `filter-fixture-${randomUUID()}`, uuidPrefix = randomUUID().slice(0, 24);
  const published = categoryRow(`${prefix}-published`, true), unpublished = categoryRow(`${prefix}-unpublished`, false), empty = categoryRow(`${prefix}-empty`, true);
  const child = categoryRow(`${prefix}-child`, true, unpublished.transport_id);
  const categories = [published, unpublished, empty, child];
  assert.equal(Number((await table(db).count("* AS count").first()).count), 0, "reviewed 238-row importer must not manufacture definitions");
  await filters.preflightSchema(db); await filters.ensureSchema(db);
  const sourceBefore = await reviewedIdentities(db);
  const rows = Array.from({ length: 107 }, (_, i) => ({ id: `${uuidPrefix}${String(i + 1).padStart(12, "0")}`, category_id: published.transport_id, code: `code-${String(107 - i).padStart(3, "0")}`, data_type: i === 0 ? "arbitrary vendor type" : i === 1 ? "" : "unknown_type", unit: i === 0 ? null : i === 1 ? "" : "\n μΩ ", translations: i === 0 ? '{"ru":{"name":"Ток"},"unknown-locale":{"options":[null,false,{"large":9007199254740993,"negative":-9007199254740993123456789}]},"fraction":1.234567890123456789}' : JSON.stringify({ "unrecognized-locale": { name: `Definition ${i}`, options: [i, true, null] } }), is_filterable: i < 105, is_comparable: false }));
  const hidden = { ...rows[0], id: randomUUID(), category_id: unpublished.transport_id, translations: "null" };
  const childDefinition = { ...rows[1], id: randomUUID(), category_id: child.transport_id };
  rows[105].translations = '"{}"'; rows[106].translations = "[]";
  await db(CATEGORY).insert(categories); await table(db).insert([...rows].reverse().concat([hidden, childDefinition]));
  const businessSnapshot = async () => JSON.stringify({ definitions: await definitionsSnapshot(db), categories: await db(CATEGORY).orderBy("id"), products: await db(PRODUCT).orderBy("id"), audit: await db.withSchema("b2b").table("audit_events").orderBy("id") });
  const before = await businessSnapshot();
  async function get(query = `category_id=${published.transport_id}`, status = 200, raw = false, headers = {}) {
    const response = await fetch(`${base}/catalog/filters?${query}`, { headers }); const text = await response.text();
    assert.equal(response.status, status, `${query}: ${text}`); return raw ? text : JSON.parse(text);
  }
  const rollback = async work => {
    const marker = new Error("catalog filter fixture rollback");
    await assert.rejects(db.transaction(async tx => { await work(tx); throw marker; }), error => error === marker);
  };
  try {
    await t.test("filters HTTP handler matches pinned frozen UUID and pagination reference vectors", async () => {
      for (const vector of reference.cases.filter(vector => ["filters", "pagination"].includes(vector.endpoint))) {
        const query = vector.endpoint === "pagination" ? `${vector.query}&category_id=${published.transport_id}` : vector.query;
        const actual = parseExact(await get(query, vector.expected.status, true)), expected = vector.expected.body;
        if (vector.expected.status === 200) {
          assert.deepEqual(actual.page, expected.page, vector.id); assert.equal(actual.page_size, expected.page_size, vector.id);
          assert.deepEqual(Object.keys(actual).sort(), ["items", "page", "page_size", "total"]);
        } else assert.deepEqual({ ...actual.error, request_id: null }, expected.error, vector.id);
      }
    });
    await t.test("public filters return real metadata without products/values, ordered by definition UUID with legacy page totals", async () => {
      assert.equal(Number((await db(PRODUCT).where({ category_id: published.transport_id }).count("* AS count").first()).count), 0);
      const first = await get(); assert.deepEqual(Object.keys(first).sort(), ["items", "page", "page_size", "total"]);
      assert.deepEqual([first.page, first.page_size, first.total, first.items.length], [1, 50, 105, 50]);
      assert.deepEqual(first.items.map(row => row.code), rows.slice(0, 50).map(row => row.code));
      for (const row of first.items) assert.deepEqual(Object.keys(row).sort(), ["code", "data_type", "translations", "unit"]);
      const second = await get(`category_id=${published.transport_id}&page=2`);
      assert.deepEqual(second.items.map(row => row.code), rows.slice(50, 100).map(row => row.code));
      assert.deepEqual((await get(`category_id=${published.transport_id}&page=3`)).items.map(row => row.code), rows.slice(100, 105).map(row => row.code));
      assert.deepEqual(await get(`category_id=${published.transport_id}&page=4`), { items: [], page: 4, page_size: 50, total: 105 });
      for (const size of [100, 101, 999]) { const page = await get(`category_id=${published.transport_id}&page_size=${size}`); assert.equal(page.page_size, 100); assert.equal(page.items.length, 100); }
      const precise = await get(`category_id=${published.transport_id}&page_size=1`, 200, true);
      assert.ok(precise.includes('"large":9007199254740993')); assert.ok(precise.includes('"negative":-9007199254740993123456789'));
      assert.ok(precise.includes('"fraction":1.2345678901234567'));
      assert.equal(first.items[0].unit, null); assert.equal(first.items[0].data_type, "arbitrary vendor type");
      assert.equal(first.items[1].unit, ""); assert.equal(first.items[1].data_type, ""); assert.equal(first.items[2].unit, "\n μΩ ");
      for (const id of [unpublished.transport_id, empty.transport_id, randomUUID(), "00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001"])
        assert.deepEqual(await get(`category_id=${id}`), { items: [], page: 1, page_size: 50, total: 0 });
      assert.deepEqual((await get(`category_id=${child.transport_id}`)).items.map(row => row.code), [childDefinition.code]);
      assert.deepEqual(await get(undefined, 200, false, { Authorization: "Bearer malformed-or-expired", "X-Organization-Id": randomUUID() }), first);
    });
    await t.test("filters require legacy-normalized raw category UUID and consume exact scalars beyond qs truncation", async () => {
      const canonical = await get(`category_id=${published.transport_id}&page_size=1`);
      for (const id of [published.transport_id.toUpperCase(), published.transport_id.replaceAll("-", ""), `{${published.transport_id}}`, `urn:uuid:${published.transport_id}`])
        assert.deepEqual(await get(`category_id=${encodeURIComponent(id)}&page_size=1`), canonical);
      for (const query of [`category_id=invalid&category_id=${published.transport_id}&page_size=1`, `category_id[]=${unpublished.transport_id}&category_id=${published.transport_id}&page_size=1`, `${"ignored=x&".repeat(1001)}category_id=${published.transport_id}&page_size=1`, `category_id=${published.transport_id}&category_id[x]=bad&page_size=1`])
        assert.deepEqual(await get(query), canonical);
      for (const query of ["", "category_id[]=ignored", "Category_id=ignored"]) {
        const error = (await get(query, 422)).error; assert.deepEqual(error.details.at(-1).loc, ["query", "category_id"]); assert.equal(error.details.at(-1).type, "missing");
      }
      for (const value of ["", "null", "bad", published.public_key, ` ${published.transport_id}`, `URN:UUID:${published.transport_id}`, `{${published.transport_id.replaceAll("-", "")}}`]) {
        const error = (await get(`category_id=${encodeURIComponent(value)}`, 422)).error;
        assert.equal(error.code, "validation_error"); assert.deepEqual(error.details[0].loc, ["query", "category_id"]); assert.equal(error.details[0].input, value);
      }
      const second = await get(`category_id=${published.transport_id}&page=2&page_size=1`);
      for (const suffix of ["page=bad&page=2&page_size=1", "page[]=99&page=2&page_size=1", `${"ignored=x&".repeat(1001)}page=2&page_size=1`])
        assert.deepEqual(await get(`category_id=${published.transport_id}&${suffix}`), second);
      for (const suffix of ["page[]=9&page_size=1", "page=%2B01.00&page_size=1", "page=%C2%A01%E3%80%80&page_size=1"])
        assert.deepEqual(await get(`category_id=${published.transport_id}&${suffix}`), canonical);
      for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "", "1.5", "1e1", "1__1"])
        assert.deepEqual((await get(`category_id=${published.transport_id}&${field}=${value}`, 422)).error.details[0].loc, ["query", field]);
      for (const page of ["9007199254740993", "999999999999999999999999999999999999999"]) {
        const raw = await get(`category_id=${published.transport_id}&page=${page}`, 200, true); assert.ok(raw.includes(`"page":${page}`));
        const body = JSON.parse(raw); assert.deepEqual(body.items, []); assert.equal(body.total, 105); assert.equal(Object.hasOwn(body, "offset"), false);
      }
    });
    await t.test("selected malformed translations or driver DTO fail the whole read without coercion or writes", async () => {
      for (const value of ["null", "[]", '"{}"', "42"]) {
        await table(db).where({ id: rows[0].id }).update({ translations: value });
        try {
          const error = (await get(undefined, 500)).error; assert.equal(error.code, "internal_error");
          assert.equal((await get(`category_id=${published.transport_id}&page=2&page_size=1`)).items[0].code, rows[1].code);
          assert.equal((await table(db).where({ id: rows[0].id }).select(db.raw("translations::text AS value")).first()).value, value);
        } finally { await table(db).where({ id: rows[0].id }).update({ translations: rows[0].translations }); }
      }
      const pgTypes = require("pg").types, original = pgTypes.getTypeParser(1043, "text");
      pgTypes.setTypeParser(1043, "text", value => value === rows[0].code ? 123 : original(value));
      try { assert.equal((await get(undefined, 500)).error.code, "internal_error"); }
      finally { pgTypes.setTypeParser(1043, "text", original); }
      assert.equal(await businessSnapshot(), before);
    });
    await t.test("filter store has exact legacy columns, no defaults and a native transport-string FK without cascade", async () => {
      const columns = await db("information_schema.columns").where({ table_schema: "b2b", table_name: filters.TABLE });
      assert.equal(columns.length, 8); assert.ok(columns.every(column => column.column_default === null));
      const target = await db("information_schema.columns").where({ table_schema: "public", table_name: CATEGORY, column_name: "transport_id" }).first();
      const reference = columns.find(column => column.column_name === "category_id");
      assert.equal(reference.data_type, target.data_type); assert.equal(reference.character_maximum_length, target.character_maximum_length);
      assert.equal(columns.find(column => column.column_name === "id").data_type, "uuid");
      for (const [patch, expected] of [[{ id: rows[0].id }, "23505"], [{ category_id: randomUUID() }, "23503"], [{ code: rows[0].code }, "23505"], [{ code: "x".repeat(121) }, "22001"], [{ data_type: "x".repeat(41) }, "22001"], [{ unit: "x".repeat(51) }, "22001"]])
        await assert.rejects(table(db).insert({ ...rows[0], id: randomUUID(), code: randomUUID(), ...patch }), code(expected));
      for (const field of ["id", "category_id", "code", "data_type", "translations", "is_filterable", "is_comparable"]) {
        const row = { ...rows[0], id: randomUUID(), code: randomUUID() }; delete row[field];
        await assert.rejects(table(db).insert(row), code("23502"));
      }
      await assert.rejects(db(CATEGORY).where({ transport_id: published.transport_id }).delete(), code("23503"));
      await rollback(async tx => { await table(tx).insert({ ...rows[0], id: randomUUID(), category_id: empty.transport_id }); });
      await filters.ensureSchema(db); await filters.ensureSchema(db); await filters.preflightSchema(db);
      assert.equal(await businessSnapshot(), before);
      assert.deepEqual(await app.alageum.catalog.importRecords(readCatalog()), { categories_created: 0, created: 0, skipped: reviewedRecordCount });
      assert.deepEqual(await reviewedIdentities(db), sourceBefore); assert.equal(await businessSnapshot(), before);
    });
    await t.test("filter preflight refuses schema drift before native synchronization or bootstrap writes", async () => {
      const changes = [
        "ALTER TABLE b2b.product_attribute_definitions ALTER COLUMN code SET DEFAULT 'invented'",
        "ALTER TABLE b2b.product_attribute_definitions ALTER COLUMN code DROP NOT NULL",
        "ALTER TABLE b2b.product_attribute_definitions ALTER COLUMN code TYPE varchar(121)",
        "ALTER TABLE b2b.product_attribute_definitions ADD COLUMN invented text",
        "ALTER TABLE b2b.product_attribute_definitions ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE b2b.product_attribute_definitions DROP CONSTRAINT product_attribute_definitions_category_id_code_unique",
        "DROP INDEX b2b.product_attribute_definitions_category_id_index",
        "CREATE INDEX unexpected_filter_index ON b2b.product_attribute_definitions (code)",
        "ALTER TABLE public.alageum_categories ALTER COLUMN transport_id SET DEFAULT 'invented'",
        async tx => { await tx.raw("ALTER TABLE b2b.product_attribute_definitions DROP CONSTRAINT product_attribute_definitions_category_id_foreign"); await tx.raw("ALTER TABLE b2b.product_attribute_definitions ADD FOREIGN KEY (category_id) REFERENCES public.alageum_categories(transport_id) ON DELETE CASCADE"); },
        async tx => { await tx.raw("ALTER TABLE b2b.product_attribute_definitions DROP CONSTRAINT product_attribute_definitions_category_id_foreign"); await tx.raw("ALTER TABLE b2b.product_attribute_definitions ALTER COLUMN category_id TYPE varchar(254)"); },
        async tx => { await tx.raw("ALTER TABLE b2b.product_attribute_definitions RENAME TO fixture_saved_definitions"); await tx.raw("CREATE VIEW b2b.product_attribute_definitions AS SELECT * FROM b2b.fixture_saved_definitions"); },
        async tx => { await tx.raw("ALTER TABLE b2b.product_attribute_definitions DROP CONSTRAINT product_attribute_definitions_pkey"); await tx.raw("ALTER TABLE b2b.product_attribute_definitions ADD PRIMARY KEY (id) DEFERRABLE"); },
      ];
      for (const change of changes) await rollback(async tx => {
        if (typeof change === "string") await tx.raw(change); else await change(tx);
        await assert.rejects(filters.preflightSchema(tx), /Catalog filter schema mismatch/);
        await assert.rejects(filters.ensureSchema(tx), /Catalog filter schema mismatch/);
        let synchronized = false;
        await assert.rejects(require("../src").register({ strapi: { db: { connection: tx }, documents: { use() { synchronized = true; } } } }), /Catalog filter schema mismatch/);
        assert.equal(synchronized, false);
      });
      assert.equal(await businessSnapshot(), before);
    });
  } finally {
    await table(db).whereIn("category_id", categories.map(row => row.transport_id)).delete();
    await db(CATEGORY).whereIn("transport_id", categories.map(row => row.transport_id)).delete();
  }
}

async function createRestartFixture(app) {
  const db = app.db.connection, category = await db(CATEGORY).where({ public_key: "transformers" }).first();
  const row = { id: randomUUID(), category_id: category.transport_id, code: `restart-${randomUUID()}`, data_type: "opaque", unit: null, translations: '{"restart":{"large":9007199254740993,"negative":-900719925474099312345}}', is_filterable: true, is_comparable: false };
  await table(db).insert(row);
  return { row, snapshot: await definitionsSnapshot(db), identities: await reviewedIdentities(db) };
}
async function verifyRestartFixture(app, fixture) {
  const db = app.db.connection;
  try {
    await filters.verifySchema(db);
    assert.equal(await definitionsSnapshot(db), fixture.snapshot); assert.deepEqual(await reviewedIdentities(db), fixture.identities);
    const ctx = { querystring: `category_id=${fixture.row.category_id}` }; await app.alageum.catalogFilters.list(ctx);
    assert.equal(ctx.body.items.length, 1); assert.equal(ctx.body.items[0].code, fixture.row.code);
    assert.ok(JSON.stringify(ctx.body).includes('"large":9007199254740993'));
  } finally { await table(db).where({ id: fixture.row.id }).delete(); }
}

async function verifyNativeAdapterTransition(db, refuseStartup) {
  const savedName = "fixture_saved_filter_definitions", savedTable = `b2b.${savedName}`;
  const prefix = `adapter-preflight-${randomUUID()}`, identity = randomUUID();
  const original = JSON.stringify({ definitions: await definitionsSnapshot(db), categories: await db(CATEGORY).orderBy("id") });
  const constraints = (await db.raw("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.alageum_categories'::regclass AND contype='u'")).rows;
  const key = constraints.find(row => row.definition === "UNIQUE (transport_id)");
  assert.ok(key, "installed Strapi 5.56 column.unique must own a SQL UNIQUE constraint");
  const nativeSchema = require("../src/api/category/content-types/category/schema.json");
  assert.equal(nativeSchema.attributes.transport_id.column.unique, true);
  assert.equal(nativeSchema.options.draftAndPublish, false);
  let renamed = false, removedFk = false, removedKey = false;
  try {
    // Preserve the populated store under a temporary name while reproducing
    // an existing pre-adapter native DB. The fixture performs no row re-import.
    await db.raw("ALTER TABLE b2b.product_attribute_definitions RENAME TO ??", [savedName]); renamed = true;
    await db.raw("ALTER TABLE ?? DROP CONSTRAINT product_attribute_definitions_category_id_foreign", [savedTable]); removedFk = true;
    await db.raw("ALTER TABLE public.alageum_categories DROP CONSTRAINT ??", [key.conname]); removedKey = true;
    const snapshot = async () => JSON.stringify({ definitions: await db(savedTable).select("*", db.raw("translations::text AS translations")).orderBy("id"), categories: await db(CATEGORY).orderBy("id"), products: await db(PRODUCT).orderBy("id"), audit: await db.withSchema("b2b").table("audit_events").orderBy("id") });
    await filters.preflightSchema(db); // Clean missing index is additive only.
    await assert.rejects(filters.ensureSchema(db), /Catalog filter schema mismatch/); // Native sync must own index creation.
    // A malformed existing key must never take the initial-missing exception.
    await db.raw("CREATE UNIQUE INDEX ?? ON public.alageum_categories (transport_id) WHERE transport_id IS NOT NULL", [key.conname]);
    try { await refuseStartup(snapshot); }
    finally { await db.raw("DROP INDEX ??", [`public.${key.conname}`]); }
    for (const create of [
      "CREATE UNIQUE INDEX ?? ON public.alageum_categories ((lower(transport_id)))",
      "CREATE INDEX ?? ON public.alageum_categories (id)",
      "ALTER TABLE public.alageum_categories ADD CONSTRAINT ?? UNIQUE (transport_id) DEFERRABLE",
    ]) {
      await db.raw(create, [key.conname]);
      try { await assert.rejects(filters.preflightSchema(db), /Catalog filter schema mismatch/); }
      finally {
        if (create.startsWith("ALTER TABLE")) await db.raw("ALTER TABLE public.alageum_categories DROP CONSTRAINT ??", [key.conname]);
        else await db.raw("DROP INDEX ??", [`public.${key.conname}`]);
      }
    }
    await db(CATEGORY).insert([0, 1].map(i => ({ ...categoryRow(`${prefix}-${i}`, true), transport_id: identity })));
    await refuseStartup(snapshot);
    await db(CATEGORY).where("public_key", "like", `${prefix}%`).delete();
    for (const invalid of ["not-a-uuid", "A0000000-0000-4000-8000-000000000001", null]) {
      await db(CATEGORY).insert({ ...categoryRow(`${prefix}-invalid`, true), transport_id: invalid });
      await refuseStartup(snapshot);
      await db(CATEGORY).where("public_key", "like", `${prefix}%`).delete();
    }
    await filters.preflightSchema(db);
  } finally {
    await db(CATEGORY).where("public_key", "like", `${prefix}%`).delete();
    if (removedKey) await db.raw("ALTER TABLE public.alageum_categories ADD CONSTRAINT ?? UNIQUE (transport_id)", [key.conname]);
    if (removedFk) await db.raw("ALTER TABLE ?? ADD CONSTRAINT product_attribute_definitions_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.alageum_categories(transport_id)", [savedTable]);
    if (renamed) await db.raw("ALTER TABLE ?? RENAME TO product_attribute_definitions", [savedTable]);
  }
  assert.equal(JSON.stringify({ definitions: await definitionsSnapshot(db), categories: await db(CATEGORY).orderBy("id") }), original);
  await filters.verifySchema(db);
}
module.exports = { runCatalogFilterTests, createRestartFixture, verifyRestartFixture, verifyNativeAdapterTransition };
