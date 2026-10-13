"use strict";
// Disposable fixtures and live HTTP assertions; never imported by application startup.
const assert = require("node:assert/strict");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const { readFileSync, lstatSync, realpathSync } = require("node:fs");
const { resolve, join, basename } = require("node:path");
const DATABASE = "alageum_strapi_system_test";
const METRIC_KEYS = ["http_errors_total", "http_request_duration_seconds_count", "http_request_duration_seconds_sum", "http_requests_total"];
const ROUTES = ["health", "readiness", "metrics", "version"];
const pause = ms => new Promise(done => setTimeout(done, ms));
const table = (db, name) => db.withSchema("b2b").table(name);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function validateEnvironment(env = process.env) {
  assert.equal(env.APP_ENV, "test", "System fixtures require APP_ENV=test");
  assert.equal(env.ALAGEUM_TEST_SYSTEM_FIXTURES, "1", "System fixtures require their explicit test guard");
  assert.equal(env.ALAGEUM_SEED_DEMO, "0", "Demo seeding must be disabled");
  assert.equal(env.ALAGEUM_IMPORT_CATALOG, "0", "Catalog import must be disabled");
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("System fixtures require an explicit disposable PostgreSQL URL"); }
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "127.0.0.1" && url.pathname === `/${DATABASE}` && !url.search && !url.hash && url.username === "alageum_system_test" && /^\d+$/.test(url.port), "System fixtures accept only their exact dedicated loopback database");
  assert.match(url.password, /^[a-f0-9]{64}$/, "A generated ephemeral database password is required");
  const work = resolve(env.E2E_SYSTEM_WORK || ".");
  assert.match(basename(work), /^alageum-system-tests\.[A-Za-z0-9]+$/, "Use the owned system shell runner");
  assert.match(env.E2E_SYSTEM_RUN_TOKEN || "", /^[a-f0-9]{64}$/, "A generated run ownership token is required");
  assert.equal(realpathSync(work), work, "The owned work directory must not be a symlink");
  for (const name of ["owner", "postgres"]) assert.equal(lstatSync(join(work, name)).isSymbolicLink(), false, "Owned files must not be symlinks");
  assert.equal(readFileSync(join(work, "owner"), "utf8").trim(), env.E2E_SYSTEM_RUN_TOKEN, "Cluster ownership does not match this run");
  assert.equal(realpathSync(join(work, "postgres")), join(work, "postgres"));
  const pgBin = realpathSync(env.E2E_SYSTEM_PG_BIN || ".");
  assert.ok(lstatSync(join(pgBin, "pg_ctl")).isFile(), "An explicit PostgreSQL control binary is required");
  return { url, work, pgBin, data: join(work, "postgres") };
}

