"use strict";

// Invoked by the real Strapi HTTP harness, only against its disposable database.
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const { table } = require("../src/domain/auth");
const { PRODUCT, CATEGORY } = require("../src/domain/catalog");

async function readState(db) {
  const relations = (await db.raw("SELECT tablename FROM pg_tables WHERE schemaname='b2b' ORDER BY tablename")).rows;
  const result = {};
  // Text casting preserves exact decimals/JSON numbers through Strapi's pg parsers.
  for (const name of relations.map(row => `b2b.${row.tablename}`).concat([PRODUCT, CATEGORY]))
    result[name] = (await db.raw("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), '[]'::jsonb)::text AS value FROM ?? r", [name])).rows[0].value;
  // Failure output must never dump password hashes or session token hashes.
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

module.exports = async function verifyRfqRead({ app, base, t }) {
  assert.equal(app.config.get("alageum.env"), "test");
  const db = app.db.connection;
  assert.match((await db.raw("SELECT current_database() AS name")).rows[0].name, /^alageum_strapi(?:_|$)/);
  const orgs = { a: randomUUID(), b: randomUUID(), empty: randomUUID() };
  const roles = { a: randomUUID(), b: randomUUID(), empty: randomUUID(), global: randomUUID(), denied: randomUUID() };
  const users = Object.fromEntries(["owner", "peer", "other", "multi", "global", "denied", "empty", "inactive", "former"].map(name => [name, randomUUID()]));
  const memberships = [];
  const quoteRows = [], itemRows = [];
  await db.transaction(async tx => {
    await table(tx, "organizations").insert(Object.entries(orgs).map(([key, id]) => ({ id, name: `Fictitious RFQ read ${key}` })));
    await table(tx, "roles").insert(Object.entries(roles).map(([key, id]) => ({
      id, organization_id: key === "global" ? null : orgs[key === "denied" ? "a" : key],
      code: key === "denied" ? "admin" : `rfq_read_${key}_${id}`, name: `Fictitious RFQ ${key}`,
      permissions: JSON.stringify(key === "denied" ? [] : ["quote.read"]),
    })));
    await table(tx, "users").insert(Object.entries(users).map(([key, id]) => ({
      id, email: `${id}@rfq-read.fixture.invalid`, display_name: `Fictitious RFQ ${key}`,
      password_hash: "Fictitious token-only read fixture, no login credential", is_active: key !== "inactive",
    })));
    for (const [key, id] of Object.entries(users)) {
      const destinations = key === "multi" ? ["a", "b"] : [key === "other" || key === "former" ? "b" : key === "empty" ? "empty" : "a"];
      for (const destination of destinations) memberships.push({
        id: randomUUID(), user_id: id, organization_id: orgs[destination],
        role_id: roles[key === "global" || key === "denied" ? key : destination],
      });
    }
    await table(tx, "memberships").insert(memberships);
    for (let index = 0; index < 66; index++) {
      const organization = index < 63 ? "a" : "b";
      const creator = index < 60 ? (index % 2 ? "peer" : "owner") : ["inactive", "former", "multi", "other", "other", "multi"][index - 60];
      const date = index < 10 ? "2026-03-01T12:00:00.123Z" : "2026-01-01T00:00:00.000Z";
      const quote = {
        id: randomUUID(), organization_id: orgs[organization], created_by_id: users[creator], mode: "catalog",
        status: "submitted", comment: index === 2 ? null : index === 4 ? "" : `Fictitious saved ${creator} comment ${index}`,
        idempotency_key: randomUUID(), request_hash: "f".repeat(64), created_at: date, updated_at: date,
      };
      quoteRows.push(quote);
      const itemCount = index === 0 ? 2 : index % 4;
      for (let position = 0; position < itemCount; position++) itemRows.push({
        id: randomUUID(), quote_request_id: quote.id, product_id: randomUUID(), position, mode: "catalog", parameters: "{}",
        quantity: index === 0 && position === 0 ? "999999999999999.999" : "2.500",
        product_snapshot: JSON.stringify(position === 0 ? {} : { sku: "Persisted historical SKU", translations: { en: { name: "Saved partial snapshot" } } }),
      });
    }
    await table(tx, "quote_requests").insert(quoteRows);
    await table(tx, "quote_request_items").insert(itemRows);
  });
  // These are source-defined catalog fixtures, including historical snapshot
  // shapes for read fallback coverage. Their explicit mode is not a data import.
  // Nullable legacy IDs, duplicate positions and
  // other incompatible legacy storage shapes are deliberately not fabricated.
  const config = app.config.get("alageum"), now = Math.floor(Date.now() / 1000);
  const tokens = Object.fromEntries(Object.entries(users).map(([key, id]) => [key, jwt.sign({
    sub: id, type: "access", jti: randomUUID(), iat: now, nbf: now, exp: now + 900,
  }, config.jwtSecret, { algorithm: "HS256", issuer: config.jwtIssuer, audience: config.jwtAudience })]));
  async function api(path = "/quotes", { actor = "owner", organization = "a", status = 200, token, raw = false } = {}) {
    const headers = {};
    if (actor !== null || token) headers.Authorization = `Bearer ${token || tokens[actor]}`;
    if (organization !== null) headers["X-Organization-ID"] = orgs[organization] || organization;
    const response = await fetch(`${base}${path}`, { headers });
    const text = await response.text();
    assert.equal(response.status, status, `${path}: ${text}`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = JSON.parse(text);
    if (status >= 400) {
      assert.equal(typeof body.error.request_id, "string");
      assert.equal(body.items, undefined);
      assert.equal(body.item_count, undefined);
    }
    return raw ? text : body;
  }
  const expectedRows = (organization = "a", actor = null) => quoteRows
    .filter(row => row.organization_id === orgs[organization] && (!actor || row.created_by_id === users[actor]))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  const expectedSummary = row => ({
    id: row.id, status: row.status, comment: row.comment,
    item_count: itemRows.filter(item => item.quote_request_id === row.id).length,
    created_at: row.created_at,
  });
  const list = (query = "", options = {}) => api(`/quotes${query ? `?${query}` : ""}`, options);
  const initial = await readState(db);

  await t.test("RFQ real HTTP results match every frozen pagination/boolean query reference vector", async () => {
    const reference = JSON.parse(readFileSync(path.join(__dirname, "reference/legacy-query.json"), "utf8"), (_key, value, context) =>
      typeof value === "number" && !Number.isSafeInteger(value) ? JSON.rawJSON(context.source) : value);
    for (const vector of reference.cases.filter(item => ["pagination", "quotes"].includes(item.endpoint))) {
      const wire = await list(vector.query, { status: vector.expected.status, raw: true });
      if (vector.expected.status !== 200) {
        const result = JSON.parse(wire);
        result.error.request_id = null;
        assert.deepEqual(result, vector.expected.body, vector.id);
        continue;
      }
      const expected = vector.expected.body, result = JSON.parse(wire);
      assert.ok(wire.includes(`"page":${JSON.stringify(expected.page)},`), vector.id);
      assert.equal(result.page_size, expected.page_size, vector.id);
      assert.deepEqual(Object.keys(result).sort(), ["items", "page", "page_size", "total"], vector.id);
      const all = expectedRows("a", expected.mine ? "owner" : null).map(expectedSummary);
      const offset = BigInt(expected.offset);
      assert.equal(result.total, all.length, vector.id);
      assert.deepEqual(result.items, offset >= BigInt(all.length) ? [] : all.slice(Number(offset), Number(offset) + expected.page_size), vector.id);
    }
  });

  await t.test("RFQ raw HTTP default/false intentionally includes exact same-tenant peer comments and 50-row pages", async () => {
    const all = expectedRows();
    const expected = { items: all.slice(0, 50).map(expectedSummary), page: 1, page_size: 50, total: 63 };
    for (const options of [{}, { actor: "peer" }, { actor: "global" }]) assert.deepEqual(await list("", options), expected);
    assert.deepEqual(await list("mine=false"), expected);
    assert.ok(expected.items.some(row => row.comment?.includes("peer")));
    assert.deepEqual(await list("page=2"), { items: all.slice(50).map(expectedSummary), page: 2, page_size: 50, total: 63 });
    assert.deepEqual(await list("mine=true"), { items: expectedRows("a", "owner").map(expectedSummary), page: 1, page_size: 50, total: 30 });
    assert.deepEqual(await list("mine=true&page_size=20"), { items: expectedRows("a", "owner").slice(0, 20).map(expectedSummary), page: 1, page_size: 20, total: 30 });
    assert.deepEqual(await list("", { actor: "empty", organization: "empty" }), { items: [], page: 1, page_size: 50, total: 0 });
    for (const mine of ["", "mine=false", "mine=true"])
      assert.deepEqual((await list(mine, { actor: "multi", organization: "b" })).items, expectedRows("b", mine === "mine=true" ? "multi" : null).map(expectedSummary));
    for (const row of (await list("page_size=100")).items)
      assert.deepEqual(Object.keys(row).sort(), ["comment", "created_at", "id", "item_count", "status"]);
  });

  await t.test("RFQ raw HTTP boolean aliases, duplicates, unknown/bracket keys and 1000-key parser boundary", async () => {
    const both = (await list()).items, mine = (await list("mine=true")).items;
    for (const value of ["true", "TRUE", "TrUe", "t", "T", "y", "Y", "yes", "Yes", "on", "ON", "1"])
      assert.deepEqual((await list(`mine=${value}`)).items, mine);
    for (const value of ["false", "FALSE", "FaLsE", "f", "F", "n", "N", "no", "No", "off", "OFF", "0"])
      assert.deepEqual((await list(`mine=${value}`)).items, both);
    for (const raw of ["mine=false&mine=true", "mine=invalid&mine=YES", "mine=true&mine=true", "m%69ne=TrUe", "mine=true&mine[]=false", "mine=true&mine[x]=false", `${"ignored=x&".repeat(1001)}mine=true`])
      assert.deepEqual((await list(raw)).items, mine);
    for (const raw of ["mine=true&mine=false", "mine=invalid&mine=0", "mine=%66alse", "Mine=true", "MINE=true", "mine.foo=true", "mine[]=true", "mine[0]=true", "mine[x]=true", "mine%5B%5D=true", "mine[]=true&mine=false"])
      assert.deepEqual((await list(raw)).items, both);
    assert.deepEqual((await list(`organization_id=${orgs.b}&created_by_id=${users.peer}&owner=${users.peer}&role=admin&mine=true`)).items, mine);
    for (const raw of ["mine", "mine=", "mine=null", "mine=undefined", "mine=2", "mine=01", "mine=1.0", "mine=[]", "mine=%20true", "mine=true%20", "mine=+true", "mine=%0Atrue", "mine=tr%00ue", "mine=true&mine=invalid", "mine=false&mine="]) {
      const result = await list(raw, { status: 422 });
      assert.equal(result.error.code, "validation_error");
      assert.equal(result.error.message, "Invalid request");
      assert.deepEqual(result.error.details, [{ type: "bool_parsing", loc: ["query", "mine"], msg: "Input should be a valid boolean, unable to interpret input", input: new URLSearchParams(raw).getAll("mine").at(-1) }]);
    }
  });

  await t.test("RFQ pagination clamps 100, ignores bracket keys, keeps exact huge pages and exposes no offset", async () => {
    const all = expectedRows().map(expectedSummary);
    for (const query of ["page=%2B01.00&page_size=101", "page=0__1&page_size=999", "page=%C2%A01%E3%80%80&page_size=99999999999999999999999"])
      assert.deepEqual(await list(query), { items: all, page: 1, page_size: 100, total: 63 });
    for (const query of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2", "page_size[]=1"])
      assert.deepEqual(await list(query), { items: all.slice(0, 50), page: 1, page_size: 50, total: 63 });
    for (const query of ["page=bad&page=2&page_size=1", `${"ignored=x&".repeat(1001)}page=2&page_size=1`])
      assert.deepEqual(await list(query), { items: [all[1]], page: 2, page_size: 1, total: 63 });
    assert.deepEqual(await list("page=1_000"), { items: [], page: 1000, page_size: 50, total: 63 });
    for (const page of ["9007199254740993", "18446744073709551616"]) {
      const wire = await list(`page=${page}`, { raw: true });
      assert.ok(wire.includes(`"page":${page}`));
      assert.deepEqual(JSON.parse(wire).items, []);
      assert.equal(JSON.parse(wire).total, 63);
      assert.deepEqual(Object.keys(JSON.parse(wire)).sort(), ["items", "page", "page_size", "total"]);
    }
    for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "1.5", "1e1", "", "text"])
      assert.equal((await list(`${field}=${value}`, { status: 422 })).error.code, "validation_error");
    const error = (await list("page=0&page_size=text&mine=invalid", { status: 422 })).error;
    assert.deepEqual(error.details.map(item => item.loc), [["query", "page"], ["query", "page_size"], ["query", "mine"]]);
  });

  await t.test("RFQ detail stays owner/tenant scoped and preserves ordered saved snapshots without live catalog", async () => {
    const own = quoteRows[0], peer = quoteRows[1], foreign = quoteRows[63];
    const detail = await api(`/quotes/${own.id}`);
    assert.deepEqual(Object.keys(detail).sort(), ["comment", "created_at", "id", "item_count", "items", "status"]);
    assert.deepEqual(detail.items, itemRows.filter(item => item.quote_request_id === own.id).sort((a, b) => a.position - b.position).map(item => ({
      id: item.id, product_id: item.product_id, quantity: item.quantity, product_snapshot: JSON.parse(item.product_snapshot),
    })));
    for (const [id, options] of [[peer.id, {}], [own.id, { actor: "peer" }], [own.id, { actor: "other", organization: "b" }], [foreign.id, {}], [randomUUID(), {}]])
      assert.equal((await api(`/quotes/${id}`, { ...options, status: 404 })).error.code, "quote_not_found");
    assert.deepEqual(detail.items[0].product_snapshot, {});
    const ownBefore = detail;
    assert.deepEqual(await api(`/quotes/${own.id}`), ownBefore);
    assert.equal((await list("page_size=100")).items.some(row => row.id === quoteRows[60].id), true);
    assert.equal((await list("page_size=100")).items.some(row => row.id === quoteRows[61].id), true);
  });

  await t.test("RFQ authority denies native identities, denied roles, inactive callers and unselected/foreign tenants", async () => {
    for (const path of ["/quotes", `/quotes/${quoteRows[0].id}`]) {
      assert.equal((await api(path, { actor: null, status: 401 })).error.code, "authentication_required");
      assert.equal((await api(path, { token: "malformed", status: 401 })).error.code, "invalid_token");
      assert.equal((await api(path, { actor: "inactive", status: 401 })).error.code, "authentication_required");
      assert.equal((await api(path, { actor: "denied", status: 403 })).error.code, "permission_denied");
      assert.equal((await api(path, { actor: "owner", organization: "b", status: 403 })).error.code, "organization_access_denied");
      assert.equal((await api(path, { actor: "global", organization: "b", status: 403 })).error.code, "organization_access_denied");
      assert.equal((await api(path, { actor: "multi", organization: null, status: 400 })).error.code, "organization_required");
      assert.equal((await api(path, { organization: "malformed", status: 422 })).error.code, "validation_error");
      const native = jwt.sign({ id: 1, type: "access" }, app.config.get("admin.auth.secret"), { expiresIn: "15m" });
      await api(path, { token: native, status: 401 });
    }
  });

  await t.test("RFQ current authority revocation fails on subsequent HTTP list and detail requests", async () => {
    const member = memberships.find(row => row.user_id === users.owner);
    for (const [name, id, patch, restore, status, code] of [
      ["users", users.owner, { is_active: false }, { is_active: true }, 401, "authentication_required"],
      ["memberships", member.id, { is_active: false }, { is_active: true }, 403, "organization_access_denied"],
      ["organizations", orgs.a, { is_active: false }, { is_active: true }, 403, "organization_access_denied"],
      ["roles", roles.a, { permissions: "[]" }, { permissions: '["quote.read"]' }, 403, "permission_denied"],
      ["roles", roles.a, { permissions: '{"quote.read":true}' }, { permissions: '["quote.read"]' }, 403, "permission_denied"],
      ["roles", roles.a, { organization_id: orgs.b }, { organization_id: orgs.a }, 403, "organization_access_denied"],
    ]) {
      await table(db, name).where({ id }).update(patch);
      try { for (const path of ["/quotes", `/quotes/${quoteRows[0].id}`]) assert.equal((await api(path, { status })).error.code, code); }
      finally { await table(db, name).where({ id }).update(restore); }
    }
  });

  await t.test("RFQ summary counts stored malformed snapshots; own detail fails without repair or partial output", async () => {
    const item = itemRows[0];
    for (const malformed of ["null", "[]", '"saved scalar"', "123"]) {
      await table(db, "quote_request_items").where({ id: item.id }).update({ product_snapshot: malformed });
      try {
        const before = await readState(db);
        const result = await list("page_size=100");
        assert.deepEqual(result.items.find(row => row.id === quoteRows[0].id), expectedSummary(quoteRows[0]));
        const error = await api(`/quotes/${quoteRows[0].id}`, { status: 500 });
        assert.equal(error.error.code, "internal_error");
        assert.deepEqual(await readState(db), before);
      } finally { await table(db, "quote_request_items").where({ id: item.id }).update({ product_snapshot: item.product_snapshot }); }
    }
    // Infinity is representable in timestamptz but is not a valid summary DTO.
    await table(db, "quote_requests").where({ id: quoteRows[0].id }).update({ created_at: "infinity" });
    try {
      const before = await readState(db);
      assert.equal((await list("", { status: 500 })).error.code, "internal_error");
      await api(`/quotes/${quoteRows[0].id}`, { status: 500 });
      assert.deepEqual(await readState(db), before);
      await list("", { actor: "other", organization: "b" });
    } finally { await table(db, "quote_requests").where({ id: quoteRows[0].id }).update({ created_at: quoteRows[0].created_at }); }
  });

  await t.test("RFQ success, denied, malformed, empty and far reads never write business data, grants, sessions or audits", async () => {
    assert.deepEqual(await readState(db), initial);
    await db.raw("CREATE FUNCTION b2b.reject_fixture_rfq_read_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious unavailable audit insert'; END $$");
    await db.raw("CREATE TRIGGER reject_fixture_rfq_read_audit BEFORE INSERT ON b2b.audit_events FOR EACH ROW EXECUTE FUNCTION b2b.reject_fixture_rfq_read_audit()");
    try {
      await list(); await list("mine=true"); await api(`/quotes/${quoteRows[0].id}`);
      await api(`/quotes/${quoteRows[1].id}`, { status: 404 });
      await list("", { actor: "denied", status: 403 }); await list("mine=invalid", { status: 422 });
      await list("page=9999999999999999999999999"); await list("", { actor: "empty", organization: "empty" });
    } finally {
      await db.raw("DROP TRIGGER reject_fixture_rfq_read_audit ON b2b.audit_events");
      await db.raw("DROP FUNCTION b2b.reject_fixture_rfq_read_audit()");
    }
    assert.deepEqual(await readState(db), initial);
  });
};
