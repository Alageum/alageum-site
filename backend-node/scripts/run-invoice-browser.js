"use strict";

const assert = require("node:assert/strict");
const { spawnOwnedGroup, stopOwnedGroup, boundedDestroy } = require("./quote-print-process");
const { publishVerifiedEvidence } = require("./quote-print-evidence");
const { createServer } = require("node:net");
const { mkdirSync, writeFileSync, appendFileSync, readdirSync, readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const fixtures = require("./seed-test-invoice-users");
const backend = resolve(__dirname, ".."), frontend = resolve(backend, "../frontend");
const publishedEvidence = process.env.E2E_INVOICE_EVIDENCE;
if (!publishedEvidence || !/^alageum-invoice-tests\.[A-Za-z0-9]+$/.test(require("node:path").basename(resolve(publishedEvidence, ".."))) || require("node:path").basename(publishedEvidence) !== "evidence")
  throw new Error("Use run-invoice-tests.sh to create the isolated evidence directory");
const evidence = join(resolve(publishedEvidence, ".."), "private-artifacts");
const mode = process.argv[2] || "--browser";
const report = { kind: "isolated-invoice-metadata", startedAt: new Date().toISOString(), status: "running", checks: [], browser: "not-run" };
const secrets = new Set([process.env.E2E_INVOICE_PASSWORD, process.env.DATABASE_URL]);
let app, next, browser, build, origin, cleanupPromise;
mkdirSync(evidence, { recursive: true, mode: 0o700 });
function redact(value) {
  let result = String(value).replaceAll(evidence, publishedEvidence);
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
function sanitizeArtifacts(directory = evidence) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sanitizeArtifacts(path);
    else if (entry.isFile() && /\.(?:md|json|txt|log)$/.test(entry.name)) writeFileSync(path, redact(readFileSync(path, "utf8")), { mode: 0o600 });
    else if (entry.isFile()) assert.match(entry.name, /\.png$/, "Unexpected unreviewed binary invoice artifact");
    else throw new Error("Unexpected non-regular invoice artifact");
  }
}
function cleanup() { return cleanupPromise ||= (async () => {
  const current = app; app = null;
  const results = await Promise.allSettled([
    stopOwnedGroup(browser), stopOwnedGroup(build), stopOwnedGroup(next),
    current ? boundedDestroy(() => current.destroy()) : Promise.resolve(),
  ]);
  if (results.some(result => result.status === "rejected")) throw new Error("Bounded invoice runner teardown failed");
})(); }
function finishEvidence() {
  save(); nativeLog.end();
  if (!publishVerifiedEvidence({ staging: evidence, published: publishedEvidence, sanitize: sanitizeArtifacts, report, redact, reportName: "results.json" })) {
    report.cleanup = "failed"; process.exitCode = 1;
  }
}
function child(args, env, name) {
  const sink = lineSink(join(evidence, name));
  const task = spawnOwnedGroup(process.execPath, args, { cwd: frontend, env, stdio: ["ignore", "pipe", "pipe"] });
  task.stdout.on("data", sink.push); task.stderr.on("data", sink.push);
  task.completion = new Promise(done => task.once("close", code => { sink.end(); done(code); }));
  task.on("error", error => { task.spawnError = error; }); return task;
}
async function completed(task, message) { const code = await task.completion; if (task.spawnError) throw task.spawnError; assert.equal(code, 0, message); }
async function port() { const server = createServer(); await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); }); const value = server.address().port; await new Promise(done => server.close(done)); return value; }
async function api(path, { actor, organization, method = "GET", data, rawBody, contentType = "application/json", expected = 200, raw = false } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, signal: AbortSignal.timeout(15000), headers: {
    ...(contentType ? { "Content-Type": contentType } : {}), ...(actor ? { Authorization: `Bearer ${actor.access_token}` } : {}), ...(organization ? { "X-Organization-ID": organization } : {}),
  }, ...(rawBody !== undefined ? { body: rawBody } : data !== undefined ? { body: JSON.stringify(data) } : {}) });
  assert.equal(response.status, expected, `${method} ${path} status`);
  if (method === "GET" && /^\/finance\/invoices(?:\?|$)/.test(path)) assert.match(response.headers.get("cache-control") || "", /private.*no-store/, "Invoice responses must be private and non-cacheable");
  return response.status === 204 ? null : response.status === 405 || raw ? response.text() : response.json();
}
async function interrupted(signal) {
  report.status = "failed"; if (report.browser === "running") report.browser = "failed"; report.error = `Interrupted by ${signal}`;
  try { await cleanup(); } catch { report.cleanup = "failed"; }
  finally { report.finishedAt = new Date().toISOString(); finishEvidence(); process.exit(1); }
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void interrupted(signal); });
const deadline = setTimeout(() => { void interrupted("runner deadline"); }, 900000);

