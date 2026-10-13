"use strict";

const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const { boundedDestroy } = require("./quote-print-process");
const { publishVerifiedEvidence } = require("./quote-print-evidence");
const support = require("../tests/quote-limit.integration-support");
const backend = resolve(__dirname, "..");

const { redactor, createAppOwner, finishCleanup } = require("./run-system-checks");

// Child startup must fail before mounting/listening. No guard child can serve HTTP.
async function startupGuard() {
  const env = process.env, original = env.E2E_QUOTE_LIMIT_OWNED_DATABASE_URL;
  // This subprocess entry point cannot become a way to sync an arbitrary DB.
  await support.requireFreshDatabase({ ...env, APP_ENV: "test", DATABASE_URL: original });
  const expected = env.E2E_QUOTE_LIMIT_EXPECTED_GUARD;
  const refusingMode = ["production", "staging"].includes(env.APP_ENV) && expected === "Production startup blocked" && env.DATABASE_URL === original;
  const refusingDatabase = env.APP_ENV === "test" && expected === "isolated alageum_strapi" && env.DATABASE_URL === "postgresql://ignored:ignored@127.0.0.1:1/legacy_forbidden";
  const refusingSecret = env.APP_ENV === "test" && expected === "ALAGEUM_JWT_SECRET must be explicitly supplied" && env.ALAGEUM_JWT_SECRET === "" && env.DATABASE_URL === original;
  assert.ok(refusingMode || refusingDatabase || refusingSecret, "Only fixed startup refusal cases are permitted");
  let app;
  try {
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    process.exitCode = 1;
  } catch (error) {
    process.exitCode = error.message.includes(expected) ? 0 : 1;
  } finally {
    if (app) try { await boundedDestroy(() => app.destroy(), 5000); } catch { /* Some config failures never initialized Strapi destroy hooks. */ }
  }
}

