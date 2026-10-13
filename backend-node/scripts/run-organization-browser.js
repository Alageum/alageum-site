"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdirSync, writeFileSync, appendFileSync, readdirSync, readFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const fixtures = require("./seed-test-organization-users");
const backend = resolve(__dirname, ".."), frontend = resolve(backend, "../frontend");
const evidence = resolve(process.env.E2E_ORGANIZATION_EVIDENCE || join(backend, "../organization-delivery-evidence"));
const mode = process.argv[2] || "--browser";
const report = { kind: "isolated-organization-selection", startedAt: new Date().toISOString(), status: "running", checks: [], browser: "not-run" };
const secrets = new Set();
let app, next, browser, build, origin, cleanupPromise;
mkdirSync(evidence, { recursive: true, mode: 0o700 });
function redact(value) {
  let result = String(value);
  for (const secret of secrets) if (secret) result = result.split(secret).join("[REDACTED]");
  return result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{64,}(?![A-Za-z0-9_-])/g, "[REDACTED_SECRET]")
    .replace(/\$argon2\S+/g, "[REDACTED_HASH]");
}
// Only complete lines reach disk; credentials spanning output chunks are masked.
function lineSink(file) {
  const decoder = new StringDecoder("utf8"); let pending = "", discard = false;
  writeFileSync(file, "", { mode: 0o600 });
  function drain() {
    let boundary;
    while ((boundary = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, boundary + 1); pending = pending.slice(boundary + 1);
      if (!discard) appendFileSync(file, redact(line));
      discard = false;
    }
    if (pending.length > 1024 * 1024) { pending = ""; discard = true; }
  }
  return { push(chunk) { pending += typeof chunk === "string" ? chunk : decoder.write(chunk); drain(); }, end() { pending += decoder.end(); drain(); if (pending && !discard) appendFileSync(file, redact(pending)); pending = ""; } };
}
const stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr);
const nativeLog = lineSink(join(evidence, "strapi.log"));
for (const stream of [process.stdout, process.stderr]) stream.write = (chunk, encoding, callback) => { nativeLog.push(chunk); if (typeof encoding === "function") encoding(); else callback?.(); return true; };
function save() { writeFileSync(join(evidence, "results.json"), `${redact(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 }); }
async function check(name, work) { const item = { name, status: "running" }; report.checks.push(item); try { await work(); item.status = "passed"; } catch (error) { item.status = "failed"; item.error = redact(error.message); throw error; } finally { save(); } }
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(done => child.once("close", done)); child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000); try { await ended; } finally { clearTimeout(timer); }
}
function sanitizeBrowserArtifacts(directory = join(evidence, "browser")) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sanitizeBrowserArtifacts(path);
    else if (entry.isFile() && /\.(?:md|json|txt|log)$/.test(entry.name)) {
      writeFileSync(path, redact(readFileSync(path, "utf8")), { mode: 0o600 });
    }
  }
}
function cleanup() { return cleanupPromise ||= (async () => { await stop(browser); await stop(build); await stop(next); if (app) { const current = app; app = null; await current.destroy(); } })(); }
function child(args, env, name) {
  const sink = lineSink(join(evidence, name));
  const task = spawn(process.execPath, args, { cwd: frontend, env, stdio: ["ignore", "pipe", "pipe"] });
  task.stdout.on("data", sink.push); task.stderr.on("data", sink.push); task.once("close", sink.end);
  task.on("error", error => { task.spawnError = error; }); return task;
}
async function completed(task, message) { const code = await new Promise(done => task.once("close", done)); if (task.spawnError) throw task.spawnError; assert.equal(code, 0, message); }
async function port() { const server = createServer(); await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); }); const value = server.address().port; await new Promise(done => server.close(done)); return value; }
async function api(path, { actor, organization, method = "GET", data, expected = 200 } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, signal: AbortSignal.timeout(15000), headers: {
    "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor.access_token}` } : {}), ...(organization ? { "X-Organization-ID": organization } : {}),
  }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal(response.status, expected, `${method} ${path} status`);
  if (path === "/organizations/current/profile" || (response.ok && ["/organizations", "/auth/"].some(prefix => path.startsWith(prefix)))) assert.match(response.headers.get("cache-control") || "", /private.*no-store/, "Private responses must be non-cacheable");
  return response.status === 204 ? null : response.json();
}
async function interrupted(signal) { report.status = "failed"; if (report.browser === "running") report.browser = "failed"; report.error = `Interrupted by ${signal}`; await cleanup(); sanitizeBrowserArtifacts(); save(); nativeLog.end(); process.exit(1); }
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void interrupted(signal); });
const deadline = setTimeout(() => { void interrupted("runner deadline"); }, 900000);

