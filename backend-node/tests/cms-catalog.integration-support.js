"use strict";
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { createCatalog, PRODUCT } = require("../src/domain/catalog");
const {
  createCmsCatalogAuthorizer,
  ACTION,
} = require("../src/domain/cms-catalog");
const { audit } = require("../src/domain/audit");
const { seedTestCmsAdmins } = require("../scripts/seed-test-cms-admins");
const parse = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;

async function runCmsCatalogTests(t, app, { category, businessToken }) {
  const db = app.db.connection;
  const server = app.server.httpServer;
  assert.ok(server.listening, "The native Strapi HTTP server must be mounted");
  const base = `http://127.0.0.1:${server.address().port}`;
  const passwords = {
    editor: `${randomBytes(24).toString("hex")}Aa1!`,
    denied: `${randomBytes(24).toString("hex")}Aa1!`,
  };
  const fixtures = await seedTestCmsAdmins(app, {
    ...process.env,
    ALAGEUM_TEST_ADMIN_FIXTURES: "1",
    E2E_CMS_EDITOR_PASSWORD: passwords.editor,
    E2E_CMS_DENIED_PASSWORD: passwords.denied,
  });
  async function login(kind, full = false) {
    const response = await fetch(`${base}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fixtures[kind].email,
        password: passwords[kind],
      }),
    });
    assert.equal(response.status, 200, `CMS ${kind} login`);
    const body = await response.json();
    assert.ok(body.data.accessToken);
    if (full)
      return {
        accessToken: body.data.accessToken,
        refreshCookie: response.headers.get("set-cookie").split(";")[0],
      };
    return body.data.accessToken;
  }
  const editor = await login("editor"),
    denied = await login("denied");
  const request = (path, token = editor, method = "GET", body) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const valid = () => {
    const key = `cms-test-${randomUUID()}`;
    return {
      public_key: key,
      slug: key,
      category_id: category,
      translations: {
        ru: { name: "CMS original" },
        en: { name: "CMS original EN" },
      },
      status: "published",
      price_mode: "fixed",
      price: "150.25",
      currency: "USD",
    };
  };
  let product;
  const permissions = [
    { action: ACTION, subject: null, properties: {}, conditions: [] },
  ];

  await t.test(
    "CMS plugin has registered admin permission and no public/business-token access",
    async () => {
      assert.ok(app.plugin("alageum-catalog"));
      assert.ok(app.service("admin::permission").actionProvider.has(ACTION));
      for (const token of [null, businessToken]) {
        const response = await request("/alageum-catalog/products", token);
        assert.equal(response.status, 401);
      }
      assert.equal(
        (await request("/alageum-catalog/products", denied)).status,
        403,
      );
      assert.equal(
        (await request("/alageum-catalog/categories", denied)).status,
        403,
      );
      assert.equal(
        (await request("/api/v1/admin/catalog/products", editor)).status,
        401,
      );
      assert.ok(
        [404, 405].includes(
          (await request("/api/v1/alageum-catalog/products", editor)).status,
        ),
      );
      const listed = await request("/alageum-catalog/products?page_size=2");
      assert.equal(listed.status, 200);
      assert.equal((await listed.json()).items.length, 2);
      assert.equal(listed.headers.get("cache-control"), "private, no-store");
      const categories = await request(
        "/alageum-catalog/categories?page_size=100",
      );
      assert.equal(categories.status, 200);
      assert.ok(
        (await categories.json()).items.some((item) => item.id === category),
      );
    },
  );
  await t.test(
    "CMS create and published edits reuse validated immutable IDs, versions and public catalog",
    async () => {
      const response = await request(
        "/alageum-catalog/products",
        editor,
        "POST",
        valid(),
      );
      assert.equal(response.status, 201, await response.clone().text());
      product = await response.json();
      const [row] = await db(PRODUCT).where({ transport_id: product.id });
      assert.ok(row.document_id);
      const updated = await request(
        `/alageum-catalog/products/${product.id}`,
        editor,
        "PUT",
        {
          version: 1,
          translations: {
            ...product.translations,
            ru: { name: "CMS changed published" },
          },
          price: "175.50",
        },
      );
      assert.equal(updated.status, 200, await updated.clone().text());
      const saved = await updated.json();
      assert.equal(saved.id, product.id);
      assert.equal(saved.public_key, product.public_key);
      assert.equal(saved.version, 2);
      assert.equal(saved.translations.en.name, "CMS original EN");
      const after = await db(PRODUCT)
        .where({ transport_id: product.id })
        .first();
      assert.equal(after.document_id, row.document_id);
      const publicRead = await request(
        `/api/v1/catalog/products/${product.public_key}`,
        null,
      );
      assert.equal(publicRead.status, 200);
      assert.equal(
        (await publicRead.json()).translations.ru.name,
        "CMS changed published",
      );
      const detail = await request(`/alageum-catalog/products/${product.id}`);
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).version, 2);
      const conflict = await request(
        `/alageum-catalog/products/${product.id}`,
        editor,
        "PATCH",
        { version: 1, price: "9.99" },
      );
      assert.equal(conflict.status, 409);
      assert.equal(
        (await conflict.json()).error.code,
        "catalog_version_conflict",
      );
      const immutable = await request(
        `/alageum-catalog/products/${product.id}`,
        editor,
        "PATCH",
        { version: 2, public_key: "cms-replaced" },
      );
      assert.equal(immutable.status, 422);
      const negative = await request(
        `/alageum-catalog/products/${product.id}`,
        editor,
        "PATCH",
        { version: 2, price: "-1" },
      );
      assert.equal(negative.status, 422);
    },
  );
  await t.test(
    "CMS hide and restore remain versioned; restore returns draft",
    async () => {
      let response = await request(
        `/alageum-catalog/products/${product.id}/hide`,
        editor,
        "POST",
        { version: 2 },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).status, "hidden");
      assert.equal(
        (await request(`/api/v1/catalog/products/${product.public_key}`, null))
          .status,
        404,
      );
      response = await request(
        `/alageum-catalog/products/${product.id}/restore`,
        editor,
        "POST",
        { version: 3 },
      );
      assert.equal(response.status, 200);
      const restored = await response.json();
      assert.equal(restored.status, "draft");
      assert.equal(restored.version, 4);
      assert.equal(
        (await request(`/api/v1/catalog/products/${product.public_key}`, null))
          .status,
        404,
      );
    },
  );
  await t.test(
    "CMS audits preserve separate native administrator identity without B2B impersonation",
    async () => {
      const events = await db
        .withSchema("b2b")
        .table("audit_events")
        .where({ entity_id: product.id })
        .orderBy("created_at");
      assert.deepEqual(
        events.map((event) => event.action),
        [
          "catalog.product.create",
          "catalog.product.update",
          "catalog.product.hide",
          "catalog.product.restore",
        ],
      );
      for (const event of events) {
        assert.equal(event.actor_user_id, null);
        assert.equal(event.organization_id, null);
        const metadata = parse(event.event_metadata);
        assert.equal(metadata.source, "cms");
        assert.equal(metadata.cms_admin_id, String(fixtures.editor.id));
      }
    },
  );
  await t.test(
    "CMS permission revocation between route policy and write denies stale authorization",
    async () => {
      const original = app.alageum.cmsCatalog;
      const live = createCmsCatalogAuthorizer({ strapi: app });
      app.alageum.cmsCatalog = createCatalog({
        db,
        audit,
        authorizer: {
          ...live,
          async manager(ctx) {
            const principal = await live.manager(ctx);
            await app
              .service("admin::role")
              .assignPermissions(fixtures.roles.editor, []);
            return principal;
          },
        },
      });
      try {
        const response = await request(
          `/alageum-catalog/products/${product.id}`,
          editor,
          "PATCH",
          { version: 4, price: "1" },
        );
        assert.equal(response.status, 403, await response.clone().text());
        assert.equal(
          (await db(PRODUCT).where({ transport_id: product.id }).first())
            .version,
          4,
        );
      } finally {
        app.alageum.cmsCatalog = original;
        await app
          .service("admin::role")
          .assignPermissions(fixtures.roles.editor, permissions);
      }
    },
  );
  await t.test(
    "CMS role removal and account disable after route policy are rechecked in the write transaction",
    async () => {
      const original = app.alageum.cmsCatalog;
      for (const mutation of [
        { roles: [fixtures.roles.denied] },
        { isActive: false },
      ]) {
        const live = createCmsCatalogAuthorizer({ strapi: app });
        app.alageum.cmsCatalog = createCatalog({
          db,
          audit,
          authorizer: {
            ...live,
            async manager(ctx) {
              const principal = await live.manager(ctx);
              await app
                .service("admin::user")
                .updateById(fixtures.editor.id, mutation);
              return principal;
            },
          },
        });
        try {
          const response = await request(
            `/alageum-catalog/products/${product.id}`,
            editor,
            "PATCH",
            { version: 4, price: "1" },
          );
          assert.equal(
            response.status,
            mutation.roles ? 403 : 401,
            await response.clone().text(),
          );
          assert.equal(
            (await db(PRODUCT).where({ transport_id: product.id }).first())
              .version,
            4,
          );
        } finally {
          app.alageum.cmsCatalog = original;
          await app
            .service("admin::user")
            .updateById(fixtures.editor.id, {
              isActive: true,
              roles: [fixtures.roles.editor],
            });
        }
      }
    },
  );
  await t.test(
    "CMS role removal and inactive administrators fail closed with existing sessions",
    async () => {
      await app
        .service("admin::user")
        .updateById(fixtures.editor.id, { roles: [fixtures.roles.denied] });
      try {
        assert.equal((await request("/alageum-catalog/products")).status, 403);
      } finally {
        await app
          .service("admin::user")
          .updateById(fixtures.editor.id, { roles: [fixtures.roles.editor] });
      }
      await app
        .service("admin::user")
        .updateById(fixtures.editor.id, { isActive: false });
      try {
        assert.equal((await request("/alageum-catalog/products")).status, 401);
      } finally {
        await app
          .service("admin::user")
          .updateById(fixtures.editor.id, { isActive: true });
      }
    },
  );
  await t.test(
    "CMS session revocation between route policy and write denies stale authorization",
    async () => {
      const disposableToken = await login("editor");
      const original = app.alageum.cmsCatalog;
      const live = createCmsCatalogAuthorizer({ strapi: app });
      app.alageum.cmsCatalog = createCatalog({
        db,
        audit,
        authorizer: {
          ...live,
          async manager(ctx) {
            const principal = await live.manager(ctx);
            assert.equal(
              await app
                .sessionManager("admin")
                .revokeSessionById(
                  String(principal.adminId),
                  principal.sessionId,
                ),
              true,
            );
            return principal;
          },
        },
      });
      try {
        const response = await request(
          `/alageum-catalog/products/${product.id}`,
          disposableToken,
          "PUT",
          { version: 4, price: "1" },
        );
        assert.equal(response.status, 401, await response.clone().text());
        assert.equal(
          (await db(PRODUCT).where({ transport_id: product.id }).first())
            .version,
          4,
        );
      } finally {
        app.alageum.cmsCatalog = original;
      }
    },
  );
  await t.test(
    "CMS transactional audit failure rolls create and update back",
    async () => {
      const original = app.alageum.cmsCatalog;
      app.alageum.cmsCatalog = createCatalog({
        db,
        authorizer: createCmsCatalogAuthorizer({ strapi: app }),
        audit: async () => {
          throw new Error("cms audit rollback fixture");
        },
      });
      const data = valid();
      try {
        assert.equal(
          (await request("/alageum-catalog/products", editor, "POST", data))
            .status,
          500,
        );
        assert.equal(
          await db(PRODUCT).where({ public_key: data.public_key }).first(),
          undefined,
        );
        assert.equal(
          (
            await request(
              `/alageum-catalog/products/${product.id}`,
              editor,
              "PATCH",
              { version: 4, price: "1" },
            )
          ).status,
          500,
        );
        assert.equal(
          (await db(PRODUCT).where({ transport_id: product.id }).first())
            .version,
          4,
        );
      } finally {
        app.alageum.cmsCatalog = original;
      }
    },
  );
  await t.test(
    "native rotation followed by current-session revocation invalidates retained parent bearer",
    async () => {
      const session = await login("editor", true);
      const rotated = await fetch(`${base}/admin/access-token`, {
        method: "POST",
        headers: {
          Cookie: session.refreshCookie,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(rotated.status, 200, await rotated.clone().text());
      const rotatedBody = await rotated.json();
      const currentToken =
        rotatedBody.data.accessToken || rotatedBody.data.token;
      assert.ok(currentToken);
      assert.equal(
        (await request("/alageum-catalog/products", session.accessToken))
          .status,
        200,
      );
      const current = app
        .sessionManager("admin")
        .validateAccessToken(currentToken);
      assert.equal(current.isValid, true);
      const beforeAudit = Number(
        (
          await db
            .withSchema("b2b")
            .table("audit_events")
            .where({ entity_id: product.id })
            .count("* as n")
            .first()
        ).n,
      );
      const original = app.alageum.cmsCatalog;
      const live = createCmsCatalogAuthorizer({ strapi: app });
      app.alageum.cmsCatalog = createCatalog({
        db,
        audit,
        authorizer: {
          ...live,
          async manager(ctx) {
            const principal = await live.manager(ctx);
            assert.equal(
              await app
                .sessionManager("admin")
                .revokeSessionById(
                  String(fixtures.editor.id),
                  current.payload.sessionId,
                ),
              true,
            );
            return principal;
          },
        },
      });
      try {
        const response = await request(
          `/alageum-catalog/products/${product.id}`,
          session.accessToken,
          "PUT",
          { version: 4, price: "1" },
        );
        assert.equal(response.status, 401, await response.clone().text());
      } finally {
        app.alageum.cmsCatalog = original;
      }
      assert.equal(
        Number(
          (
            await db
              .withSchema("b2b")
              .table("audit_events")
              .where({ entity_id: product.id })
              .count("* as n")
              .first()
          ).n,
        ),
        beforeAudit,
      );
      assert.equal(
        (await request("/alageum-catalog/products", session.accessToken))
          .status,
        401,
      );
      assert.equal(
        (
          await request(
            `/alageum-catalog/products/${product.id}`,
            session.accessToken,
            "PUT",
            { version: 4, price: "1" },
          )
        ).status,
        401,
      );
      assert.equal(
        (await db(PRODUCT).where({ transport_id: product.id }).first()).version,
        4,
      );
    },
  );
  await require("./cms-specs.integration-support").runCmsSpecsTests(t, app, {
    request,
    base,
    editor,
    denied,
    businessToken,
    adminId: fixtures.editor.id,
    valid,
  });
  await require("./cms-media.integration-support").runCmsMediaTests(t, app, {
    request,
    base,
    editor,
    denied,
    businessToken,
    adminId: fixtures.editor.id,
    valid,
    fixtures,
    login,
  });
  await require("./cms-upload.integration-support").runCmsUploadTests(t, app, {
    base, editor, denied, businessToken, fixtures,
  });
  await t.test(
    "native CMS logout invalidates actual session and blocks subsequent plugin reads/writes",
    async () => {
      const logout = await request("/admin/logout", editor, "POST", {});
      assert.equal(logout.status, 200, await logout.clone().text());
      assert.equal(
        (await request("/alageum-catalog/products", editor)).status,
        401,
      );
      assert.equal(
        (
          await request(
            `/alageum-catalog/products/${product.id}`,
            editor,
            "PUT",
            { version: 4, price: "1" },
          )
        ).status,
        401,
      );
      assert.equal(
        (await db(PRODUCT).where({ transport_id: product.id }).first()).version,
        4,
      );
    },
  );
}
module.exports = { runCmsCatalogTests };
