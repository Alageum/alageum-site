"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const knex = require("knex");
const {
  ensureSchema: authSchema,
  createAuth,
  table,
  DEMO,
} = require("../src/domain/auth");
const {
  ensureSchema: quoteSchema,
  createQuotes,
} = require("../src/domain/quotes");
const { ensureSchema: auditSchema, audit } = require("../src/domain/audit");
const quoteStore = require("../src/domain/quote-schema");
const connection = process.env.ALAGEUM_DOMAIN_TEST_DATABASE_URL;
const config = {
  jwtSecret: "integration-only-key-with-at-least-thirty-two-characters",
  jwtIssuer: "alageum-tests",
  jwtAudience: "alageum-business",
  accessTokenMinutes: 15,
  refreshTokenDays: 14,
  seedDemo: true,
  env: "test",
};
const code = (value) => (error) => error.code === value;
function ctx(body, headers = {}, query = {}, params = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    request: { body },
    headers: normalized,
    query,
    params,
    state: {},
    responseHeaders: {},
    get(name) {
      return normalized[name.toLowerCase()] || "";
    },
    set(name, value) {
      this.responseHeaders[name] = value;
    },
  };
}

test(
  "PostgreSQL domain transactions, refresh rotation, RFQ isolation and concurrent idempotency",
  { timeout: 90000 },
  async (t) => {
    // Refuse destructive setup unless pointed at an explicitly dedicated test database.
    if (!connection)
      throw new Error(
        "ALAGEUM_DOMAIN_TEST_DATABASE_URL is required; PostgreSQL integration tests must not silently skip",
      );
    if (!new URL(connection).pathname.endsWith("/alageum_strapi_domain_test"))
      throw new Error("Use the dedicated alageum_strapi_domain_test database");
    const db = knex({ client: "pg", connection, pool: { min: 0, max: 16 } });
    t.after(async () => {
      await db.destroy();
    });
    // Domain-only fixture: obtain the real fresh-store admission before any
    // DDL. A preexisting database or public target is refused, never reset.
    // This minimal native-shaped key is synthetic; the separate full-Strapi
    // storage proof verifies actual native sync, restart and FK behavior.
    await quoteStore.preflightSchema(db);
    await db.schema.withSchema("public").createTable("alageum_products", (t) => {
      t.increments("id").primary();
      t.string("transport_id", 255);
      t.unique(["transport_id"], { indexName: "alageum_products_transport_id_uq" });
    });
    await quoteStore.verifyAfterSync(db);
    await authSchema(db);
    await auditSchema(db);
    await quoteSchema(db);
    await authSchema(db);
    await quoteSchema(db); // Bootstrap is repeatable.
    const auth = createAuth({ db, config, audit });
    assert.deepEqual(await auth.seed(), { seeded: true });
    assert.deepEqual(await auth.seed(), { seeded: false });
    await db.schema
      .withSchema("b2b")
      .createTable("test_categories", (table) => {
        table.uuid("id").primary();
        table.boolean("published").notNullable();
      });
    await db.schema.withSchema("b2b").createTable("test_products", (table) => {
      table.uuid("id").primary();
      table.uuid("category_id").notNullable();
      table.boolean("published").notNullable();
      table.jsonb("data").notNullable();
    });
    const categoryId = randomUUID(),
      productId = randomUUID(),
      productId2 = randomUUID();
    const source = (id) => ({
      id,
      public_key: `product-${id}`,
      slug: `product-${id}`,
      sku: "SERVER-SKU",
      translations: { en: { name: "Server product name" } },
      specs: { power: 400 },
      version: 1,
      category_public_key: "category-a",
      price: "100.00",
      currency: "KZT",
      price_mode: "fixed",
    });
    await table(db, "test_categories").insert({
      id: categoryId,
      published: true,
    });
    await table(db, "test_products").insert(
      [productId, productId2].map((id) => ({
        id,
        category_id: categoryId,
        published: true,
        data: JSON.stringify(source(id)),
      })),
    );
    const catalog = {
      async getForQuote(tx, ids) {
        const categories = await table(tx, "test_categories")
          .where({ published: true })
          .orderBy("id")
          .forUpdate();
        const rows = await table(tx, "test_products")
          .whereIn("id", ids)
          .whereIn(
            "category_id",
            categories.map((category) => category.id),
          )
          .where({ published: true })
          .orderBy("id")
          .forUpdate();
        return rows.map((row) =>
          typeof row.data === "string" ? JSON.parse(row.data) : row.data,
        );
      },
    };
    const quotes = createQuotes({ db, catalog, audit, auth });
    async function login(name = "buyer") {
      const request = ctx({
        email: `${name}@demo.example`,
        password: "ChangeMe123!",
      });
      await auth.login(request);
      return request.body;
    }
    const buyerPair = await login(),
      adminPair = await login("admin"),
      accountantPair = await login("accountant");
    const bearer = (pair) => ({ Authorization: `Bearer ${pair.access_token}` });
    const buyer = await auth.context(ctx(null, bearer(buyerPair)));
    const body = (quantity = 1) => ({
      comment: "Test RFQ",
      items: [
        { product_id: productId, quantity },
        { product_id: productId2, quantity: 2 },
      ],
    });
    let first;
    async function count(name, filters = {}) {
      return Number(
        (await table(db, name).where(filters).count("* as count").first())
          .count,
      );
    }

    await t.test(
      "login validates credentials; business context is active and tenant-bound",
      async () => {
        await assert.rejects(
          auth.login(
            ctx({ email: "buyer@demo.example", password: "incorrect" }),
          ),
          code("invalid_credentials"),
        );
        await assert.rejects(
          auth.login(
            ctx({ email: "unknown@demo.example", password: "incorrect" }),
          ),
          code("invalid_credentials"),
        );
        const me = ctx(null, bearer(buyerPair));
        await auth.me(me);
        assert.equal(me.body.user.id, DEMO.users.buyer);
        assert.equal(me.body.organization.id, DEMO.organizationA);
        assert.equal(me.body.permissions.includes("quote.create"), true);
        assert.equal(me.body.permissions.includes("catalog.manage"), false);
        assert.equal(me.body.user.password_hash, undefined);
        assert.equal(me.responseHeaders["Cache-Control"], "private, no-store");
        await assert.rejects(
          auth.context(
            ctx(null, {
              ...bearer(buyerPair),
              "X-Organization-ID": DEMO.organizationB,
            }),
          ),
          code("organization_access_denied"),
        );
        await table(db, "users")
          .where({ id: DEMO.users.buyer })
          .update({ is_active: false });
        await assert.rejects(
          auth.context(ctx(null, bearer(buyerPair))),
          code("authentication_required"),
        );
        await assert.rejects(
          auth.refresh(ctx({ refresh_token: buyerPair.refresh_token })),
          code("invalid_token"),
        );
        await table(db, "users")
          .where({ id: DEMO.users.buyer })
          .update({ is_active: true });
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ is_active: false });
        await assert.rejects(
          auth.context(ctx(null, bearer(buyerPair))),
          code("organization_access_denied"),
        );
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ is_active: true });
        await table(db, "organizations")
          .where({ id: DEMO.organizationA })
          .update({ is_active: false });
        await assert.rejects(
          auth.context(ctx(null, bearer(buyerPair))),
          code("organization_access_denied"),
        );
        await table(db, "organizations")
          .where({ id: DEMO.organizationA })
          .update({ is_active: true });
      },
    );
    await t.test(
      "multi-organization user must explicitly select an authorized tenant",
      async () => {
        const id = randomUUID();
        await table(db, "memberships").insert({
          id,
          user_id: DEMO.users.buyer,
          organization_id: DEMO.organizationB,
          role_id: DEMO.roles.accountant,
        });
        await assert.rejects(
          auth.context(ctx(null, bearer(buyerPair))),
          code("organization_required"),
        );
        const selected = await auth.context(
          ctx(null, {
            ...bearer(buyerPair),
            "X-Organization-ID": DEMO.organizationB,
          }),
        );
        assert.equal(selected.organization_id, DEMO.organizationB);
        await table(db, "memberships").where({ id }).del();
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ role_id: DEMO.roles.accountant });
        await assert.rejects(
          auth.context(ctx(null, bearer(buyerPair))),
          code("organization_access_denied"),
        );
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ role_id: DEMO.roles.buyer });
      },
    );
    await t.test(
      "catalog.manage belongs only to global platform roles",
      async () => {
        const role = await table(db, "roles")
          .where({ id: DEMO.roles.admin })
          .first();
        await table(db, "roles")
          .where({ id: role.id })
          .update({
            permissions: JSON.stringify([
              ...role.permissions,
              "catalog.manage",
            ]),
          });
        await assert.rejects(
          auth.permission(ctx(null, bearer(adminPair)), "catalog.manage"),
          code("permission_denied"),
        );
        const catalogPair = await login("catalog");
        assert.equal(
          (
            await auth.permission(
              ctx(null, bearer(catalogPair)),
              "catalog.manage",
            )
          ).user.id,
          DEMO.users.catalog,
        );
        await table(db, "roles")
          .where({ id: role.id })
          .update({ permissions: JSON.stringify(role.permissions) });
      },
    );
    await t.test(
      "refresh rotation is atomic under simultaneous reuse; logout revokes the live refresh token",
      async () => {
        const pair = await login();
        const attempts = [
          ctx({ refresh_token: pair.refresh_token }),
          ctx({ refresh_token: pair.refresh_token }),
        ];
        const results = await Promise.allSettled(
          attempts.map((request) => auth.refresh(request)),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.filter(
            (result) =>
              result.status === "rejected" &&
              result.reason.code === "invalid_token",
          ).length,
          1,
        );
        const rotated =
          attempts[results.findIndex((result) => result.status === "fulfilled")]
            .body;
        assert.notEqual(rotated.refresh_token, pair.refresh_token);
        assert.equal(rotated.refresh_token.includes("."), false);
        await assert.rejects(
          auth.refresh(ctx({ refresh_token: pair.refresh_token })),
          code("invalid_token"),
        );
        const before = await count("audit_events", { action: "logout" });
        const logout = ctx({ refresh_token: rotated.refresh_token });
        await auth.logout(logout);
        assert.equal(logout.status, 204);
        await auth.logout(ctx({ refresh_token: rotated.refresh_token }));
        assert.equal(
          await count("audit_events", { action: "logout" }),
          before + 1,
        );
        await assert.rejects(
          auth.refresh(ctx({ refresh_token: rotated.refresh_token })),
          code("invalid_token"),
        );
      },
    );
    await t.test(
      "login audit failure rolls back newly issued refresh sessions",
      async () => {
        const before = await count("refresh_sessions");
        const failedAuth = createAuth({
          db,
          config,
          audit: async () => {
            throw new Error("audit unavailable");
          },
        });
        await assert.rejects(
          failedAuth.login(
            ctx({ email: "buyer@demo.example", password: "ChangeMe123!" }),
          ),
          /audit unavailable/,
        );
        assert.equal(await count("refresh_sessions"), before);
      },
    );
    await t.test(
      "missing/malformed submission keys and unauthorized roles fail without writes",
      async () => {
        const before = await count("quote_requests");
        for (const key of [
          undefined,
          "not-a-uuid",
          randomUUID().replaceAll("-", ""),
        ]) {
          const headers = {
            ...bearer(buyerPair),
            ...(key ? { "Idempotency-Key": key } : {}),
          };
          await assert.rejects(
            quotes.create(ctx(body(), headers)),
            code("validation_error"),
          );
        }
        await assert.rejects(
          quotes.create(
            ctx(body(), {
              ...bearer(accountantPair),
              "Idempotency-Key": randomUUID(),
            }),
          ),
          code("permission_denied"),
        );
        assert.equal(await count("quote_requests"), before);
      },
    );
    await t.test(
      "create persists server-owned snapshots, owner, tenant, items and one audit atomically",
      async () => {
        const key = randomUUID();
        const request = ctx(body(), {
          ...bearer(buyerPair),
          "Idempotency-Key": key,
        });
        await quotes.create(request);
        first = { quote: request.body, key };
        assert.equal(request.status, 201);
        assert.equal(request.body.item_count, 2);
        assert.equal(request.body.items[0].product_snapshot.sku, "SERVER-SKU");
        assert.equal(request.body.items[0].quantity, "1.000");
        assert.equal(request.body.created_by_id, undefined);
        assert.equal(
          request.responseHeaders.Location,
          `/api/v1/quotes/${request.body.id}`,
        );
        const stored = await table(db, "quote_requests")
          .where({ id: request.body.id })
          .first();
        assert.equal(stored.created_by_id, DEMO.users.buyer);
        assert.equal(stored.organization_id, DEMO.organizationA);
        assert.equal(
          await count("audit_events", {
            action: "quote.create",
            entity_id: request.body.id,
          }),
          1,
        );
        const replay = await quotes.submit({
          context: buyer,
          key,
          body: {
            comment: "Test RFQ",
            items: [
              { product_id: productId2, quantity: "2.000" },
              { product_id: productId, quantity: "1.0" },
            ],
          },
        });
        assert.equal(replay.created, false);
        assert.equal(replay.quote.id, request.body.id);
        await assert.rejects(
          quotes.submit({ context: buyer, key, body: body(2) }),
          code("idempotency_conflict"),
        );
        const retryHttp = ctx(body(), {
          ...bearer(buyerPair),
          "Idempotency-Key": key,
        });
        await quotes.create(retryHttp);
        assert.equal(retryHttp.status, 200);
      },
    );
    await t.test(
      "12 simultaneous identical submissions create one quote and one audit",
      async () => {
        const key = randomUUID();
        const results = await Promise.all(
          Array.from({ length: 12 }, () =>
            quotes.submit({ context: buyer, body: body(), key }),
          ),
        );
        assert.equal(results.filter((result) => result.created).length, 1);
        assert.equal(new Set(results.map((result) => result.quote.id)).size, 1);
        assert.equal(
          await count("quote_requests", { idempotency_key: key }),
          1,
        );
        assert.equal(
          await count("audit_events", {
            action: "quote.create",
            entity_id: results[0].quote.id,
          }),
          1,
        );
      },
    );
    await t.test(
      "simultaneous reuse with different bodies yields one create and one conflict",
      async () => {
        const key = randomUUID();
        const results = await Promise.allSettled(
          [1, 2].map((value) =>
            quotes.submit({ context: buyer, body: body(value), key }),
          ),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.filter(
            (result) =>
              result.status === "rejected" &&
              result.reason.code === "idempotency_conflict",
          ).length,
          1,
        );
        assert.equal(
          await count("quote_requests", { idempotency_key: key }),
          1,
        );
      },
    );
    await t.test(
      "unpublished products/categories abort the whole request and leave no audit",
      async () => {
        const before = [
          await count("quote_requests"),
          await count("quote_request_items"),
          await count("audit_events", { action: "quote.create" }),
        ];
        await table(db, "test_products")
          .where({ id: productId2 })
          .update({ published: false });
        await assert.rejects(
          quotes.submit({ context: buyer, body: body(), key: randomUUID() }),
          (error) =>
            error.code === "quote_product_unavailable" &&
            error.details.product_ids.includes(productId2),
        );
        await table(db, "test_products")
          .where({ id: productId2 })
          .update({ published: true });
        await table(db, "test_categories")
          .where({ id: categoryId })
          .update({ published: false });
        await assert.rejects(
          quotes.submit({ context: buyer, body: body(), key: randomUUID() }),
          code("quote_product_unavailable"),
        );
        await table(db, "test_categories")
          .where({ id: categoryId })
          .update({ published: true });
        assert.deepEqual(
          [
            await count("quote_requests"),
            await count("quote_request_items"),
            await count("audit_events", { action: "quote.create" }),
          ],
          before,
        );
      },
    );
    await t.test(
      "audit failure rolls quote and item writes back; the key can safely retry",
      async () => {
        const key = randomUUID();
        const failing = createQuotes({
          db,
          catalog,
          audit: async () => {
            throw new Error("audit unavailable");
          },
          auth,
        });
        const before = await count("quote_request_items");
        await assert.rejects(
          failing.submit({ context: buyer, body: body(), key }),
          /audit unavailable/,
        );
        assert.equal(
          await count("quote_requests", { idempotency_key: key }),
          0,
        );
        assert.equal(await count("quote_request_items"), before);
        const retry = await quotes.submit({
          context: buyer,
          body: body(),
          key,
        });
        assert.equal(retry.created, true);
      },
    );
    await t.test(
      "detail and explicit mine remain owner scoped while default history shares tenant summaries",
      async () => {
        await assert.rejects(
          quotes.detail(
            ctx(null, bearer(adminPair), {}, { id: first.quote.id }),
          ),
          code("quote_not_found"),
        );
        const adminList = ctx(null, bearer(adminPair), { mine: "true" });
        await quotes.list(adminList);
        assert.equal(adminList.body.total, 0);
        const accountantRole = await table(db, "roles")
          .where({ id: DEMO.roles.accountant })
          .first();
        await table(db, "roles")
          .where({ id: accountantRole.id })
          .update({
            permissions: JSON.stringify(["quote.read", "quote.create"]),
          });
        await assert.rejects(
          quotes.detail(
            ctx(null, bearer(accountantPair), {}, { id: first.quote.id }),
          ),
          code("quote_not_found"),
        );
        const otherTenant = ctx(null, bearer(accountantPair), { mine: "true" });
        await quotes.list(otherTenant);
        assert.equal(otherTenant.body.total, 0);
        const otherContext = await auth.context(
          ctx(null, bearer(accountantPair)),
        );
        const other = await quotes.submit({
          context: otherContext,
          body: body(),
          key: first.key,
        });
        assert.equal(other.created, true);
        assert.notEqual(other.quote.id, first.quote.id);
        await table(db, "roles")
          .where({ id: accountantRole.id })
          .update({ permissions: JSON.stringify(accountantRole.permissions) });
        const buyerList = ctx(null, bearer(buyerPair), {
          mine: "true",
          page: "1",
          page_size: "2",
        });
        await quotes.list(buyerList);
        assert.equal(buyerList.body.items.length, 2);
        assert.ok(buyerList.body.total >= 4);
        assert.equal(
          buyerList.body.items.some((item) => item.id === other.quote.id),
          false,
        );
        for (const query of [{}, { mine: "false" }]) {
          const request = ctx(null, bearer(adminPair), query);
          await quotes.list(request);
          assert.ok(request.body.items.some((item) => item.id === first.quote.id));
          assert.equal(request.body.items.find((item) => item.id === first.quote.id).comment, "Test RFQ");
          assert.equal(request.body.items.some((item) => item.id === other.quote.id), false);
          assert.deepEqual(Object.keys(request.body).sort(), ["items", "page", "page_size", "total"]);
          for (const item of request.body.items)
            assert.deepEqual(Object.keys(item).sort(), ["comment", "created_at", "id", "item_count", "status"]);
        }
      },
    );
    await t.test(
      "list and detail recheck authority after request authorization, without read writes",
      async () => {
        const member = await table(db, "memberships").where({ id: buyer.membership.id }).first();
        const role = await table(db, "roles").where({ id: member.role_id }).first();
        const before = await Promise.all(["quote_requests", "quote_request_items", "audit_events", "refresh_sessions"].map((name) => count(name)));
        for (const [name, id, patch, restore, expected] of [
          ["users", buyer.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
          ["memberships", member.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
          ["organizations", buyer.organization_id, { is_active: false }, { is_active: true }, "organization_access_denied"],
          ["roles", role.id, { permissions: "[]" }, { permissions: JSON.stringify(role.permissions) }, "permission_denied"],
          ["roles", role.id, { organization_id: DEMO.organizationB, code: "rfq_moved_fixture" }, { organization_id: role.organization_id, code: role.code }, "organization_access_denied"],
        ]) for (const method of ["list", "detail"]) {
          const raced = createQuotes({ db, catalog, audit, auth: {
            permission: async () => {
              await table(db, name).where({ id }).update(patch);
              return buyer;
            },
          } });
          const request = ctx(null, bearer(buyerPair), {}, { id: first.quote.id });
          try {
            await assert.rejects(raced[method](request), code(expected));
            assert.equal(request.responseHeaders["Cache-Control"], "private, no-store");
            assert.equal(request.body, undefined);
          } finally { await table(db, name).where({ id }).update(restore); }
        }
        assert.deepEqual(await Promise.all(["quote_requests", "quote_request_items", "audit_events", "refresh_sessions"].map((name) => count(name))), before);
      },
    );
    await t.test(
      "accepted RFQ list and detail hold caller authority locks through read commit",
      async () => {
        const role = await table(db, "roles").where({ id: buyer.membership.role.id }).first();
        for (const method of ["list", "detail"]) for (const [name, id, patch, restore, expected] of [
          ["users", buyer.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
          ["memberships", buyer.membership.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
          ["organizations", buyer.organization_id, { is_active: false }, { is_active: true }, "organization_access_denied"],
          ["roles", role.id, { permissions: "[]" }, { permissions: JSON.stringify(role.permissions) }, "permission_denied"],
        ]) {
          let release, entered;
          const barrier = new Promise((resolve) => { release = resolve; });
          const ready = new Promise((resolve) => { entered = resolve; });
          const held = createQuotes({ catalog, audit, auth, db: {
            transaction: (work) => db.transaction(async (tx) => {
              const result = await work(tx);
              entered();
              await barrier;
              return result;
            }),
          } });
          const request = ctx(null, bearer(buyerPair), {}, { id: first.quote.id });
          const reading = held[method](request), watchdog = setTimeout(release, 12000);
          let revoke;
          try {
            await Promise.race([ready, reading.then(() => { throw new Error("Read finished before lock barrier"); })]);
            revoke = table(db, name).where({ id }).update(patch).then(() => {});
            const deadline = Date.now() + 8000;
            let blocked = false;
            while (Date.now() < deadline) {
              const waiting = await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?", [`update%${name}%`]);
              if (waiting.rows.length) { blocked = true; break; }
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            assert.equal(blocked, true, `${method}: ${name} revocation waits for read commit`);
            release();
            await reading;
            await revoke;
            assert.equal(request.status, 200);
            await assert.rejects(quotes[method](ctx(null, bearer(buyerPair), {}, { id: first.quote.id })), code(expected));
          } finally {
            release();
            await reading;
            if (revoke) await revoke;
            clearTimeout(watchdog);
            await table(db, name).where({ id }).update(restore);
          }
        }
      },
    );
    await t.test(
      "permission changes and inactive membership invalidate stale write contexts",
      async () => {
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ is_active: false });
        await assert.rejects(
          quotes.submit({ context: buyer, body: body(), key: randomUUID() }),
          code("organization_access_denied"),
        );
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ is_active: true, role_id: DEMO.roles.engineer });
        await assert.rejects(
          quotes.submit({ context: buyer, body: body(), key: randomUUID() }),
          code("permission_denied"),
        );
        await table(db, "memberships")
          .where({ user_id: DEMO.users.buyer })
          .update({ role_id: DEMO.roles.buyer });
      },
    );
    await t.test(
      "historical snapshots and safe retries survive later catalog edits/unpublication",
      async () => {
        await table(db, "test_products")
          .where({ id: productId })
          .update({
            data: JSON.stringify({
              ...source(productId),
              sku: "CHANGED",
              version: 2,
            }),
            published: false,
          });
        const detail = ctx(null, bearer(buyerPair), {}, { id: first.quote.id });
        await quotes.detail(detail);
        assert.equal(detail.body.items[0].product_snapshot.sku, "SERVER-SKU");
        const replay = await quotes.submit({
          context: buyer,
          body: body(),
          key: first.key,
        });
        assert.equal(replay.created, false);
        assert.equal(replay.quote.id, first.quote.id);
        assert.equal(replay.quote.items[0].product_snapshot.version, 1);
        await table(db, "test_products")
          .where({ id: productId })
          .update({ published: true });
      },
    );
    await t.test(
      "Strapi JSONB text-parser mode keeps live permissions and snapshots usable",
      async () => {
        const { types } = require("pg");
        const original = types.getTypeParser(3802, "text");
        types.setTypeParser(3802, (value) => value);
        try {
          const me = ctx(null, bearer(buyerPair));
          await auth.me(me);
          assert.equal(me.body.permissions.includes("quote.create"), true);
          const catalogPair = await login("catalog");
          assert.equal(
            (
              await auth.permission(
                ctx(null, bearer(catalogPair)),
                "catalog.manage",
              )
            ).user.id,
            DEMO.users.catalog,
          );
          const created = await quotes.submit({
            context: buyer,
            body: body(),
            key: randomUUID(),
          });
          assert.equal(
            typeof created.quote.items[0].product_snapshot,
            "object",
          );
          const detail = ctx(
            null,
            bearer(buyerPair),
            {},
            { id: created.quote.id },
          );
          await quotes.detail(detail);
          assert.equal(detail.body.items[0].product_snapshot.sku, "CHANGED");
        } finally {
          types.setTypeParser(3802, original);
        }
      },
    );
    await t.test(
      "catalog row locks hold concurrent edits until snapshot commit",
      async () => {
        let releaseAudit, enteredAudit;
        const auditEntered = new Promise((resolve) => {
          enteredAudit = resolve;
        });
        const release = new Promise((resolve) => {
          releaseAudit = resolve;
        });
        const heldQuotes = createQuotes({
          db,
          catalog,
          auth,
          audit: async (...args) => {
            enteredAudit();
            await release;
            return audit(...args);
          },
        });
        const pending = heldQuotes.submit({
          context: buyer,
          body: body(),
          key: randomUUID(),
        });
        await auditEntered;
        let updated = false;
        const edit = table(db, "test_products")
          .where({ id: productId })
          .update({ published: false })
          .then(() => {
            updated = true;
          });
        await new Promise((resolve) => setTimeout(resolve, 75));
        assert.equal(updated, false);
        releaseAudit();
        await pending;
        await edit;
        assert.equal(updated, true);
        await table(db, "test_products")
          .where({ id: productId })
          .update({ published: true });
      },
    );
  },
);
