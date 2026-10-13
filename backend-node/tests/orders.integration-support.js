"use strict";
// Only the isolated orders runner invokes these real HTTP/PostgreSQL checks.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { table } = require("../src/domain/auth");
const { audit } = require("../src/domain/audit");
const { createOrders, ensureSchema, READ } = require("../src/domain/orders");
const fixtures = require("../scripts/seed-test-orders-users");
const code = value => error => error.code === value;
const pause = ms => new Promise(done => setTimeout(done, ms));
function request(actor, organization, id) {
  const headers = { authorization: `Bearer ${actor.access_token}`, "x-organization-id": organization || "" };
  return { request: {}, query: {}, params: { id }, state: {}, get: name => headers[name.toLowerCase()] || "", set() {} };
}
module.exports = async function verifyOrders({ app, api, check, manifest, password, rememberSecret }) {
  const db = app.db.connection, a = manifest.organizations.a.id, b = manifest.organizations.b.id, c = manifest.organizations.c.id;
  const ids = manifest.orders, actors = {}, initialRoles = await table(db, "roles").orderBy("id");
  const countAudit = async () => Number((await table(db, "audit_events").where({ action: "order.view" }).count("* AS count").first()).count);
  const snapshot = async () => (await db.raw("SELECT jsonb_build_object('statuses',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM b2b.order_statuses s),'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM b2b.orders o),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM b2b.order_items i))::text AS value")).rows[0].value;
  const initialRows = await snapshot();
  const list = (kind = "reader", organization = a, suffix = "", expected = 200) => api(`/orders${suffix}`, { actor: actors[kind], organization, expected });
  const detail = (id = ids.precise, kind = "reader", organization = a, expected = 200) => api(`/orders/${id}`, { actor: actors[kind], organization, expected });
  await check("repeat schema bootstrap preserves isolated order snapshots and fixture grants", async () => {
    await ensureSchema(db); await ensureSchema(db);
    assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    for (const name of ["orders", "order_items", "order_statuses"]) assert.equal(await db.schema.withSchema("public").hasTable(name), false);
    assert.equal(await snapshot(), initialRows); assert.equal(await countAudit(), 0);
  });
  await check("real logins retain only order.read fixture permissions", async () => {
    for (const kind of Object.keys(fixtures.EMAILS)) {
      actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password } });
      rememberSecret(actors[kind].access_token); rememberSecret(actors[kind].refresh_token);
      const organization = kind === "other" ? b : kind === "empty" ? c : a;
      assert.deepEqual((await api("/auth/me", { actor: actors[kind], organization })).permissions, kind === "denied" ? [] : [READ]);
    }
  });
  await check("list DTO preserves exact decimal strings, nulls, multi-items and empty items", async () => {
    const result = await list();
    assert.deepEqual(Object.keys(result).sort(), ["items", "page", "page_size", "total"]);
    assert.deepEqual([result.page, result.page_size, result.total], [1, 50, 3]);
    assert.deepEqual(result.items.map(item => item.id), [ids.newest, ids.precise, ids.empty]);
    for (const item of result.items) {
      assert.deepEqual(Object.keys(item).sort(), ["amount", "currency", "external_id", "id", "items", "number", "status"]);
      for (const line of item.items) assert.deepEqual(Object.keys(line).sort(), ["configuration", "description", "id", "quantity", "unit_price"]);
    }
    const precise = result.items[1], nullLine = precise.items.find(item => item.unit_price === null), largeLine = precise.items.find(item => item.unit_price !== null);
    assert.equal(precise.amount, "9999999999999999.99"); assert.equal(precise.external_id, "DISPOSABLE-ORDER-001");
    assert.equal(largeLine.quantity, "999999999999999.999"); assert.equal(largeLine.unit_price, "9999999999999999.99");
    assert.equal(nullLine.quantity, "0.001"); assert.deepEqual(nullLine.configuration, { nullable: null, list: [null, { enabled: false }] });
    assert.deepEqual(result.items[2].items, []); assert.equal(result.items[2].external_id, null); assert.equal(result.items[2].amount, "0.00");
    assert.deepEqual(await list("empty", c), { items: [], page: 1, page_size: 50, total: 0 });
  });
  await check("raw HTTP list and detail retain unsafe JSON integer tokens in nested arrays", async () => {
    for (const path of ["/orders", `/orders/${ids.precise}`]) {
      const raw = await api(path, { actor: actors.reader, organization: a, raw: true });
      const sources = [];
      const body = JSON.parse(raw, (_key, value, context) => { if (typeof value === "number" && /^-?\d+$/.test(context.source || "") && !Number.isSafeInteger(value)) sources.push(context.source); return value; });
      assert.deepEqual(sources.sort(), ["-9007199254740993", "-9007199254740993", "9007199254740993", "9007199254740993"].sort());
      assert.ok(raw.includes('"9999999999999999.99"')); assert.ok(raw.includes('"999999999999999.999"'));
      const order = path === "/orders" ? body.items.find(item => item.id === ids.precise) : body;
      const config = order.items.find(item => item.unit_price !== null).configuration;
      assert.deepEqual(config.nested.slice(0, 2), [null, true]); assert.equal(config.nested[2].fraction, 1.25); assert.deepEqual(config.empty, {});
    }
  });
  await check("organization-wide peer reads and selected-tenant filtering have no owner restriction", async () => {
    assert.deepEqual(await list("peer"), await list());
    const left = await detail(ids.precise, "peer"), right = await detail(); assert.deepEqual(left, right);
    assert.deepEqual((await list("other", b)).items.map(item => item.id), [ids.foreign]);
    assert.deepEqual((await list("multi", a)).items.map(item => item.id), [ids.newest, ids.precise, ids.empty]);
    assert.deepEqual((await list("multi", b)).items.map(item => item.id), [ids.foreign]);
    assert.equal((await detail(ids.foreign, "reader", a, 404)).error.code, "order_not_found");
    assert.equal((await detail(ids.precise, "other", b, 404)).error.code, "order_not_found");
  });
  await check("pagination matches legacy defaults, clamp, last scalar, brackets, whitespace and huge integers", async () => {
    const second = await list("reader", a, "?page=2&page_size=1"); assert.equal(second.items[0].id, ids.precise); assert.equal(second.total, 3);
    for (const suffix of ["?page=%2B01.00&page_size=999", "?page=%20%091%20&page_size=9999999999999999999999999", "?page=0__1&page_size=100"] ) {
      const page = await list("reader", a, suffix); assert.equal(page.page, 1); assert.equal(page.page_size, 100);
    }
    for (const raw of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2"]) assert.equal((await list("reader", a, `?${raw}`)).page, 1);
    assert.equal((await list("reader", a, "?page=bad&page=2&page_size=1")).items[0].id, ids.precise);
    assert.equal((await list("reader", a, `?${"ignored=x&".repeat(1000)}page=2`)).page, 2);
    const huge = await api("/orders?page=9007199254740993", { actor: actors.reader, organization: a, raw: true });
    assert.match(huge, /"page":9007199254740993(?:,|})/); assert.deepEqual(JSON.parse(huge).items, []);
    for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "1.5", "1e2", "", "one", "%EF%BB%BF1"])
      assert.equal((await list("reader", a, `?${field}=${value}`, 422)).error.code, "validation_error");
    assert.deepEqual((await list("reader", a, `?organization_id=${b}&unknown=ignored`)).items.map(item => item.id), [ids.newest, ids.precise, ids.empty]);
  });
  await check("UUID normalization, valid missing/foreign 404 and invalid UUID 422 preserve envelopes", async () => {
    for (const value of [ids.precise.toUpperCase(), ids.precise.replaceAll("-", ""), `{${ids.precise}}`, `urn:uuid:${ids.precise}`]) assert.equal((await detail(value)).id, ids.precise);
    assert.equal((await detail(randomUUID(), "reader", a, 404)).error.code, "order_not_found");
    const error = (await detail("invalid-uuid", "reader", a, 422)).error;
    assert.deepEqual(Object.keys(error).sort(), ["code", "details", "message", "request_id"]); assert.equal(error.code, "validation_error"); assert.deepEqual(error.details[0].loc, ["path", "order_id"]);
  });
  await check("detail appends one core order.view audit; list and denials append none", async () => {
    const before = await countAudit(); await list(); await list("denied", a, "", 403); await detail(randomUUID(), "reader", a, 404); await detail("invalid", "reader", a, 422); await detail(ids.foreign, "reader", a, 404);
    assert.equal(await countAudit(), before);
    await detail(); assert.equal(await countAudit(), before + 1);
    const event = await table(db, "audit_events").where({ action: "order.view" }).orderBy("created_at", "desc").first();
    assert.equal(event.actor_user_id, manifest.users.reader.id); assert.equal(event.organization_id, a); assert.equal(event.entity_type, "order"); assert.equal(event.entity_id, ids.precise);
    assert.deepEqual(typeof event.event_metadata === "string" ? JSON.parse(event.event_metadata) : event.event_metadata, {}); assert.match(event.request_id, /^[0-9a-f-]{36}$/); assert.ok(event.created_at);
  });
  await check("private errors reject missing login, native CMS identities and unauthorized org selection", async () => {
    const before = await countAudit();
    for (const path of ["/orders", `/orders/${ids.precise}`]) {
      await api(path, { expected: 401 });
      for (const secret of [app.config.get("admin.auth.secret"), app.config.get("plugin::users-permissions.jwtSecret")].filter(Boolean)) {
        const native = jwt.sign({ id: 1, type: "access" }, secret, { expiresIn: "15m" }); rememberSecret(native);
        await api(path, { actor: { access_token: native }, organization: a, expected: 401 });
      }
      assert.equal((await api(path, { actor: actors.reader, organization: b, expected: 403 })).error.code, "organization_access_denied");
      assert.equal((await api(path, { actor: actors.denied, organization: a, expected: 403 })).error.code, "permission_denied");
      assert.equal((await api(path, { actor: actors.multi, expected: 400 })).error.code, "organization_required");
    }
    assert.equal(await countAudit(), before);
  });
  await check("order writes, status/history/payment/shipping endpoints remain unavailable", async () => {
    const before = await countAudit();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) for (const path of ["/orders", `/orders/${ids.precise}`]) await api(path, { actor: actors.reader, organization: a, method, data: {}, expected: 405 });
    for (const suffix of ["events", "history", "payments", "shipping", "status"]) {
      await api(`/orders/${ids.precise}/${suffix}`, { actor: actors.reader, organization: a, expected: 404 });
      await api(`/orders/${ids.precise}/${suffix}`, { actor: actors.reader, organization: a, method: "POST", data: {}, expected: 405 });
    }
    assert.equal(await countAudit(), before); assert.equal(await snapshot(), initialRows);
  });
  await check("invalid stored numeric/configuration data fails closed without repair", async () => {
    const before = await countAudit();
    const item = await table(db, "order_items").where({ order_id: ids.precise }).whereNotNull("unit_price").first("id");
    for (const [name, id, field, original] of [["orders", ids.precise, "amount", "9999999999999999.99"], ["order_items", item.id, "quantity", "999999999999999.999"], ["order_items", item.id, "unit_price", "9999999999999999.99"]]) {
      await table(db, name).where({ id }).update({ [field]: "NaN" });
      try {
        assert.equal((await list("reader", a, "", 500)).error.code, "internal_error"); assert.equal((await detail(ids.precise, "reader", a, 500)).error.code, "internal_error");
        assert.equal((await table(db, name).where({ id }).select(db.raw(`${field}::text AS value`)).first()).value, "NaN");
      } finally { await table(db, name).where({ id }).update({ [field]: original }); }
      for (const value of ["Infinity", "-Infinity"]) await assert.rejects(table(db, name).where({ id }).update({ [field]: value }), error => error.code === "22003");
    }
    const stored = (await table(db, "order_items").where({ id: item.id }).select(db.raw("configuration::text AS value")).first()).value;
    for (const invalid of ["[]", "null", "true", "1", '\"text\"']) {
      await table(db, "order_items").where({ id: item.id }).update({ configuration: invalid });
      try {
        assert.equal((await list("reader", a, "", 500)).error.code, "internal_error"); assert.equal((await detail(ids.precise, "reader", a, 500)).error.code, "internal_error");
        assert.equal((await table(db, "order_items").where({ id: item.id }).select(db.raw("configuration::text AS value")).first()).value, invalid);
      } finally { await table(db, "order_items").where({ id: item.id }).update({ configuration: stored }); }
    }
    assert.equal(await countAudit(), before);
  });
  await check("HTTP audit failure and post-insert failure roll back audit without a successful detail", async () => {
    const before = await countAudit();
    await db.raw("CREATE FUNCTION b2b.reject_fixture_order_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'order.view' THEN RAISE EXCEPTION 'Fictitious audit failure'; END IF; RETURN NEW; END $$");
    await db.raw("CREATE TRIGGER reject_fixture_order_audit BEFORE INSERT ON b2b.audit_events FOR EACH ROW EXECUTE FUNCTION b2b.reject_fixture_order_audit()");
    try { assert.equal((await detail(ids.precise, "reader", a, 500)).error.code, "internal_error"); }
    finally { await db.raw("DROP TRIGGER reject_fixture_order_audit ON b2b.audit_events"); await db.raw("DROP FUNCTION b2b.reject_fixture_order_audit()"); }
    const failing = createOrders({ db, auth: app.alageum.auth, audit: async (tx, ctx, event) => { await audit(tx, ctx, event); throw new Error("Fictitious post-insert audit failure"); } });
    await assert.rejects(failing.detail(request(actors.reader, a, ids.precise)), /Fictitious post-insert audit failure/);
    assert.equal(await countAudit(), before); assert.equal(await snapshot(), initialRows);
  });
  await check("fresh transaction authorization denies revoked users, memberships, organizations and roles", async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    const guarded = createOrders({ db, auth: { permission: async () => context }, audit }), before = await countAudit();
    for (const [name, id, revoked, restored, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["organizations", a, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, "permission_denied"],
      ["roles", context.membership.role.id, { organization_id: b, code: "orders_fixture_moved_role" }, { organization_id: a, code: context.membership.role.code }, "organization_access_denied"],
    ]) {
      await table(db, name).where({ id }).update(revoked);
      try {
        for (const method of ["list", "detail"]) await assert.rejects(guarded[method](request(actors.reader, a, ids.precise)), code(expected));
        for (const path of ["/orders", `/orders/${ids.precise}`]) assert.equal((await api(path, { actor: actors.reader, organization: a, expected: expected === "authentication_required" ? 401 : 403 })).error.code, expected);
      } finally { await table(db, name).where({ id }).update(restored); }
    }
    assert.equal(await countAudit(), before);
  });
  await check("accepted detail holds shared authority until audit commit then revocation denies later reads", async () => {
    let release, entered;
    const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
    const roleId = manifest.roles.a.reader, before = await countAudit();
    const held = createOrders({ db, auth: app.alageum.auth, audit: async (tx, ctx, event) => { await audit(tx, ctx, event); entered(); await barrier; } });
    const reading = held.detail(request(actors.reader, a, ids.precise));
    const watchdog = setTimeout(release, 12000); let revoke;
    try {
      await ready;
      revoke = table(db, "roles").where({ id: roleId }).update({ permissions: "[]" }).then(() => {});
      const deadline = Date.now() + 8000; let blocked = false;
      while (Date.now() < deadline) {
        const waiting = await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'update%roles%'");
        if (waiting.rows.length) { blocked = true; break; } await pause(20);
      }
      assert.equal(blocked, true); release(); await reading; await revoke;
      assert.equal(await countAudit(), before + 1); assert.equal((await list("reader", a, "", 403)).error.code, "permission_denied");
    } finally { release(); await reading; if (revoke) await revoke; clearTimeout(watchdog); await table(db, "roles").where({ id: roleId }).update({ permissions: JSON.stringify([READ]) }); }
  });
  await check("schema rejects columns, constraints, unique indexes and views without repair", async () => {
    await db.schema.withSchema("b2b").alterTable("orders", t => t.string("fixture_unreviewed", 10));
    try { await assert.rejects(ensureSchema(db), /Order schema mismatch/); assert.equal(await db.schema.withSchema("b2b").hasColumn("orders", "fixture_unreviewed"), true); }
    finally { await db.schema.withSchema("b2b").alterTable("orders", t => t.dropColumn("fixture_unreviewed")); }
    await db.raw("ALTER TABLE b2b.order_items ADD CONSTRAINT fixture_unreviewed CHECK (description <> '') NOT VALID");
    try { await assert.rejects(ensureSchema(db), /Order schema mismatch/); }
    finally { await db.raw("ALTER TABLE b2b.order_items DROP CONSTRAINT fixture_unreviewed"); }
    await db.raw("CREATE UNIQUE INDEX fixture_unreviewed_order ON b2b.orders(number)");
    try { await assert.rejects(ensureSchema(db), /Order schema mismatch/); }
    finally { await db.raw("DROP INDEX b2b.fixture_unreviewed_order"); }
    const rollback = new Error("fixture rollback");
    await assert.rejects(db.transaction(async tx => {
      await tx.raw("ALTER TABLE b2b.order_items RENAME TO fixture_saved_items");
      await tx.raw("CREATE VIEW b2b.order_items AS SELECT * FROM b2b.fixture_saved_items");
      await assert.rejects(ensureSchema(tx), /Order schema mismatch/); throw rollback;
    }), error => error === rollback);
    await ensureSchema(db);
  });
  await check("fresh domain instance reads durable snapshots with unchanged DTO precision", async () => {
    const reloaded = createOrders({ db, auth: app.alageum.auth, audit });
    const ctx = request(actors.reader, a, ids.precise); await reloaded.detail(ctx);
    assert.equal(ctx.body.amount, "9999999999999999.99"); assert.equal(ctx.body.items.length, 2);
    assert.match(JSON.stringify(ctx.body), /9007199254740993/);
  });
  await check("all read acceptance preserves every business snapshot and original role grant", async () => {
    assert.equal(await snapshot(), initialRows); assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.equal(await db.schema.withSchema("b2b").hasTable("order_events"), false);
  });
  return actors;
};
