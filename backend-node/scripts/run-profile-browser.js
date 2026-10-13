"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdirSync, writeFileSync, appendFileSync, readdirSync, readFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const fixtures = require("./seed-test-profile-users");
const backend = resolve(__dirname, ".."), frontend = resolve(backend, "../frontend");
const evidence = resolve(process.env.E2E_PROFILE_EVIDENCE || join(backend, "../profile-delivery-evidence"));
const mode = process.argv[2] || "--browser";
const report = { kind: "isolated-company-profile", startedAt: new Date().toISOString(), status: "running", checks: [], browser: "not-run" };
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
  if (path === "/organizations/current/profile") assert.match(response.headers.get("cache-control") || "", /private.*no-store/, "Profile responses must be private and non-cacheable");
  return response.status === 204 ? null : response.json();
}
async function interrupted(signal) { report.status = "failed"; report.error = `Interrupted by ${signal}`; await cleanup(); sanitizeBrowserArtifacts(); save(); nativeLog.end(); process.exit(1); }
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void interrupted(signal); });
const deadline = setTimeout(() => { void interrupted("runner deadline"); }, 900000);

(async () => {
  try {
    assert.ok(["--browser", "--backend-only"].includes(mode) && process.argv.length <= 3, "Use --browser or --backend-only");
    assert.ok(mode !== "--backend-only" || !process.env.CI, "CI must run the browser suite");
    const validated = fixtures.validateFixtureEnvironment();
    secrets.add(validated.password); secrets.add(decodeURIComponent(validated.url.password));
    await check("fresh isolated loopback database before schema synchronization", () => fixtures.requireFreshProfileDatabase());
    fixtures.generateFixtureSecrets();
    for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) secrets.add(process.env[key]);
    const webPort = mode === "--browser" ? await port() : null;
    const webOrigin = webPort ? `http://127.0.0.1:${webPort}` : null;
    if (webOrigin) process.env.CORS_ORIGINS = webOrigin;
    process.chdir(backend); process.env.HOST = "127.0.0.1"; process.env.PORT = "0";
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    let manifest;
    await check("new profile-only B2B fixtures and reject reseed", async () => {
      manifest = await fixtures.seedTestProfileUsers(app);
      await assert.rejects(() => fixtures.seedTestProfileUsers(app), /existing B2B rows/);
      assert.equal(await app.db.connection.withSchema("b2b").table("users").where("email", "like", "%@demo.example").count("id AS count").first().then(row => Number(row.count)), 0);
    });
    app.server.mount(); await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
    origin = `http://127.0.0.1:${app.server.httpServer.address().port}`;
    const actors = {}, a = manifest.organizations.a.id, b = manifest.organizations.b.id, path = "/organizations/current/profile";
    const fixtureLoginWindow = Date.now();
    await check("real logins, exact role grants and read boundaries", async () => {
      for (const kind of Object.keys(fixtures.EMAILS)) {
        actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password: validated.password } });
        secrets.add(actors[kind].access_token); secrets.add(actors[kind].refresh_token);
        const organization = kind === "other" ? b : a;
        const me = await api("/auth/me", { actor: actors[kind], organization });
        assert.deepEqual(me.permissions, [...fixtures.GRANTS[["other", "multi"].includes(kind) ? "editor" : kind]].sort());
        const allowed = !["updateonly", "denied"].includes(kind);
        const profile = await api(path, { actor: actors[kind], organization, expected: allowed ? 200 : 403 });
        if (allowed) assert.equal(profile.organization_id, organization);
      }
      await api(path, { expected: 401 });
      await api(path, { actor: actors.editor, organization: b, expected: 403 });
      await api(path, { actor: actors.multi, expected: 400 });
      assert.equal((await api(path, { actor: actors.multi, organization: b })).organization_id, b);
    });
    await check("both grants required, durable save, optional strings and stale version conflict", async () => {
      for (const kind of ["readonly", "updateonly", "denied"]) await api(path, { actor: actors[kind], organization: a, method: "PATCH", data: { version: 0, name: "Not permitted" }, expected: 403 });
      const before = await api(path, { actor: actors.editor, organization: a });
      const fields = { name: "Fictitious Profile Workshop A", business_contact_name: "Fictitious Contact", business_contact_email: "contact@fixture.invalid", business_contact_phone: "+0 000 000 000", business_address: "Fictitious Example Avenue 1" };
      const saved = await api(path, { actor: actors.editor, organization: a, method: "PATCH", data: { version: before.version, ...fields } });
      assert.equal(saved.version, before.version + 1);
      assert.deepEqual(await api(path, { actor: actors.editor, organization: a }), saved);
      for (const [key, value] of Object.entries(fields)) assert.equal(saved[key], value);
      assert.equal((await api(path, { actor: actors.editor, organization: a, method: "PATCH", data: { version: before.version, name: "Stale" }, expected: 409 })).error.code, "version_conflict");
      const untouched = await api(path, { actor: actors.other, organization: b });
      assert.equal(untouched.version, 0); assert.equal(untouched.name, manifest.organizations.b.name);
    });
    if (mode === "--browser") {
      const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ALAGEUM_PROFILE_BUILD: "1", NEXT_PUBLIC_API_URL: `${origin}/api/v1`, NEXT_PUBLIC_CATALOG_SOURCE: "static", COMPANY_SOURCE: "static", PAGES_SOURCE: "static", PAGES_STATIC_PREVIEW: "1", E2E_PROFILE_BASE_URL: webOrigin, E2E_PROFILE_API_URL: `${origin}/api/v1`, E2E_PROFILE_ORGANIZATION_A: a, E2E_PROFILE_ORGANIZATION_B: b, E2E_PROFILE_OUTPUT: join(evidence, "browser") };
      await check("dedicated production Next build", async () => { build = child([join(frontend, "node_modules/next/dist/bin/next"), "build"], env, "next-build.log"); await completed(build, "Profile Next build failed; inspect sanitized log"); });
      next = child([join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], env, "next.log");
      const readyBy = Date.now() + 45000;
      while (true) {
        assert.ok(next.exitCode === null && next.signalCode === null && !next.spawnError, "Profile Next exited before readiness");
        try { const response = await fetch(`${webOrigin}/login`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* Bounded readiness retry. */ }
        assert.ok(Date.now() < readyBy, "Profile Next readiness timed out"); await new Promise(done => setTimeout(done, 200));
      }
      // Keep the six HTTP fixture logins outside the real 20/minute browser
      // login allowance. Respect the limiter instead of disabling security.
      const remainingLoginWindow = fixtureLoginWindow + 61000 - Date.now();
      if (remainingLoginWindow > 0) await new Promise(done => setTimeout(done, remainingLoginWindow));
      await check("dedicated desktop/mobile company profile browser acceptance", async () => {
        report.browser = "running";
        browser = child([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.profile.config.js"], env, "playwright.log");
        await completed(browser, "Profile browser acceptance failed; inspect sanitized log"); report.browser = "passed";
      });
    } else report.browser = "not-run: explicit --backend-only";
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = redact(error.message); process.exitCode = 1; }
  finally {
    try { await cleanup(); sanitizeBrowserArtifacts(); } catch { report.status = "failed"; report.cleanup = "failed"; process.exitCode = 1; }
    clearTimeout(deadline); report.finishedAt = new Date().toISOString(); save(); nativeLog.end();
    process.stdout.write = stdout; process.stderr.write = stderr;
    stdout(`Profile verification ${report.status}; ${report.checks.filter(item => item.status === "passed").length}/${report.checks.length} checks passed; browser ${report.browser}\n`);
    stdout(`Sanitized evidence: ${evidence}\n`);
  }
})();
