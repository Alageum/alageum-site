"use strict";

// Final-candidate default-Vite acceptance. Uses installed dependencies only.
// Source the task's PostgreSQL environment first. No HOME/CODEX_HOME overrides.
const assert = require("node:assert/strict");
const { randomBytes, createHash } = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { StringDecoder } = require("node:string_decoder");
const { setTimeout: delay } = require("node:timers/promises");

const root = path.resolve(__dirname, "../..");
const backend = path.join(root, "backend-node"), frontend = path.join(root, "frontend");
const mode = process.argv[2] || "--all";
assert.ok(["--all", "--discover", "--http-builds"].includes(mode), "Use --all, --discover, or explicit --http-builds when browser execution is blocked");
const browserBlocked = mode === "--http-builds";
assert.equal(process.versions.node.split(".")[0], "24", "Node.js 24 is required");
const workRoot = path.join(backend, ".tmp/candidate-regressions");
fs.mkdirSync(workRoot, { recursive: true });
const work = fs.mkdtempSync(path.join(workRoot, "run."));
const relative = value => path.relative(root, value);
const reportPath = path.join(backend, "docs/webpack-default-regression-results.json");
const report = {
  kind: "final-candidate-default-vite-regressions", status: "running",
  startedAt: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  node: process.version, chromium: "/usr/bin/chromium", heapMiB: 2560,
  workflow: ".github/workflows/node-strapi.yml", evidence: relative(work),
  dependencyInstalls: 0, registryRequests: 0, testRetries: 0,
  stages: [], browsers: {}, screenshots: [], cleanup: { status: "not-run" },
};
const env = { ...process.env, APP_ENV: "test", HOST: "127.0.0.1", BROWSER: "none",
  NODE_OPTIONS: "--max-old-space-size=2560", STRAPI_TELEMETRY_DISABLED: "true", STRAPI_HIDE_UPDATE_MESSAGE: "true",
  NEXT_TELEMETRY_DISABLED: "1", CHROMIUM_PATH: "/usr/bin/chromium", FORCE_COLOR: "0",
  TMPDIR: path.join(work, "tmp"), XDG_CONFIG_HOME: path.join(work, "config"), SWC_NATIVE_BINDING_CACHE: path.join(work, "swc"),
};
for (const key of ["CI", "ALAGEUM_QUOTES_BUILD", "PLAYWRIGHT_JSON_OUTPUT_FILE", "PLAYWRIGHT_JSON_OUTPUT_NAME", "PLAYWRIGHT_JSON_OUTPUT_DIR"]) delete env[key];
for (const key of ["TMPDIR", "XDG_CONFIG_HOME", "SWC_NATIVE_BINDING_CACHE"]) fs.mkdirSync(env[key], { recursive: true });
const originalHome = process.env.HOME, originalCodexHome = process.env.CODEX_HOME;
const secrets = new Set();
const pgUser = "candidate_regressions", pgData = path.join(work, "postgres");
let pgStarted = false, api, web, active;
const servers = new Set();
const selected = [
  { key: "cms", config: "playwright.cms.config.js", file: "node-cms.spec.js", count: 5 },
  { key: "admin", config: "playwright.admin.config.js", file: "catalog-admin.spec.js", count: 3 },
  { key: "rfq", config: "playwright.node.config.js", file: "node-rfq.spec.js", count: 2 },
  { key: "quotes", config: "playwright.quotes.config.js", file: "quotes.spec.js", count: 28 },
  { key: "pages", config: "playwright.pages.config.js", file: "node-pages.spec.js", count: 7 },
];
const protectedFiles = [
  ...selected.flatMap(item => [path.join("frontend", item.config), path.join("frontend/e2e", item.file)]),
  "frontend/next.config.mjs", "backend-node/package.json", "backend-node/package-lock.json",
  "frontend/package.json", "frontend/package-lock.json", ".github/workflows/node-strapi.yml",
  ...fs.readdirSync(path.join(backend, "config")).filter(name => name.endsWith(".js")).map(name => path.join("backend-node/config", name)),
];
const digest = file => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const before = Object.fromEntries(protectedFiles.map(file => [file, digest(file)]));
function conciseReport() {
  const checks = Object.fromEntries(report.stages.filter(stage => /^(?:backend-|frontend-|page-)/.test(stage.name)).map(stage => [stage.name, {
    status: stage.status, ...(stage.tests === undefined ? {} : { tests: stage.tests }),
  }]));
  return {
    kind: report.kind, status: report.status, startedAt: report.startedAt, finishedAt: report.finishedAt,
    commit: report.commit, node: report.node, heapMiB: report.heapMiB, workflow: report.workflow,
    evidence: report.evidence, detailedReport: `${report.evidence}/results.json`,
    dependencyInstalls: report.dependencyInstalls, registryRequests: report.registryRequests,
    checks, pageHttpFaultCases: report.pageHttpFaultCases, pageNativeChecks: report.pageNativeChecks,
    discoveredBrowserCases: report.discoveredBrowserCases, passedBrowserCases: report.passedBrowserCases,
    testRetries: report.testRetries, browsers: report.browsers, screenshots: report.screenshots,
    ...(report.browserBlocker ? { browserBlocker: report.browserBlocker } : {}),
    protectedFilesUnchanged: report.protectedFilesUnchanged, cleanup: report.cleanup,
    ...(report.error ? { error: report.error } : {}),
  };
}
function save() {
  fs.writeFileSync(path.join(work, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (mode !== "--discover") fs.writeFileSync(reportPath, `${JSON.stringify(conciseReport(), null, 2)}\n`);
}
function redact(text) {
  for (const secret of secrets) text = text.split(secret).join("[REDACTED]");
  return text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]");
}
function sink(file) {
  fs.writeFileSync(file, "");
  const decoder = new StringDecoder("utf8");
  let pending = "";
  return {
    push(chunk) {
      pending += decoder.write(chunk);
      let index;
      while ((index = pending.indexOf("\n")) !== -1) {
        fs.appendFileSync(file, redact(pending.slice(0, index + 1))); pending = pending.slice(index + 1);
      }
      assert.ok(pending.length < 4 * 1024 * 1024, "Output line exceeds redaction buffer");
    },
    end() { pending += decoder.end(); if (pending) fs.appendFileSync(file, redact(pending)); pending = ""; },
  };
}
function child(command, args, cwd, childEnv, filename) {
  const log = path.join(work, `${filename}.log`), errorLog = path.join(work, `${filename}.stderr.log`);
  const stdout = sink(log), stderr = sink(errorLog);
  const proc = spawn(command, args, { cwd, env: childEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", chunk => stdout.push(chunk)); proc.stderr.on("data", chunk => stderr.push(chunk));
  proc.completion = new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code, signal) => { stdout.end(); stderr.end(); resolve({ code, signal }); });
  });
  proc.log = log; proc.errorLog = errorLog;
  return proc;
}
async function stop(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  try { process.kill(-proc.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  let forced = false;
  const timer = setTimeout(() => { forced = true; try { process.kill(-proc.pid, "SIGKILL"); } catch {} }, 15000);
  try { await proc.completion; } finally { clearTimeout(timer); servers.delete(proc); }
  assert.equal(forced, false, "Child shutdown must complete within 15 seconds");
}
async function run(name, command, args, cwd = root, overrides = {}, timeoutMs = 600000) {
  const stage = { name, status: "running", command: [command, ...args].map(value => value.startsWith(root) ? relative(value) : value).join(" ") };
  report.stages.push(stage); save(); console.log(`START ${name}`);
  const started = Date.now();
  const childEnv = { ...env, ...overrides }; for (const key of Object.keys(childEnv)) if (childEnv[key] === undefined) delete childEnv[key];
  const proc = child(command, args, cwd, childEnv, name); active = proc;
  stage.log = relative(proc.log); stage.stderr = relative(proc.errorLog);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void stop(proc); }, timeoutMs);
  try {
    const result = await proc.completion;
    assert.equal(timedOut, false, `${name} exceeded ${timeoutMs}ms`);
    assert.equal(result.signal, null, `${name} received ${result.signal}`);
    assert.equal(result.code, 0, `${name} failed; see ${relative(proc.log)} and ${relative(proc.errorLog)}`);
    stage.status = "passed";
    const stdout = fs.readFileSync(proc.log, "utf8");
    const tests = [...stdout.matchAll(/^(?:#|ℹ) tests (\d+)$/gm)];
    if (tests.length) {
      stage.tests = Number(tests.at(-1)[1]);
      for (const field of ["fail", "cancelled", "skipped", "todo"]) {
        const values = [...stdout.matchAll(new RegExp(`^(?:#|ℹ) ${field} (\\d+)$`, "gm"))];
        if (values.length) assert.equal(Number(values.at(-1)[1]), 0, `${name}: ${field} must be zero`);
      }
    }
    console.log(`PASS ${name}${stage.tests ? ` (${stage.tests} tests)` : ""}`);
    return { stage, stdout, log: proc.log };
  } catch (error) { stage.status = "failed"; throw error; }
  finally { clearTimeout(timer); active = null; stage.durationMs = Date.now() - started; save(); }
}
const node = (name, args, cwd, overrides, timeout) => run(name, process.execPath, args, cwd, overrides, timeout);
const npm = (name, args, cwd, overrides, timeout) => run(name, "npm", args, cwd, overrides, timeout);
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return String(port);
}
const playwright = path.join(frontend, "node_modules/@playwright/test/cli.js");
function testsIn(suites) { return suites.flatMap(suite => [...(suite.specs || []).flatMap(spec => spec.tests), ...testsIn(suite.suites || [])]); }
function verifyBrowsers(item, file) {
  const result = JSON.parse(fs.readFileSync(file, "utf8"));
  const tests = testsIn(result.suites);
  assert.equal(tests.length, item.count, `${item.key}: selected case count`);
  assert.equal(result.stats.expected, item.count);
  assert.equal(result.stats.unexpected + result.stats.skipped + result.stats.flaky, 0);
  for (const test of tests) {
    assert.equal(test.expectedStatus, "passed"); assert.equal(test.status, "expected");
    assert.equal(test.results.length, 1, "Exactly one attempt per browser case");
    assert.equal(test.results[0].status, "passed"); assert.equal(test.results[0].retry, 0);
    for (const attachment of test.results[0].attachments || []) if (attachment.contentType === "image/png" && attachment.path) {
      assert.ok(fs.statSync(attachment.path).size > 0); report.screenshots.push(relative(attachment.path));
    }
  }
  report.browsers[item.key] = { discovered: item.count, passed: item.count, failed: 0, skipped: 0, retries: 0, flaky: 0, report: relative(file) }; save();
}
async function discover() {
  let total = 0;
  for (const item of selected) {
    const result = await node(`discover-${item.key}`, [playwright, "test", `--config=${item.config}`, "--list", "--reporter=json", "--retries=0", "--forbid-only"], frontend);
    const data = JSON.parse(result.stdout), tests = testsIn(data.suites);
    assert.equal(tests.length, item.count, `${item.key} discovery count`);
    assert.ok(tests.every(test => test.expectedStatus === "passed"), "No expected skips/failures");
    report.browsers[item.key] = { discovered: tests.length, status: "not-run" }; total += tests.length;
  }
  assert.equal(total, 45); report.discoveredBrowserCases = total; save(); console.log("DISCOVERED 45 browser cases");
}
async function ready(proc, url, timeoutMs = 150000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assert.ok(proc.exitCode === null && proc.signalCode === null, `Server exited: ${relative(proc.log)}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(4000) }); await response.arrayBuffer(); if (response.ok) return; } catch {}
    await delay(500);
  }
  throw new Error(`Readiness deadline exceeded: ${url}`);
}
async function main() {
  await discover(); if (mode === "--discover") return;
  if (browserBlocked) {
    report.browserBlocker = "This executor rejects Chromium process-singleton Unix socket creation (Operation not permitted), before page creation. Browser cases are discovered but not executed; --http-builds was explicitly selected.";
    for (const item of selected) report.browsers[item.key].status = "blocked";
  }
  assert.ok(fs.existsSync(env.CHROMIUM_PATH));
  const pg = process.env.PG_BIN;
  assert.ok(pg, "Source the official local PostgreSQL environment first");
  for (const executable of ["initdb", "pg_ctl", "createdb", "dropdb"]) fs.accessSync(path.join(pg, executable), fs.constants.X_OK);
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) {
    env[key] = Array.from({ length: key === "APP_KEYS" ? 2 : 1 }, () => randomBytes(32).toString("hex")).join(",");
    for (const value of env[key].split(",")) secrets.add(value);
  }
  for (const key of ["E2E_CMS_EDITOR_PASSWORD", "E2E_CMS_DENIED_PASSWORD"]) { env[key] = `Aa1!${randomBytes(24).toString("hex")}`; secrets.add(env[key]); }
  const password = randomBytes(32).toString("hex"); secrets.add(password);
  const pwfile = path.join(work, "pg-password"); fs.writeFileSync(pwfile, `${password}\n`, { mode: 0o600 });
  const pgPort = await freePort(), apiPort = await freePort(), webPort = await freePort(), quotesPort = await freePort();
  report.ports = { postgres: Number(pgPort), api: Number(apiPort), frontend: Number(webPort), quotes: Number(quotesPort) };
  await run("postgres-init", path.join(pg, "initdb"), ["-D", pgData, "--no-locale", "--encoding=UTF8", "--auth-local=trust", "--auth-host=scram-sha-256", "-U", pgUser, `--pwfile=${pwfile}`]);
  await run("postgres-start", path.join(pg, "pg_ctl"), ["-D", pgData, "-l", path.join(work, "postgres.log"), "-o", `-h 127.0.0.1 -p ${pgPort} -c unix_socket_directories=''`, "-w", "start"]); pgStarted = true;
  const pgArgs = ["-h", "127.0.0.1", "-p", pgPort, "-U", pgUser];
  for (const name of ["alageum_strapi_test", "alageum_strapi_domain_test", "alageum_strapi_browser_test", "alageum_strapi_pages_test"]) await run(`create-${name}`, path.join(pg, "createdb"), [...pgArgs, name], root, { PGPASSWORD: password });
  const dbUrl = name => `postgresql://${pgUser}:${password}@127.0.0.1:${pgPort}/${name}`;
  Object.assign(env, {
    DATABASE_URL: dbUrl("alageum_strapi_test"), ALAGEUM_DOMAIN_TEST_DATABASE_URL: dbUrl("alageum_strapi_domain_test"),
    ALAGEUM_CMS_BROWSER_DATABASE_URL: dbUrl("alageum_strapi_browser_test"), ALAGEUM_SEED_DEMO: "1", ALAGEUM_IMPORT_CATALOG: "1", ALAGEUM_TEST_ADMIN_FIXTURES: "1",
    PORT: apiPort, CORS_ORIGINS: `http://127.0.0.1:${webPort}`, E2E_API_URL: `http://127.0.0.1:${apiPort}/api/v1`,
    E2E_BASE_URL: `http://127.0.0.1:${webPort}`, E2E_QUOTES_BASE_URL: `http://127.0.0.1:${webPort}`, E2E_CMS_BASE_URL: `http://127.0.0.1:${apiPort}/cms`,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}/api/v1`, NEXT_PUBLIC_CATALOG_SOURCE: "api",
  });
  await npm("backend-check", ["run", "check"], backend);
  await npm("backend-integration", ["run", "test:integration"], backend);
  await npm("backend-default-vite-build", ["run", "build"], backend, { NODE_ENV: "production" });
  await node("backend-vite-assets", ["scripts/probe-vite-compat.js", "build"], backend);
  await npm("frontend-lint", ["run", "lint"], frontend);
  await npm("frontend-unit", ["run", "test:unit"], frontend, { NEXT_PUBLIC_CATALOG_SOURCE: "static" });
  await npm("frontend-api-build", ["run", "build"], frontend, { NODE_ENV: "production" });
  await npm("frontend-quotes-build", ["run", "build"], frontend, { NODE_ENV: "production", ALAGEUM_QUOTES_BUILD: "1", NEXT_PUBLIC_CATALOG_SOURCE: "static" });
  await node("cms-fixtures", ["scripts/seed-test-cms-admins.js"], backend, { DATABASE_URL: env.ALAGEUM_CMS_BROWSER_DATABASE_URL });
  api = child("npm", ["run", "start"], backend, { ...env, NODE_ENV: "production", DATABASE_URL: env.ALAGEUM_CMS_BROWSER_DATABASE_URL }, "live-api"); servers.add(api);
  web = child("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", webPort], frontend, { ...env, NODE_ENV: "production" }, "live-frontend"); servers.add(web);
  await ready(api, `${env.E2E_API_URL}/readiness`); await ready(web, `${env.E2E_BASE_URL}/inquiry?source=api`);
  for (const suffix of ["/_health", "/cms"]) { const response = await fetch(`http://127.0.0.1:${apiPort}${suffix}`, { signal: AbortSignal.timeout(10000) }); await response.arrayBuffer(); assert.ok(response.ok); }
  for (const item of browserBlocked ? [] : selected.slice(0, 4)) {
    const overrides = item.key === "quotes" ? { E2E_QUOTES_BASE_URL: undefined, E2E_QUOTES_PRODUCTION: "1", NEXT_PUBLIC_CATALOG_SOURCE: "static", NODE_ENV: "production", E2E_QUOTES_PORT: quotesPort } : { NODE_ENV: "production" };
    const args = [playwright, "test", `--config=${item.config}`, "--reporter=json", "--retries=0", "--forbid-only"];
    if (item.key !== "cms") args.push(`--max-failures=${item.key === "quotes" ? 3 : 1}`);
    const result = await node(`browser-${item.key}`, args, frontend, overrides, 720000); verifyBrowsers(item, result.log);
  }
  await stop(api); api = null; await stop(web); web = null;
  const pagesEnv = { DATABASE_URL: dbUrl("alageum_strapi_pages_test"), ALAGEUM_TEST_PAGE_FIXTURES: "1", ALAGEUM_SEED_DEMO: "0", ALAGEUM_IMPORT_CATALOG: "0" };
  await node("page-contracts", ["--test", "--test-concurrency=1", "tests/pages.integration.cjs"], backend, pagesEnv);
  // Both exact-name databases belong to the newly initialized cluster above.
  await run("reset-owned-page-database", path.join(pg, "dropdb"), [...pgArgs, "alageum_strapi_pages_test"], root, { PGPASSWORD: password });
  await run("recreate-owned-page-database", path.join(pg, "createdb"), [...pgArgs, "alageum_strapi_pages_test"], root, { PGPASSWORD: password });
  const deliveryEnv = { ...pagesEnv, NODE_ENV: "production", NEXT_PUBLIC_CATALOG_SOURCE: "static", API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`, COMPANY_SOURCE: "cms", PAGES_SOURCE: "api", PAGES_STATIC_PREVIEW: "0", PAGES_SITE_ORIGIN: `http://127.0.0.1:${webPort}` };
  await npm("frontend-page-build", ["run", "build"], frontend, deliveryEnv);
  await node("page-http-fault-matrix", ["frontend/scripts/verify-editorial-http.mjs"], root, deliveryEnv, 330000);
  const matrix = JSON.parse(fs.readFileSync(path.join(root, "page-delivery-evidence/fault-matrix-results.json"), "utf8"));
  assert.equal(matrix.status, "passed"); assert.equal(matrix.cases.length, 196); assert.ok(matrix.cases.every(item => item.status === "passed"));
  report.pageHttpFaultCases = matrix.cases.length;
  await node("page-native-delivery", ["backend-node/scripts/run-page-delivery.js", ...(browserBlocked ? ["--http-only"] : [])], root, deliveryEnv, 810000);
  const native = JSON.parse(fs.readFileSync(path.join(root, "page-delivery-evidence/native-results.json"), "utf8"));
  assert.equal(native.status, "passed"); assert.ok(native.cases.every(item => item.status === "passed")); report.pageNativeChecks = native.cases.length;
  if (!browserBlocked) verifyBrowsers(selected[4], path.join(root, "page-delivery-evidence/browser-results.json"));
  fs.cpSync(path.join(root, "page-delivery-evidence"), path.join(work, "page-delivery-evidence"), { recursive: true });
  await npm("frontend-static-preview-build", ["run", "build:preview"], frontend, { ...deliveryEnv, COMPANY_SOURCE: "static", PAGES_SOURCE: "static", PAGES_STATIC_PREVIEW: "1" });
  report.passedBrowserCases = Object.values(report.browsers).reduce((sum, value) => sum + (value.passed || 0), 0); assert.equal(report.passedBrowserCases, browserBlocked ? 0 : 45);
}
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { interrupted = true; if (active) void stop(active); for (const proc of servers) void stop(proc); });
(async () => {
  try { await main(); assert.equal(interrupted, false); report.status = mode === "--discover" ? "discovered" : browserBlocked ? "blocked-browser" : "passed"; }
  catch (error) { report.status = "failed"; report.error = redact(error.stack || error.message); process.exitCode = 1; console.error(report.error); }
  finally {
    try {
      for (const proc of servers) await stop(proc);
      if (pgStarted) {
        await run("postgres-stop", path.join(process.env.PG_BIN, "pg_ctl"), ["-D", pgData, "-m", "fast", "-w", "stop"]); pgStarted = false;
        assert.ok(!fs.existsSync(path.join(pgData, "postmaster.pid")), "PostgreSQL must be stopped");
      }
      assert.equal(process.env.HOME, originalHome); assert.equal(process.env.CODEX_HOME, originalCodexHome);
      assert.deepEqual(Object.fromEntries(protectedFiles.map(file => [file, digest(file)])), before, "Tests, configs, workflow, packages and locks must remain unchanged during acceptance");
      report.protectedFilesUnchanged = true; report.cleanup = { status: "passed", serversStopped: true, postgresStopped: !pgStarted, homePreserved: true, codexHomePreserved: true };
    } catch (error) { report.cleanup = { status: "failed", error: redact(error.message) }; report.status = "failed"; process.exitCode = 1; }
    report.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ status: report.status, discovered: report.discoveredBrowserCases, passed: report.passedBrowserCases, evidence: relative(work), report: mode === "--discover" ? relative(path.join(work, "results.json")) : relative(reportPath) }));
  }
})();
