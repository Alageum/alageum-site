"use strict";

// Reimplemented acceptance, not a byte-for-byte restoration of lost evidence.
// Real native admin authentication/Content Manager and a production Next child.
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { mkdirSync, appendFileSync, writeFileSync, readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { StringDecoder } = require("node:string_decoder");
const { pageDeliveryOptions, extractPageProbeEvidence, assertPageProbeAcceptance } = require("./page-test-guards");
const { extractPageSyncEvidence, assertPageSyncAcceptance } = require("./page-sync-guards");

const backend = resolve(__dirname, "..");
const frontend = resolve(backend, "../frontend");
const evidence = resolve(backend, "../page-delivery-evidence");
const httpOnly = process.argv.includes("--http-only");
const fastSaveProbe = process.argv.includes("--fast-save-probe");
const report = { implementation: "reimplemented", kind: "native-page-delivery", startedAt: new Date().toISOString(), status: "running", cases: [], browser: { status: "not-run", reason: httpOnly ? "explicit local --http-only mode" : "not yet reached" } };
if (fastSaveProbe) report.fastSaveProbe = { status: "not-run", reason: "not yet reached" };
if (fastSaveProbe) report.pageInputSync = { status: "not-run", reason: "not yet reached" };
mkdirSync(evidence, { recursive: true });
const secrets = new Set();
// Redact complete lines, never individual data chunks. A password or token may
// span chunks. No raw add-mask commands, child output, or login payloads go to tee.
function redact(value) {
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join("[REDACTED]");
  return text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]");
}
function lineSink(write) {
  const decoder = new StringDecoder("utf8");
  let pending = "", discarding = false;
  function drain() {
    let index;
    while ((index = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, index + 1); pending = pending.slice(index + 1);
      if (!discarding) write(redact(line));
      discarding = false;
    }
    // Bound memory without writing an incomplete, potentially secret line.
    if (pending.length > 4 * 1024 * 1024) { pending = ""; if (!discarding) write("[oversized output line discarded]\n"); discarding = true; }
  }
  return { push: chunk => { pending += typeof chunk === "string" ? chunk : decoder.write(chunk); drain(); }, end: () => { pending += decoder.end(); drain(); if (pending && !discarding) write(redact(pending)); pending = ""; } };
}
const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);
const nativeLog = join(evidence, "native-strapi.log");
writeFileSync(nativeLog, "");
const output = lineSink(line => { appendFileSync(nativeLog, line); originalStdout(line); });
const errors = lineSink(line => { appendFileSync(nativeLog, line); originalStderr(line); });
process.stdout.write = (chunk, encoding, callback) => { output.push(chunk); if (typeof encoding === "function") encoding(); else callback?.(); return true; };
process.stderr.write = (chunk, encoding, callback) => { errors.push(chunk); if (typeof encoding === "function") encoding(); else callback?.(); return true; };
let app, next, browserChild, cmsOrigin, webOrigin;
let cleaning;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolveDone => child.once("close", resolveDone));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await done; } finally { clearTimeout(timer); }
}
async function cleanup() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    await stop(browserChild);
    await stop(next);
    if (app) { const current = app; app = null; await current.destroy(); }
  })();
  return cleaning;
}
function saveReport() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(evidence, "native-results.json"), `${redact(JSON.stringify(report, null, 2))}\n`);
}
async function failInterrupted(reason) {
  report.status = "failed"; report.error = reason;
  try { await cleanup(); } finally { saveReport(); output.end(); errors.end(); process.exit(1); }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void failInterrupted(`Interrupted by ${signal}`); });
const watchdog = setTimeout(() => { void failInterrupted("Native Page delivery exceeded the 780-second deadline"); }, 780000);

