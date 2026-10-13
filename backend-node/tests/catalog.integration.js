const reviewedRecordCount = require("../data/catalog-release.json").recordCount;
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { PRODUCT, CATEGORY, NAMESPACE } = require("../src/domain/catalog");
const { readCatalog } = require("../src/domain/catalog-source");
const { v5: uuid5 } = require("uuid");
const { DEMO } = require("../src/domain/auth");
function ctx({ token, body, params = {}, query = {} } = {}) {
  return {
    state: { requestId: randomUUID() },
    request: { body },
    params,
    query,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    get(name) {
      return this.headers[name.toLowerCase()] || "";
    },
    set() {},
  };
}
async function rejects(work, code, status) {
  await assert.rejects(work, (e) => {
    assert.equal(e.code, code);
    assert.equal(e.status, status);
    return true;
  });
}
test("real Strapi/PostgreSQL catalog and HTTP contract", async (t) => {
  assert.ok(
    process.env.DATABASE_URL?.includes("/alageum_strapi"),
    "Use a dedicated alageum_strapi test database",
  );
  process.env.APP_ENV = "test";
  process.env.ALAGEUM_SEED_DEMO = "true";
  process.env.ALAGEUM_IMPORT_CATALOG = "true";
  process.env.STRAPI_TELEMETRY_DISABLED = "true";
  for (const key of [
    "APP_KEYS",
    "ADMIN_JWT_SECRET",
    "API_TOKEN_SALT",
    "TRANSFER_TOKEN_SALT",
    "ENCRYPTION_KEY",
    "ALAGEUM_JWT_SECRET",
  ])
    process.env[key] ||= randomBytes(48).toString("hex");
  let app = require("@strapi/strapi").createStrapi({
    appDir: process.cwd(),
    distDir: process.cwd(),
  });
  t.after(() => app?.destroy());
  await app.load();
  const db = app.db.connection,
    { catalog, auth, quotes } = app.alageum;
  async function login(name) {
    const c = ctx({
      body: { email: `${name}@demo.example`, password: "ChangeMe123!" },
    });
    await auth.login(c);
    return c.body.access_token;
  }
  const manager = await login("catalog"),
    buyer = await login("buyer"),
    admin = await login("admin");
  const category = (
    await db(CATEGORY).where({ public_key: "transformers" }).first()
  ).transport_id;
  const valid = () => {
    const key = `node-test-${randomUUID()}`;
    return {
      public_key: key,
      slug: key,
      category_id: category,
      translations: { ru: { name: "Node test" } },
      status: "published",
      price_mode: "fixed",
      price: "1200.10",
      currency: "USD",
    };
  };
  async function create(data = valid()) {
    const c = ctx({ token: manager, body: data });
    await catalog.create(c);
    assert.equal(c.status, 201);
    return c.body;
  }
  await t.test(
    "Strapi actually owns catalog and editorial types, with business CRUD absent",
    () => {
      assert.ok(app.contentTypes["api::product.product"]);
      assert.ok(app.contentTypes["api::page.page"]);
      assert.equal(
        app.contentTypes["api::product.product"].pluginOptions[
          "content-manager"
        ].visible,
        false,
      );
      assert.equal(app.plugin("users-permissions"), undefined);
    },
  );
  await t.test(
    "native CMS catalog writes fail closed rather than bypassing audit and versions",
    async () => {
      await assert.rejects(
        () =>
          app.documents("api::product.product").create({
            data: {
              public_key: "cms-bypass",
              transport_id: randomUUID(),
              slug: "cms-bypass",
              translations: { ru: { name: "unsafe" } },
              category_id: category,
            },
          }),
        /not enabled/,
      );
    },
  );
  await t.test(
    "released source rows preserve every public key and UUID; reimport is insert-only",
    async () => {
      const records = readCatalog();
      const stored = await db(PRODUCT).whereIn(
        "public_key",
        records.map((r) => r.id),
      );
      assert.equal(stored.length, reviewedRecordCount);
      for (const row of stored) {
        assert.equal(
          row.transport_id,
          uuid5(`product:${row.public_key}`, NAMESPACE),
        );
      }
      assert.deepEqual(await catalog.importRecords(records), {
        categories_created: 0,
        created: 0,
        skipped: reviewedRecordCount,
      });
    },
  );
  await t.test(
    "public stable key/UUID/slug and Unicode literal search contract",
    async () => {
      const c = ctx({ params: { id: "tmg-400" } });
      await catalog.get(c);
      assert.equal(c.body.id, uuid5("product:tmg-400", NAMESPACE));
      assert.equal(c.body.source_data, undefined);
      const list = ctx({ query: { q: "ТМГ", page_size: "100" } });
      await catalog.list(list);
      assert.ok(list.body.total > 0);
      assert.ok(list.body.items.every((p) => p.status === "published"));
      for (const q of ["%", "_"]) {
        const literal = ctx({ query: { q } });
        await catalog.list(literal);
        assert.equal(literal.body.total, 0);
      }
    },
  );
  await t.test("identity completion migrates823to843 atomically and never overwrites edited references", async () => {
    const records = readCatalog(), additions = records.slice(823), rollback = new Error('rollback isolated migration probe');
    assert.equal(additions.length, 20);
    const before = JSON.stringify(await db(PRODUCT).orderBy('id'));
    await assert.rejects(db.transaction(async tx => {
      await tx(PRODUCT).whereIn('public_key', additions.map(row => row.id)).delete();
      await tx(PRODUCT).where({ public_key: 'ntmi-6' }).update({ status: 'hidden', translations: { ru: { name: 'Edited reference retained' } }, version: 7 });
      const kept = JSON.stringify(await tx(PRODUCT).orderBy('id'));
      const { createCatalog } = require('../src/domain/catalog');
      const scoped = createCatalog({ db: tx });
      assert.deepEqual(await scoped.importRecords(records), { categories_created: 0, created: 20, skipped: 823 });
      assert.equal(JSON.stringify(await tx(PRODUCT).whereNotIn('public_key', additions.map(row => row.id)).orderBy('id')), kept);
      const firstImport = JSON.stringify(await tx(PRODUCT).orderBy('id'));
      assert.deepEqual(await scoped.importRecords(records), { categories_created: 0, created: 0, skipped: 843 });
      assert.equal(JSON.stringify(await tx(PRODUCT).orderBy('id')), firstImport);
      for (const row of await tx(PRODUCT).whereIn('public_key', additions.map(row => row.id))) assert.equal(row.transport_id, uuid5(`product:${row.public_key}`, NAMESPACE));
      for (const alias of Object.keys(require('../data/catalog-identity-completion/manifest.json').aliases)) assert.equal(await tx(PRODUCT).where({ public_key: alias }).first(), undefined);
      throw rollback;
    }), error => error === rollback);
    assert.equal(JSON.stringify(await db(PRODUCT).orderBy('id')), before);
  });
  await t.test("canonicalNTMI reads and persisted RFQ snapshots keep their legacy UUIDs across aliases and reimport", async () => {
    const aliases = require('../data/catalog-identity-completion/manifest.json').aliases;
    const c = ctx({ token: buyer }), context = await auth.permission(c, 'quote.create');
    const body = { items: Object.values(aliases).map(id => ({ product_id: uuid5(`product:${id}`, NAMESPACE), quantity: '1' })) };
    const key = randomUUID(), first = await quotes.submit({ context, body, key, ctx: c });
    const snapshot = JSON.stringify(first.quote);
    for (const [alias, canonical] of Object.entries(aliases)) {
      const a = ctx({ params: { id: alias } }), b = ctx({ params: { id: canonical } });
      await catalog.get(a); await catalog.get(b); assert.deepEqual(a.body, b.body);
      assert.equal(a.body.id, uuid5(`product:${canonical}`, NAMESPACE));
      assert.equal(a.body.specs.power, null);
    }
    assert.deepEqual(await catalog.importRecords(readCatalog()), { categories_created: 0, created: 0, skipped: 843 });
    const replay = await quotes.submit({ context, body, key, ctx: c });
    assert.equal(replay.created, false); assert.equal(JSON.stringify(replay.quote), snapshot);
  });
  await t.test(
    "anonymous and tenant administrators cannot manage global catalog",
    async () => {
      await rejects(
        () => catalog.list(ctx(), true),
        "authentication_required",
        401,
      );
      await rejects(
        () => catalog.list(ctx({ token: admin }), true),
        "permission_denied",
        403,
      );
    },
  );
  await t.test(
    "create/update/hide/restore persist exact money, immutable IDs and versions",
    async () => {
      const product = await create();
      let c = ctx({
        token: manager,
        params: { id: product.id },
        body: { version: 1, price: "1500.25" },
      });
      await catalog.update(c);
      assert.equal(c.body.price, "1500.25");
      assert.equal(c.body.version, 2);
      assert.equal(c.body.public_key, product.public_key);
      await rejects(
        () =>
          catalog.update(
            ctx({
              token: manager,
              params: { id: product.id },
              body: { version: 1, price: "3" },
            }),
          ),
        "catalog_version_conflict",
        409,
      );
      c = ctx({
        token: manager,
        params: { id: product.id },
        body: { version: 2 },
      });
      await catalog.update(c, "hide");
      await rejects(
        () => catalog.get(ctx({ params: { id: product.public_key } })),
        "product_not_found",
        404,
      );
      c = ctx({
        token: manager,
        params: { id: product.id },
        body: { version: 3 },
      });
      await catalog.update(c, "restore");
      assert.equal(c.body.status, "draft");
      await rejects(
        () => catalog.get(ctx({ params: { id: product.public_key } })),
        "product_not_found",
        404,
      );
    },
  );
  await t.test(
    "category-change audit records the true before and after category",
    async () => {
      const p = await create();
      const other = await db(CATEGORY)
        .whereNot({ transport_id: category })
        .first();
      await catalog.update(
        ctx({
          token: manager,
          params: { id: p.id },
          body: { version: 1, category_id: other.transport_id },
        }),
      );
      const event = await db
        .withSchema("b2b")
        .table("audit_events")
        .where({ entity_id: p.id, action: "catalog.product.update" })
        .first();
      const evidence =
        typeof event.event_metadata === "string"
          ? JSON.parse(event.event_metadata)
          : event.event_metadata;
      assert.equal(evidence.before.category_id, category);
      assert.equal(evidence.before.category_public_key, "transformers");
      assert.equal(evidence.after.category_id, other.transport_id);
      assert.equal(evidence.after.category_public_key, other.public_key);
    },
  );
  await t.test(
    "frozen v1 allows 100 RFQ lines and lossless Decimal(18,3) quantities",
    async () => {
      const c = ctx({ token: buyer });
      const context = await auth.permission(c, "quote.create");
      const products = await db(PRODUCT)
        .where({ status: "published" })
        .limit(100);
      const result = await quotes.submit({
        context,
        key: randomUUID(),
        ctx: c,
        body: {
          items: products.map((p, i) => ({
            product_id: p.transport_id,
            quantity: i === 0 ? "999999999999999.999" : 1,
          })),
        },
      });
      assert.equal(result.quote.item_count, 100);
      assert.equal(result.quote.items[0].quantity, "999999999999999.999");
    },
  );
  await t.test(
    "optimistic concurrent writes have exactly one winner and one audit",
    async () => {
      const p = await create();
      const before = Number(
        (
          await db
            .withSchema("b2b")
            .table("audit_events")
            .where({ entity_id: p.id })
            .count("* as n")
            .first()
        ).n,
      );
      const results = await Promise.allSettled(
        ["200", "300"].map((price) =>
          catalog.update(
            ctx({
              token: manager,
              params: { id: p.id },
              body: { version: 1, price },
            }),
          ),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        results.find((r) => r.status === "rejected").reason.code,
        "catalog_version_conflict",
      );
      const after = Number(
        (
          await db
            .withSchema("b2b")
            .table("audit_events")
            .where({ entity_id: p.id })
            .count("* as n")
            .first()
        ).n,
      );
      assert.equal(after, before + 1);
    },
  );
  await t.test(
    "alias and UUID shadowing are rejected including hidden identities",
    async () => {
      const p = await create();
      await rejects(
        () => create({ ...valid(), slug: p.public_key }),
        "catalog_unique_conflict",
        409,
      );
      await rejects(
        () => create({ ...valid(), slug: p.id }),
        "catalog_unique_conflict",
        409,
      );
    },
  );
  await t.test("audit failure rolls back catalog write", async () => {
    const { createCatalog } = require("../src/domain/catalog");
    const failing = createCatalog({
      db,
      auth,
      audit: async () => {
        throw new Error("audit failed");
      },
    });
    const data = valid();
    await assert.rejects(
      () => failing.create(ctx({ token: manager, body: data })),
      /audit failed/,
    );
    assert.equal(
      await db(PRODUCT).where({ public_key: data.public_key }).first(),
      undefined,
    );
  });
  await t.test(
    "reviewed import preserves administrator edits/hides and is batch atomic",
    async () => {
      const source = readCatalog();
      const original = await db(PRODUCT)
        .where({ public_key: source[0].id })
        .first();
      await db(PRODUCT).where({ id: original.id }).update({
        status: "hidden",
        price_mode: "fixed",
        price: "123.45",
        currency: "USD",
      });
      try {
        await catalog.importRecords(source);
        const kept = await db(PRODUCT).where({ id: original.id }).first();
        assert.equal(kept.status, "hidden");
        assert.equal(kept.price, "123.45");
      } finally {
        await db(PRODUCT).where({ id: original.id }).update({
          status: original.status,
          price_mode: original.price_mode,
          price: original.price,
          currency: original.currency,
        });
      }
      const record = { ...source[0], id: `atomic-${randomUUID()}`, sku: null };
      await assert.rejects(() =>
        catalog.importRecords([
          record,
          { ...record, id: `bad-${randomUUID()}`, name: "" },
        ]),
      );
      assert.equal(
        await db(PRODUCT).where({ public_key: record.id }).first(),
        undefined,
      );
    },
  );
  await t.test(
    "actual catalog supplies immutable snapshot to RFQ, survives hide and idempotent replay",
    async () => {
      const p = await create();
      const c = ctx({ token: buyer });
      const context = await auth.permission(c, "quote.create");
      const key = randomUUID(),
        body = {
          comment: "Node persisted",
          items: [{ product_id: p.id, quantity: "2.500" }],
        };
      const first = await quotes.submit({ context, body, key, ctx: c });
      assert.equal(first.created, true);
      assert.equal(first.quote.items[0].product_snapshot.price, "1200.10");
      await catalog.update(
        ctx({ token: manager, params: { id: p.id }, body: { version: 1 } }),
        "hide",
      );
      const replay = await quotes.submit({ context, body, key, ctx: c });
      assert.equal(replay.created, false);
      assert.equal(replay.quote.id, first.quote.id);
      await assert.rejects(() =>
        quotes.submit({ context, body, key: randomUUID(), ctx: c }),
      );
    },
  );
  await t.test(
    "category visibility excludes children from public and RFQ paths",
    async () => {
      const p = await create();
      await db(CATEGORY)
        .where({ transport_id: category })
        .update({ is_published: false });
      try {
        await rejects(
          () => catalog.get(ctx({ params: { id: p.id } })),
          "product_not_found",
          404,
        );
        const rows = await db.transaction((tx) =>
          catalog.getForQuote(tx, [p.id]),
        );
        assert.equal(rows.length, 0);
      } finally {
        await db(CATEGORY)
          .where({ transport_id: category })
          .update({ is_published: true });
      }
    },
  );
  await t.test(
    "HTTP compatibility routes return legacy envelopes and no generic data API",
    async () => {
      app.server.mount();
      const server = app.server.httpServer;
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const base = `http://127.0.0.1:${server.address().port}/api/v1`;
      let response = await fetch(`${base}/catalog/products/tmg-400`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).public_key, "tmg-400");
      for (const [alias, canonical] of Object.entries(require('../data/catalog-identity-completion/manifest.json').aliases)) {
        const aliasResponse = await fetch(`${base}/catalog/products/${alias}`);
        const canonicalResponse = await fetch(`${base}/catalog/products/${canonical}`);
        assert.equal(aliasResponse.status, 200); assert.equal(canonicalResponse.status, 200);
        const value = await aliasResponse.json(); assert.deepEqual(value, await canonicalResponse.json());
        assert.equal(value.public_key, canonical); assert.equal(value.id, uuid5(`product:${canonical}`, NAMESPACE));
        assert.equal(value.specs.power, null);
      }
      for (const id of ['__proto__', 'constructor', 'alageum-2026-ntmi-6-x', 'alageum-tmg-standard-400']) {
        assert.equal((await fetch(`${base}/catalog/products/${id}`)).status, 404);
      }
      response = await fetch(`${base}/admin/catalog/products`);
      assert.equal(response.status, 401);
      assert.equal(
        (await response.json()).error.code,
        "authentication_required",
      );
      response = await fetch(`${base}/products`);
      assert.equal(response.status, 404);
      response = await fetch(`${base}/auth/local/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.ok([404, 405].includes(response.status));
      async function httpLogin(name) {
        const result = await fetch(`${base}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `${name}@demo.example`,
            password: "ChangeMe123!",
          }),
        });
        assert.equal(result.status, 200);
        return (await result.json()).access_token;
      }
      const httpManager = await httpLogin("catalog"),
        httpBuyer = await httpLogin("buyer");
      const adminHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${httpManager}`,
      };
      response = await fetch(`${base}/admin/catalog/products`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify(valid()),
      });
      assert.equal(response.status, 201);
      const httpProduct = await response.json();
      const key = randomUUID(),
        buyerHeaders = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${httpBuyer}`,
          "Idempotency-Key": key,
        },
        payload = {
          comment: "HTTP roundtrip",
          items: [{ product_id: httpProduct.id, quantity: "2.500" }],
        };
      response = await fetch(`${base}/quotes/catalog`, {
        method: "POST",
        headers: buyerHeaders,
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 201);
      const httpQuote = await response.json();
      assert.equal(httpQuote.items[0].quantity, "2.500");
      response = await fetch(`${base}/quotes/catalog`, {
        method: "POST",
        headers: buyerHeaders,
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).id, httpQuote.id);
      response = await fetch(`${base}/quotes/${httpQuote.id}`, {
        headers: buyerHeaders,
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).comment, "HTTP roundtrip");
      response = await fetch(`${base}/quotes?mine=true`, {
        headers: buyerHeaders,
      });
      assert.equal(response.status, 200);
      assert.ok(
        (await response.json()).items.some((q) => q.id === httpQuote.id),
      );
      response = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, "validation_error");
    },
  );
  await t.test(
    "revoked actor permission is rechecked inside write transaction",
    async () => {
      const original = auth.context;
      const p = await create();
      const stale = await auth.context(ctx({ token: manager }));
      auth.context = async () => stale;
      await db
        .withSchema("b2b")
        .table("memberships")
        .where({ user_id: DEMO.users.catalog })
        .update({ is_active: false });
      try {
        await rejects(
          () =>
            catalog.update(
              ctx({
                token: manager,
                params: { id: p.id },
                body: { version: 1, price: "12" },
              }),
            ),
          "organization_access_denied",
          403,
        );
      } finally {
        auth.context = original;
        await db
          .withSchema("b2b")
          .table("memberships")
          .where({ user_id: DEMO.users.catalog })
          .update({ is_active: true });
      }
    },
  );
  await t.test("invoice metadata honors unchanged default admin/accountant grants and denies buyer/engineer/catalog", async () => {
    const rolesBefore = await db.withSchema("b2b").table("roles").orderBy("id");
    for (const name of ["admin", "accountant", "buyer", "engineer", "catalog"]) {
      const token = await login(name), request = ctx({ token });
      if (["admin", "accountant"].includes(name)) {
        await app.alageum.invoices.list(request);
        assert.deepEqual(request.body, { items: [], page: 1, page_size: 50, total: 0 });
      } else await rejects(() => app.alageum.invoices.list(request), "permission_denied", 403);
    }
    assert.deepEqual(await db.withSchema("b2b").table("roles").orderBy("id"), rolesBefore);
  });
  await require("./cms-catalog.integration-support").runCmsCatalogTests(
    t,
    app,
    { category, businessToken: manager },
  );
  await require("./catalog-read.integration-support").runCatalogReadTests(t, app, { manager });
  await require("./catalog-filter.integration-support").runCatalogFilterTests(t, app);
  await require("./organization-pagination.integration-support").runOrganizationPaginationTests(t, app);
  await require("./rfq-read.integration-support")({ app, base: `http://127.0.0.1:${app.server.httpServer.address().port}/api/v1`, t });
  await t.test("populated filter definitions, native category FK and all released reviewed identities survive a real Strapi restart", async () => {
    const { createRestartFixture, verifyRestartFixture, verifyNativeAdapterTransition } = require("./catalog-filter.integration-support");
    const fixture = await createRestartFixture(app);
    const previous = app; app = null; await previous.destroy();
    // One sequential rejected startup on the same disposable database proves
    // the guard runs before actual Strapi sync, and never silently repairs drift.
    const observer = require("knex")({ client: "pg", connection: process.env.DATABASE_URL, pool: { min: 0, max: 1 } });
    const snapshot = async () => JSON.stringify({
      definitions: await observer.withSchema("b2b").table("product_attribute_definitions").select("*", observer.raw("translations::text AS translations")).orderBy("id"),
      categories: await observer(CATEGORY).orderBy("id"), products: await observer(PRODUCT).orderBy("id"),
      audit: await observer.withSchema("b2b").table("audit_events").orderBy("id"),
    });
    async function refuseStartup(snapshotRows) {
      const before = await snapshotRows();
      const rejected = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
      try {
        let synchronizations = 0;
        const sync = rejected.db.schema.sync.bind(rejected.db.schema);
        rejected.db.schema.sync = async (...args) => { synchronizations++; return sync(...args); };
        await assert.rejects(rejected.load(), /Catalog filter schema mismatch/);
        assert.equal(synchronizations, 0); assert.equal(await snapshotRows(), before);
      } finally { await rejected.destroy(); }
    }
    try {
      await verifyNativeAdapterTransition(observer, refuseStartup);
      await observer.raw("ALTER TABLE b2b.product_attribute_definitions ALTER COLUMN code SET DEFAULT 'fictitious forbidden default'");
      await refuseStartup(snapshot);
      const column = await observer("information_schema.columns").where({ table_schema: "b2b", table_name: "product_attribute_definitions", column_name: "code" }).first();
      assert.match(column.column_default, /fictitious forbidden default/);
    } finally {
      try { await observer.raw("ALTER TABLE b2b.product_attribute_definitions ALTER COLUMN code DROP DEFAULT"); }
      finally { await observer.destroy(); }
    }
    app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    await app.load();
    await verifyRestartFixture(app, fixture);
  });
});
