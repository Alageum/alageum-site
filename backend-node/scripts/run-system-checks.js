"use strict";

const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { StringDecoder } = require("node:string_decoder");
const { boundedDestroy } = require("./quote-print-process");
const { publishVerifiedEvidence } = require("./quote-print-evidence");
const support = require("../tests/system.integration-support");
const backend = resolve(__dirname, "..");

function redactor(secrets) {
  return value => {
    let output = String(value);
    for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) output = output.split(secret).join("[REDACTED]");
    return output.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
      .replace(/\$argon2\S+/g, "[REDACTED_HASH]");
  };
}

function createAppOwner(milliseconds = 15000) {
  const pending = new WeakMap();
  const owner = {
    current: null,
    async destroy() {
      const current = owner.current;
      if (!current) return;
      // Retain the instance and its in-flight destroy until actual success.
      // A failed/timed-out recreation must remain visible to final cleanup,
      // without invoking a second concurrent destroy on the same application.
      if (!pending.has(current)) pending.set(current, Promise.resolve().then(() => current.destroy()));
      await boundedDestroy(() => pending.get(current), milliseconds);
      if (owner.current === current) owner.current = null;
      pending.delete(current);
    },
  };
  return owner;
}

async function finishCleanup(cleanup, report, finish) {
  try { await cleanup(); report.cleanup = "passed"; }
  catch { report.cleanup = "failed"; report.status = "failed"; process.exitCode = 1; }
  try { finish(); }
  finally {
    // A rejected or hung destroy can leave live handles. Force a bounded,
    // nonzero exit after evidence publication so the shell removes its cluster.
    if (report.cleanup === "failed") process.exit(1);
  }
}

// Child startup must fail before mounting/listening. No guard child can serve HTTP.
async function startupGuard() {
  let app;
  try {
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    process.exitCode = 1;
  } catch (error) {
    const expected = process.env.E2E_SYSTEM_EXPECTED_GUARD;
    process.exitCode = error.message.includes(expected) ? 0 : 1;
  } finally {
    if (app) try { await boundedDestroy(() => app.destroy(), 5000); } catch { /* Some config failures never initialized Strapi destroy hooks. */ }
  }
}

