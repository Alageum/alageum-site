const reviewedRecordCount = require("../data/catalog-release.json").recordCount;
"use strict";
// This module is test-only. No fixture, reset route or clock override enters the app.
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { readFileSync, lstatSync, realpathSync } = require("node:fs");
const { resolve, join, basename } = require("node:path");
const { performance } = require("node:perf_hooks");
const { snapshot, metricShape } = require("./system.integration-support");
const DATABASE = "alageum_strapi_quote_limit_test";
const table = (db, name) => db.withSchema("b2b").table(name);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function validateEnvironment(env = process.env) {
  assert.equal(env.APP_ENV, "test", "Quote throttle fixtures require APP_ENV=test");
  assert.equal(env.ALAGEUM_TEST_QUOTE_LIMIT_FIXTURES, "1", "Quote throttle fixtures require their explicit guard");
  assert.equal(env.ALAGEUM_SEED_DEMO, "0", "Demo seeding must be disabled");
  assert.equal(env.ALAGEUM_IMPORT_CATALOG, "1", "Only the reviewed native catalog import is permitted");
  assert.equal(env.DATABASE_SSL, "false", "Fixture SSL overrides are not permitted");
  for (const name of Object.keys(env).filter(name => name.startsWith("PG") && name !== "PG_BIN"))
    assert.equal(env[name], undefined, "Inherited libpq overrides are not permitted");
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error("Quote throttle fixtures require their explicit disposable PostgreSQL URL"); }
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol) && url.hostname === "127.0.0.1" && url.pathname === `/${DATABASE}` && !url.search && !url.hash && url.username === "alageum_quote_limit_test" && /^\d+$/.test(url.port), "Quote throttle fixtures accept only their exact dedicated loopback database");
  assert.match(url.password, /^[a-f0-9]{64}$/, "A generated ephemeral database password is required");
  const work = resolve(env.E2E_QUOTE_LIMIT_WORK || ".");
  assert.match(basename(work), /^alageum-quote-limit-tests\.[A-Za-z0-9]+$/, "Use the owned quote throttle shell runner");
  assert.match(env.E2E_QUOTE_LIMIT_RUN_TOKEN || "", /^[a-f0-9]{64}$/, "A generated run ownership token is required");
  assert.equal(realpathSync(work), work, "The owned work directory must not be a symlink");
  for (const name of ["owner", "postgres"]) assert.equal(lstatSync(join(work, name)).isSymbolicLink(), false, "Owned files must not be symlinks");
  assert.equal(readFileSync(join(work, "owner"), "utf8").trim(), env.E2E_QUOTE_LIMIT_RUN_TOKEN, "Cluster ownership does not match this run");
  assert.equal(realpathSync(join(work, "postgres")), join(work, "postgres"));
  const pgBin = realpathSync(env.E2E_QUOTE_LIMIT_PG_BIN || ".");
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
    assert.equal(tables.rows.length, 0, "Quote throttle fixtures refuse a reused database");
  } finally { await client.end(); }
}

