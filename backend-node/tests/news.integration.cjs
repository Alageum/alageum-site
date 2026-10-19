"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { mkdtemp, mkdir } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { UID, FIELDS } = require("../src/domain/news");
const { scannerFixture, EICAR } = require("./helpers/media-scanner-fixture");
const { png } = require("./helpers/upload-image-fixtures");
const CMS = `/content-manager/collection-types/${UID}`;
const paragraph = text => [{ type: "paragraph", children: [{ type: "text", text }] }];
test("native News lifecycle, authority, scanner-gated covers and public disclosure", { timeout: 180000 }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol)); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/alageum_strapi_news_test"); assert.equal(url.search, ""); assert.equal(url.hash, "");
  Object.assign(process.env, { APP_ENV: "test", ALAGEUM_SEED_DEMO: "false", ALAGEUM_IMPORT_CATALOG: "false", STRAPI_TELEMETRY_DISABLED: "true" });
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) process.env[key] = randomBytes(48).toString("hex");
  const scanner = await scannerFixture(t), root = await mkdtemp(join(tmpdir(), "alageum-news-media-"));
  await mkdir(join(root, "public/uploads"), { recursive: true, mode: 0o755 }); await mkdir(join(root, "private"), { mode: 0o700 });
  Object.assign(process.env, { ALAGEUM_MEDIA_PUBLIC_ROOT: join(root, "public"), ALAGEUM_MEDIA_QUARANTINE_DIR: join(root, "private"), ALAGEUM_MEDIA_CLAMAV_HOST: "127.0.0.1", ALAGEUM_MEDIA_CLAMAV_PORT: String(scanner.config.scanner.port), ALAGEUM_MEDIA_CLAMAV_SOCKET: "" });
  const app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
  t.after(async () => { await app.destroy(); });
  await app.load(); assert.equal(await app.admin.services.user.exists(), false, "Use a fresh disposable database");
  const fixtures = {};
  for (const [kind, actions] of Object.entries({ editor: ["read", "create", "update"], publisher: ["read", "publish"], denied: [] })) {
    const role = await app.admin.services.role.create({ name: `Disposable news ${kind}`, code: `news-test-${kind}` });
    const permissions = actions.map(action => ({ action: `plugin::content-manager.explorer.${action}`, subject: UID, conditions: [], properties: ["read", "create", "update"].includes(action) ? { fields: FIELDS } : {} }));
    if (kind === "editor") permissions.push(...["plugin::upload.read", "plugin::upload.assets.create"].map(action => ({ action, subject: null, properties: {}, conditions: [] })));
    await app.admin.services.role.assignPermissions(role.id, permissions);
    const password = `Aa1!${randomBytes(32).toString("hex")}`, email = `news-${kind}@example.test`;
    const user = await app.admin.services.user.create({ firstname: "News", lastname: kind, email, password, isActive: true, blocked: false, roles: [role.id] });
    fixtures[kind] = { user, role, email, password, permissions };
  }
  app.server.mount(); await new Promise(resolve => app.server.httpServer.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.httpServer.address().port}`;
  const request = (path, kind, method = "GET", body) => fetch(`${base}${path}`, { method, headers: { ...(fixtures[kind]?.token ? { Authorization: `Bearer ${fixtures[kind].token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (response, expected = 200) => { assert.equal(response.status, expected, await response.clone().text()); return response.json(); };
  for (const [kind, fixture] of Object.entries(fixtures)) fixture.token = (await json(await request("/admin/login", null, "POST", { email: fixture.email, password: fixture.password }))).data.accessToken;
  const data = { slug: "news-lifecycle", title: "Factory launch", locale_code: "ru", summary: "Public summary", body: paragraph("Initial body"), publication_date: "2026-10-19", cover_alt: "Factory" };
  let documentId, cover;
  await t.test("native editor creates persistent draft; anonymous/business/denied identities cannot create or read drafts", async () => {
    await json(await request(CMS, null, "POST", data), 401); await json(await request(CMS, "denied", "POST", data), 403);
    const jwt = require("jsonwebtoken"); fixtures.business = { token: jwt.sign({ sub: "1", role: "admin" }, process.env.ALAGEUM_JWT_SECRET, { expiresIn: "1h" }) }; await json(await request(CMS, "business", "POST", data), 401);
    const created = await json(await request(CMS, "editor", "POST", data), 201); documentId = created.data.documentId; assert.ok(documentId);
    const reloaded = await json(await request(`${CMS}/${documentId}`, "editor")); assert.equal(reloaded.data.title, data.title); assert.equal(reloaded.data.publishedAt, null);
    assert.equal((await request(`${CMS}/${documentId}`, null)).status, 401); assert.equal((await request(`${CMS}/${documentId}`, "denied")).status, 403);
    await json(await request(`/api/v1/news/${data.slug}`), 404); assert.deepEqual((await json(await request("/api/v1/news"))).data, []);
  });
  await t.test("Media Library cover upload is scanned; EICAR and scanner outage cannot persist uploads", async () => {
    const upload = async bytes => { const form = new FormData(); form.append("files", new Blob([bytes], { type: "image/png" }), "news-cover.png"); return fetch(`${base}/upload`, { method: "POST", headers: { Authorization: `Bearer ${fixtures.editor.token}` }, body: form }); };
    const before = await app.db.query("plugin::upload.file").count();
    const blocked = await upload(Buffer.concat([png(12, 8), EICAR])); assert.equal(blocked.status, 400); assert.equal(await app.db.query("plugin::upload.file").count(), before);
    cover = (await json(await upload(png(12, 8)), 201))[0]; assert.match(cover.url, /^\/uploads\//); assert.ok(scanner.scanned.length >= 5);
    scanner.setResponder(() => "stream: scan failed ERROR\0"); assert.equal((await upload(png(12, 8))).status, 503); scanner.setResponder(bytes => bytes.includes(EICAR) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
    assert.equal(await app.db.query("plugin::upload.file").count(), before + 1);
    await json(await request(`${CMS}/${documentId}`, "editor", "PUT", { cover: cover.id }), 200);
    await json(await request(`/api/v1/news/${data.slug}`), 404);
  });
  await t.test("publisher alone publishes; later draft edits do not leak until republished", async () => {
    await json(await request(`${CMS}/${documentId}/actions/publish`, "editor", "POST", {}), 403);
    await json(await request(`${CMS}/${documentId}`, "publisher", "PUT", { title: "Denied" }), 403);
    await json(await request(`${CMS}/${documentId}/actions/publish`, "publisher", "POST", {}));
    const original = await json(await request(`/api/v1/news/${data.slug}`)); assert.equal(original.title, data.title); assert.equal(original.cover.url, cover.url); assert.equal(original.createdBy, undefined);
    assert.equal((await json(await request("/api/v1/news?page_size=3"))).data[0].body, undefined);
    await json(await request(`${CMS}/${documentId}`, "editor", "PUT", { title: "Revised draft", body: paragraph("Private revision") }));
    assert.deepEqual(await json(await request(`/api/v1/news/${data.slug}`)), original);
    await json(await request(`${CMS}/${documentId}/actions/publish`, "publisher", "POST", {})); assert.equal((await json(await request(`/api/v1/news/${data.slug}`))).title, "Revised draft");
  });
  await t.test("unsafe body, no permission, revoked grants and blocked admin preserve content", async () => {
    for (const body of [[{ type: "html", children: [] }], [{ type: "paragraph", children: [{ type: "link", url: "javascript:alert(1)", children: [{ type: "text", text: "X" }] }] }]]) await json(await request(`${CMS}/${documentId}`, "editor", "PUT", { body }), 400);
    await app.admin.services.role.assignPermissions(fixtures.editor.role.id, []); await json(await request(`${CMS}/${documentId}`, "editor", "PUT", { title: "Revoked" }), 403);
    await app.admin.services.role.assignPermissions(fixtures.editor.role.id, fixtures.editor.permissions);
    await app.admin.services.user.updateById(fixtures.editor.user.id, { blocked: true }); await json(await request(`${CMS}/${documentId}`, "editor", "PUT", { title: "Blocked" }), 401);
    await app.admin.services.user.updateById(fixtures.editor.user.id, { blocked: false });
    assert.equal((await json(await request(`/api/v1/news/${data.slug}`))).title, "Revised draft");
    for (const query of ["status=draft", "populate=*", "locale=ru&locale=en", "fields=createdBy"]) { await json(await request(`/api/v1/news?${query}`), 400); await json(await request(`/api/v1/news/${data.slug}?${query}`), 400); }
    await json(await request(`/api/v1/news/${data.slug}?locale=en`), 404);
    for (const path of ["/api/v1/news-articles", `/api/v1/news/${data.slug}`]) for (const method of ["POST", "PUT", "DELETE"]) assert.ok([404, 405].includes((await request(path, "editor", method, data)).status));
  });
  await t.test("native unpublish removes list/detail immediately and audit records CMS identity", async () => {
    await json(await request(`${CMS}/${documentId}/actions/unpublish`, "publisher", "POST", {}));
    await json(await request(`/api/v1/news/${data.slug}`), 404); assert.deepEqual((await json(await request("/api/v1/news"))).data, []);
    assert.equal((await json(await request(`${CMS}/${documentId}`, "editor"))).data.title, "Revised draft");
    const events = await app.db.connection.withSchema("b2b").table("audit_events").where({ entity_type: "news", entity_id: documentId });
    assert.ok(events.some(event => event.action === "news.publish")); assert.ok(events.some(event => event.action === "news.unpublish")); assert.ok(events.every(event => event.actor_user_id === null));
  });
});