async function run() {
  const owned = support.validateEnvironment();
  const published = join(owned.work, "evidence"), staging = join(owned.work, "private-artifacts");
  const secrets = new Set([process.env.DATABASE_URL, owned.url.password, process.env.E2E_SYSTEM_RUN_TOKEN]);
  const sentinels = ["system-private-name-sentinel", "system-private-version-sentinel", "system-private-bearer-sentinel", "system-private-organization-sentinel", "SELECT secret FROM private_table", "private-db-host.invalid"];
  for (const value of sentinels) secrets.add(value);
  const redact = redactor(secrets);
  const report = { kind: "isolated-system-reads", startedAt: new Date().toISOString(), status: "running", checks: [], browser: "not-applicable: system JSON routes only" };
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
  let origin, databaseDown = false, cleanupPromise, stopping = false;
  function control(action) {
    // Revalidate the fresh shell ownership proof on every outage/recovery action.
    const current = support.validateEnvironment(); assert.equal(current.data, owned.data);
    assert.ok(["stop", "start"].includes(action));
    const args = ["-D", owned.data];
    if (action === "stop") args.push("-m", "fast", "-t", "10", "-w", "stop");
    else args.push("-l", join(owned.work, "postgres.log"), "-o", `-h 127.0.0.1 -p ${owned.url.port} -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic`, "-t", "20", "-w", "start");
    const result = spawnSync(join(owned.pgBin, "pg_ctl"), args, { timeout: 25000, encoding: "utf8", maxBuffer: 1024 * 1024 });
    if (result.status !== 0 || result.error) throw new Error(`Owned PostgreSQL ${action} failed within its deadline`);
    databaseDown = action === "stop";
    const status = spawnSync(join(owned.pgBin, "pg_ctl"), ["-D", owned.data, "status"], { timeout: 5000, stdio: "ignore" });
    assert.equal(status.status, action === "stop" ? 3 : 0, `Owned PostgreSQL ${action} state was not confirmed`);
  }
  async function request(path, { method = "GET", headers = {}, expected = 200, json = true, timeout = 15000 } = {}) {
    const before = Date.now();
    const response = await fetch(`${origin}${path}`, { method, headers, redirect: "manual", signal: AbortSignal.timeout(timeout) });
    const text = await response.text(), after = Date.now();
    if (expected !== null) assert.equal(response.status, expected, `${method} ${path.split("?")[0]} status`);
    const result = { status: response.status, headers: Object.fromEntries(response.headers), before, after, body: json && text && /application\/json/.test(response.headers.get("content-type") || "") ? JSON.parse(text) : text };
    if (/^\/api\/v1(?:\/|$)/i.test(path)) assert.match(result.headers["cache-control"] || "", /no-store/);
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
    if (databaseDown) control("start");
    await appOwner.destroy();
  })(); }
  function publish() {
    save(); sink(decoder.end()); if (pending && !discard) appendFileSync(log, redact(pending)); pending = "";
    const sanitize = () => {
      for (const entry of readdirSync(staging, { withFileTypes: true })) {
        assert.ok(entry.isFile() && ["strapi.log", "results.json"].includes(entry.name), "Unexpected raw system artifact");
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
  const deadline = setTimeout(() => { void interrupted("system runner deadline"); }, 480000);
  try {
    assert.equal(process.argv.length, 2, "The system suite has no test-selection options");
    for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) {
      process.env[key] = randomBytes(48).toString("hex"); secrets.add(process.env[key]); sentinels.push(process.env[key]);
    }
    process.env.APP_NAME = sentinels[0]; process.env.APP_VERSION = sentinels[1]; process.env.PRIVATE_SYSTEM_CONFIG = sentinels[5]; process.env.NODE_ENV = "production";
    await check("fresh owned loopback database and explicit reused-database refusal", async () => {
      await support.requireFreshDatabase();
      const client = new (require("pg").Client)({ connectionString: owned.url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
      await client.connect();
      try { await client.query("CREATE TABLE public.system_freshness_probe (id integer)"); await assert.rejects(support.requireFreshDatabase(), /refuse a reused database/); await client.query("DROP TABLE public.system_freshness_probe"); }
      finally { await client.end(); }
      await support.requireFreshDatabase();
    });
    await check("S11 actual Strapi startup rejects production staging wrong database and missing secrets", async () => {
      for (const override of [
        { APP_ENV: "production", E2E_SYSTEM_EXPECTED_GUARD: "Production startup blocked" },
        { APP_ENV: "staging", E2E_SYSTEM_EXPECTED_GUARD: "Production startup blocked" },
        { DATABASE_URL: "postgresql://ignored:ignored@127.0.0.1:1/legacy_forbidden", E2E_SYSTEM_EXPECTED_GUARD: "isolated alageum_strapi" },
        { ALAGEUM_JWT_SECRET: "", E2E_SYSTEM_EXPECTED_GUARD: "ALAGEUM_JWT_SECRET must be explicitly supplied" },
      ]) {
        const child = spawnSync(process.execPath, [__filename, "--startup-guard"], { cwd: backend, env: { ...process.env, ...override }, timeout: 30000, encoding: "utf8", maxBuffer: 1024 * 1024 });
        if (child.stdout) sink(child.stdout); if (child.stderr) sink(child.stderr);
        assert.equal(child.error, undefined, "Startup refusal child exceeded its process deadline"); assert.equal(child.status, 0, "Strapi startup must fail for the intended guard before serving routes");
      }
    });
    await startApp();
    const app = appOwner.current;
    await check("nonempty synthetic B2B business audit session and grant fixtures reject reseeding", async () => {
      const ids = await support.seedFixtures(app); for (const value of Object.values(ids)) { sentinels.push(value); secrets.add(value); }
      await assert.rejects(() => support.seedFixtures(app), /refuse existing B2B rows/);
      await assert.rejects(support.requireFreshDatabase(), /refuse a reused database/);
    });
    const b2bBefore = await support.snapshot(app.db.connection);
    const initialChecks = report.checks.length;
    await support.verifySystem({ app, request, check, control, sentinels, report });
    assert.equal(report.checks.length - initialChecks, support.verifySystem.EXPECTED_CHECKS);
    await check("S09 S15 S22 app recreation resets metrics and preserves rows with development metadata", async () => {
      const previousRecorder = app.alageumMetrics;
      await appOwner.destroy();
      process.env.APP_ENV = "development";
      try {
        await startApp(); const recreated = appOwner.current;
        assert.notEqual(recreated.alageumMetrics, previousRecorder); assert.deepEqual(recreated.alageumMetrics.snapshot(), {});
        support.dto("health", await request("/api/v1/health")); support.dto("readiness", await request("/api/v1/readiness"));
        const scrape = await request("/api/v1/metrics"); assert.equal(scrape.body.http_requests_total, 2); assert.equal(scrape.body.http_request_duration_seconds_count, 2); assert.equal(Object.hasOwn(scrape.body, "http_errors_total"), false);
        assert.equal(recreated.alageumMetrics.snapshot().http_requests_total, 3);
        support.dto("version", await request("/api/v1/version"), "development");
        assert.deepEqual(await support.snapshot(recreated.db.connection), b2bBefore);
      } finally { process.env.APP_ENV = "test"; }
    });
    assert.equal(report.checks.length, support.verifySystem.EXPECTED_CHECKS + 4);
    report.backendChecks = report.checks.length; report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = redact(error.message); process.exitCode = 1; }
  finally {
    stopping = true;
    await finishCleanup(cleanup, report, () => {
      clearTimeout(deadline); for (const [signal, handler] of handlers) process.off(signal, handler);
      report.finishedAt = new Date().toISOString(); publish();
      process.stdout.write = stdout; process.stderr.write = stderr;
      stdout(`System verification ${report.status}; ${report.checks.filter(item => item.status === "passed").length}/${report.checks.length} checks passed\n`);
      stdout(`Sanitized evidence: ${published}\n`);
    });
  }
}

module.exports = { redactor, createAppOwner, finishCleanup };
if (require.main === module) {
  if (process.argv[2] === "--startup-guard") startupGuard().then(() => process.exit(process.exitCode || 0));
  else run().catch(() => { console.error("System runner refused its environment before starting; use run-system-tests.sh"); process.exitCode = 1; });
}
