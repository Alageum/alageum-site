"use strict";
// Real Strapi HTTP and PostgreSQL transaction assertions, invoked only after the
// dedicated runner's fresh-database preflight and fictitious fixture creation.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { table } = require("../src/domain/auth");
const { audit } = require("../src/domain/audit");
const { createSupport, ensureSchema, READ, CREATE } = require("../src/domain/support");
const fixtures = require("../scripts/seed-test-support-users");
const code = value => error => error.code === value;
const pause = ms => new Promise(done => setTimeout(done, ms));
function request(actor, organization, body = null) {
  const headers = { authorization: `Bearer ${actor.access_token}`, "x-organization-id": organization || "" };
  return { request: { body }, query: {}, state: {}, get: name => headers[name.toLowerCase()] || "", set() {} };
}
module.exports = async function verifySupport({ app, api, check, manifest, password, rememberSecret }) {
  const db = app.db.connection, a = manifest.organizations.a.id, b = manifest.organizations.b.id;
  const actors = {}, valid = (subject = `Fictitious support ${randomUUID()}`) => ({ category_id: manifest.category.id, subject, message: " Fictitious private initial message\nUnicode: Б 中 😀\n " });
  const create = (kind, data = valid(), organization = kind === "other" ? b : a, expected = 201) => api("/support/tickets", { actor: actors[kind], organization, method: "POST", data, expected });
  const count = async (name, filters = {}) => Number((await table(db, name).where(filters).count("* AS count").first()).count);
  const counts = async () => Promise.all([count("tickets"), count("ticket_messages"), count("audit_events", { action: CREATE })]);
  const initialRoles = await table(db, "roles").orderBy("id");
  let initial;
  await check("repeat support schema bootstrap preserves rows and exact fixture role grants", async () => {
    await ensureSchema(db); await ensureSchema(db);
    assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
    assert.equal(await db.schema.withSchema("public").hasTable("tickets"), false);
    assert.deepEqual(await counts(), [0, 0, 0]);
  });
  await check("real logins and independent read/create/neither permissions", async () => {
    for (const kind of Object.keys(fixtures.EMAILS)) {
      actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password } });
      rememberSecret(actors[kind].access_token); rememberSecret(actors[kind].refresh_token);
      const organization = kind === "other" ? b : a;
      const me = await api("/auth/me", { actor: actors[kind], organization });
      assert.deepEqual(me.permissions, [...fixtures.GRANTS[["multi", "other"].includes(kind) ? "editor" : kind]].sort());
      const canRead = !["createonly", "denied"].includes(kind), canCreate = !["readonly", "denied"].includes(kind);
      const list = await api("/support/tickets", { actor: actors[kind], organization, expected: canRead ? 200 : 403 });
      if (canRead) assert.deepEqual(list, { items: [], page: 1, page_size: 50, total: 0 });
      const categories = await api("/support/categories", { actor: actors[kind], organization, expected: canCreate ? 200 : 403 });
      if (canCreate) assert.deepEqual(categories, { items: [manifest.category], page: 1, page_size: 50, total: 1 });
      if (!canCreate) assert.equal((await create(kind, valid(), organization, 403)).error.code, "permission_denied");
    }
  });
  await check("private no-store errors, native CMS tokens and cross-tenant selection denial", async () => {
    for (const path of ["/support/categories", "/support/tickets"]) {
      await api(path, { expected: 401 });
      await api(path, { actor: { access_token: jwt.sign({ id: 1, type: "access" }, app.config.get("admin.auth.secret"), { expiresIn: "15m" }) }, organization: a, expected: 401 });
      assert.equal((await api(path, { actor: actors.editor, organization: b, expected: 403 })).error.code, "organization_access_denied");
      assert.equal((await api(path, { actor: actors.multi, expected: 400 })).error.code, "organization_required");
      await api(path, { actor: actors.multi, organization: b });
    }
    await api("/support/tickets", { method: "POST", data: valid(), expected: 401 });
    await create("editor", valid(), b, 403);
    assert.equal((await api("/support/tickets", { actor: actors.multi, method: "POST", data: valid(), expected: 400 })).error.code, "organization_required");
  });
  await check("legacy query default/coercion/clamp, duplicates, extras and validation errors", async () => {
    for (const path of ["/support/categories", "/support/tickets"]) {
      const query = await api(`${path}?page=%2B01.00&page_size=1000&organization_id=${b}&unknown=ignored`, { actor: actors.editor, organization: a });
      assert.equal(query.page, 1); assert.equal(query.page_size, 100);
      for (const raw of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2"]) assert.equal((await api(`${path}?${raw}`, { actor: actors.editor, organization: a })).page, 1);
      assert.equal((await api(`${path}?${"ignored=x&".repeat(1000)}page=2`, { actor: actors.editor, organization: a })).page, 2);
      const duplicate = await api(`${path}?page=bad&page=2&page_size=1`, { actor: actors.editor, organization: a });
      assert.equal(duplicate.page, 2); assert.equal(duplicate.page_size, 1);
      const large = await api(`${path}?page=9007199254740993`, { actor: actors.editor, organization: a });
      assert.deepEqual(large.items, []); assert.equal(large.page_size, 50);
      for (const value of ["0", "-1", "1.1", "1e2", "oops"]) {
        const error = (await api(`${path}?page_size=${value}`, { actor: actors.editor, organization: a, expected: 422 })).error;
        assert.equal(error.code, "validation_error"); assert.ok(Array.isArray(error.details));
        assert.deepEqual(Object.keys(error).sort(), ["code", "details", "message", "request_id"]); assert.match(error.request_id, /^[0-9a-f-]{36}$/);
      }
    }
  });
  await check("global category DTO allowlist and deterministic code ordering", async () => {
    const rows = [{ id: randomUUID(), code: "aaa-fixture-only", label: "Fictitious order probe A" }, { id: randomUUID(), code: "zzz-fixture-only", label: "Fictitious order probe Z" }];
    await table(db, "ticket_categories").insert(rows);
    try {
      for (const [kind, organization] of [["editor", a], ["other", b]]) {
        const result = await api("/support/categories?page_size=2", { actor: actors[kind], organization });
        assert.deepEqual(result.items, [rows[0], manifest.category]); assert.equal(result.total, 3);
        assert.deepEqual((await api("/support/categories?page=2&page_size=2", { actor: actors[kind], organization })).items, [rows[1]]);
      }
    } finally { await table(db, "ticket_categories").whereIn("id", rows.map(row => row.id)).delete(); }
  });
  await check("missing category or initial new status returns configuration error without writes", async () => {
    const before = await counts();
    assert.equal((await create("editor", { ...valid(), category_id: randomUUID() }, a, 422)).error.code, "ticket_configuration_missing");
    const status = await table(db, "ticket_statuses").where({ code: "new" }).first();
    await table(db, "ticket_statuses").where({ id: status.id }).delete();
    try { assert.equal((await create("editor", valid(), a, 422)).error.code, "ticket_configuration_missing"); }
    finally { await table(db, "ticket_statuses").insert(status); }
    assert.deepEqual(await counts(), before);
  });
  await check("strict HTTP input rejects server-owned fields and invalid values atomically", async () => {
    const before = await counts();
    for (const field of ["id", "organization_id", "created_by_id", "status_id", "source", "attachments", "idempotency_key"])
      assert.equal((await create("editor", { ...valid(), [field]: b }, a, 422)).error.code, "validation_error");
    for (const data of [{}, { ...valid(), category_id: "bad" }, { ...valid(), subject: "" }, { ...valid(), message: "" }, { ...valid(), subject: "😀".repeat(301) }, { ...valid(), message: "😀".repeat(10001) }, { ...valid(), message: 4 }])
      assert.equal((await create("editor", data, a, 422)).error.code, "validation_error");
    assert.deepEqual(await counts(), before);
  });
  await check("JSON-only support input rejects forms and multipart before writes", async () => {
    const before = await counts(), fields = valid();
    const form = new URLSearchParams(fields);
    assert.equal((await api("/support/tickets", { actor: actors.editor, organization: a, method: "POST", rawBody: form.toString(), contentType: "application/x-www-form-urlencoded", expected: 422 })).error.code, "validation_error");
    const multipart = new FormData(); for (const [key, value] of Object.entries(fields)) multipart.append(key, value);
    assert.equal((await api("/support/tickets", { actor: actors.editor, organization: a, method: "POST", rawBody: multipart, contentType: null, expected: 422 })).error.code, "validation_error");
    assert.deepEqual(await counts(), before);
  });
  await check("ticket initial message and audit persist together with server-derived ownership", async () => {
    const body = valid("  Fictitious support request\nБ 中 😀  ");
    initial = await create("editor", body);
    assert.deepEqual(Object.keys(initial).sort(), ["category", "id", "status", "subject"]);
    assert.deepEqual(initial, { id: initial.id, subject: body.subject, category: "other", status: "new" });
    const ticket = await table(db, "tickets").where({ id: initial.id }).first();
    assert.equal(ticket.organization_id, a); assert.equal(ticket.created_by_id, manifest.users.editor.id); assert.equal(ticket.subject, body.subject);
    const messages = await table(db, "ticket_messages").where({ ticket_id: initial.id }); assert.equal(messages.length, 1);
    assert.equal(messages[0].body, body.message); assert.equal(messages[0].source, "portal"); assert.equal(messages[0].author_user_id, manifest.users.editor.id);
    const events = await table(db, "audit_events").where({ action: CREATE, entity_id: initial.id }); assert.equal(events.length, 1);
    assert.equal(events[0].actor_user_id, manifest.users.editor.id); assert.equal(events[0].organization_id, a); assert.equal(events[0].entity_type, "ticket");
    assert.deepEqual(typeof events[0].event_metadata === "string" ? JSON.parse(events[0].event_metadata) : events[0].event_metadata, {});
    assert.deepEqual(await counts(), [1, 1, 1]);
  });
  await check("Unicode limits and exact whitespace are preserved through PostgreSQL", async () => {
    const values = [{ subject: "😀".repeat(300), message: "😀".repeat(10000) }, { subject: " \t\n ", message: "\r\n\t " }];
    for (const valueset of values) {
      const body = { ...valid(), ...valueset, category_id: `urn:uuid:${manifest.category.id}` }, saved = await create("createonly", body);
      assert.equal(saved.subject, body.subject);
      assert.equal((await table(db, "ticket_messages").where({ ticket_id: saved.id }).first()).body, body.message);
    }
  });
  await check("organization-wide peer summaries exclude message bodies and other tenants", async () => {
    const peer = await create("createonly", valid("Fictitious peer ticket"));
    const other = await create("other", valid("Fictitious other-tenant ticket"));
    const list = await api("/support/tickets", { actor: actors.readonly, organization: a });
    assert.ok(list.items.some(item => item.id === initial.id)); assert.ok(list.items.some(item => item.id === peer.id)); assert.ok(!list.items.some(item => item.id === other.id));
    assert.ok(list.items.every(item => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(["category", "id", "status", "subject"])));
    const otherList = await api("/support/tickets", { actor: actors.other, organization: b }); assert.deepEqual(otherList.items, [other]);
    const tie = new Date("2026-01-01T00:00:00Z");
    await table(db, "tickets").where({ organization_id: a }).update({ created_at: tie });
    const newest = await create("editor", valid("Fictitious newest ticket"));
    const ordered = await api("/support/tickets", { actor: actors.readonly, organization: a });
    assert.equal(ordered.items[0].id, newest.id);
    assert.deepEqual(ordered.items.slice(1).map(item => item.id), list.items.map(item => item.id).sort());
    const second = await api("/support/tickets?page=2&page_size=2", { actor: actors.readonly, organization: a });
    assert.deepEqual(second.items, ordered.items.slice(2, 4)); assert.equal(second.total, ordered.total);
  });
  await check("JSON suffix and absent content type retain legacy acceptance", async () => {
    for (const contentType of ["application/vnd.fixture+json", null]) {
      const body = valid("Fictitious JSON transport"), rawBody = Buffer.from(JSON.stringify(body));
      const saved = await api("/support/tickets", { actor: actors.editor, organization: a, method: "POST", rawBody, contentType, expected: 201 });
      assert.equal(saved.subject, body.subject);
    }
  });
  await check("no ticket idempotency contract: explicit duplicate POSTs create separate records", async () => {
    const body = valid("Fictitious explicit repeated request"), before = await counts();
    const left = await create("editor", body), right = await create("editor", body);
    assert.notEqual(left.id, right.id); assert.deepEqual(await counts(), before.map(value => value + 2));
  });
  await check("ticket detail, replies, assignment, states and attachments remain unavailable", async () => {
    for (const path of [`/support/tickets/${initial.id}`, `/support/tickets/${initial.id}/messages`, `/support/tickets/${initial.id}/attachments`]) await api(path, { actor: actors.editor, organization: a, expected: 404 });
    for (const path of [`/support/tickets/${initial.id}/messages`, `/support/tickets/${initial.id}/assign`, `/support/tickets/${initial.id}/status`]) await api(path, { actor: actors.editor, organization: a, method: "POST", data: {}, expected: 405 });
  });
  await check("initial message database failure rolls back ticket and audit", async () => {
    const before = await counts();
    await db.raw("CREATE FUNCTION b2b.reject_fixture_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictitious message failure'; END $$");
    await db.raw("CREATE TRIGGER reject_fixture_message BEFORE INSERT ON b2b.ticket_messages FOR EACH ROW EXECUTE FUNCTION b2b.reject_fixture_message()");
    try { assert.equal((await create("editor", valid(), a, 500)).error.code, "internal_error"); }
    finally { await db.raw("DROP TRIGGER reject_fixture_message ON b2b.ticket_messages"); await db.raw("DROP FUNCTION b2b.reject_fixture_message()"); }
    assert.deepEqual(await counts(), before);
  });
  await check("audit failure rolls back ticket, message and audit including an inserted event", async () => {
    const before = await counts();
    const failing = createSupport({ db, auth: app.alageum.auth, audit: async (tx, ctx, event) => { await audit(tx, ctx, event); throw new Error("Fictitious audit failure"); } });
    await assert.rejects(failing.create(request(actors.editor, a, valid())), /Fictitious audit failure/);
    assert.deepEqual(await counts(), before);
  });
  await check("all endpoints recheck active user/membership/organization/role after revocation", async () => {
    const context = await app.alageum.auth.context(request(actors.editor, a));
    const guarded = createSupport({ db, auth: { permission: async () => context }, audit });
    const before = await counts();
    const cases = [
      ["users", context.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["organizations", a, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ, CREATE]) }, "permission_denied"],
      ["roles", context.membership.role.id, { organization_id: b, code: "support_fixture_moved_role" }, { organization_id: a, code: context.membership.role.code }, "organization_access_denied"],
    ];
    for (const [name, id, revoked, restored, expected] of cases) {
      await table(db, name).where({ id }).update(revoked);
      try {
        for (const method of ["list", "categories", "create"]) await assert.rejects(guarded[method](request(actors.editor, a, valid())), code(expected));
        for (const path of ["/support/categories", "/support/tickets"]) assert.equal((await api(path, { actor: actors.editor, organization: a, expected: expected === "authentication_required" ? 401 : 403 })).error.code, expected);
      } finally { await table(db, name).where({ id }).update(restored); }
    }
    assert.deepEqual(await counts(), before);
  });
  await check("in-flight transaction holds role authority until commit then revocation denies later writes", async () => {
    let release, entered;
    const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
    const roleId = manifest.roles.a.editor, before = await counts();
    const held = createSupport({ db, auth: app.alageum.auth, audit: async (tx, ctx, event) => { await audit(tx, ctx, event); entered(); await barrier; } });
    const writing = held.create(request(actors.editor, a, valid("Fictitious concurrent revocation")));
    const watchdog = setTimeout(release, 12000);
    let revoke;
    try {
      await ready;
      revoke = table(db, "roles").where({ id: roleId }).update({ permissions: "[]" }).then(() => {});
      const deadline = Date.now() + 8000; let blocked = false;
      while (Date.now() < deadline) {
        const waiting = await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'update%roles%'");
        if (waiting.rows.length) { blocked = true; break; }
        await pause(20);
      }
      assert.equal(blocked, true, "Role revocation must wait for the accepted ticket transaction's SHARE lock");
      release(); await writing; await revoke;
      assert.deepEqual(await counts(), before.map(value => value + 1));
      assert.equal((await create("editor", valid(), a, 403)).error.code, "permission_denied");
    } finally { release(); await writing; if (revoke) await revoke; clearTimeout(watchdog); await table(db, "roles").where({ id: roleId }).update({ permissions: JSON.stringify([READ, CREATE]) }); }
  });
  await check("schema mismatch refuses repair, extra checks and unreviewed unique indexes", async () => {
    const before = await counts();
    await db.schema.withSchema("b2b").alterTable("tickets", t => t.string("fixture_unreviewed", 10));
    try { await assert.rejects(ensureSchema(db), /Support schema mismatch/); assert.equal(await db.schema.withSchema("b2b").hasColumn("tickets", "fixture_unreviewed"), true); }
    finally { await db.schema.withSchema("b2b").alterTable("tickets", t => t.dropColumn("fixture_unreviewed")); }
    await db.raw("ALTER TABLE b2b.ticket_messages ADD CONSTRAINT fixture_unreviewed CHECK (body <> '') NOT VALID");
    try { await assert.rejects(ensureSchema(db), /Support schema mismatch/); }
    finally { await db.raw("ALTER TABLE b2b.ticket_messages DROP CONSTRAINT fixture_unreviewed"); }
    await db.raw("CREATE UNIQUE INDEX fixture_unreviewed_ticket_message ON b2b.ticket_messages(ticket_id)");
    try { await assert.rejects(ensureSchema(db), /Support schema mismatch/); }
    finally { await db.raw("DROP INDEX b2b.fixture_unreviewed_ticket_message"); }
    await ensureSchema(db); assert.deepEqual(await counts(), before); assert.deepEqual(await table(db, "roles").orderBy("id"), initialRoles);
  });
  return actors;
};