async function run() {
  const owned = support.validateEnvironment();
  const published = join(owned.work, "evidence"), staging = join(owned.work, "private-artifacts");
  const secrets = new Set([process.env.DATABASE_URL, owned.url.password, process.env.E2E_QUOTE_LIMIT_RUN_TOKEN]);
  const redact = redactor(secrets);
  const report = { kind: "isolated-catalog-quote-throttle", startedAt: new Date().toISOString(), status: "running", checks: [], browser: "not-applicable: real HTTP socket requests", httpRequests: 0, httpErrors: 0, generatedRequestIds: 0 };
  mkdirSync(staging, { mode: 0o700 });
  const log = join(staging, "strapi.log"), decoder = new StringDecoder("utf8");
  writeFileSync(log, "", { mode: 0o600 });
  let pending = "", discard = false;
  function sink(chunk) {
    pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
    let boundary;
    while ((boundary = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, boundary + 1); pending = pending.slice(boundary + 1);
      if (!discard) appendFileSync(log, redact(line)); discard = false;
    }
    if (pending.length > 1024 * 1024) { pending = ""; discard = true; }
  }
  const stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr);
  for (const stream of [process.stdout, process.stderr]) stream.write = (chunk, encoding, callback) => { sink(chunk); if (typeof encoding === "function") encoding(); else callback?.(); return true; };
  const save = () => writeFileSync(join(staging, "results.json"), `${redact(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 });
  async function check(name, work) {
    const item = { name, status: "running" }; report.checks.push(item); save();
    try { await work(); item.status = "passed"; }
    catch (error) { item.status = "failed"; item.error = redact(error.message); throw error; }
    finally { save(); }
  }
  const appOwner = createAppOwner();
  let origin, cleanupPromise, stopping = false;
  const ids = new Set();
  async function request(path, { method = "GET", headers = {}, expected = 200, body, raw, localAddress = "127.0.0.1" } = {}) {
    assert.ok(["127.0.0.1", "127.0.0.2"].includes(localAddress), "Only owned loopback HTTP clients are permitted");
    const data = raw === undefined ? body === undefined ? undefined : JSON.stringify(body) : raw;
    const supplied = { ...headers };
    if (data !== undefined) { supplied["Content-Type"] = "application/json"; supplied["Content-Length"] = Buffer.byteLength(data); }
    const result = await new Promise((done, reject) => {
      const req = require("node:http").request(new URL(path, origin), { method, headers: supplied, localAddress, agent: false }, res => {
        const chunks = [];
        const actualSocketIp = res.socket.localAddress;
        res.on("data", chunk => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          try {
            assert.equal(actualSocketIp, localAddress, "Requests must use their actual specified source socket IP");
            const text = Buffer.concat(chunks).toString("utf8");
            done({ status: res.statusCode, headers: res.headers, body: text && /application\/json/.test(res.headers["content-type"] || "") ? JSON.parse(text) : text });
          } catch (error) { reject(error); }
        });
      });
      req.setTimeout(15000, () => req.destroy(new Error("Loopback quote request exceeded its deadline")));
      req.on("error", reject); req.end(data);
    });
    report.httpRequests++;
    if (result.status >= 400) report.httpErrors++;
    assert.match(result.headers["cache-control"] || "", /no-store/);
    const id = result.headers["x-request-id"];
    assert.match(id || "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(id, supplied["X-Request-ID"]); assert.equal(ids.has(id), false); ids.add(id); report.generatedRequestIds++;
    if (result.body?.error) assert.equal(result.body.error.request_id, id);
    if (expected !== null) assert.equal(result.status, expected, `${method} ${path} status`);
    return result;
  }
  async function startApp() {
    process.chdir(backend); process.env.HOST = "127.0.0.1"; process.env.PORT = "0";
    const app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    appOwner.current = app;
    await app.load(); app.server.mount();
    await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
    origin = `http://127.0.0.1:${app.server.httpServer.address().port}`;
  }
  function cleanup() { return cleanupPromise ||= (async () => {
    await appOwner.destroy();
  })(); }
  function publish() {
    save(); sink(decoder.end()); if (pending && !discard) appendFileSync(log, redact(pending)); pending = "";
    const sanitize = () => {
      for (const entry of readdirSync(staging, { withFileTypes: true })) {
        assert.ok(entry.isFile() && ["strapi.log", "results.json"].includes(entry.name), "Unexpected raw quote throttle artifact");
        const path = join(staging, entry.name); writeFileSync(path, redact(readFileSync(path, "utf8")), { mode: 0o600 });
      }
    };
    if (!publishVerifiedEvidence({ staging, published, sanitize, report, redact, reportName: "results.json" })) process.exitCode = 1;
  }
  async function interrupted(signal) {
    if (stopping) return; stopping = true;
    report.status = "failed"; report.error = `Interrupted by ${signal}`;
    try { await cleanup(); report.cleanup = "passed"; } catch { report.cleanup = "failed"; }
    report.finishedAt = new Date().toISOString(); publish(); process.exit(1);
  }
  const handlers = new Map(["SIGINT", "SIGTERM"].map(signal => [signal, () => { void interrupted(signal); }]));
  for (const [signal, handler] of handlers) process.once(signal, handler);
  const deadline = setTimeout(() => { void interrupted("quote throttle runner deadline"); }, 240000);
  try {
    assert.equal(process.argv.length, 2, "The quote throttle suite has no test-selection options");
    for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) {
      process.env[key] = randomBytes(48).toString("hex"); secrets.add(process.env[key]);
    }
    process.env.NODE_ENV = "production";
    await check("fresh owned loopback database and explicit reused-database refusal", async () => {
      await support.requireFreshDatabase();
      const client = new (require("pg").Client)({ connectionString: owned.url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
      await client.connect();
      try { await client.query("CREATE TABLE public.quote_limit_freshness_probe (id integer)"); await assert.rejects(support.requireFreshDatabase(), /refuse a reused database/); await client.query("DROP TABLE public.quote_limit_freshness_probe"); }
      finally { await client.end(); }
      await support.requireFreshDatabase();
    });
    await check("actual Strapi startup rejects production staging wrong database and missing secrets", async () => {
      for (const override of [
        { APP_ENV: "production", E2E_QUOTE_LIMIT_EXPECTED_GUARD: "Production startup blocked" },
        { APP_ENV: "staging", E2E_QUOTE_LIMIT_EXPECTED_GUARD: "Production startup blocked" },
        { DATABASE_URL: "postgresql://ignored:ignored@127.0.0.1:1/legacy_forbidden", E2E_QUOTE_LIMIT_EXPECTED_GUARD: "isolated alageum_strapi" },
        { ALAGEUM_JWT_SECRET: "", E2E_QUOTE_LIMIT_EXPECTED_GUARD: "ALAGEUM_JWT_SECRET must be explicitly supplied" },
      ]) {
        const child = spawnSync(process.execPath, [__filename, "--startup-guard"], { cwd: backend, env: { ...process.env, E2E_QUOTE_LIMIT_OWNED_DATABASE_URL: owned.url.href, ...override }, timeout: 30000, encoding: "utf8", maxBuffer: 1024 * 1024 });
        if (child.stdout) sink(child.stdout); if (child.stderr) sink(child.stderr);
        assert.equal(child.error, undefined, "Startup refusal child exceeded its process deadline"); assert.equal(child.status, 0, "Strapi startup must fail for the intended guard before serving routes");
      }
    });
    await support.requireFreshDatabase();
    await startApp();
    const app = appOwner.current;
    let fixture;
    await check("dedicated fictitious token-only actors seed once with the native 238-product catalog", async () => {
      fixture = await support.seedFixtures(app);
      for (const value of Object.values(fixture.tokens)) secrets.add(value);
      for (const value of [...Object.values(fixture.orgs), ...Object.values(fixture.actors)]) secrets.add(value);
      await assert.rejects(() => support.seedFixtures(app), /refuse existing B2B rows/);
      await assert.rejects(support.requireFreshDatabase(), /refuse a reused database/);
    });
    const initialChecks = report.checks.length;
    await support.verifyQuoteLimit({ app, request, check, fixture, report, progress: value => stdout(`${value}\n`) });
    assert.equal(report.checks.length - initialChecks, support.verifyQuoteLimit.EXPECTED_CHECKS);
    assert.equal(report.checks.length, support.verifyQuoteLimit.EXPECTED_CHECKS + 3);
    report.backendChecks = report.checks.length; report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = redact(error.message); process.exitCode = 1; }
  finally {
    stopping = true;
    await finishCleanup(cleanup, report, () => {
      clearTimeout(deadline); for (const [signal, handler] of handlers) process.off(signal, handler);
      report.finishedAt = new Date().toISOString(); publish();
      process.stdout.write = stdout; process.stderr.write = stderr;
      stdout(`Quote throttle verification ${report.status}; ${report.checks.filter(item => item.status === "passed").length}/${report.checks.length} checks passed\n`);
      stdout(`Sanitized evidence: ${published}\n`);
    });
  }
}

if (require.main === module) {
  if (process.argv[2] === "--startup-guard") startupGuard().then(() => process.exit(process.exitCode || 0)).catch(() => { console.error("Quote throttle startup guard refused its environment"); process.exit(1); });
  else run().catch(() => { console.error("Quote throttle runner refused its environment before starting; use run-quote-limit-tests.sh"); process.exitCode = 1; });
}