async function requireFreshDatabase(env = process.env) {
  const owner = validateEnvironment(env);
  const client = new (require("pg").Client)({ connectionString: owner.url.href, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  await client.connect();
  try {
    const actual = (await client.query("SELECT current_database() AS database, current_setting('data_directory') AS directory, host(inet_server_addr()) AS address, inet_server_port() AS port")).rows[0];
    assert.equal(actual.database, DATABASE); assert.equal(actual.directory, owner.data);
    assert.equal(actual.address, "127.0.0.1"); assert.equal(actual.port, Number(owner.url.port));
    const tables = await client.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')");
    assert.equal(tables.rows.length, 0, "System fixtures refuse a reused database");
  } finally { await client.end(); }
}

async function seedFixtures(app) {
  validateEnvironment();
  assert.equal(app.config.get("alageum.env"), "test");
  assert.equal((await app.db.connection.raw("SELECT current_database() AS database")).rows[0].database, DATABASE);
  return app.db.connection.transaction(async tx => {
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions", "audit_events", "orders", "invoices", "quote_requests", "documents", "tickets"])
      assert.equal(await table(tx, name).first("id"), undefined, "System fixtures refuse existing B2B rows");
    const names = ["user", "organization", "role", "membership", "session", "audit", "orderStatus", "order", "invoice", "quote", "documentType", "document", "file", "ticketCategory", "ticketStatus", "ticket"];
    const ids = Object.fromEntries(names.map(name => [name, randomUUID()]));
    const stamp = { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
    await table(tx, "users").insert({ id: ids.user, email: "system-fixture@fixture.invalid", display_name: "Synthetic system fixture", password_hash: "!disabled-system-fixture" });
    await table(tx, "organizations").insert({ id: ids.organization, name: "Synthetic system organization", external_id: "SYSTEM-DISPOSABLE" });
    await table(tx, "roles").insert({ id: ids.role, organization_id: ids.organization, code: "system_fixture", name: "Synthetic read grant", permissions: JSON.stringify(["orders.read"]) });
    await table(tx, "memberships").insert({ id: ids.membership, user_id: ids.user, organization_id: ids.organization, role_id: ids.role });
    await table(tx, "refresh_sessions").insert({ id: ids.session, user_id: ids.user, token_hash: randomBytes(32).toString("hex"), family_id: randomUUID(), expires_at: "2026-01-02T00:00:00Z", revoked_at: "2026-01-01T00:00:00Z" });
    await table(tx, "audit_events").insert({ id: ids.audit, action: "system_fixture", actor_user_id: ids.user, organization_id: ids.organization, event_metadata: JSON.stringify({ synthetic: true }) });
    await table(tx, "order_statuses").insert({ id: ids.orderStatus, code: "system_fixture", label: "Synthetic", sort_order: 1 });
    await table(tx, "orders").insert({ id: ids.order, organization_id: ids.organization, status_id: ids.orderStatus, number: "SYSTEM-ORDER", currency: "KZT", amount: "12.34", ...stamp });
    await table(tx, "order_items").insert({ id: randomUUID(), order_id: ids.order, description: "Synthetic item", quantity: "1.000", unit_price: "12.34", configuration: "{}" });
    await table(tx, "invoices").insert({ id: ids.invoice, organization_id: ids.organization, order_id: ids.order, number: "SYSTEM-INVOICE", amount: "12.34", currency: "KZT", status: "fixture", source: "fixture", ...stamp });
    await table(tx, "quote_requests").insert({ id: ids.quote, organization_id: ids.organization, created_by_id: ids.user, mode: "catalog", idempotency_key: randomUUID(), request_hash: "0".repeat(64) });
    await table(tx, "quote_request_items").insert({ id: randomUUID(), quote_request_id: ids.quote, product_id: randomUUID(), mode: "catalog", parameters: "{}", quantity: "1.000", position: 0, product_snapshot: "{}" });
    await table(tx, "document_types").insert({ id: ids.documentType, code: "system_fixture", name: "Synthetic", is_active: true });
    await table(tx, "documents").insert({ id: ids.document, organization_id: ids.organization, type_id: ids.documentType, title: "Synthetic document", source: "fixture", ...stamp });
    await table(tx, "file_objects").insert({ id: ids.file, organization_id: ids.organization, storage_key: "system-fixture-no-file", original_name: "fixture.txt", content_type: "text/plain", size_bytes: 0, checksum_sha256: "0".repeat(64), storage_backend: "fixture", ...stamp });
    await table(tx, "document_versions").insert({ id: randomUUID(), organization_id: ids.organization, document_id: ids.document, file_id: ids.file, version: 1, ...stamp });
    await table(tx, "ticket_categories").insert({ id: ids.ticketCategory, code: "system_fixture", label: "Synthetic" });
    await table(tx, "ticket_statuses").insert({ id: ids.ticketStatus, code: "system_fixture", label: "Synthetic" });
    await table(tx, "tickets").insert({ id: ids.ticket, organization_id: ids.organization, created_by_id: ids.user, category_id: ids.ticketCategory, status_id: ids.ticketStatus, subject: "Synthetic ticket", ...stamp });
    await table(tx, "ticket_messages").insert({ id: randomUUID(), ticket_id: ids.ticket, author_user_id: ids.user, body: "Synthetic message", source: "fixture", ...stamp });
    return ids;
  });
}

async function snapshot(db, schemas = ["b2b"]) {
  const tables = await db("information_schema.tables").select("table_schema", "table_name").whereIn("table_schema", schemas).where({ table_type: "BASE TABLE" }).orderBy(["table_schema", "table_name"]);
  const rows = {};
  for (const { table_schema: schema, table_name: name } of tables)
    rows[`${schema}.${name}`] = (await db.raw("SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text), '[]'::jsonb)::text AS value FROM ?? AS x", [`${schema}.${name}`])).rows[0].value;
  const columns = await db("information_schema.columns").select("table_schema", "table_name", "column_name", "ordinal_position", "data_type", "is_nullable", "column_default").whereIn("table_schema", schemas).orderBy(["table_schema", "table_name", "ordinal_position"]);
  const constraints = (await db.raw("SELECT n.nspname, c.conname, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname = ANY(?) ORDER BY n.nspname, c.conname", [schemas])).rows;
  return { digest: digest({ rows, columns, constraints }), tables: tables.length };
}

function metricShape(value) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value), Object.keys(value).sort());
  for (const [key, number] of Object.entries(value)) {
    assert.ok(METRIC_KEYS.includes(key), "Only the fixed HTTP metric keys are public");
    assert.ok(typeof number === "number" && Number.isFinite(number) && number >= 0);
    if (key !== "http_request_duration_seconds_sum") assert.ok(Number.isSafeInteger(number));
  }
}
function timestamp(value, before, after) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}000)?Z$/);
  assert.equal(value.includes(".000000Z"), false);
  assert.ok(Date.parse(value) >= before && Date.parse(value) <= after, "Timestamp must be obtained during this request");
}
function dto(name, result, environment = "test") {
  assert.equal(result.status, 200);
  assert.match(result.headers["content-type"], /application\/json/);
  if (name === "metrics") return metricShape(result.body);
  if (name === "version") return assert.deepEqual(result.body, { name: "ALAGEUM API", version: require("../package.json").version, environment });
  assert.deepEqual(Object.keys(result.body).sort(), name === "health" ? ["status", "timestamp"] : ["database", "status", "timestamp"]);
  assert.equal(result.body.status, "ok");
  if (name === "readiness") assert.equal(result.body.database, "ok");
  timestamp(result.body.timestamp, result.before, result.after);
}
function generic(result, sentinels) {
  assert.equal(result.status, 500);
  assert.deepEqual(Object.keys(result.body), ["error"]);
  assert.deepEqual(result.body.error, { code: "internal_error", message: "Request failed", details: null, request_id: result.headers["x-request-id"] });
  for (const value of sentinels) assert.equal(JSON.stringify([result.body, result.headers]).includes(value), false, "A generic failure must not expose injected private data");
}

