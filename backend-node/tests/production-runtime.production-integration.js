"use strict";
// This proof only accepts the fresh loopback database created by its shell
// runner. HTTPS and SMTP terminate locally; no recipient or external host exists.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { Client } = require("pg");
const { startSmtpCapture, plainText } = require("./helpers/local-smtp-capture");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test("validated production Strapi boots, persists sessions and serves secure account flows", { timeout: 180000 }, async t => {
  const work = process.env.ALAGEUM_PRODUCTION_TEST_WORK;
  assert.ok(work && /^alageum-production-test\.[A-Za-z0-9]+$/.test(path.basename(work)));
  assert.equal(fs.realpathSync(work), work);
  assert.equal(fs.readFileSync(path.join(work, "owner"), "utf8").trim(), process.env.ALAGEUM_PRODUCTION_TEST_OWNER);
  const database = new URL(process.env.ALAGEUM_PRODUCTION_TEST_DATABASE_URL);
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/alageum_strapi_production_test");
  assert.equal(database.username, "alageum_production_test"); assert.equal(database.search, ""); assert.equal(database.hash, "");
  const client = new Client({ connectionString: database.href }); await client.connect();
  try {
    assert.equal((await client.query("SELECT current_setting('data_directory') AS directory")).rows[0].directory, path.join(work, "postgres"));
    assert.equal((await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema IN ('public','b2b')")).rows.length, 0, "Fresh owned database required");
  } finally { await client.end(); }
  const cert = fs.readFileSync(path.join(work, "cert.pem")), key = fs.readFileSync(path.join(work, "key.pem"));
  const smtp = await startSmtpCapture({ cert, key, port: 2525 });
  let app, backendPort;
  const proxy = https.createServer({ cert, key }, (req, res) => {
    const forwarded = http.request({ host: "127.0.0.1", port: backendPort, path: req.url, method: req.method,
      headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress, "x-forwarded-proto": "https" } }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
    });
    forwarded.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(forwarded);
  });
  await new Promise((resolve, reject) => { proxy.once("error", reject); proxy.listen(0, "127.0.0.1", resolve); });
  const origin = `https://site.example.test:${proxy.address().port}`;
  const media = path.join(work, "public"), quarantine = path.join(work, "quarantine");
  fs.mkdirSync(path.join(media, "uploads"), { recursive: true, mode: 0o750 }); fs.mkdirSync(quarantine, { mode: 0o700 });
  Object.assign(process.env, {
    APP_ENV: "production", NODE_ENV: "production", HOST: "127.0.0.1", PORT: "8000",
    DATABASE_URL: database.href, DATABASE_SSL: "false", ALAGEUM_SEED_DEMO: "0", ALAGEUM_IMPORT_CATALOG: "0",
    ALAGEUM_EDS_ENABLED: "0", ALAGEUM_GOOGLE_ENABLED: "0", ALAGEUM_BROWSER_ORIGIN: origin, CORS_ORIGINS: origin,
    ALAGEUM_TRUSTED_PROXY_IPS: "127.0.0.1", ALAGEUM_MEDIA_PUBLIC_ROOT: media, ALAGEUM_MEDIA_QUARANTINE_DIR: quarantine,
    ALAGEUM_MEDIA_CLAMAV_HOST: "127.0.0.1", ALAGEUM_MEDIA_CLAMAV_SOCKET: "", ALAGEUM_MEDIA_CLAMAV_PORT: "3310",
    ALAGEUM_REGISTRATION_MAIL_PROVIDER: "smtp", ALAGEUM_SMTP_HOST: "127.0.0.1", ALAGEUM_SMTP_PORT: String(smtp.port),
    ALAGEUM_SMTP_TLS_SERVERNAME: "site.example.test", ALAGEUM_MAIL_FROM: "noreply@example.test",
    ALAGEUM_SMTP_USER: "synthetic-test-user", ALAGEUM_SMTP_PASSWORD: "synthetic-test-password",
    STRAPI_TELEMETRY_DISABLED: "true", STRAPI_HIDE_UPDATE_MESSAGE: "true",
    APP_KEYS: `${randomBytes(48).toString("hex")},${randomBytes(48).toString("hex")}`,
  });
  for (const name of ["ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"])
    process.env[name] = randomBytes(48).toString("hex");
  t.after(async () => {
    if (app) await app.destroy();
    proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); await smtp.close();
  });
  async function boot() {
    app = require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() });
    await app.load(); app.server.mount();
    await new Promise((resolve, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", resolve); });
    backendPort = app.server.httpServer.address().port;
  }
  const jar = new Map(); let boundary = "";
  async function request(route, { method = "GET", body, expected = 200, sentOrigin = origin, useCookies = true, session = boundary, api = true } = {}) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const response = await new Promise((resolve, reject) => {
      const req = https.request({ hostname: "127.0.0.1", port: proxy.address().port, servername: "site.example.test", ca: cert,
        path: api ? `/api/v1${route}` : route, method, headers: { Host: new URL(origin).host, Origin: sentOrigin,
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(useCookies && jar.size ? { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
          ...(session ? { "X-Browser-Session": session } : {}),
        } }, res => {
        let text = ""; res.on("data", value => { text += value; }); res.on("end", () => {
          try { resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }); }
          catch { reject(new Error("Local proof received a non-JSON response")); }
        });
      }); req.on("error", reject); req.setTimeout(15000, () => req.destroy(new Error("Local proof request timed out"))); req.end(payload);
    });
    assert.equal(response.status, expected, `${method} ${route}`);
    for (const cookie of response.headers["set-cookie"] || []) {
      const [pair] = cookie.split(";"), index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
      assert.match(cookie, /; secure/i); assert.match(cookie, /; httponly/i); assert.match(cookie, /; samesite=lax/i);
    }
    return response;
  }
  async function mailToken(start, route) {
    for (let attempt = 0; attempt < 50 && smtp.messages.length <= start; attempt++) { await app.alageum.registration.flushMail(); await pause(100); }
    assert.equal(smtp.messages.length, start + 1); const message = smtp.messages[start]; assert.equal(message.secure, true);
    const match = plainText(message).match(/https:\/\/site\.example\.test:\d+\/[^\s]+/); assert.ok(match);
    const url = new URL(match[0]); assert.equal(url.origin, origin); assert.equal(url.pathname, route);
    return new URLSearchParams(url.hash.slice(1)).get("token");
  }
  const email = "production-proof@example.test"; let password = "Synthetic-production-password!";
  async function login() {
    const prepare = await request("/auth/browser-prepare", { method: "POST", body: {} });
    const result = await request("/auth/browser-login", { method: "POST", body: { email, password, flow_id: prepare.body.flow_id } });
    boundary = result.body.session_id; assert.match(boundary, /^[a-f0-9-]{36}$/);
    assert.ok(jar.get("__Host-alageum_session")); assert.equal(Object.hasOwn(result.body, "access_token"), false);
  }
  await t.test("actual production bootstrap admits all schemas with no demo identities", async () => {
    await boot(); assert.equal(app.config.get("alageum.env"), "production");
    assert.equal(Number((await app.db.connection.withSchema("b2b").table("users").count({ total: "*" }).first()).total), 0);
    assert.equal((await request("/readiness")).body.database, "ok");
    assert.equal((await request("/version")).body.environment, "production");
    assert.equal(app.alageum.registration.mailWorkerStatus().polling, true);
  });
  await t.test("empty production CMS cannot be claimed through anonymous bootstrap HTTP", async () => {
    await request("/admin/register-admin", { api: false, method: "POST", body: { email: "attacker@example.test", password: "Synthetic-blocked-password!", firstname: "Blocked" }, expected: 403 });
    assert.equal(await app.db.query("admin::user").count(), 0);
  });
  await t.test("reviewed catalog bootstrap imports once and refuses concurrent or later overwrite", async () => {
    const records = require("../src/domain/catalog-source").readCatalog();
    const results = await Promise.allSettled([app.alageum.catalog.importRecords(records, { requireEmpty: true }), app.alageum.catalog.importRecords(records, { requireEmpty: true })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "fulfilled").value.created, records.length);
    assert.match(results.find(result => result.status === "rejected").reason.message, /requires an empty catalog/);
    const before = await app.db.connection("alageum_products").select("*").orderBy("id");
    await assert.rejects(app.alageum.catalog.importRecords(records, { requireEmpty: true }), /requires an empty catalog/);
    assert.deepEqual(await app.db.connection("alageum_products").select("*").orderBy("id"), before);
  });
  await t.test("real TLS signup mail, verification and cookie login produce a personal account only", async () => {
    await request("/auth/register", { method: "POST", body: { email, password, display_name: "Synthetic production customer" }, expected: 202 });
    const token = await mailToken(0, "/verify-email");
    await request("/auth/verify-email", { method: "POST", body: { token } }); await login();
    const account = await request("/auth/account"); assert.equal(account.body.onboarding_status, "no_company"); assert.deepEqual(account.body.permissions, []);
    await request("/auth/me", { expected: 403 });
  });
  await t.test("foreign-origin mutation and missing session boundary are refused", async () => {
    await request("/auth/browser-logout", { method: "POST", body: {}, sentOrigin: "https://evil.example.test", expected: 403 });
    await request("/auth/account", { session: "", expected: 401 });
    assert.equal((await request("/auth/account")).body.user.email, email);
  });
  await t.test("application restart preserves schema, verified account and issued cookie", async () => {
    await app.destroy(); app = null; await boot();
    assert.equal((await request("/auth/account")).body.user.email, email);
    assert.equal((await request("/readiness")).body.database, "ok");
  });
  await t.test("actual reset mail invalidates old cookie, new login and logout work", async () => {
    const count = smtp.messages.length;
    await request("/auth/forgot-password", { method: "POST", body: { email }, expected: 202 });
    const token = await mailToken(count, "/reset-password"); password = "Changed-production-password!";
    await request("/auth/reset-password", { method: "POST", body: { token, password } });
    await request("/auth/account", { expected: 401 }); await login();
    await request("/auth/browser-logout", { method: "POST", body: {}, expected: 204 });
    await request("/auth/account", { expected: 401 });
  });
  await t.test("explicit verified operator provisioning works in production without changing existing grants", async () => {
    const operator = require("../scripts/provision-business-operator");
    const connection = operator.connectionForEnvironment(); assert.equal(connection.database, "alageum_strapi_production_test");
    const args = { email, mode: "organization-admin", createOrganization: true, organizationName: "Synthetic organization", organizationIdentifier: "synthetic-production-operator", apply: false };
    assert.equal((await operator.provision(app.db.connection, args)).applied, false);
    assert.equal(Number((await app.db.connection.withSchema("b2b").table("memberships").count({ count: "*" }).first()).count), 0);
    const granted = await operator.provision(app.db.connection, { ...args, apply: true }); assert.equal(granted.applied, true);
    await login();
    const account = await request("/auth/account"); assert.equal(account.body.onboarding_status, "approved");
    await assert.rejects(operator.provision(app.db.connection, { email, mode: "catalog-manager", organizationId: granted.organization.id, apply: true }), /Membership already exists/);
    const role = await app.db.connection.withSchema("b2b").table("roles").where({ organization_id: granted.organization.id }).first();
    assert.ok(!JSON.stringify(role.permissions).includes("catalog.manage"));
  });
});
