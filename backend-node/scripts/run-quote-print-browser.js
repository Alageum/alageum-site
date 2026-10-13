"use strict";

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawnOwnedGroup, stopOwnedGroup, boundedDestroy } = require("./quote-print-process");
const { publishVerifiedEvidence } = require("./quote-print-evidence");
const { createServer } = require("node:net");
const { mkdirSync, writeFileSync, appendFileSync, readdirSync, readFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const fixtures = require("./seed-test-quote-print-users");
const backend = resolve(__dirname, ".."), frontend = resolve(backend, "../frontend");
const mode = process.argv[2] || "--browser";
const publishedEvidence = process.env.E2E_QUOTE_PRINT_EVIDENCE;
if (!publishedEvidence || !/^alageum-quote-print-tests\.[A-Za-z0-9]+$/.test(require("node:path").basename(resolve(publishedEvidence, ".."))) || require("node:path").basename(publishedEvidence) !== "evidence") {
  throw new Error("Use run-quote-print-tests.sh to create the isolated evidence directory");
}
const evidence = join(resolve(publishedEvidence, ".."), "private-artifacts");
const report = { kind: "isolated-own-quote-print", startedAt: new Date().toISOString(), status: "running", checks: [], expectedBackendChecks: 7, expectedBrowserTests: 5, browser: "not-run" };
const secrets = new Set([process.env.E2E_QUOTE_PRINT_PASSWORD, process.env.DATABASE_URL]);
let app, next, browser, origin, cleanupPromise;
mkdirSync(evidence, { recursive: true, mode: 0o700 });
function redact(value) {
  let result = String(value);
  for (const secret of secrets) if (secret) result = result.split(secret).join("[REDACTED]");
  return result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{64,}(?![A-Za-z0-9_-])/g, "[REDACTED_SECRET]")
    .replace(/\$argon2\S+/g, "[REDACTED_HASH]");
}
// Only complete lines reach disk, including credentials split across chunks.
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
function save() { writeFileSync(join(evidence, "quote-print-results.json"), `${redact(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 }); }
async function check(name, work, group = "backend") {
  const item = { name, group, status: "running" }; report.checks.push(item);
  try { await work(); item.status = "passed"; } catch (error) { item.status = "failed"; item.error = redact(error.message); throw error; } finally { save(); }
}
function sanitizeArtifacts(directory = evidence) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sanitizeArtifacts(path);
    else if (entry.isFile() && /\.(?:md|json|txt|log)$/.test(entry.name)) writeFileSync(path, redact(readFileSync(path, "utf8")), { mode: 0o600 });
    else if (entry.isFile()) assert.match(entry.name, /\.(?:png|pdf)$/, "Unexpected unreviewed binary evidence artifact");
    else throw new Error("Unexpected non-regular evidence artifact");
  }
}
function cleanup() { return cleanupPromise ||= (async () => {
  const current = app; app = null;
  // Each branch has its own deadline and all branches run even if one fails.
  const results = await Promise.allSettled([
    stopOwnedGroup(browser), stopOwnedGroup(next),
    current ? boundedDestroy(() => current.destroy()) : Promise.resolve(),
  ]);
  if (results.some(result => result.status === "rejected")) throw new Error("Bounded quote print runner teardown failed");
})(); }
function finishEvidence() {
  save(); nativeLog.end();
  if (!publishVerifiedEvidence({ staging: evidence, published: publishedEvidence, sanitize: sanitizeArtifacts, report, redact })) {
    report.cleanup = "failed";
    process.exitCode = 1;
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
async function freePort() { const server = createServer(); await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); }); const value = server.address().port; await new Promise(done => server.close(done)); return value; }
async function api(path, { actor, organization, method = "GET", data, expected = 200, key } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, signal: AbortSignal.timeout(15000), headers: {
    "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor.access_token}` } : {}), ...(organization ? { "X-Organization-ID": organization } : {}), ...(key ? { "Idempotency-Key": key } : {}),
  }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal(response.status, expected, `${method} ${path} status`);
  if (response.ok && (path.startsWith("/quotes") || path === "/auth/me")) assert.match(response.headers.get("cache-control") || "", /private.*no-store/, "Private responses must not be cached");
  return response.status === 204 ? null : response.json();
}
async function interrupted(signal) {
  report.status = "failed"; if (report.browser === "running") report.browser = "failed"; report.error = `Interrupted by ${signal}`;
  try { await cleanup(); } catch { report.cleanup = "failed"; } finally { report.finishedAt = new Date().toISOString(); finishEvidence(); process.exit(1); }
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void interrupted(signal); });
const deadline = setTimeout(() => { void interrupted("runner deadline"); }, 600000);