async function verifySystem({ app, request, check, control, sentinels, report }) {
  const db = app.db.connection, metrics = app.alageumMetrics;
  assert.ok(metrics && typeof metrics.snapshot === "function");
  const baseline = await snapshot(db, ["b2b", "public"]);
  const settle = async () => { await new Promise(done => setImmediate(done)); };
  const count = () => metrics.snapshot().http_requests_total || 0;
  async function exactDelta(work, requests, errors = 0) {
    const before = metrics.snapshot(); await work(); await settle(); const after = metrics.snapshot();
    assert.equal((after.http_requests_total || 0) - (before.http_requests_total || 0), requests);
    assert.equal((after.http_request_duration_seconds_count || 0) - (before.http_request_duration_seconds_count || 0), requests);
    assert.equal((after.http_errors_total || 0) - (before.http_errors_total || 0), errors);
    assert.ok((after.http_request_duration_seconds_sum || 0) >= (before.http_request_duration_seconds_sum || 0));
  }
  await check("S14 first live metrics scrape is empty and counts only after its snapshot", async () => {
    assert.deepEqual(metrics.snapshot(), {});
    const first = await request("/api/v1/metrics"); dto("metrics", first); assert.deepEqual(first.body, {});
    await settle(); assert.equal(count(), 1); assert.equal(metrics.snapshot().http_request_duration_seconds_count, 1);
    assert.equal(Object.hasOwn(metrics.snapshot(), "http_errors_total"), false);
  });
  await check("S02 anonymous reads have exact DTOs and no wrappers", async () => {
    for (const name of ROUTES) dto(name, await request(`/api/v1/${name}`));
  });
  await check("S03 bogus auth organization and repeated unknown query inputs do not affect system reads", async () => {
    for (const name of ROUTES) {
      const result = await request(`/api/v1/${name}?tenant=${sentinels[0]}&page=bad&page=2&unknown=${sentinels[1]}`, { headers: { Authorization: `Bearer ${sentinels[2]}`, "X-Organization-ID": sentinels[3] } });
      dto(name, result);
      for (const value of sentinels) assert.equal(JSON.stringify(result.body).includes(value), false);
    }
  });
  await check("S04 health metrics and version never access the database", async () => {
    const raw = db.client.raw; let calls = 0;
    db.client.raw = () => { calls++; throw new Error("Unexpected database access from a process-only read"); };
    try { for (const name of ["health", "metrics", "version"]) dto(name, await request(`/api/v1/${name}`)); }
    finally { db.client.raw = raw; }
    assert.equal(calls, 0);
  });
  await check("S05 readiness executes one SELECT 1 and timestamps only after the awaited ping", async () => {
    const raw = db.client.raw; let release, entered, calls = 0, finished = false;
    const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
    db.client.raw = async function (sql, ...args) { assert.equal(sql, "SELECT 1"); calls++; entered(); await barrier; return raw.call(this, sql, ...args); };
    const pending = request("/api/v1/readiness").then(value => { finished = true; return value; });
    try {
      await Promise.race([ready, pause(5000).then(() => { throw new Error("Readiness did not acquire its query"); })]);
      await pause(30); assert.equal(finished, false); const released = Date.now(); release();
      const result = await pending; dto("readiness", result); assert.ok(Date.parse(result.body.timestamp) >= released); assert.equal(calls, 1);
    } finally { release(); await pending.catch(() => {}); db.client.raw = raw; }
  });
  await check("S06 finalized readiness exceptions are generic safe counted 500s", async () => {
    const raw = db.client.raw;
    db.client.raw = () => { throw new Error(sentinels.join(" ")); };
    try { await exactDelta(async () => generic(await request("/api/v1/readiness", { expected: 500 }), sentinels), 1, 1); }
    finally { db.client.raw = raw; }
  });
  await check("S08 health timestamps are fresh across consecutive live requests", async () => {
    const first = await request("/api/v1/health"); await pause(5); const second = await request("/api/v1/health");
    dto("health", first); dto("health", second); assert.ok(Date.parse(second.body.timestamp) > Date.parse(first.body.timestamp));
  });
  await check("S10 fixed public version ignores malicious metadata and NODE_ENV production", async () => {
    assert.equal(process.env.NODE_ENV, "production"); dto("version", await request("/api/v1/version"));
    assert.ok(sentinels.includes(process.env.APP_NAME)); assert.ok(sentinels.includes(process.env.APP_VERSION));
  });
  await check("S12 generated request IDs and no-store persist for every input and safe errors", async () => {
    const ids = new Set();
    for (const input of [undefined, "", "x", "x".repeat(128), "x".repeat(129), "unsafe id <>" ]) for (const name of ROUTES) {
      const result = await request(`/api/v1/${name}`, { headers: input === undefined ? {} : { "X-Request-ID": input } });
      assert.match(result.headers["x-request-id"], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.notEqual(result.headers["x-request-id"], input); assert.equal(ids.has(result.headers["x-request-id"]), false); ids.add(result.headers["x-request-id"]);
      assert.match(result.headers["cache-control"], /no-store/); dto(name, result);
    }
  });
  await check("S13 system responses reveal no private sentinel credentials or fixture identifiers", async () => {
    for (const name of ROUTES) {
      const result = await request(`/api/v1/${name}`);
      for (const value of sentinels) assert.equal(JSON.stringify([result.body, result.headers]).includes(value), false);
    }
  });
  await check("S16 repeat scrapes are cumulative detached snapshots and never reset", async () => {
    const before = metrics.snapshot(), duplicate = metrics.snapshot(); assert.deepEqual(duplicate, before);
    duplicate.http_requests_total = -100; assert.deepEqual(metrics.snapshot(), before);
    const first = await request("/api/v1/metrics"), second = await request("/api/v1/metrics");
    assert.equal(first.body.http_requests_total, before.http_requests_total); assert.equal(second.body.http_requests_total, before.http_requests_total + 1);
    assert.equal(count(), before.http_requests_total + 2);
  });
  await check("S18 handled 4xx unknown routes and final 500s increment once each", async () => {
    await exactDelta(async () => { await request("/api/v1/organizations/members", { expected: 401 }); await request("/api/v1/unknown-system-path", { expected: 404 }); }, 2, 2);
  });
  await check("S19 high cardinality request inputs cannot create or label metric keys", async () => {
    await exactDelta(async () => {
      for (let index = 0; index < 12; index++) await request(`/api/v1/${sentinels[0]}-${index}?tenant=${sentinels[1]}`, { expected: 404, headers: { Authorization: sentinels[2], "X-Organization-ID": sentinels[3] } });
    }, 12, 12);
    metricShape(metrics.snapshot()); for (const value of sentinels) assert.equal(JSON.stringify(metrics.snapshot()).includes(value), false);
  });
  await check("S20 native CMS admin plugins assets uploads and health are excluded", async () => {
    const before = metrics.snapshot();
    for (const path of ["/_health", "/cms", "/admin", "/admin/init", "/alageum-catalog/system-fixture", "/uploads/system-fixture.png", "/favicon.ico", "/api/v10/health"])
      await request(path, { expected: null, json: false });
    await settle(); assert.deepEqual(metrics.snapshot(), before);
  });
  await check("S21 concurrent live reads and scrapes have exact quiescent totals", async () => {
    await exactDelta(async () => {
      await Promise.all(Array.from({ length: 40 }, (_, index) => request(`/api/v1/${index % 4 === 0 ? "metrics" : index % 4 === 1 ? "version" : index % 4 === 2 ? "readiness" : "health"}`).then(result => { if (index % 4 === 0) metricShape(result.body); })));
    }, 40);
  });
  await check("S23 unimplemented AI file and integration metrics remain absent", async () => {
    const result = await request("/api/v1/metrics"); metricShape(result.body);
    assert.equal(Object.keys(result.body).some(key => /^(ai_|file_|integration_)/.test(key)), false);
  });
  await check("S25 no system writes resets or additional reset routes are exposed", async () => {
    for (const name of ROUTES) for (const method of ["POST", "PUT", "PATCH", "DELETE"]) await request(`/api/v1/${name}`, { method, expected: 405 });
    for (const path of ["/metrics/reset", "/metrics/clear", "/system/reset", "/version/config", "/health/reset"]) {
      await request(`/api/v1${path}`, { expected: 404 }); await request(`/api/v1${path}`, { method: "POST", expected: 405 });
    }
    const behaviors = [];
    for (const [method, path] of [["HEAD", "/api/v1/health"], ["OPTIONS", "/api/v1/metrics"], ["GET", "/API/v1/health"], ["GET", "/api/v1/health/"]]) {
      const result = await request(path, { method, expected: null, json: false }); behaviors.push({ method, path, status: result.status });
    }
    report.frameworkRouteBehavior = behaviors;
  });
  await check("S07 live PostgreSQL outage preserves process reads returns safe 500 and recovers", async () => {
    const before = metrics.snapshot(); let restored = false;
    try {
      control("stop"); report.outage = { stopped: true, restored: false };
      for (const name of ["health", "metrics", "version"]) dto(name, await request(`/api/v1/${name}`));
      const failed = await request("/api/v1/readiness", { expected: 500, timeout: 75000 }); generic(failed, sentinels);
      assert.match(failed.headers["cache-control"], /no-store/);
      report.outage.readinessStatus = failed.status; report.outage.failureWaitMilliseconds = failed.after - failed.before;
      assert.equal(count() - before.http_requests_total, 4);
      assert.equal(metrics.snapshot().http_errors_total - before.http_errors_total, 1);
    } finally {
      control("start"); restored = true; if (report.outage) report.outage.restored = restored;
    }
    const recovered = await request("/api/v1/readiness", { timeout: 75000 }); dto("readiness", recovered); report.outage.recoveryStatus = recovered.status;
  });
  await check("S24 every business identity session audit grant row and schema stays unchanged", async () => {
    assert.deepEqual(await snapshot(db, ["b2b", "public"]), baseline);
    report.readOnlyFingerprint = baseline;
  });
}
verifySystem.EXPECTED_CHECKS = 19;
module.exports = { DATABASE, METRIC_KEYS, validateEnvironment, requireFreshDatabase, seedFixtures, snapshot, metricShape, dto, verifySystem };
