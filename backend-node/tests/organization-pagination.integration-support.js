"use strict";

const assert = require("node:assert/strict");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const argon2 = require("argon2");
const { table, DEMO } = require("../src/domain/auth");
const parseExact = text => JSON.parse(text, (_key, value, context) =>
  typeof value === "number" && !Number.isSafeInteger(value) && /^-?\d+$/.test(context.source || "")
    ? JSON.rawJSON(context.source) : value);

async function snapshot(db) {
  const names = await db("information_schema.tables")
    .select("table_name")
    .where({ table_schema: "b2b", table_type: "BASE TABLE" })
    .orderBy("table_name");
  const result = {};
  for (const { table_name: name } of names) {
    result[name] = (await db.raw(
      "SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text), '[]'::jsonb)::text AS value FROM ?? AS x",
      [`b2b.${name}`],
    )).rows[0].value;
  }
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

async function runOrganizationPaginationTests(t, app) {
  const db = app.db.connection;
  const base = `http://127.0.0.1:${app.server.httpServer.address().port}/api/v1`;
  const userId = randomUUID(), emptyUserId = randomUUID();
  const roleId = randomUUID();
  const password = `Aa1!${randomBytes(24).toString("hex")}`;
  const email = `pagination-${userId}@example.test`;
  const emptyEmail = `empty-${emptyUserId}@example.test`;
  const passwordHash = await argon2.hash(password);
  const organizations = Array.from({ length: 107 }, (_, i) => ({
    id: randomUUID(), name: `Fictitious pagination organization ${i}`,
    is_active: i !== 106,
  }));
  const members = organizations.map((org, i) => ({
    id: randomUUID(), user_id: userId, organization_id: org.id,
    role_id: roleId, is_active: i !== 105,
    created_at: new Date("2026-01-01T00:00:00Z"),
  }));
  const expected = members.slice(0, 105).sort((a, b) => a.id.localeCompare(b.id));
  let token, emptyToken;
  async function api(query = "", { bearer = token, expectedStatus = 200, headers = {} } = {}) {
    const response = await fetch(`${base}/organizations${query}`, {
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers },
    });
    assert.equal(response.status, expectedStatus, `Organization query ${query}`);
    const text = await response.text();
    if (expectedStatus === 200) assert.equal(response.headers.get("cache-control"), "private, no-store");
    return { text, body: parseExact(text) };
  }
  async function login(address) {
    const response = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).access_token;
  }
  try {
    await db.transaction(async tx => {
      await table(tx, "users").insert([
        { id: userId, email, display_name: "Fictitious pagination user", password_hash: passwordHash },
        { id: emptyUserId, email: emptyEmail, display_name: "Fictitious empty user", password_hash: passwordHash },
      ]);
      await table(tx, "organizations").insert(organizations);
      // Organization discovery needs no permission grant. This fixture's global
      // empty role is valid across its memberships; a tenant-A role would be a
      // malformed foreign-role relationship in every newly created tenant.
      await table(tx, "roles").insert({ id: roleId, organization_id: null, code: `pagination_${roleId}`, name: "Fictitious membership role", permissions: "[]" });
      await table(tx, "memberships").insert(members);
    });
    token = await login(email);
    emptyToken = await login(emptyEmail);
    const before = await snapshot(db);

    await t.test("organization list restores default50, cap100 and exact six-field membership envelope", async () => {
      const { body } = await api();
      assert.deepEqual(Object.keys(body).sort(), ["items", "page", "page_size", "total"]);
      assert.equal(body.page, 1); assert.equal(body.page_size, 50); assert.equal(body.total, 105);
      assert.deepEqual(body.items.map(row => row.id), expected.slice(0, 50).map(row => row.id));
      for (const row of body.items) {
        assert.deepEqual(Object.keys(row).sort(), ["id", "organization_id", "organization_name", "permissions", "role_id", "role_name"]);
        assert.equal(row.role_id, roleId);
        assert.deepEqual(row.permissions, []);
      }
      const second = (await api("?page=2")).body;
      assert.deepEqual(second.items.map(row => row.id), expected.slice(50, 100).map(row => row.id));
      const capped = (await api("?page_size=9999999999999999999999999")).body;
      assert.equal(capped.page_size, 100); assert.equal(capped.items.length, 100); assert.equal(capped.total, 105);
      const last = (await api("?page=2&page_size=100")).body;
      assert.deepEqual(last.items.map(row => row.id), expected.slice(100).map(row => row.id));
    });

    await t.test("organization raw pagination ignores brackets, takes last scalar and preserves huge page digits", async () => {
      for (const raw of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2", "Page=2"])
        assert.equal((await api(`?${raw}`)).body.page, 1);
      for (const value of ["01", "%2B01.00", "%20%091%20", "0__1", "%C2%A01%E3%80%80"])
        assert.equal((await api(`?page=${value}`)).body.page, 1);
      assert.equal((await api("?page=bad&page=2&page_size=1")).body.items[0].id, expected[1].id);
      assert.equal((await api(`?${"ignored=x&".repeat(1000)}page=2&page_size=1`)).body.items[0].id, expected[1].id);
      const huge = await api("?page=9007199254740993");
      assert.match(huge.text, /"page":9007199254740993(?:,|})/);
      assert.deepEqual(huge.body.items, []); assert.equal(huge.body.total, 105);
      for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "", "1.5", "1e1", "one", "%EF%BB%BF1"]) {
        const invalid = (await api(`?${field}=${value}`, { expectedStatus: 422 })).body;
        assert.equal(invalid.error.code, "validation_error");
        assert.deepEqual(invalid.error.details[0].loc, ["query", field]);
      }
    });

    await t.test("organization pagination keeps own active memberships without selecting a tenant or granting permissions", async () => {
      const ordinary = (await api()).body;
      const injected = (await api(`?user_id=${DEMO.users.admin}&organization_id=${DEMO.organizationA}&permissions=catalog.manage`, {
        headers: { "X-Organization-ID": DEMO.organizationA },
      })).body;
      assert.deepEqual(injected, ordinary);
      assert.deepEqual((await api("", { bearer: emptyToken })).body, { items: [], page: 1, page_size: 50, total: 0 });
      await api("", { bearer: null, expectedStatus: 401 });
      await table(db, "users").where({ id: userId }).update({ is_active: false });
      try { await api("", { expectedStatus: 401 }); }
      finally { await table(db, "users").where({ id: userId }).update({ is_active: true }); }
      assert.equal(await snapshot(db), before, "Organization GETs must leave all business, audit, grant and session rows unchanged");
    });

    await t.test("organization HTTP query results match every frozen pagination reference vector", async () => {
      const reference = parseExact(readFileSync(path.join(__dirname, "reference/legacy-query.json"), "utf8"));
      const vectors = reference.cases.filter(vector => vector.endpoint === "pagination");
      assert.equal(reference.http_targets.some(target => target.path === "/organizations" && target.contracts.includes("pagination")), true);
      assert.ok(vectors.length >= 78);
      for (const vector of vectors) {
        const { body } = await api(vector.query ? `?${vector.query}` : "", { expectedStatus: vector.expected.status });
        if (vector.expected.status === 200) {
          assert.deepEqual({ page: body.page, page_size: body.page_size }, {
            page: vector.expected.body.page, page_size: vector.expected.body.page_size,
          }, vector.id);
          assert.deepEqual(Object.keys(body).sort(), ["items", "page", "page_size", "total"]);
          assert.equal(body.total, 105);
        } else {
          const { request_id: requestId, ...actual } = body.error;
          const { request_id: _referenceId, ...expectedError } = vector.expected.body.error;
          assert.equal(typeof requestId, "string");
          assert.deepEqual(actual, expectedError, vector.id);
        }
      }
      assert.equal(await snapshot(db), before, "Reference queries are read-only");
    });

    await t.test("organization pagination retains the documented foreign-role exclusion without granting access", async () => {
      const member = expected[0];
      await table(db, "memberships").where({ id: member.id }).update({ role_id: DEMO.roles.buyer });
      try {
        const page = (await api()).body;
        assert.equal(page.total, 104);
        assert.equal(page.items.some(row => row.id === member.id), false);
        assert.ok(page.items.every(row => row.permissions.length === 0));
      } finally { await table(db, "memberships").where({ id: member.id }).update({ role_id: roleId }); }
      assert.equal(await snapshot(db), before);
    });
  } finally {
    await db.transaction(async tx => {
      await table(tx, "audit_events").whereIn("actor_user_id", [userId, emptyUserId]).delete();
      await table(tx, "refresh_sessions").whereIn("user_id", [userId, emptyUserId]).delete();
      await table(tx, "memberships").whereIn("user_id", [userId, emptyUserId]).delete();
      await table(tx, "roles").where({ id: roleId }).delete();
      await table(tx, "organizations").whereIn("id", organizations.map(row => row.id)).delete();
      await table(tx, "users").whereIn("id", [userId, emptyUserId]).delete();
    });
  }
}

module.exports = { runOrganizationPaginationTests };