async function seedFixtures(app) {
  validateEnvironment();
  assert.equal(app.config.get("alageum.env"), "test");
  assert.equal((await app.db.connection.raw("SELECT current_database() AS database")).rows[0].database, DATABASE);
  const orgs = { a: randomUUID(), b: randomUUID() };
  const actors = Object.fromEntries(["owner", "peer", "other", "denied"].map(name => [name, randomUUID()]));
  await app.db.connection.transaction(async tx => {
    for (const name of ["users", "organizations", "roles", "memberships", "refresh_sessions", "audit_events", "quote_requests", "quote_request_items"])
      assert.equal(await table(tx, name).first("id"), undefined, "Quote throttle fixtures refuse existing B2B rows");
    await table(tx, "organizations").insert(Object.entries(orgs).map(([name, id]) => ({ id, name: `Fictitious quote throttle ${name}` })));
    for (const [name, id] of Object.entries(actors)) {
      const organization_id = orgs[name === "other" ? "b" : "a"], role_id = randomUUID();
      await table(tx, "users").insert({ id, email: `${id}@quote-limit.fixture.invalid`, display_name: `Fictitious quote throttle ${name}`, password_hash: "!disabled-token-only-quote-limit-fixture" });
      await table(tx, "roles").insert({ id: role_id, organization_id, code: `quote_limit_${name}`, name: `Fictitious quote throttle ${name}`, permissions: JSON.stringify(name === "denied" ? [] : ["quote.read", "quote.create"]) });
      await table(tx, "memberships").insert({ id: randomUUID(), user_id: id, organization_id, role_id });
    }
  });
  const config = app.config.get("alageum"), now = Math.floor(Date.now() / 1000);
  const tokens = Object.fromEntries(Object.entries(actors).map(([name, id]) => [name, require("jsonwebtoken").sign({ sub: id, type: "access", jti: randomUUID(), iat: now, nbf: now, exp: now + 900 }, config.jwtSecret, { algorithm: "HS256", issuer: config.jwtIssuer, audience: config.jwtAudience })]));
  const products = await app.db.connection("alageum_products").select("transport_id").where({ status: "published" }).orderBy("public_key");
  assert.equal(products.length, reviewedRecordCount, "Use only the reviewed 238-product native catalog");
  // Pinned Strapi upload schedules its initial weekly bookkeeping 15 seconds
  // after fresh startup, even when transmission is disabled. Let that real job
  // settle before the full protected-row baseline; do not reset or stop jobs.
  assert.equal(app.telemetry.isDisabled, true);
  const deadline = performance.now() + 25000;
  while (true) {
    const stored = await app.store.get({ type: "plugin", name: "upload", key: "metrics" });
    if (Number.isFinite(stored?.lastWeeklyUpdate)) break;
    assert.ok(performance.now() < deadline, "Native upload startup bookkeeping did not settle within 25 seconds");
    await new Promise(done => setTimeout(done, 100));
  }
  return { orgs, actors, tokens, product: products[0].transport_id };
}

async function protectedState(db) {
  // Domain identity, grants, sessions, native catalog and structural privileges
  // must not change when exercising the quote route (even on failed requests).
  const rows = {};
  const names = (await db.raw("SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('b2b','public') ORDER BY schemaname, tablename")).rows;
  for (const { schemaname, tablename } of names) {
    if (schemaname === "b2b" && ["quote_requests", "quote_request_items", "audit_events"].includes(tablename)) continue;
    rows[`${schemaname}.${tablename}`] = digest((await db.raw("SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb)::text AS value FROM ?? r", [`${schemaname}.${tablename}`])).rows[0].value);
  }
  const columns = await db("information_schema.columns").select("table_schema", "table_name", "column_name", "ordinal_position", "data_type", "is_nullable", "column_default").whereIn("table_schema", ["b2b", "public"]).orderBy(["table_schema", "table_name", "ordinal_position"]);
  const constraints = (await db.raw("SELECT n.nspname, c.conname, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('b2b','public') ORDER BY n.nspname, c.conname")).rows;
  const grants = (await db.raw("SELECT n.nspname, c.relname, c.relacl::text, c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('b2b','public') ORDER BY n.nspname,c.relname")).rows;
  const schemas = (await db.raw("SELECT nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname IN ('b2b','public') ORDER BY nspname")).rows;
  const indexes = (await db.raw("SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('b2b','public') ORDER BY schemaname,tablename,indexname")).rows;
  return { rows, columns: digest(columns), constraints: digest(constraints), grants: digest(grants), schemas: digest(schemas), indexes: digest(indexes) };
}

function rateError(result, code = "rate_limit_exceeded", message = "Too many requests") {
  assert.equal(result.status, 429);
  assert.deepEqual(result.body, { error: { code, message, details: null, request_id: result.headers["x-request-id"] } });
  if (code === "rate_limit_exceeded") assert.equal(result.headers["cache-control"], "private, no-store");
}

