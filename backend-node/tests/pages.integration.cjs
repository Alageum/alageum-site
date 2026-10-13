"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const knex = require("knex");

const execute = promisify(execFile);
const UID = "api::page.page";
const PAGE = "alageum_pages";
const CMS = `/content-manager/collection-types/${UID}`;
const DATABASE = "alageum_strapi_pages_test";
const LEGACY_DATABASE = "alageum_strapi_pages_legacy_test";
const ACTION = (name) => `plugin::content-manager.explorer.${name}`;
const PUBLIC_FIELDS = [
  "slug", "title", "locale_code", "body", "seo_title", "seo_description",
  "published_at", "updated_at",
].sort();
const paragraph = (text) => [{ type: "paragraph", children: [{ type: "text", text }] }];
const json = (value) => typeof value === "string" ? JSON.parse(value) : value;

function guardedDatabaseUrl() {
  let url;
  try { url = new URL(process.env.DATABASE_URL); }
  catch { throw new Error("Page integration requires an explicit disposable PostgreSQL URL"); }
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(decodeURIComponent(url.pathname.slice(1)), DATABASE);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return url;
}

async function childStartup(databaseUrl, mode) {
  // A failed native register must not leave a partially initialized global
  // Strapi instance in the process that runs the HTTP tests.
  const source = `
    "use strict";
    const assert = require("node:assert/strict");
    const app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    (async () => {
      let syncCalls = 0;
      const original = app.db.schema.sync;
      app.db.schema.sync = async function (...args) {
        syncCalls++;
        return original.apply(this, args);
      };
      try {
        if (process.env.PAGE_STARTUP_TEST_MODE === "legacy") {
          await assert.rejects(() => app.load(), /legacy|preflight|migration|existing|populated|schema/i);
          assert.equal(syncCalls, 0, "legacy rows must stop startup before schema.sync");
        } else {
          await app.load();
          assert.equal(syncCalls, 1, "a ready schema must allow normal native startup");
          const { MARKER } = require("./src/domain/page-editorial");
          const marker = await app.db.connection.withSchema("b2b").table("editorial_page_schema").where({ key: MARKER }).first();
          assert.equal(marker.phase, "ready");
        }
      } finally {
        await app.destroy();
      }
      process.stdout.write("PAGE_STARTUP_VERIFIED\\n");
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const { stdout } = await execute(process.execPath, ["-e", source], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, PAGE_STARTUP_TEST_MODE: mode },
    timeout: 90000,
    maxBuffer: 1024 * 1024,
  });
  assert.match(stdout, /PAGE_STARTUP_VERIFIED/);
}

test("native Strapi Page HTTP delivery and transactional authority", { timeout: 300000 }, async (t) => {
  const databaseUrl = guardedDatabaseUrl();
  process.env.APP_ENV = "test";
  process.env.ALAGEUM_TEST_PAGE_FIXTURES = "1";
  process.env.ALAGEUM_SEED_DEMO = "false";
  process.env.ALAGEUM_IMPORT_CATALOG = "false";
  process.env.STRAPI_TELEMETRY_DISABLED = "true";
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"])
    process.env[key] ||= randomBytes(48).toString("hex");

  // This independent connection also models a revocation committed by another
  // request. It must not inherit Content Manager publish's outer transaction.
  const fixtureDb = knex({ client: "pg", connection: databaseUrl.toString(), pool: { min: 0, max: 4 } });
  let app, legacyDb, createdLegacyDatabase = false;
  t.after(async () => {
    try {
      if (app) await app.destroy();
      if (legacyDb) await legacyDb.destroy();
      if (createdLegacyDatabase) await fixtureDb.raw("DROP DATABASE ??", [LEGACY_DATABASE]);
    } finally {
      await fixtureDb.destroy();
    }
  });
  const actualDatabase = await fixtureDb.raw("SELECT current_database() AS database");
  assert.equal(actualDatabase.rows[0].database, DATABASE);
  assert.equal(await fixtureDb.schema.hasTable(PAGE), false, "Use a fresh, dedicated Page fixture database");

  await t.test("actual native startup refuses populated legacy Pages before schema sync and preserves rows and columns", async () => {
    const existing = await fixtureDb("pg_database").where({ datname: LEGACY_DATABASE }).first();
    assert.equal(existing, undefined, "Use a fresh alageum_strapi_pages_legacy_test sibling database");
    await fixtureDb.raw("CREATE DATABASE ??", [LEGACY_DATABASE]);
    createdLegacyDatabase = true;
    const legacyUrl = new URL(databaseUrl);
    legacyUrl.pathname = `/${LEGACY_DATABASE}`;
    legacyDb = knex({ client: "pg", connection: legacyUrl.toString(), pool: { min: 0, max: 2 } });
    await legacyDb.schema.createTable(PAGE, (table) => {
      table.increments("id");
      table.string("document_id");
      table.string("slug");
      table.string("title");
      table.string("locale_code");
      table.jsonb("body");
      table.boolean("published");
      table.string("legacy_preserve_me");
    });
    await legacyDb(PAGE).insert({
      document_id: "legacy-page-preserve",
      slug: "legacy-page-preserve",
      title: "Legacy copy must survive",
      locale_code: "ru",
      body: JSON.stringify(paragraph("Unmigrated content")),
      published: true,
      legacy_preserve_me: "Schema sync must not remove this column",
    });
    const rows = await legacyDb(PAGE).orderBy("id");
    const columns = await legacyDb(PAGE).columnInfo();
    await childStartup(legacyUrl.toString(), "legacy");
    assert.deepEqual(await legacyDb(PAGE).orderBy("id"), rows);
    assert.deepEqual(await legacyDb(PAGE).columnInfo(), columns);
  });

  app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
  await app.load();
  const { seedTestPageAdmins } = require("../scripts/seed-test-page-admins");
  const fixtures = await seedTestPageAdmins(app);
  app.server.mount();
  const server = app.server.httpServer;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, token = null, method = "GET", body, headers = {}) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function expectStatus(response, status) {
    assert.equal(response.status, status, await response.clone().text());
    return response;
  }
  async function login(kind, full = false) {
    const user = fixtures[kind];
    const response = await request("/admin/login", null, "POST", { email: user.email, password: user.password });
    await expectStatus(response, 200);
    const body = await response.json();
    assert.ok(body.data.accessToken);
    if (!full) return body.data.accessToken;
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie, "Native login must issue a refresh cookie");
    return { accessToken: body.data.accessToken, refreshCookie: cookie.split(";")[0] };
  }
  // Reuse these native sessions after restoring authority. Only tests that
  // destroy a session lineage need a separate login; keep native rate limits.
  const tokens = { editor: await login("editor"), publisher: await login("publisher"), denied: await login("denied") };
  const pageData = {
    slug: `page-test-${randomUUID()}`,
    title: "Published Russian title",
    locale_code: "ru",
    body: paragraph("First approved copy"),
    seo_title: "Editorial SEO title",
    seo_description: "Editorial SEO description",
  };
  let documentId;
  const publicPath = () => `/api/v1/pages/${pageData.slug}?locale=ru`;
  const nativePath = () => `${CMS}/${documentId}`;
  const metadata = (uid) => app.db.metadata.get(uid);
  const column = (uid, field) => {
    const name = metadata(uid).attributes[field]?.columnName;
    assert.ok(name, `Native column metadata ${uid}.${field}`);
    return name;
  };
  async function snapshot() {
    const response = await request(publicPath());
    let body = await response.json();
    if (response.status >= 400) {
      assert.ok(body.error && typeof body.error === "object", "Public errors retain their semantic error envelope");
      assert.match(body.error.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Every public error has a valid request UUID");
      assert.equal(body.error.request_id, response.headers.get("x-request-id"));
      // The request UUID identifies this read, not the stored Page state.
      // Preserve every other public error field and all stored rows/audits.
      const { request_id, ...error } = body.error;
      body = { ...body, error };
    }
    return {
      rows: await fixtureDb(PAGE).orderBy("id"),
      public: { status: response.status, body },
      audits: await fixtureDb.withSchema("b2b").table("audit_events").where({ entity_type: "page" }).orderBy("id"),
    };
  }
  async function unchangedAfter(work) {
    const before = await snapshot();
    await work();
    assert.deepEqual(await snapshot(), before, "Rejected write must preserve every Page row, public version and audit event");
  }
  async function rolePermissions(kind) {
    const role = await app.db.query("admin::role").findOne({ where: { id: fixtures[kind].role }, populate: ["permissions"] });
    return role.permissions.map(({ action, subject, properties, conditions, actionParameters }) => ({
      action, subject, properties, conditions, ...(actionParameters ? { actionParameters } : {}),
    }));
  }
  const savedPermissions = { editor: await rolePermissions("editor"), publisher: await rolePermissions("publisher") };
  async function restoreUser(kind) {
    await app.service("admin::user").updateById(fixtures[kind].id, { roles: [fixtures[kind].role], isActive: true, blocked: false });
    await app.service("admin::role").assignPermissions(fixtures[kind].role, savedPermissions[kind]);
  }
  async function write(kind, token = tokens[kind]) {
    return kind === "editor"
      ? request(nativePath(), token, "PUT", { title: "Must never reach storage", body: paragraph("Revoked write") })
      : request(`${nativePath()}/actions/publish`, token, "POST", {});
  }

  await t.test("native editor drafts and publisher-only publication preserve private edits with separate CMS audit identity", async () => {
    assert.equal(app.contentTypes[UID].options.draftAndPublish, true);
    assert.equal(app.contentTypes[UID].attributes.published, undefined);
    for (const kind of ["editor", "publisher", "denied"]) {
      const user = await app.db.query("admin::user").findOne({ where: { id: fixtures[kind].id }, populate: ["roles.permissions"] });
      assert.equal(user.roles.length, 1);
      assert.notEqual(user.roles[0].code, "strapi-super-admin");
      assert.ok(user.roles.flatMap((role) => role.permissions).every((permission) => permission.subject === UID));
      assert.ok(user.roles.flatMap((role) => role.permissions).every((permission) => !permission.action.includes("alageum-catalog")));
      await expectStatus(await request("/alageum-catalog/products", tokens[kind]), 403);
    }
    assert.deepEqual(savedPermissions.editor.map((permission) => permission.action).sort(), ["create", "read", "update"].map(ACTION).sort());
    assert.deepEqual(savedPermissions.publisher.map((permission) => permission.action).sort(), ["read", "publish"].map(ACTION).sort());
    await expectStatus(await request(CMS, null, "POST", pageData), 401);
    await expectStatus(await request(CMS, tokens.denied, "POST", pageData), 403);
    await expectStatus(await request(CMS, tokens.publisher, "POST", pageData), 403);
    const created = await expectStatus(await request(CMS, tokens.editor, "POST", pageData), 201);
    documentId = (await created.json()).data.documentId;
    assert.ok(documentId);
    await expectStatus(await request(publicPath()), 404);
    await expectStatus(await request(nativePath(), tokens.publisher), 200);
    await unchangedAfter(async () => {
      await expectStatus(await request(nativePath(), tokens.denied, "PUT", { title: "Denied" }), 403);
      await expectStatus(await request(nativePath(), tokens.publisher, "PUT", { title: "Publisher cannot edit" }), 403);
      await expectStatus(await request(`${nativePath()}/actions/publish`, tokens.editor, "POST", {}), 403);
    });
    await expectStatus(await request(`${nativePath()}/actions/publish`, tokens.publisher, "POST", {}), 200);
    const original = await (await expectStatus(await request(publicPath()), 200)).json();
    assert.equal(original.title, pageData.title);
    const edited = { title: "Approved revised title", body: paragraph("Revised draft body") };
    await expectStatus(await request(nativePath(), tokens.editor, "PUT", edited), 200);
    assert.deepEqual(await (await request(publicPath())).json(), original);
    await expectStatus(await request(`${nativePath()}/actions/publish`, tokens.publisher, "POST", {}), 200);
    const revised = await (await request(publicPath())).json();
    assert.equal(revised.title, edited.title);
    assert.deepEqual(revised.body, edited.body);
    const events = await fixtureDb.withSchema("b2b").table("audit_events").where({ entity_type: "page", entity_id: documentId }).orderBy("created_at");
    assert.deepEqual(events.map((event) => event.action), ["page.create", "page.publish", "page.update", "page.publish"]);
    for (const event of events) {
      assert.equal(event.actor_user_id, null);
      assert.equal(event.organization_id, null);
      const details = json(event.event_metadata);
      assert.equal(details.source, "cms");
      assert.equal(details.cms_admin_id, String(fixtures[event.action === "page.publish" ? "publisher" : "editor"].id));
    }
  });

  await t.test("public Page API exposes exactly the published allowlist and rejects query, locale and method escapes", async () => {
    const response = await expectStatus(await request(publicPath()), 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), PUBLIC_FIELDS);
    assert.equal(body.slug, pageData.slug);
    assert.equal(body.locale_code, "ru");
    assert.ok(Number.isFinite(Date.parse(body.published_at)));
    assert.ok(Number.isFinite(Date.parse(body.updated_at)));
    await expectStatus(await request(`/api/v1/pages/${pageData.slug}`), 200);
    for (const locale of ["en", "kk", "zh", "uz"])
      await expectStatus(await request(`/api/v1/pages/${pageData.slug}?locale=${locale}`), 404);
    await expectStatus(await request("/api/v1/pages/missing-editorial-page?locale=ru"), 404);
    for (const query of ["locale=de", "locale=RU", "locale=", "locale=ru&locale=ru", "locale=ru&locale=en", "locale[]=ru", "status=draft", "publicationState=preview", "populate=*", "fields=title", "filters[slug]=anything", "limit=1", "locale=ru&extra=1"])
      await expectStatus(await request(`/api/v1/pages/${pageData.slug}?${query}`), 400);
    for (const method of ["HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
      const result = await request(publicPath(), null, method, method === "HEAD" ? undefined : { title: "Public write" });
      assert.ok([404, 405].includes(result.status), `${method} must not expose Page data or mutation; got ${result.status}`);
    }
    for (const path of ["/api/v1/pages", "/api/pages", `/api/pages/${documentId}`, `/api/v1/pages/${documentId}`])
      await expectStatus(await request(path), 404);
  });

  await t.test("unsafe Blocks and transactional audit failures roll back updates and publication, and native discard is audited", async () => {
    const unsafeBodies = [
      [{ type: "paragraph", children: [{ type: "link", url: "javascript:alert(1)", children: [{ type: "text", text: "Unsafe" }] }] }],
      [{ type: "image", image: { url: "https://example.com/tracker.png" }, children: [{ type: "text", text: "" }] }],
      [{ type: "html", children: [{ type: "text", text: "<script>alert(1)</script>" }] }],
    ];
    for (const body of unsafeBodies) await unchangedAfter(async () => {
      const response = await request(nativePath(), tokens.editor, "PUT", { body });
      assert.ok([400, 422].includes(response.status), await response.clone().text());
    });
    await expectStatus(await request(nativePath(), tokens.editor, "PUT", { title: "Draft awaiting publication", body: paragraph("Unpublished safe body") }), 200);
    await fixtureDb.raw(`CREATE FUNCTION b2b.page_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type = 'page' THEN RAISE EXCEPTION 'Page audit rollback fixture'; END IF; RETURN NEW; END $$`);
    await fixtureDb.raw("CREATE TRIGGER page_test_reject_audit BEFORE INSERT ON b2b.audit_events FOR EACH ROW EXECUTE FUNCTION b2b.page_test_reject_audit()");
    try {
      for (const kind of ["editor", "publisher"]) await unchangedAfter(async () => {
        await expectStatus(await write(kind), 500);
      });
    } finally {
      await fixtureDb.raw("DROP TRIGGER page_test_reject_audit ON b2b.audit_events");
      await fixtureDb.raw("DROP FUNCTION b2b.page_test_reject_audit()");
    }
    const published = await (await request(publicPath())).json();
    await expectStatus(await request(`${nativePath()}/actions/discard`, tokens.editor, "POST", {}), 200);
    const draft = await app.documents(UID).findOne({ documentId, status: "draft" });
    assert.equal(draft.title, published.title);
    assert.deepEqual(draft.body, published.body);
    assert.deepEqual(await (await request(publicPath())).json(), published);
    const discard = await fixtureDb.withSchema("b2b").table("audit_events").where({ entity_type: "page", entity_id: documentId, action: "page.discardDraft" });
    assert.equal(discard.length, 1);
    assert.equal(json(discard[0].event_metadata).cms_admin_id, String(fixtures.editor.id));
  });

  await t.test("existing native sessions lose Page write access after role removal, permission removal or account disable", async () => {
    for (const kind of ["editor", "publisher"]) {
      for (const mutation of ["roles", "permissions", "disabled"]) {
        if (mutation === "permissions") await app.service("admin::role").assignPermissions(fixtures[kind].role, []);
        else await app.service("admin::user").updateById(fixtures[kind].id, mutation === "roles" ? { roles: [fixtures.denied.role] } : { isActive: false });
        try {
          await unchangedAfter(async () => { await expectStatus(await write(kind), mutation === "disabled" ? 401 : 403); });
        } finally { await restoreUser(kind); }
      }
    }
  });

  await t.test("native refresh rotation followed by current-child revocation rejects retained parent update and publish bearers", async () => {
    for (const kind of ["editor", "publisher"]) {
      const session = await login(kind, true);
      const rotatedResponse = await request("/admin/access-token", null, "POST", {}, { Cookie: session.refreshCookie });
      await expectStatus(rotatedResponse, 200);
      const rotated = (await rotatedResponse.json()).data;
      const current = app.sessionManager("admin").validateAccessToken(rotated.accessToken || rotated.token);
      const parent = app.sessionManager("admin").validateAccessToken(session.accessToken);
      assert.equal(current.isValid, true);
      assert.equal(parent.isValid, true);
      assert.notEqual(current.payload.sessionId, parent.payload.sessionId);
      await expectStatus(await request(nativePath(), session.accessToken), 200);
      const parentRow = await app.db.query("admin::session").findOne({ where: { sessionId: parent.payload.sessionId } });
      assert.equal(parentRow.status, "rotated");
      assert.equal(parentRow.childId, current.payload.sessionId);
      assert.equal(await app.sessionManager("admin").revokeSessionById(String(fixtures[kind].id), current.payload.sessionId), true);
      assert.ok(await app.db.query("admin::session").findOne({ where: { sessionId: parent.payload.sessionId } }), "The retained native parent must actually remain present");
      await unchangedAfter(async () => { await expectStatus(await write(kind, session.accessToken), 401); });
    }
  });

  await t.test("blocked native administrators cannot update or publish Pages with otherwise active sessions", async () => {
    for (const kind of ["editor", "publisher"]) {
      const token = tokens[kind];
      await app.service("admin::user").updateById(fixtures[kind].id, { blocked: true });
      try { await unchangedAfter(async () => { await expectStatus(await write(kind, token), 401); }); }
      finally { await restoreUser(kind); }
    }
  });

  async function afterNativeAuthorization(kind, token, mutation) {
    const manager = app.plugin("content-manager").service("document-manager");
    const method = kind === "editor" ? "update" : "publish";
    const original = manager[method];
    let calls = 0;
    manager[method] = async function (id, uid, options) {
      if (uid !== UID || id !== documentId) return original.apply(this, arguments);
      calls++;
      assert.equal(calls, 1);
      const ctx = app.requestContext.get();
      assert.equal(ctx.params.model, UID);
      assert.equal(ctx.params.id, documentId);
      assert.equal(ctx.state.user.id, fixtures[kind].id);
      assert.equal(ctx.state.isAuthenticated, true);
      assert.ok(ctx.state.session.id);
      const checker = app.plugin("content-manager").service("permission-checker").create({ userAbility: ctx.state.userAbility, model: UID });
      assert.equal(checker.can[method](), true, "The real native controller must have initially authorized this write");
      if (method === "update") {
        assert.equal(options.data.title, "Must never reach storage", "Injection follows native input sanitization");
        assert.deepEqual(options.data.body, paragraph("Revoked write"));
      }
      manager[method] = original;
      await mutation(ctx);
      return original.apply(this, arguments);
    };
    try {
      const response = await write(kind, token);
      assert.equal(calls, 1, "The revocation must happen after native authorization, not before the route");
      return response;
    } finally { manager[method] = original; }
  }
  async function independentlyRevoke(kind, mutation, ctx) {
    if (mutation === "role") {
      const join = metadata("admin::user").attributes.roles.joinTable;
      const count = await fixtureDb(join.name).where({ [join.joinColumn.name]: fixtures[kind].id }).delete();
      assert.ok(count > 0);
    } else if (mutation === "permission") {
      const join = metadata("admin::role").attributes.permissions.joinTable;
      const count = await fixtureDb(join.name).where({ [join.joinColumn.name]: fixtures[kind].role }).delete();
      assert.ok(count > 0);
    } else if (mutation === "session") {
      const count = await fixtureDb(metadata("admin::session").tableName).where({
        [column("admin::session", "sessionId")]: ctx.state.session.id,
        [column("admin::session", "userId")]: String(fixtures[kind].id),
        [column("admin::session", "origin")]: "admin",
      }).delete();
      assert.equal(count, 1);
    } else {
      const count = await fixtureDb(metadata("admin::user").tableName).where({ [column("admin::user", "id")]: fixtures[kind].id }).update({ [column("admin::user", mutation === "blocked" ? "blocked" : "isActive")]: mutation === "blocked" });
      assert.equal(count, 1);
    }
  }

  await t.test("role, permission, session and account revocation after native route authorization prevents the actual Page write", async () => {
    for (const kind of ["editor", "publisher"]) {
      for (const mutation of ["role", "permission", "session", "disabled", "blocked"]) {
        const token = mutation === "session" ? await login(kind) : tokens[kind];
        try {
          await unchangedAfter(async () => {
            const response = await afterNativeAuthorization(kind, token, (ctx) => independentlyRevoke(kind, mutation, ctx));
            await expectStatus(response, ["role", "permission"].includes(mutation) ? 403 : 401);
          });
        } finally { await restoreUser(kind); }
      }
    }
  });

  await t.test("field permissions narrowed after native sanitization reject title and body without a partial write", async () => {
    const token = tokens.editor;
    try {
      await unchangedAfter(async () => {
        const response = await afterNativeAuthorization("editor", token, async () => {
          const role = await app.db.query("admin::role").findOne({ where: { id: fixtures.editor.role }, populate: ["permissions"] });
          const grant = role.permissions.find((permission) => permission.action === ACTION("update") && permission.subject === UID);
          assert.ok(grant);
          const count = await fixtureDb(metadata("admin::permission").tableName).where({ [column("admin::permission", "id")]: grant.id }).update({
            [column("admin::permission", "properties")]: JSON.stringify({ ...grant.properties, fields: ["seo_title", "seo_description"] }),
          });
          assert.equal(count, 1);
        });
        await expectStatus(response, 403);
      });
    } finally { await restoreUser("editor"); }
  });

  await t.test("fresh native ownership conditions deny a stale publish grant while allowing the editor to edit its own draft", async () => {
    const publisherToken = tokens.publisher;
    try {
      await unchangedAfter(async () => {
        const response = await afterNativeAuthorization("publisher", publisherToken, async () => {
          const role = await app.db.query("admin::role").findOne({ where: { id: fixtures.publisher.role }, populate: ["permissions"] });
          const grant = role.permissions.find((permission) => permission.action === ACTION("publish") && permission.subject === UID);
          assert.ok(grant);
          const draft = await app.db.query(UID).findOne({ where: { documentId, publishedAt: null }, populate: ["createdBy"] });
          assert.equal(draft.createdBy.id, fixtures.editor.id);
          assert.notEqual(draft.createdBy.id, fixtures.publisher.id);
          const count = await fixtureDb(metadata("admin::permission").tableName).where({ [column("admin::permission", "id")]: grant.id }).update({
            [column("admin::permission", "conditions")]: JSON.stringify(["admin::is-creator"]),
          });
          assert.equal(count, 1);
        });
        await expectStatus(response, 403);
      });
    } finally { await restoreUser("publisher"); }

    await app.service("admin::role").assignPermissions(fixtures.editor.role, savedPermissions.editor.map((permission) => ({
      ...permission,
      conditions: permission.action === ACTION("update") ? ["admin::is-creator"] : permission.conditions,
    })));
    try {
      const before = await snapshot();
      await expectStatus(await request(nativePath(), tokens.editor, "PUT", {
        title: "Creator-authorized draft edit",
        body: paragraph("The native ownership condition still permits its creator"),
      }), 200);
      const after = await snapshot();
      assert.deepEqual(after.public, before.public, "A conditional draft edit must remain private");
      const draft = await app.documents(UID).findOne({ documentId, status: "draft" });
      assert.equal(draft.title, "Creator-authorized draft edit");
      assert.deepEqual(draft.body, paragraph("The native ownership condition still permits its creator"));
      assert.equal(after.audits.length, before.audits.length + 1);
      const added = after.audits.filter((event) => !before.audits.some((previous) => previous.id === event.id));
      assert.equal(added.length, 1);
      assert.equal(added[0].action, "page.update");
      assert.equal(json(added[0].event_metadata).cms_admin_id, String(fixtures.editor.id));
    } finally { await restoreUser("editor"); }
  });

  await t.test("ready native Page schema marker permits a later actual startup without changing published data", async () => {
    const { MARKER } = require("../src/domain/page-editorial");
    const marker = await fixtureDb.withSchema("b2b").table("editorial_page_schema").where({ key: MARKER }).first();
    assert.equal(marker.phase, "ready");
    await unchangedAfter(async () => { await childStartup(databaseUrl.toString(), "ready"); });
  });
});