(async () => {
  try {
    assert.ok(["--browser", "--backend-only"].includes(mode) && process.argv.length <= 3, "Use --browser or --backend-only");
    assert.ok(mode !== "--backend-only" || !process.env.CI, "CI must run the browser suite");
    const validated = fixtures.validateFixtureEnvironment();
    secrets.add(validated.password); secrets.add(decodeURIComponent(validated.url.password));
    await check("fresh isolated loopback database before schema synchronization", async () => {
      await fixtures.requireFreshInvoiceDatabase();
      // Exercise the reused-database refusal before Strapi is even constructed.
      // This transient probe belongs only to the freshly verified fixture DB.
      const client = new (require("pg").Client)({ connectionString: validated.url.href });
      await client.connect();
      try {
        await client.query("CREATE TABLE public.invoice_freshness_probe (id integer)");
        await assert.rejects(fixtures.requireFreshInvoiceDatabase(), /refuse a reused database/);
        assert.equal((await client.query("SELECT to_regclass('b2b.users') AS relation")).rows[0].relation, null);
        await client.query("DROP TABLE public.invoice_freshness_probe");
      } finally { await client.end(); }
      await fixtures.requireFreshInvoiceDatabase();
    });
    fixtures.generateFixtureSecrets();
    for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) secrets.add(process.env[key]);
    const webPort = mode === "--browser" ? await port() : null;
    const webOrigin = webPort ? `http://127.0.0.1:${webPort}` : null;
    if (webOrigin) process.env.CORS_ORIGINS = webOrigin;
    process.chdir(backend); process.env.HOST = "127.0.0.1"; process.env.PORT = "0";
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    let manifest;
    await check("new invoice-read-only B2B fixtures, no defaults and reject reseed", async () => {
      manifest = await fixtures.seedTestInvoiceUsers(app);
      await assert.rejects(() => fixtures.seedTestInvoiceUsers(app), /existing B2B rows/);
      await assert.rejects(fixtures.requireFreshInvoiceDatabase(), /refuse a reused database/);
      assert.equal(await app.db.connection.withSchema("b2b").table("users").where("email", "like", "%@demo.example").count("id AS count").first().then(row => Number(row.count)), 0);
      assert.equal(await app.db.connection.withSchema("b2b").table("roles").whereNull("organization_id").count("id AS count").first().then(row => Number(row.count)), 0);
    });
    app.server.mount(); await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
    origin = `http://127.0.0.1:${app.server.httpServer.address().port}`;
    const fixtureLoginWindow = Date.now();
    const actors = await require("../tests/invoices.integration-support")({ app, api, check, manifest, password: validated.password, rememberSecret: value => secrets.add(value) });
    await check("actual Strapi startup refuses invoice drift before schema synchronization", async () => {
      const previous = app; app = null; await boundedDestroy(() => previous.destroy());
      const client = new (require("pg").Client)({ connectionString: validated.url.href });
      await client.connect();
      try {
        await client.query("ALTER TABLE b2b.invoices ADD COLUMN fixture_startup_drift text");
        const before = (await client.query("SELECT phase FROM b2b.editorial_page_schema ORDER BY key")).rows;
        const blocked = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
        try { await assert.rejects(blocked.load(), /Invoice schema mismatch/); }
        finally { await boundedDestroy(() => blocked.destroy()); }
        assert.deepEqual((await client.query("SELECT phase FROM b2b.editorial_page_schema ORDER BY key")).rows, before);
        assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema='b2b' AND table_name='invoices' AND column_name='fixture_startup_drift'")).rows[0].count, 1);
      } finally { await client.query("ALTER TABLE b2b.invoices DROP COLUMN fixture_startup_drift"); await client.end(); }
    });
    await check("full Strapi reload preserves invoices, original grants and audit counts", async () => {
      const client = new (require("pg").Client)({ connectionString: validated.url.href });
      await client.connect();
      const before = (await client.query("SELECT COUNT(*)::int AS count FROM b2b.audit_events")).rows[0].count;
      const rolesBefore = (await client.query("SELECT * FROM b2b.roles ORDER BY id")).rows;
      try {
        app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
        await app.load(); app.server.mount();
        await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
        origin = `http://127.0.0.1:${app.server.httpServer.address().port}`;
        const result = await api("/finance/invoices", { actor: actors.reader, organization: manifest.organizations.a.id });
        assert.deepEqual(result.items.map(item => item.amount), ["12.30", "9999999999999999.99", "0.00"]);
        assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM b2b.audit_events")).rows[0].count, before);
        assert.deepEqual((await client.query("SELECT * FROM b2b.roles ORDER BY id")).rows, rolesBefore);
      } finally { await client.end(); }
    });
    if (mode === "--browser") {
      const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ALAGEUM_INVOICE_BUILD: "1", NEXT_PUBLIC_API_URL: `${origin}/api/v1`, NEXT_PUBLIC_CATALOG_SOURCE: "static", COMPANY_SOURCE: "static", PAGES_SOURCE: "static", PAGES_STATIC_PREVIEW: "1", E2E_INVOICE_BASE_URL: webOrigin, E2E_INVOICE_API_URL: `${origin}/api/v1`, E2E_INVOICE_ORGANIZATION_A: manifest.organizations.a.id, E2E_INVOICE_ORGANIZATION_B: manifest.organizations.b.id, E2E_INVOICE_ORGANIZATION_EMPTY: manifest.organizations.c.id, E2E_INVOICE_ID_A: manifest.invoices.precise, E2E_INVOICE_ID_B: manifest.invoices.foreign, E2E_INVOICE_ID_EMPTY: manifest.invoices.empty, E2E_INVOICE_OUTPUT: join(evidence, "browser"), PLAYWRIGHT_JSON_OUTPUT_NAME: join(evidence, "browser-results.json") };
      await check("dedicated production Next build", async () => { build = child([join(frontend, "node_modules/next/dist/bin/next"), "build"], env, "next-build.log"); await completed(build, "Invoice Next build failed; inspect sanitized log"); });
      next = child([join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], env, "next.log");
      const readyBy = Date.now() + 45000;
      while (true) {
        assert.ok(next.exitCode === null && next.signalCode === null && !next.spawnError, "Invoice Next exited before readiness");
        try { const response = await fetch(`${webOrigin}/login`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* Bounded readiness retry. */ }
        assert.ok(Date.now() < readyBy, "Invoice Next readiness timed out"); await new Promise(done => setTimeout(done, 200));
      }
      const remainingLoginWindow = fixtureLoginWindow + 61000 - Date.now();
      if (remainingLoginWindow > 0) await new Promise(done => setTimeout(done, remainingLoginWindow));
      await check("dedicated desktop/mobile invoice browser acceptance", async () => {
        report.browser = "running";
        browser = child([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.invoice.config.js", "--retries=0", "--forbid-only"], env, "playwright.log");
        await completed(browser, "Invoice browser acceptance failed; inspect sanitized log");
        const result = JSON.parse(readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME, "utf8"));
        const flatten = suites => suites.flatMap(suite => [...(suite.specs || []).flatMap(spec => spec.tests), ...flatten(suite.suites || [])]);
        const tests = flatten(result.suites);
        assert.equal(tests.length, 28); assert.equal(result.stats.expected, 28);
        assert.equal(result.stats.unexpected + result.stats.skipped + result.stats.flaky, 0);
        const screenshots = [];
        for (const test of tests) {
          assert.equal(test.expectedStatus, "passed"); assert.equal(test.status, "expected"); assert.equal(test.results.length, 1);
          assert.equal(test.results[0].status, "passed"); assert.equal(test.results[0].retry, 0);
          for (const attachment of test.results[0].attachments || []) if (attachment.contentType === "image/png") {
            assert.ok(attachment.path && readFileSync(attachment.path).length > 0); screenshots.push({ project: test.projectName, name: attachment.name });
          }
        }
        assert.equal(screenshots.length, 6, "Desktop/mobile list/empty/retry PNGs are required");
        for (const project of ["invoices-desktop", "invoices-mobile"]) for (const name of ["invoices-list", "invoices-empty", "invoices-retry"])
          assert.ok(screenshots.some(shot => shot.project === project && shot.name === name));
        report.browser = "passed"; report.browserTests = 28; report.screenshots = screenshots;
      });
    } else report.browser = "not-run: explicit --backend-only";
    assert.equal(report.checks.length, mode === "--browser" ? 21 : 19);
    report.status = "passed";
  } catch (error) { report.status = "failed"; if (report.browser === "running") report.browser = "failed"; report.error = redact(error.message); process.exitCode = 1; }
  finally {
    try { await cleanup(); report.cleanup = "passed"; } catch { report.status = "failed"; report.cleanup = "failed"; process.exitCode = 1; }
    clearTimeout(deadline); report.finishedAt = new Date().toISOString(); finishEvidence();
    process.stdout.write = stdout; process.stderr.write = stderr;
    stdout(`Invoice verification ${report.status}; ${report.checks.filter(item => item.status === "passed").length}/${report.checks.length} checks passed; browser ${report.browser}\n`);
    stdout(`Sanitized evidence: ${publishedEvidence}\n`);
    if (report.cleanup === "failed") process.exit(1);
  }
})();