async function verifyQuoteLimit({ app, request, check, fixture, report, progress }) {
  const db = app.db.connection, metrics = app.alageumMetrics, keys = { original: randomUUID(), blocked: randomUUID() };
  const baseline = await protectedState(db), before = await snapshot(db, ["b2b", "public"]);
  const payload = { comment: "Fictitious quote throttle inquiry", items: [{ product_id: fixture.product, quantity: "1.25" }] };
  const headers = (actor = "owner", key = keys.original, extra = {}) => ({ Authorization: `Bearer ${fixture.tokens[actor]}`, "X-Organization-ID": fixture.orgs[actor === "other" ? "b" : "a"], "Idempotency-Key": key, ...extra });
  const quote = (options = {}) => request("/api/v1/quotes/catalog", { method: "POST", body: payload, headers: headers(), ...options });
  const count = async name => Number((await table(db, name).count("* AS total").first()).total);
  let latestAccepted, first;
  await check("Q01 native syntax prototype and byte protections plus unavailable generic POST preserve catalog allowances", async () => {
    for (const raw of ["{", '{"items":', "true false", '{"__proto__":{"quote_limit_polluted":true}}']) assert.equal((await quote({ raw, expected: 422 })).body.error.code, "validation_error");
    assert.equal({}.quote_limit_polluted, undefined);
    assert.equal((await quote({ raw: JSON.stringify("x".repeat(1024 * 1024)), expected: 413 })).body.error.code, "request_too_large");
    const unrelated = await request("/api/v1/catalog/compare", { method: "POST", body: true, expected: 422 });
    assert.equal(unrelated.body.error.message, "Invalid request body", "Other routes retain strict native JSON parsing");
    const doubleSlash = await request("/api/v1/quotes/catalog//", { method: "POST", body: true, expected: 422 });
    assert.equal(doubleSlash.body.error.message, "Invalid request body", "Unsupported double-slash paths retain strict native JSON parsing");
    const unavailable = await request("/api/v1/quotes", { method: "POST", body: payload, headers: headers(), expected: null });
    assert.ok([404, 405].includes(unavailable.status), "Generic quote POST must remain unavailable");
    assert.deepEqual(await snapshot(db, ["b2b", "public"]), before);
  });
  await check("Q02 exactly ten decoded attempts share a socket-IP bucket across errors actors tenants and keys", async () => {
    const decoded = [
      { headers: {}, body: null, expected: 401, code: "authentication_required" },
      { headers: { Authorization: "Bearer deliberately-invalid-fixture" }, expected: 401, code: "invalid_token" },
      { headers: headers("denied"), expected: 403, code: "permission_denied" },
      { body: true, expected: 422, code: "validation_error" },
      { headers: headers("owner", "invalid-key"), expected: 422, code: "validation_error" },
    ];
    for (const item of decoded) assert.equal((await quote(item)).body.error.code, item.code);
    assert.deepEqual(await snapshot(db, ["b2b", "public"]), before);
    first = await quote({ expected: 201 });
    const replay = await quote({ expected: 200 }); assert.deepEqual(replay.body, first.body);
    const peer = await quote({ headers: headers("peer"), expected: 201 });
    const other = await quote({ headers: headers("other"), expected: 201 });
    assert.notEqual(first.body.id, peer.body.id); assert.notEqual(first.body.id, other.body.id);
    const tenth = await quote({ headers: headers("owner", keys.original, { "X-Forwarded-For": "198.51.100.17", Forwarded: 'for="203.0.113.9"' }), expected: 200 });
    latestAccepted = performance.now(); assert.deepEqual(tenth.body, first.body);
    assert.equal(await count("quote_requests"), 3); assert.equal(await count("quote_request_items"), 3); assert.equal(await count("audit_events"), 3);
    assert.deepEqual(await protectedState(db), baseline);
  });
  await check("Q03 concurrent rejected attempts ignore spoofed forwarding auth schema and idempotency with no writes or audit", async () => {
    const unchanged = await snapshot(db, ["b2b", "public"]), metricsBefore = metrics.snapshot();
    const rejected = await Promise.all(Array.from({ length: 8 }, (_, index) => quote({
      headers: index === 0 ? headers("owner", keys.blocked) : index === 1 ? {} : headers(["owner", "peer", "other"][index % 3], randomUUID(), { "X-Forwarded-For": `198.51.100.${index}`, Forwarded: `for=203.0.113.${index}`, "X-Real-IP": `192.0.2.${index}`, "X-Request-ID": `untrusted-quote-id-${index}` }),
      body: index === 1 ? {} : index >= 2 && index <= 5 ? [null, true, 17, "valid decoded scalar"][index - 2] : payload, expected: 429,
    })));
    for (const result of rejected) rateError(result);
    await new Promise(done => setImmediate(done));
    const metricsAfter = metrics.snapshot();
    for (const key of ["http_requests_total", "http_request_duration_seconds_count", "http_errors_total"]) assert.equal((metricsAfter[key] || 0) - (metricsBefore[key] || 0), 8);
    metricShape(metricsAfter); assert.deepEqual(await snapshot(db, ["b2b", "public"]), unchanged);
    // JSON decoding remains ahead of the throttle even after the bucket is full.
    assert.equal((await quote({ raw: "{", expected: 422 })).body.error.code, "validation_error");
    rateError(await quote({ expected: 429 }));
    assert.deepEqual(await snapshot(db, ["b2b", "public"]), unchanged);
  });
  await check("Q04 another real loopback socket IP gets exactly ten allowances under twelve concurrent writes", async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => quote({ localAddress: "127.0.0.2", headers: headers("owner", randomUUID(), { "X-Forwarded-For": "127.0.0.1", Forwarded: "for=127.0.0.1" }), expected: null })));
    assert.equal(responses.filter(result => result.status === 201).length, 10);
    assert.equal(responses.filter(result => result.status === 429).length, 2);
    for (const result of responses.filter(result => result.status === 429)) rateError(result);
    assert.equal(new Set(responses.filter(result => result.status === 201).map(result => result.body.id)).size, 10);
    assert.equal(await count("quote_requests"), 13); assert.equal(await count("quote_request_items"), 13); assert.equal(await count("audit_events"), 13);
  });
  await check("Q05 exhausted quote quota leaves login limiter at its unchanged twenty-call policy", async () => {
    const unchanged = await snapshot(db, ["b2b", "public"]);
    // Tokens are fixture-signed; no login call has used this actual socket IP.
    for (let index = 0; index < 20; index++) assert.equal((await request("/api/v1/auth/login", { method: "POST", body: {}, expected: 422 })).body.error.code, "validation_error");
    rateError(await request("/api/v1/auth/login", { method: "POST", body: {}, expected: 429 }), "rate_limited", "Try again later");
    rateError(await quote({ expected: 429 }));
    assert.deepEqual(await snapshot(db, ["b2b", "public"]), unchanged);
  });
  await check("Q06 the real default sixty-second window expires without resets and blocked creation safely retries", async () => {
    const waitStarted = performance.now();
    progress("HTTP quota, concurrent socket-IP isolation and unchanged login limiter passed; waiting for the real sixty-second quote window.");
    const remaining = Math.max(0, latestAccepted + 60050 - performance.now());
    await new Promise(done => setTimeout(done, remaining));
    assert.ok(performance.now() - latestAccepted >= 60000);
    report.realWindowWaitMs = Math.round(performance.now() - waitStarted);
    report.realWindowElapsedMs = Math.round(performance.now() - latestAccepted);
    const retried = await quote({ headers: headers("owner", keys.blocked), expected: 201 });
    const replay = await quote({ headers: headers("owner", keys.blocked), expected: 200 }); assert.deepEqual(replay.body, retried.body);
    assert.deepEqual((await quote({ expected: 200 })).body, first.body);
    for (let index = 0; index < 7; index++) await quote({ headers: {}, expected: 401 });
    const unchanged = await snapshot(db, ["b2b", "public"]);
    rateError(await quote({ headers: headers("owner", randomUUID()), expected: 429 }));
    assert.deepEqual(await snapshot(db, ["b2b", "public"]), unchanged);
    assert.equal(await count("quote_requests"), 14); assert.equal(await count("quote_request_items"), 14); assert.equal(await count("audit_events"), 14);
  });
  await check("Q07 safe request IDs no-store errors and public metrics cover every live attempt", async () => {
    const beforeScrape = metrics.snapshot();
    const scrape = await request("/api/v1/metrics", { expected: 200 });
    assert.deepEqual(scrape.body, beforeScrape); metricShape(scrape.body);
    assert.equal(metrics.snapshot().http_requests_total, report.httpRequests);
    assert.equal(metrics.snapshot().http_request_duration_seconds_count, report.httpRequests);
    assert.equal(metrics.snapshot().http_errors_total, report.httpErrors);
    assert.equal(report.generatedRequestIds, report.httpRequests);
  });
  await check("Q08 quote writes alone preserve identity sessions permissions native catalog schema and grants", async () => {
    assert.deepEqual(await protectedState(db), baseline);
    assert.equal(await table(db, "audit_events").whereNot({ action: "quote.create" }).first("id"), undefined);
    report.protectedStateFingerprint = digest(baseline);
    report.createdQuotes = 14; report.quoteAuditEvents = 14;
  });
}
verifyQuoteLimit.EXPECTED_CHECKS = 8;
module.exports = { DATABASE, validateEnvironment, requireFreshDatabase, seedFixtures, verifyQuoteLimit };