async function requireFreshDatabase() {
  assert.equal(process.env.APP_ENV, "test", "Page delivery requires APP_ENV=test before app.load");
  assert.equal(process.env.ALAGEUM_TEST_PAGE_FIXTURES, "1", "Explicit disposable Page fixtures must be enabled before app.load");
  pageDeliveryOptions(process.argv.slice(2), process.env);
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Page tests require loopback PostgreSQL");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), "alageum_strapi_pages_test", "Only the exact disposable Page database is allowed");
  assert.equal(url.search + url.hash, "");
  if (url.password) secrets.add(decodeURIComponent(url.password));
  const { Client } = require("pg");
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "alageum_strapi_pages_test");
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    assert.equal(tables.rows.length, 0, "Page delivery refuses a reused database; create a fresh disposable database");
  } finally { await client.end(); }
}
function generateSecrets() {
  for (const key of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) {
    process.env[key] ||= Array.from({ length: key === "APP_KEYS" ? 2 : 1 }, () => randomBytes(32).toString("hex")).join(",");
    secrets.add(process.env[key]);
    if (key === "APP_KEYS") for (const value of process.env[key].split(",")) secrets.add(value);
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
function loggedChild(args, cwd, env, filename, stderrFilename = filename) {
  const path = join(evidence, filename); writeFileSync(path, "");
  const errorPath = join(evidence, stderrFilename);
  if (errorPath !== path) writeFileSync(errorPath, "");
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const sink = lineSink(line => appendFileSync(path, line));
  const errorSink = lineSink(line => appendFileSync(errorPath, line));
  child.stdout.on("data", sink.push); child.stderr.on("data", errorSink.push);
  child.once("close", () => { sink.end(); errorSink.end(); });
  child.on("error", error => { child.spawnFailure = error; });
  return child;
}
async function native(path, { actor, method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${cmsOrigin}${path}`, {
    method, headers: { Accept: "application/json", ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), redirect: "manual",
  });
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, received ${response.status}`);
  const value = await response.json();
  return value;
}
async function check(name, work) {
  const item = { name, status: "running" }; report.cases.push(item);
  const started = Date.now();
  try { await work(); item.status = "passed"; }
  catch (error) { item.status = "failed"; item.error = redact(error.message); throw error; }
  finally { item.durationMs = Date.now() - started; saveReport(); }
}
const htmlText = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
async function delivered(slug, expected, { present = [], absent = [], locale = "ru" } = {}) {
  // The native about lifecycle must reach both public surfaces from one build.
  const company = locale === "ru" && slug === "about";
  const paths = [`/pages/${locale}/${slug}`, ...(company ? ["/company"] : [])];
  for (const path of paths) {
    const response = await fetch(`${webOrigin}${path}`, { signal: AbortSignal.timeout(18000), redirect: "manual" });
    const body = await response.text();
    assert.equal(response.status, expected, `Next ${path}: hard HTTP status`);
    for (const text of present) assert.ok(body.includes(htmlText(text)), "Published body must be present in server HTML");
    for (const text of absent) assert.ok(!body.includes(htmlText(text)), "Private, stale or fallback body must be absent");
    if (expected === 200) {
      assert.ok(body.includes(`<link rel="canonical" href="${webOrigin}${company ? "/company" : path}"`));
      assert.match(body, /<meta name="robots" content="noindex, nofollow"/);
      assert.match(body, /<header[^>]+class="[^"]*site-header/);
      assert.match(body, /<footer[^>]+class="[^"]*site-footer/);
      assert.equal((body.match(/<h1(?:>|\s)/g) || []).length, 1);
      assert.doesNotMatch(body, /class="corp-mission"|id="history"|corp-end-note/);
    }
  }
}

