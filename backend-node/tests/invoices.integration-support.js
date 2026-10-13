"use strict";
// Only the isolated invoice runner invokes these real HTTP/PostgreSQL checks.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { table } = require("../src/domain/auth");
const { createInvoices, ensureSchema, preflightSchema, READ } = require("../src/domain/invoices");
const fixtures = require("../scripts/seed-test-invoice-users");
const code = value => error => error.code === value;
const pause = ms => new Promise(done => setTimeout(done, ms));
function request(actor, organization) {
  const headers = { authorization: `Bearer ${actor.access_token}`, "x-organization-id": organization || "" };
  return { request: {}, query: {}, state: {}, get: name => headers[name.toLowerCase()] || "", set() {} };
}
async function snapshot(db) {
  // Cast whole JSON to text so driver parsing cannot round stored decimals.
  return (await db.raw("SELECT jsonb_build_object('invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM b2b.invoices i),'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM b2b.orders o),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM b2b.order_items i),'quotes',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM b2b.quote_requests q),'quote_items',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM b2b.quote_request_items q),'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM b2b.ticket_messages m),'tickets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM b2b.tickets t))::text AS value")).rows[0].value;
}
module.exports = async function verifyInvoices({ app, api, check, manifest, password, rememberSecret }) {
  const db = app.db.connection, a = manifest.organizations.a.id, b = manifest.organizations.b.id, c = manifest.organizations.c.id;
  const ids = manifest.invoices, actors = {}, initialRoles = await table(db, "roles").orderBy("id"), initialRows = await snapshot(db);
  const countAudit = async () => Number((await table(db, "audit_events").count("* AS count").first()).count);
  const list = (kind = "reader", organization = a, suffix = "", expected = 200) => api(`/finance/invoices${suffix}`, { actor: actors[kind], organization, expected });
  await check("repeat additive schema preserves every invoice/order snapshot and original grant", async () => {
    await preflightSchema(db); await ensureSchema(db); await ensureSchema(db);
    assert.equal(await db.schema.withSchema("public").hasTable("invoices"), false);
    assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.equal(await snapshot(db), initialRows); assert.equal(await countAudit(), 0);
  });
  await check("real logins retain only finance.read fixture permissions", async () => {
    for (const kind of Object.keys(fixtures.EMAILS)) {
      actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password } });
      rememberSecret(actors[kind].access_token); rememberSecret(actors[kind].refresh_token);
      assert.deepEqual((await api("/auth/me", { actor: actors[kind], organization: kind === "other" ? b : kind === "empty" ? c : a })).permissions, kind === "denied" ? [] : [READ]);
    }
  });
  const originalAuditCount = await countAudit();
  await check("six-field list DTO preserves exact nominal amounts, opaque codes and deterministic order", async () => {
    const result = await list();
    assert.deepEqual(Object.keys(result).sort(), ["items", "page", "page_size", "total"]);
    assert.deepEqual([result.page, result.page_size, result.total], [1, 50, 3]);
    assert.deepEqual(result.items.map(item => item.id), [ids.newest, ids.precise, ids.empty]);
    assert.deepEqual(result.items.map(item => item.amount), ["12.30", "9999999999999999.99", "0.00"]);
    for (const item of result.items) {
      assert.deepEqual(Object.keys(item).sort(), ["amount", "currency", "id", "number", "source", "status"]);
      assert.match(item.id, /^[0-9a-f-]{36}$/); assert.equal(item.currency, "KZT");
      assert.equal(item.status, "fixture_opaque_status"); assert.equal(item.source, "FIXTURE");
    }
    assert.deepEqual(await list("empty", c), { items: [], page: 1, page_size: 50, total: 0 });
  });
  await check("raw HTTP Decimal wire remains string-valued under Strapi global pg parseFloat", async () => {
    assert.equal(require("pg").types.getTypeParser(1700)("9999999999999999.99"), 10000000000000000);
    const raw = await api("/finance/invoices", { actor: actors.reader, organization: a, raw: true });
    for (const amount of ["9999999999999999.99", "12.30", "0.00"]) assert.ok(raw.includes(`"amount":"${amount}"`));
    for (const field of ["organization_id", "order_id", "external_id", "created_at", "updated_at", "due_date", "date", "balance", "debt", "tax"]) assert.equal(raw.includes(`"${field}"`), false);
  });
  await check("organization-wide peer visibility ignores owner and linked order tenant", async () => {
    assert.deepEqual(await list("peer"), await list());
    assert.deepEqual((await list("other", b)).items.map(item => item.id), [ids.foreign]);
    assert.deepEqual((await list("multi", a)).items.map(item => item.id), [ids.newest, ids.precise, ids.empty]);
    assert.deepEqual((await list("multi", b)).items.map(item => item.id), [ids.foreign]);
    const stored = await table(db, "invoices").where({ id: ids.precise }).first("order_id");
    assert.equal(stored.order_id, manifest.orderId);
    assert.equal((await table(db, "orders").where({ id: stored.order_id }).first("organization_id")).organization_id, b);
  });
  await check("pagination preserves defaults, cap, raw duplicates/brackets/whitespace and huge integers", async () => {
    assert.equal((await list("reader", a, "?page=2&page_size=1")).items[0].id, ids.precise);
    for (const suffix of ["?page=%2B01.00&page_size=999", "?page=%20%091%20&page_size=9999999999999999999999999", "?page=0__1&page_size=100", "?page=%C2%A01%E3%80%80&page_size=100"] ) {
      const page = await list("reader", a, suffix); assert.equal(page.page, 1); assert.equal(page.page_size, 100);
    }
    for (const raw of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2"]) assert.equal((await list("reader", a, `?${raw}`)).page, 1);
    assert.equal((await list("reader", a, "?page=bad&page=2&page_size=1")).items[0].id, ids.precise);
    assert.equal((await list("reader", a, `?${"ignored=x&".repeat(1000)}page=2`)).page, 2);
    const huge = await api("/finance/invoices?page=9007199254740993", { actor: actors.reader, organization: a, raw: true });
    assert.match(huge, /"page":9007199254740993(?:,|})/); assert.deepEqual(JSON.parse(huge).items, []);
    for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "1.5", "1e2", "", "one", "%EF%BB%BF1", "1".repeat(4301)])
      assert.equal((await list("reader", a, `?${field}=${value}`, 422)).error.code, "validation_error");
    assert.deepEqual((await list("reader", a, `?organization_id=${b}&mine=true&unknown=ignored`)).items.map(item => item.id), [ids.newest, ids.precise, ids.empty]);
  });
  await check("private authentication errors reject native CMS identities, denied roles and unauthorized tenants", async () => {
    await api("/finance/invoices", { expected: 401 });
    for (const secret of [app.config.get("admin.auth.secret"), app.config.get("plugin::users-permissions.jwtSecret")].filter(Boolean)) {
      const native = jwt.sign({ id: 1, type: "access" }, secret, { expiresIn: "15m" }); rememberSecret(native);
      await api("/finance/invoices", { actor: { access_token: native }, organization: a, expected: 401 });
    }
    for (const [kind, org, error] of [["reader", b, "organization_access_denied"], ["denied", a, "permission_denied"]])
      assert.equal((await list(kind, org, "", 403)).error.code, error);
    assert.equal((await api("/finance/invoices", { actor: actors.multi, expected: 400 })).error.code, "organization_required");
  });
  await check("invoice reads and failures write no audit even when audit inserts are unavailable", async () => {
    await db.raw("CREATE FUNCTION b2b.reject_fixture_invoice_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious unavailable audit insert'; END $$");
    await db.raw("CREATE TRIGGER reject_fixture_invoice_audit BEFORE INSERT ON b2b.audit_events FOR EACH ROW EXECUTE FUNCTION b2b.reject_fixture_invoice_audit()");
    try { await list(); await list("denied", a, "", 403); await list("reader", a, "?page=0", 422); }
    finally { await db.raw("DROP TRIGGER reject_fixture_invoice_audit ON b2b.audit_events"); await db.raw("DROP FUNCTION b2b.reject_fixture_invoice_audit()"); }
    assert.equal(await countAudit(), originalAuditCount); assert.equal(await snapshot(db), initialRows);
  });
  await check("invoice details, all mutations, payment/document/provider paths remain unavailable", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) await api("/finance/invoices", { actor: actors.reader, organization: a, method, data: {}, expected: 405 });
    for (const path of [`/finance/invoices/${ids.precise}`, "/finance/payments", "/finance/reconciliations", "/finance/debt", `/finance/invoices/${ids.precise}/download`, `/finance/invoices/${ids.precise}/document`, "/invoices"]) {
      await api(path, { actor: actors.reader, organization: a, expected: 404 });
      await api(path, { actor: actors.reader, organization: a, method: "POST", data: {}, expected: 405 });
    }
    assert.equal(await countAudit(), originalAuditCount); assert.equal(await snapshot(db), initialRows);
  });
  await check("stored NaN fails closed without invoice repair or audit and infinity cannot be stored", async () => {
    await table(db, "invoices").where({ id: ids.precise }).update({ amount: "NaN" });
    try {
      assert.equal((await list("reader", a, "", 500)).error.code, "internal_error");
      assert.equal((await table(db, "invoices").where({ id: ids.precise }).select(db.raw("amount::text AS amount")).first()).amount, "NaN");
    } finally { await table(db, "invoices").where({ id: ids.precise }).update({ amount: "9999999999999999.99" }); }
    for (const value of ["Infinity", "-Infinity", "10000000000000000.00"]) await assert.rejects(table(db, "invoices").where({ id: ids.precise }).update({ amount: value }), code("22003"));
    assert.equal(await countAudit(), originalAuditCount);
  });
  await check("legacy storage constraints keep null uniqueness, field bounds, no defaults and NO ACTION foreign keys", async () => {
    const source = await table(db, "invoices").where({ id: ids.precise }).select("*", db.raw("amount::text AS amount")).first();
    for (const [patch, expected] of [[{ amount: "-0.01" }, "23514"], [{ organization_id: randomUUID() }, "23503"], [{ order_id: randomUUID() }, "23503"], [{ number: "x".repeat(121) }, "22001"], [{ currency: "ABCD" }, "22001"], [{ status: "x".repeat(61) }, "22001"], [{ source: "x".repeat(61) }, "22001"], [{ external_id: "x".repeat(201) }, "22001"]])
      await assert.rejects(table(db, "invoices").insert({ ...source, id: randomUUID(), external_id: null, ...patch }), code(expected));
    for (const field of ["id", "organization_id", "number", "amount", "currency", "status", "source", "created_at", "updated_at"]) {
      const candidate = { ...source, id: randomUUID(), external_id: null }; delete candidate[field];
      await assert.rejects(table(db, "invoices").insert(candidate), code("23502"));
    }
    await assert.rejects(table(db, "invoices").insert({ ...source, id: randomUUID() }), code("23505"));
    await assert.rejects(table(db, "orders").where({ id: manifest.orderId }).delete(), code("23503"));
    await assert.rejects(table(db, "organizations").where({ id: a }).delete(), code("23503"));
    const rollback = new Error("fixture rollback");
    await assert.rejects(db.transaction(async tx => {
      await table(tx, "invoices").insert([
        { ...source, id: randomUUID(), external_id: null, order_id: null }, { ...source, id: randomUUID(), external_id: null, order_id: null },
        { ...source, id: randomUUID(), source: "OTHER" }, { ...source, id: randomUUID(), organization_id: b },
      ]);
      throw rollback;
    }), error => error === rollback);
    assert.equal(await snapshot(db), initialRows);
  });
  await check("fresh transaction authority denies revoked user, membership, organization and role", async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    const guarded = createInvoices({ db, auth: { permission: async () => context } });
    for (const [name, id, revoked, restored, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["organizations", a, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, "permission_denied"],
      ["roles", context.membership.role.id, { organization_id: b, code: "invoice_fixture_moved_role" }, { organization_id: a, code: context.membership.role.code }, "organization_access_denied"],
    ]) {
      await table(db, name).where({ id }).update(revoked);
      try {
        await assert.rejects(guarded.list(request(actors.reader, a)), code(expected));
        assert.equal((await list("reader", a, "", expected === "authentication_required" ? 401 : 403)).error.code, expected);
      } finally { await table(db, name).where({ id }).update(restored); }
    }
    assert.equal(await countAudit(), originalAuditCount);
  });
  await check("accepted list holds all authority row locks until commit and then revocation denies later reads", async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    for (const [name, id, patch, restore, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, 401],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, 403],
      ["organizations", a, { is_active: false }, { is_active: true }, 403],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, 403],
    ]) {
      let release, entered;
      const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
      const held = createInvoices({ db: { transaction: work => db.transaction(async tx => { const result = await work(tx); entered(); await barrier; return result; }) }, auth: app.alageum.auth });
      const ctx = request(actors.reader, a), reading = held.list(ctx), watchdog = setTimeout(release, 12000); let revoke;
      try {
        await ready;
        revoke = table(db, name).where({ id }).update(patch).then(() => {});
        const deadline = Date.now() + 8000; let blocked = false;
        while (Date.now() < deadline) {
          const waiting = await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?", [`update%${name}%`]);
          if (waiting.rows.length) { blocked = true; break; } await pause(20);
        }
        assert.equal(blocked, true, `${name} revocation must wait for the read transaction`);
        release(); await reading; await revoke; assert.equal(ctx.body.items.length, 3); await list("reader", a, "", expected);
      } finally { release(); await reading; if (revoke) await revoke; clearTimeout(watchdog); await table(db, name).where({ id }).update(restore); }
    }
    assert.equal(await countAudit(), originalAuditCount);
  });
  await check("preflight and bootstrap refuse schema drift without repair or business-row writes", async () => {
    const changes = [
      ["ALTER TABLE b2b.invoices ALTER COLUMN created_at TYPE timestamptz(0)", "ALTER TABLE b2b.invoices ALTER COLUMN created_at TYPE timestamptz"],
      ["ALTER TABLE b2b.invoices ALTER COLUMN updated_at TYPE timestamptz(0)", "ALTER TABLE b2b.invoices ALTER COLUMN updated_at TYPE timestamptz"],
      ["ALTER TABLE b2b.invoices ADD COLUMN fixture_unreviewed text", "ALTER TABLE b2b.invoices DROP COLUMN fixture_unreviewed"],
      ["ALTER TABLE b2b.invoices ALTER COLUMN source SET DEFAULT 'ERP'", "ALTER TABLE b2b.invoices ALTER COLUMN source DROP DEFAULT"],
      ["ALTER TABLE b2b.invoices ALTER COLUMN number DROP NOT NULL", "ALTER TABLE b2b.invoices ALTER COLUMN number SET NOT NULL"],
      ["ALTER TABLE b2b.invoices ADD CONSTRAINT fixture_unreviewed CHECK (number <> '') NOT VALID", "ALTER TABLE b2b.invoices DROP CONSTRAINT fixture_unreviewed"],
      ["CREATE UNIQUE INDEX fixture_unreviewed_invoice ON b2b.invoices(number)", "DROP INDEX b2b.fixture_unreviewed_invoice"],
      ["ALTER TABLE b2b.invoices ENABLE ROW LEVEL SECURITY", "ALTER TABLE b2b.invoices DISABLE ROW LEVEL SECURITY"],
    ];
    for (const [change, restore] of changes) {
      await db.raw(change);
      try { await assert.rejects(preflightSchema(db), /Invoice schema mismatch/); await assert.rejects(ensureSchema(db), /Invoice schema mismatch/); }
      finally { await db.raw(restore); }
    }
    const rollback = new Error("fixture rollback");
    await assert.rejects(db.transaction(async tx => {
      await tx.raw("ALTER TABLE b2b.invoices RENAME TO fixture_saved_invoices");
      await tx.raw("CREATE VIEW b2b.invoices AS SELECT * FROM b2b.fixture_saved_invoices");
      await assert.rejects(preflightSchema(tx), /Invoice schema mismatch/); await assert.rejects(ensureSchema(tx), /Invoice schema mismatch/); throw rollback;
    }), error => error === rollback);
    await ensureSchema(db); assert.equal(await snapshot(db), initialRows);
  });
  await check("all reads preserve every business snapshot, role grant and post-login audit count", async () => {
    assert.equal(await snapshot(db), initialRows); assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.equal(await countAudit(), originalAuditCount);
  });
  return actors;
};
module.exports.snapshot = snapshot;