(async () => {
  try {
    assert.ok(["--browser", "--backend-only"].includes(mode) && process.argv.length <= 3, "Use --browser or --backend-only");
    assert.ok(mode !== "--backend-only" || !process.env.CI, "CI must run the browser suite");
    assert.equal(process.versions.node.split(".")[0], "24", "Node.js 24 is required");
    const validated = fixtures.validateFixtureEnvironment();
    secrets.add(validated.password); secrets.add(decodeURIComponent(validated.url.password));
    await check("fresh exact authorized disposable database before schema synchronization", () => fixtures.requireFreshQuotePrintDatabase());
    fixtures.generateFixtureSecrets();
    for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) secrets.add(process.env[key]);
    const apiUrl = new URL(process.env.E2E_QUOTE_PRINT_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8016/api/v1");
    assert.ok(apiUrl.protocol === "http:" && apiUrl.hostname === "127.0.0.1" && apiUrl.port && apiUrl.pathname === "/api/v1" && !apiUrl.username && !apiUrl.password && !apiUrl.search && !apiUrl.hash, "E2E_QUOTE_PRINT_API_URL must be an explicit loopback /api/v1 URL matching the existing .next-quotes build");
    origin = apiUrl.origin;
    const webPort = mode === "--browser" ? await freePort() : null;
    const webOrigin = webPort ? `http://127.0.0.1:${webPort}` : null;
    if (webOrigin) process.env.CORS_ORIGINS = webOrigin;
    process.chdir(backend); process.env.HOST = "127.0.0.1"; process.env.PORT = apiUrl.port;
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    let manifest;
    await check("new fake accounts, independent roles, legacy snapshots and reseed guard", async () => {
      manifest = await fixtures.seedTestQuotePrintUsers(app);
      await assert.rejects(() => fixtures.seedTestQuotePrintUsers(app), /existing B2B rows/);
      await app.alageum.catalog.importRecords(fixtures.PRODUCTS);
      await app.db.connection.table("alageum_products").where({ public_key: fixtures.PRODUCTS[0].id }).update({ price: "123456789012345.678", currency: "KZT", price_mode: "fixed" });
      assert.equal(Number((await app.db.connection.withSchema("b2b").table("users").count("id AS count").first()).count), 3);
    });
    app.server.mount(); await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(Number(apiUrl.port), "127.0.0.1", done); });
    const actors = {}, table = name => app.db.connection.withSchema("b2b").table(name);
    await check("real login and durable own quote creation with exact decimal strings", async () => {
      const products = await Promise.all(fixtures.PRODUCTS.map(product => api(`/catalog/products/${product.id}`)));
      for (const kind of Object.keys(fixtures.EMAILS)) {
        actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password: validated.password } });
        secrets.add(actors[kind].access_token); secrets.add(actors[kind].refresh_token);
        const organization = manifest.users[kind].organizationId;
        assert.deepEqual((await api("/auth/me", { actor: actors[kind], organization })).permissions, [...fixtures.GRANTS].sort());
        const quote = await api("/quotes/catalog", { actor: actors[kind], organization, method: "POST", expected: 201, key: randomUUID(), data: { comment: `Fictitious saved ${kind} print request`, items: products.map((product, index) => ({ product_id: product.id, quantity: index ? "1.250" : "999999999999999.999" })) } });
        assert.equal(quote.items[0].quantity, "999999999999999.999");
        assert.equal(quote.items[1].quantity, "1.250");
        assert.equal(quote.items[0].product_snapshot.price, "123456789012345.678");
        assert.deepEqual(await api(`/quotes/${quote.id}`, { actor: actors[kind], organization }), quote);
        manifest.quotes[kind] = quote;
      }
      // Historical data must stand on its own after current catalog changes.
      await app.db.connection.table("alageum_products").whereIn("public_key", fixtures.PRODUCTS.map(product => product.id)).update({ status: "hidden", price: "9.99", version: 2, translations: JSON.stringify({ ru: { name: "CURRENT CATALOG MUST NEVER APPEAR" } }) });
      assert.deepEqual(await api(`/quotes/${manifest.quotes.owner.id}`, { actor: actors.owner, organization: manifest.users.owner.organizationId }), manifest.quotes.owner);
      await api(`/catalog/products/${fixtures.PRODUCTS[0].id}`, { expected: 404 });
      report.persistedQuotes = Object.fromEntries(Object.entries(manifest.quotes).map(([kind, quote]) => [kind, quote.id]));
    });
    await check("current own-user and tenant boundaries deny same-org and cross-org reads", async () => {
      const own = `/quotes/${manifest.quotes.owner.id}`, a = manifest.organizations.a.id, b = manifest.organizations.b.id;
      await api(own, { expected: 401 });
      for (const [actor, organization] of [[actors.peer, a], [actors.other, b]]) assert.equal((await api(own, { actor, organization, expected: 404 })).error.code, "quote_not_found");
      await api(own, { actor: actors.owner, organization: b, expected: 403 });
      const list = await api("/quotes?mine=true", { actor: actors.owner, organization: a });
      assert.deepEqual(list.items.map(quote => quote.id).sort(), [manifest.quotes.owner.id, manifest.quotes.legacy.id].sort());
    });
    await check("revoked current quote.read overrides an already-issued owner token", async () => {
      try {
        await fixtures.setOwnerRead(manifest, false);
        assert.deepEqual((await api("/auth/me", { actor: actors.owner, organization: manifest.organizations.a.id })).permissions, ["quote.create"]);
        await api(`/quotes/${manifest.quotes.owner.id}`, { actor: actors.owner, organization: manifest.organizations.a.id, expected: 403 });
      } finally { await fixtures.setOwnerRead(manifest, true); }
    });
    await check("legacy empty and partial snapshots remain unfilled with precise quantities", async () => {
      const legacy = await api(`/quotes/${manifest.quotes.legacy.id}`, { actor: actors.owner, organization: manifest.organizations.a.id });
      assert.deepEqual(legacy.items[0].product_snapshot, {});
      assert.equal(legacy.items[0].quantity, "0.001");
      assert.deepEqual(legacy.items[1].product_snapshot, { sku: "FIXTURE-LEGACY-PARTIAL", price_mode: "fixed", price: "123456789012345.678" });
      assert.equal(legacy.items[1].quantity, "999999999999999.999");
      manifest.quotes.legacy = legacy;
    });
    async function persistedState() {
      return JSON.stringify({ quotes: await table("quote_requests").select("*").orderBy("id"), items: await table("quote_request_items").select("*").orderBy("id"), creates: await table("audit_events").where({ action: "quote.create" }).select("*").orderBy("id") });
    }
    const before = await persistedState();
    if (mode === "--browser") {
      assert.ok(existsSync(join(frontend, ".next-quotes/BUILD_ID")), "Build the static-default .next-quotes with the print feature before running acceptance");
      const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", ALAGEUM_ORGANIZATION_BUILD: "0", ALAGEUM_PROFILE_BUILD: "0", ALAGEUM_QUOTES_BUILD: "1", NEXT_PUBLIC_CATALOG_SOURCE: "static", COMPANY_SOURCE: "static", PAGES_SOURCE: "static", PAGES_STATIC_PREVIEW: "1", E2E_QUOTE_PRINT_BASE_URL: webOrigin, E2E_QUOTE_PRINT_API_URL: `${origin}/api/v1`, E2E_QUOTE_PRINT_MANIFEST: JSON.stringify(manifest), E2E_QUOTE_PRINT_OUTPUT: join(evidence, "browser"), PLAYWRIGHT_JSON_OUTPUT_NAME: join(evidence, "browser-results.json") };
      next = child([join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], env, "next.log");
      const readyBy = Date.now() + 45000;
      while (true) {
        assert.ok(next.exitCode === null && next.signalCode === null && !next.spawnError, "Quote print Next exited before readiness");
        try { const response = await fetch(`${webOrigin}/login`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* Bounded readiness retry. */ }
        assert.ok(Date.now() < readyBy, "Quote print Next readiness timed out"); await new Promise(done => setTimeout(done, 200));
      }
      // Three setup + six browser logins are below the real 20/minute allowance.
      await check("real desktop/mobile saved preview, print, legacy and access-revocation acceptance", async () => {
        report.browser = "running";
        browser = child([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.quote-print-real.config.js"], env, "playwright.log");
        await completed(browser, "Quote print browser acceptance failed; inspect sanitized evidence");
        const result = JSON.parse(readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME, "utf8"));
        assert.equal(result.stats?.expected, report.expectedBrowserTests, "Every real quote print acceptance case must run");
        for (const key of ["unexpected", "flaky", "skipped"]) assert.equal(result.stats[key], 0, `No ${key} browser cases allowed`);
        report.browser = "passed"; report.browserTests = result.stats.expected;
      }, "browser");
    } else report.browser = "not-run: explicit --backend-only";
    await check("preview, print, denials and reload create no extra quotes or quote audits", async () => {
      await api(`/quotes/${manifest.quotes.owner.id}`, { actor: actors.owner, organization: manifest.organizations.a.id });
      assert.equal(await persistedState(), before);
      assert.equal(Number((await table("quote_requests").count("id AS count").first()).count), 4);
      assert.equal(Number((await table("audit_events").where({ action: "quote.create" }).count("id AS count").first()).count), 3);
      report.quoteCount = 4; report.quoteCreateAuditCount = 3;
    });
    assert.equal(report.checks.filter(item => item.group === "backend").length, report.expectedBackendChecks);
    report.status = "passed";
  } catch (error) { report.status = "failed"; if (report.browser === "running") report.browser = "failed"; report.error = redact(error.message); process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch { report.status = "failed"; report.cleanup = "failed"; process.exitCode = 1; }
    clearTimeout(deadline); report.finishedAt = new Date().toISOString(); finishEvidence();
    process.stdout.write = stdout; process.stderr.write = stderr;
    stdout(`Quote print verification ${report.status}; ${report.checks.filter(item => item.status === "passed").length}/${report.checks.length} checks passed; browser ${report.browser}\n`);
    stdout(`Sanitized evidence: ${publishedEvidence}\n`);
    // A timeout race cannot close Strapi's remaining handles. After synchronous
    // evidence writes and owned-group teardown, force this failed runner to exit.
    if (report.cleanup === "failed") process.exit(1);
  }
})();