(async () => {
  try {
    await check("fresh loopback Page database required before app.load", requireFreshDatabase);
    generateSecrets();
    process.chdir(backend);
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    process.env.STRAPI_TELEMETRY_DISABLED = "true";
    process.env.STRAPI_HIDE_UPDATE_MESSAGE = "true";
    process.env.ALAGEUM_SEED_DEMO = "0";
    process.env.ALAGEUM_IMPORT_CATALOG = "0";
    app = require("@strapi/strapi").createStrapi({ appDir: backend, distDir: backend });
    await app.load();
    const { seedTestPageAdmins } = require("./seed-test-page-admins");
    const { drainNativeAdminMetrics } = require("./seed-test-cms-admins");
    let admins;
    await check("seed minimal native Page roles and reject second seed", async () => {
      admins = await drainNativeAdminMetrics(app, () => seedTestPageAdmins(app, { fastSaveProbe }));
      const kinds = ["editor", "publisher", "denied", ...(fastSaveProbe ? ["probe"] : [])];
      assert.deepEqual(Object.keys(admins), kinds);
      for (const kind of kinds) {
        assert.ok(admins[kind]?.id && admins[kind]?.email && admins[kind]?.role);
        assert.ok(typeof admins[kind].password === "string" && admins[kind].password.length >= 32);
        secrets.add(admins[kind].password);
      }
      await assert.rejects(() => drainNativeAdminMetrics(app, () => seedTestPageAdmins(app, { fastSaveProbe })), /fresh|existing|already/i);
    });
    app.server.mount();
    await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
    cmsOrigin = `http://127.0.0.1:${app.server.httpServer.address().port}`;
    const port = await freePort(); webOrigin = `http://127.0.0.1:${port}`;
    next = loggedChild([join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], frontend, {
      ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", API_INTERNAL_BASE_URL: `${cmsOrigin}/api/v1`, PAGES_SOURCE: "api", PAGES_STATIC_PREVIEW: "0", PAGES_SITE_ORIGIN: webOrigin, COMPANY_SOURCE: "cms",
    }, "native-next.log");
    const readyDeadline = Date.now() + 45000;
    while (true) {
      if (next.spawnFailure) throw next.spawnFailure;
      assert.ok(next.exitCode === null && next.signalCode === null, "Production Next exited before readiness");
      try { const response = await fetch(`${webOrigin}/login`, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.status === 200) break; } catch { /* Bounded startup retry. */ }
      assert.ok(Date.now() < readyDeadline, "Next readiness exceeded 45 seconds");
      await new Promise(done => setTimeout(done, 200));
    }
    const actors = {};
    const uid = "api::page.page", collection = `/content-manager/collection-types/${uid}`;
    await check("native admin login and exact Page grants", async () => {
      const grants = { editor: ["create", "read", "update"], publisher: ["publish", "read"], denied: [] };
      if (fastSaveProbe) grants.probe = ["create", "publish", "read", "update"];
      for (const [kind, actions] of Object.entries(grants)) {
        const result = await native("/admin/login", { method: "POST", body: { email: admins[kind].email, password: admins[kind].password } });
        const token = result.data?.token; assert.equal(typeof token, "string"); secrets.add(token);
        actors[kind] = { token };
        const { data: user } = await native("/admin/users/me", { actor: actors[kind] });
        assert.equal(user.email, admins[kind].email);
        assert.deepEqual(user.roles.map(role => role.code), [`alageum-page-test-${kind}`]);
        const { data: permissions } = await native("/admin/users/me/permissions", { actor: actors[kind] });
        assert.deepEqual(permissions.map(grant => `${grant.subject}:${grant.action}`).sort(), actions.map(action => `${uid}:plugin::content-manager.explorer.${action}`).sort());
        if (kind === "probe") for (const grant of permissions) {
          assert.deepEqual(grant.conditions, [], "Probe grants must be unconditional native Page grants only");
          const action = grant.action.split(".").at(-1);
          const expected = action === "publish" ? {} : { fields: require("../src/domain/pages").FIELDS };
          assert.deepEqual(grant.properties, expected, "Probe grants must expose only the existing Page fields");
        }
      }
    });
    const { getPreviewPage } = await import(pathToFileURL(join(frontend, "lib/public/pagesPreview.js")).href);
    const fixture = getPreviewPage("ru", "about");
    assert.ok(fixture && fixture.body.length);
    const fields = ["slug", "title", "locale_code", "body", "seo_title", "seo_description"];
    const initial = Object.fromEntries(fields.map(key => [key, fixture[key]]));
    const firstText = fixture.body[0].children[0].text;
    const privateText = "PRIVATE_NATIVE_PAGE_REVISION_71d638";
    const revised = { ...initial, title: "Native HTTP republished revision", body: [{ type: "paragraph", children: [{ type: "text", text: privateText }] }] };
    let id;
    const save = body => native(`${collection}/${id}`, { actor: actors.editor, method: "PUT", body });
    const publish = () => native(`${collection}/${id}/actions/publish`, { actor: actors.publisher, method: "POST", body: {} });
    const apiPage = (slug, expected, locale = "ru") => native(`/api/v1/pages/${slug}?locale=${locale}`, { expected });
    await check("native editor creates a private draft with hard Next 404", async () => {
      const created = await native(collection, { actor: actors.editor, method: "POST", body: initial, expected: 201 });
      id = created.data.documentId; assert.match(id, /^[a-z0-9]+$/); assert.equal(created.data.publishedAt, null);
      await apiPage("about", 404);
      await delivered("about", 404, { absent: [firstText] });
    });
    await check("editor cannot publish, publisher cannot edit, denied cannot write", async () => {
      await native(`${collection}/${id}/actions/publish`, { actor: actors.editor, method: "POST", body: {}, expected: 403 });
      await native(`${collection}/${id}`, { actor: actors.publisher, method: "PUT", body: revised, expected: 403 });
      await native(collection, { actor: actors.denied, method: "POST", body: { ...initial, slug: "denied-page" }, expected: 403 });
      await native(`${collection}/${id}`, { actor: actors.denied, method: "PUT", body: revised, expected: 403 });
      await native(`${collection}/${id}/actions/publish`, { actor: actors.denied, method: "POST", body: {}, expected: 403 });
      await apiPage("about", 404);
    });
    await check("publisher publishes native draft and Next returns the verified body", async () => {
      await publish(); const value = await apiPage("about", 200); assert.deepEqual(value.body, initial.body);
      await delivered("about", 200, { present: [firstText], absent: [privateText] });
    });
    await check("draft edits stay private until a fresh republish", async () => {
      await save(revised);
      assert.deepEqual((await apiPage("about", 200)).body, initial.body);
      await delivered("about", 200, { present: [firstText], absent: [privateText] });
      await publish(); assert.deepEqual((await apiPage("about", 200)).body, revised.body);
      await delivered("about", 200, { present: [privateText], absent: [firstText] });
    });
    await check("wrong locale is absent without fallback", async () => {
      for (const locale of ["en", "kk", "zh", "uz"]) {
        await apiPage("about", 404, locale);
        await delivered("about", 404, { locale, absent: [firstText, privateText] });
      }
    });
    await check("changed slug removes the old published URL", async () => {
      await save({ ...revised, slug: "about-moved" });
      await delivered("about", 200, { present: [privateText] });
      await delivered("about-moved", 404, { absent: [privateText] });
      await publish(); await apiPage("about", 404); await apiPage("about-moved", 200);
      await delivered("about", 404, { absent: [firstText, privateText] });
      await delivered("about-moved", 200, { present: [privateText] });
    });
    await check("native unpublish removes Next content immediately", async () => {
      await native(`${collection}/${id}/actions/unpublish`, { actor: actors.publisher, method: "POST", body: {} });
      await apiPage("about-moved", 404); await delivered("about-moved", 404, { absent: [firstText, privateText] });
    });
    await check("restore verified published about before browser acceptance", async () => {
      await save(initial); await publish(); assert.deepEqual((await apiPage("about", 200)).body, initial.body);
      await delivered("about", 200, { present: [firstText], absent: [privateText] });
    });
    await check("unpublish restored about removes company and alias before republishing", async () => {
      await native(`${collection}/${id}/actions/unpublish`, { actor: actors.publisher, method: "POST", body: {} });
      await apiPage("about", 404); await delivered("about", 404, { absent: [firstText, privateText] });
      await publish(); await delivered("about", 200, { present: [firstText], absent: [privateText] });
    });
    if (!httpOnly) await check("seven native CMS and public browser cases", async () => {
      const browserEnv = { ...process.env, E2E_PAGE_CMS_BASE_URL: `${cmsOrigin}/cms`, EDITORIAL_PAGES_BASE_URL: webOrigin, FORCE_COLOR: "0" };
      for (const key of ["PLAYWRIGHT_JSON_OUTPUT_FILE", "PLAYWRIGHT_JSON_OUTPUT_NAME", "PLAYWRIGHT_JSON_OUTPUT_DIR"]) delete browserEnv[key];
      for (const kind of ["editor", "publisher", "denied"]) for (const field of ["email", "password"]) browserEnv[`E2E_PAGE_${kind.toUpperCase()}_${field.toUpperCase()}`] = admins[kind][field];
      // JSON goes through the redactor, never Playwright's direct file reporter.
      browserChild = loggedChild([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.pages.config.js", "--reporter=json"], frontend, browserEnv, "browser-results.json", "browser-stderr.log");
      const result = await new Promise((done, reject) => { browserChild.once("error", reject); browserChild.once("close", (code, signal) => done({ code, signal })); });
      report.browser = { status: "failed", ...result };
      assert.equal(result.signal, null, "Browser child must exit normally"); assert.equal(result.code, 0, "Browser child close must report exit 0");
      const browserReport = JSON.parse(readFileSync(join(evidence, "browser-results.json"), "utf8"));
      assert.equal(browserReport.stats.expected, 7, "All seven selected Page browser cases must pass");
      assert.equal(browserReport.stats.unexpected + browserReport.stats.skipped + browserReport.stats.flaky, 0);
      report.browser = { status: "passed", ...result, expected: browserReport.stats.expected, unexpected: 0, skipped: 0, flaky: 0 };
    });
    if (fastSaveProbe) await check("twelve bounded native Page fast-save probe attempts", async () => {
      const browserEnv = { ...process.env, E2E_PAGE_CMS_BASE_URL: `${cmsOrigin}/cms`, EDITORIAL_PAGES_BASE_URL: webOrigin, FORCE_COLOR: "0", E2E_PAGE_PROBE_EMAIL: admins.probe.email, E2E_PAGE_PROBE_PASSWORD: admins.probe.password };
      for (const key of ["PLAYWRIGHT_JSON_OUTPUT_FILE", "PLAYWRIGHT_JSON_OUTPUT_NAME", "PLAYWRIGHT_JSON_OUTPUT_DIR"]) delete browserEnv[key];
      browserChild = loggedChild([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.page-fast-save.config.js", "--reporter=json"], frontend, browserEnv, "probe-browser-results.json", "probe-browser-stderr.log");
      // Allow 15 seconds for Playwright's 180-second timeout to emit its report.
      // An independent parent deadline also bounds a wedged Playwright process.
      let exceededDeadline = false;
      const deadline = setTimeout(() => { exceededDeadline = true; void stop(browserChild); }, 195000);
      let result;
      try {
        result = await new Promise((done, reject) => { browserChild.once("error", reject); browserChild.once("close", (code, signal) => done({ code, signal })); });
      } finally { clearTimeout(deadline); }
      report.fastSaveProbe = { status: "failed", ...result };
      const browserReport = JSON.parse(readFileSync(join(evidence, "probe-browser-results.json"), "utf8"));
      // The marker arrived inside already-redacted Playwright stdout. Persist
      // only that curated record, applying the same redactor at its final write.
      const probeEvidence = extractPageProbeEvidence(browserReport);
      writeFileSync(join(evidence, "probe-evidence.json"), `${redact(JSON.stringify(probeEvidence, null, 2))}\n`);
      assert.equal(exceededDeadline, false, "Probe browser exceeded its 195-second reporting/cleanup deadline");
      assert.equal(result.signal, null, "Probe browser child must exit normally");
      assert.equal(result.code, 0, "Probe browser child close must report exit 0");
      assertPageProbeAcceptance(browserReport, probeEvidence);
      report.fastSaveProbe = { status: "passed", ...result, expected: 1, unexpected: 0, skipped: 0, flaky: 0, totals: probeEvidence.totals, underDebounceWindow: probeEvidence.underDebounceWindow, fastWindowCovered: probeEvidence.fastWindowCovered };
    });
    if (fastSaveProbe) await check("seven bounded native Page input lifecycle scenarios", async () => {
      const browserEnv = { ...process.env, E2E_PAGE_CMS_BASE_URL: `${cmsOrigin}/cms`, EDITORIAL_PAGES_BASE_URL: webOrigin, FORCE_COLOR: "0", E2E_PAGE_PROBE_EMAIL: admins.probe.email, E2E_PAGE_PROBE_PASSWORD: admins.probe.password };
      for (const key of ["PLAYWRIGHT_JSON_OUTPUT_FILE", "PLAYWRIGHT_JSON_OUTPUT_NAME", "PLAYWRIGHT_JSON_OUTPUT_DIR"]) delete browserEnv[key];
      browserChild = loggedChild([join(frontend, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.page-sync.config.js", "--reporter=json"], frontend, browserEnv, "sync-browser-results.json", "sync-browser-stderr.log");
      // The browser has 150 seconds, plus a bounded reporting/cleanup margin.
      let exceededDeadline = false;
      const deadline = setTimeout(() => { exceededDeadline = true; void stop(browserChild); }, 165000);
      let result;
      try {
        result = await new Promise((done, reject) => { browserChild.once("error", reject); browserChild.once("close", (code, signal) => done({ code, signal })); });
      } finally { clearTimeout(deadline); }
      report.pageInputSync = { status: "failed", ...result };
      const browserReport = JSON.parse(readFileSync(join(evidence, "sync-browser-results.json"), "utf8"));
      const syncEvidence = extractPageSyncEvidence(browserReport);
      writeFileSync(join(evidence, "sync-evidence.json"), `${redact(JSON.stringify(syncEvidence, null, 2))}\n`);
      assert.equal(exceededDeadline, false, "Page lifecycle browser exceeded its 165-second reporting/cleanup deadline");
      assert.equal(result.signal, null);
      assert.equal(result.code, 0);
      assertPageSyncAcceptance(browserReport, syncEvidence);
      report.pageInputSync = { status: "passed", ...result, expected: 1, unexpected: 0, skipped: 0, flaky: 0, totals: syncEvidence.totals };
    });
    await check("stopping actual Strapi produces Next 500 without stale body or fixture fallback", async () => {
      const current = app; app = null; await current.destroy();
      await assert.rejects(() => fetch(`${cmsOrigin}/api/v1/pages/about?locale=ru`, { signal: AbortSignal.timeout(2000) }));
      await delivered("about", 500, { absent: [firstText, privateText] });
    });
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = redact(error.stack || error.message); process.exitCode = 1; }
  finally {
    clearTimeout(watchdog);
    try { await cleanup(); } catch (error) { report.status = "failed"; report.cleanupError = redact(error.message); process.exitCode = 1; }
    saveReport();
    console.log(JSON.stringify({ kind: report.kind, status: report.status, cases: report.cases.length, browser: report.browser, ...(fastSaveProbe ? { fastSaveProbe: report.fastSaveProbe, pageInputSync: report.pageInputSync } : {}), ...(report.error ? { error: report.error } : {}) }));
    output.end(); errors.end();
    process.stdout.write = originalStdout; process.stderr.write = originalStderr;
  }
})();