(async () => {
  try {
    assert.ok(["--browser", "--backend-only"].includes(mode) && process.argv.length <= 3, "Use --browser or --backend-only");
    assert.ok(mode !== "--backend-only" || !process.env.CI, "CI must run the browser suite");
    const validated = fixtures.validateFixtureEnvironment();
    secrets.add(validated.password); secrets.add(decodeURIComponent(validated.url.password));
    await check("fresh isolated loopback database before schema synchronization", () => fixtures.requireFreshOrganizationDatabase());
    fixtures.generateFixtureSecrets();
    for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) secrets.add(process.env[key]);
    const webPort = mode === "--browser" ? await port() : null;
    const webOrigin = webPort ? `http://127.0.0.1:${webPort}` : null;
    if (webOrigin) process.env.CORS_ORIGINS = webOrigin;
    process.chdir(backend); process.env.HOST = "127.0.0.1"; process.env.PORT = "0";
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    let manifest;
    await check("new organization-only fixtures and reject reseed", async () => {
      manifest = await fixtures.seedTestOrganizationUsers(app);
      await assert.rejects(() => fixtures.seedTestOrganizationUsers(app), /existing B2B rows/);
      const counts = await app.db.connection.withSchema("b2b").table("users").where("email", "like", "%@demo.example").count("id AS count");
      assert.equal(Number(counts[0].count), 0);
      assert.equal(manifest.organizations.a.name, manifest.organizations.b.name);
      assert.notEqual(manifest.organizations.a.id, manifest.organizations.b.id);
    });
    app.server.mount(); await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
    origin = `http://127.0.0.1:${app.server.httpServer.address().port}`;
    const actors = {}, a = manifest.organizations.a.id, b = manifest.organizations.b.id, path = "/organizations/current/profile";
    const table = name => app.db.connection.withSchema("b2b").table(name);
    let fixtureLoginWindow = Date.now();
    await check("real single/multiple/zero-membership logins with duplicate display names", async () => {
      for (const kind of Object.keys(fixtures.EMAILS)) {
        actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password: validated.password } });
        fixtureLoginWindow = Date.now();
        secrets.add(actors[kind].access_token); secrets.add(actors[kind].refresh_token);
        const inventory = await api("/organizations?page=1&page_size=100", { actor: actors[kind] });
        const ids = manifest.users[kind].organizations;
        assert.equal(inventory.total, ids.length);
        assert.deepEqual(inventory.items.map(item => item.organization_id).sort(), [...ids].sort());
        for (const item of inventory.items) {
          assert.equal(item.organization_name, manifest.organizations.a.name);
          const role = ["readonly", "denied"].includes(kind) ? kind : "editor";
          assert.deepEqual(item.permissions, [...fixtures.GRANTS[role]].sort());
        }
      }
      await api("/organizations", { expected: 401 });
      assert.equal((await api("/auth/me", { actor: actors.single })).organization.id, a);
      await api("/auth/me", { actor: actors.multi, expected: 400 });
      await api("/auth/me", { actor: actors.none, expected: 403 });
      await api(path, { actor: actors.none, organization: a, expected: 403 });
    });
    await check("explicit UUID selection and role grants enforce tenant boundaries", async () => {
      for (const organization of [a, b]) {
        assert.equal((await api("/auth/me", { actor: actors.multi, organization })).organization.id, organization);
        assert.equal((await api(path, { actor: actors.multi, organization })).organization_id, organization);
      }
      await api("/auth/me", { actor: actors.single, organization: b, expected: 403 });
      await api(path, { actor: actors.single, organization: b, expected: 403 });
      await api("/auth/me", { actor: actors.multi, organization: "not-a-uuid", expected: 422 });
      await api(path, { actor: actors.readonly, organization: a });
      await api(path, { actor: actors.denied, organization: a, expected: 403 });
      for (const kind of ["readonly", "denied"]) await api(path, { actor: actors[kind], organization: a, method: "PATCH", data: { version: 0, name: "Forbidden fixture change" }, expected: 403 });
    });
    await check("stale selection, revoked membership and wrong-organization role fail closed", async () => {
      const target = { user_id: manifest.users.revoked.id, organization_id: b };
      try {
        await table("memberships").where(target).update({ is_active: false });
        const active = await api("/organizations", { actor: actors.revoked });
        assert.deepEqual(active.items.map(item => item.organization_id), [a]);
        await api("/auth/me", { actor: actors.revoked, organization: b, expected: 403 });
        await api(path, { actor: actors.revoked, organization: b, expected: 403 });
        await table("memberships").where(target).update({ is_active: true, role_id: manifest.roles.a.editor });
        assert.equal((await api("/organizations", { actor: actors.revoked })).total, 1);
        await api("/auth/me", { actor: actors.revoked, organization: b, expected: 403 });
      } finally { await table("memberships").where(target).update({ is_active: true, role_id: manifest.roles.b.editor }); }
      try {
        await table("organizations").where({ id: b }).update({ is_active: false });
        assert.equal((await api("/organizations", { actor: actors.multi })).total, 1);
        await api("/auth/me", { actor: actors.multi, organization: b, expected: 403 });
      } finally { await table("organizations").where({ id: b }).update({ is_active: true }); }
    });
    await check("revoked current role grants apply before profile read or mutation", async () => {
      try {
        await table("roles").where({ id: manifest.roles.b.editor }).update({ permissions: JSON.stringify([]) });
        assert.deepEqual((await api("/auth/me", { actor: actors.multi, organization: b })).permissions, []);
        await api(path, { actor: actors.multi, organization: b, expected: 403 });
        await api(path, { actor: actors.multi, organization: b, method: "PATCH", data: { version: 0, name: "Forbidden stale grant" }, expected: 403 });
      } finally { await table("roles").where({ id: manifest.roles.b.editor }).update({ permissions: JSON.stringify(fixtures.GRANTS.editor) }); }
    });
    await check("expired access, one-use refresh rotation and expired refresh are rejected", async () => {
      const jwt = require("jsonwebtoken");
      const issued = jwt.decode(actors.revoked.access_token), now = Math.floor(Date.now() / 1000);
      const expired = jwt.sign({ ...issued, iat: now - 120, nbf: now - 120, exp: now - 60 }, process.env.ALAGEUM_JWT_SECRET, { algorithm: "HS256" });
      secrets.add(expired);
      await api("/organizations", { actor: { access_token: expired }, expected: 401 });
      const rotated = await api("/auth/refresh", { method: "POST", data: { refresh_token: actors.revoked.refresh_token } });
      secrets.add(rotated.access_token); secrets.add(rotated.refresh_token);
      await api("/auth/refresh", { method: "POST", data: { refresh_token: actors.revoked.refresh_token }, expected: 401 });
      await table("refresh_sessions").where({ user_id: manifest.users.revoked.id }).update({ expires_at: new Date(0) });
      await api("/auth/refresh", { method: "POST", data: { refresh_token: rotated.refresh_token }, expected: 401 });
      assert.equal((await api("/organizations", { actor: actors.multi })).total, 2);
    });
    if (mode === "--browser") {
      const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ALAGEUM_ORGANIZATION_BUILD: "1", NEXT_PUBLIC_API_URL: `${origin}/api/v1`, NEXT_PUBLIC_CATALOG_SOURCE: "static", COMPANY_SOURCE: "static", PAGES_SOURCE: "static", PAGES_STATIC_PREVIEW: "1", E2E_ORGANIZATION_BASE_URL: webOrigin, E2E_ORGANIZATION_API_URL: `${origin}/api/v1`, E2E_ORGANIZATION_A: a, E2E_ORGANIZATION_B: b, E2E_ORGANIZATION_OUTPUT: join(evidence, "browser") };
      await check("dedicated production Next build", async () => { build = child([join(frontend, "node_modules/next/dist/bin/next"), "build"], env, "next-build.log"); await completed(build, "Organization Next build failed; inspect sanitized log"); });
      next = child([join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], env, "next.log");
      const readyBy = Date.now() + 45000;
      while (true) {
        assert.ok(next.exitCode === null && next.signalCode === null && !next.spawnError, "Organization Next exited before readiness");
        try { const response = await fetch(`${webOrigin}/login`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* Bounded readiness retry. */ }
        assert.ok(Date.now() < readyBy, "Organization Next readiness timed out"); await new Promise(done => setTimeout(done, 200));
      }
      // Wait 61 seconds after the LAST of six HTTP setup logins. The browser
      // suite has at most 19 further login attempts across both projects, within
      // the unchanged 20/minute limit even if the whole suite runs in one minute.
      const remainingLoginWindow = fixtureLoginWindow + 61000 - Date.now();
      for (let remaining = remainingLoginWindow; remaining > 0; remaining -= 30000) await new Promise(done => setTimeout(done, Math.min(remaining, 30000)));
      await check("dedicated desktop/mobile organization selection browser acceptance", async () => {
        report.browser = "running";
        browser = child([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.organization.config.js"], env, "playwright.log");
        await completed(browser, "Organization browser acceptance failed; inspect sanitized log"); report.browser = "passed";
      });
    } else report.browser = "not-run: explicit --backend-only";
    report.status = "passed";
  } catch (error) { report.status = "failed"; if (report.browser === "running") report.browser = "failed"; report.error = redact(error.message); process.exitCode = 1; }
  finally {
    try { await cleanup(); sanitizeBrowserArtifacts(); } catch { report.status = "failed"; report.cleanup = "failed"; process.exitCode = 1; }
    clearTimeout(deadline); report.finishedAt = new Date().toISOString(); save(); nativeLog.end();
    process.stdout.write = stdout; process.stderr.write = stderr;
    stdout(`Organization verification ${report.status}; ${report.checks.filter(item => item.status === "passed").length}/${report.checks.length} checks passed; browser ${report.browser}\n`);
    stdout(`Sanitized evidence: ${evidence}\n`);
  }
})();
