"use strict";
// Invoked only by the fresh, guarded member runner. All identities are synthetic.
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const { table } = require("../src/domain/auth");
const { createOrganizationMembers, READ } = require("../src/domain/organization-members");
const fixtures = require("../scripts/seed-test-member-users");
const code = value => error => error.code === value;
const pause = ms => new Promise(done => setTimeout(done, ms));
function request(actor, organization, query = {}) {
  const headers = { authorization: `Bearer ${actor.access_token}`, "x-organization-id": organization || "" };
  return { request: {}, query, state: {}, headers: {}, get: name => headers[name.toLowerCase()] || "", set(name, value) { this.headers[name] = value; } };
}
async function snapshot(db) {
  const tables = await db("information_schema.tables").select("table_name").where({ table_schema: "b2b", table_type: "BASE TABLE" }).orderBy("table_name");
  const result = {};
  for (const { table_name: name } of tables) {
    // Identifiers come from the isolated database catalog and are quoted by Knex.
    result[name] = (await db.raw("SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text), '[]'::jsonb)::text AS value FROM ?? AS x", [`b2b.${name}`])).rows[0].value;
  }
  return JSON.stringify(result);
}
module.exports = async function verifyMembers({ app, api, check, manifest, password, rememberSecret }) {
  const db = app.db.connection, a = manifest.organizations.a.id, b = manifest.organizations.b.id;
  const actors = {}, originalRoles = await table(db, "roles").orderBy("id");
  const list = (kind = "reader", organization = a, suffix = "", expected = 200) => api(`/organizations/members${suffix}`, { actor: actors[kind], organization, expected });
  async function unchanged(work) { const before = await snapshot(db); await work(); assert.equal(await snapshot(db), before, "Member requests must not change identity, session, audit or business rows"); }
  function generic(result, forbidden = []) {
    assert.deepEqual(Object.keys(result), ["error"]);
    assert.deepEqual(Object.keys(result.error).sort(), ["code", "details", "message", "request_id"]);
    assert.equal(result.error.code, "internal_error"); assert.equal(result.error.message, "Request failed"); assert.equal(result.error.details, null);
    for (const value of forbidden.filter(Boolean)) assert.equal(JSON.stringify(result).includes(value), false, "Failure must not disclose stored identity or role metadata");
  }
  async function blocked(pattern) {
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      if ((await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?", [pattern])).rows.length) return;
      await pause(20);
    }
    assert.fail("Expected caller authority lock to block the concurrent operation");
  }
  // Hook the actual SQL result to exercise malformed driver/missing join data
  // without weakening identity FKs or altering the existing schema.
  async function project(patch, work) {
    const listener = rows => {
      if (Array.isArray(rows)) for (const row of rows) if (row?.membership_id === manifest.targets.plainEmail.membership_id && Object.hasOwn(row, "joined_user_id")) Object.assign(row, patch);
    };
    db.on("query-response", listener);
    try { await work(); } finally { db.off("query-response", listener); }
  }

  await check("real logins use test-only manage_users grants without profile or platform access", async () => {
    for (const kind of Object.keys(fixtures.EMAILS)) {
      actors[kind] = await api("/auth/login", { method: "POST", data: { email: fixtures.EMAILS[kind], password } });
      rememberSecret(actors[kind].access_token); rememberSecret(actors[kind].refresh_token);
      assert.deepEqual((await api("/auth/me", { actor: actors[kind], organization: kind === "other" ? b : a })).permissions, kind === "denied" ? [] : kind === "profile" ? ["organization.profile.read", "organization.profile.update"] : [READ]);
    }
    assert.deepEqual(await table(db, "roles").orderBy("id"), originalRoles);
  });
  const baseline = await snapshot(db);
  await check("exact six-field first and later pages preserve created_at then id ordering and totals", () => unchanged(async () => {
    const first = await list(), second = await list("reader", a, "?page=2");
    assert.deepEqual(Object.keys(first).sort(), ["items", "page", "page_size", "total"]);
    assert.deepEqual(first, { items: manifest.members.a.slice(0, 50), page: 1, page_size: 50, total: manifest.members.a.length });
    assert.deepEqual(second, { items: manifest.members.a.slice(50), page: 2, page_size: 50, total: manifest.members.a.length });
    assert.deepEqual([...first.items, ...second.items], manifest.members.a);
    for (const item of first.items) assert.deepEqual(Object.keys(item).sort(), ["display_name", "email", "membership_id", "role_id", "role_name", "user_id"]);
    const raw = await api("/organizations/members", { actor: actors.reader, organization: a, raw: true });
    for (const key of ["organization_id", "permissions", "password_hash", "is_active", "created_at", "updated_at", "joined_role_id", "joined_user_id", "role_organization_id"]) assert.equal(raw.includes(`"${key}"`), false);
  }));
  await check("inactive targets, valid global roles and plain blank/nonstandard/Unicode identity strings remain visible", () => unchanged(async () => {
    const result = await list();
    for (const target of Object.values(manifest.targets)) assert.deepEqual(result.items.find(item => item.membership_id === target.membership_id), target);
    assert.equal((await table(db, "memberships").where({ id: manifest.targets.inactiveMembership.membership_id }).first()).is_active, false);
    assert.equal((await table(db, "users").where({ id: manifest.targets.inactiveUser.user_id }).first()).is_active, false);
    assert.equal((await table(db, "roles").where({ id: manifest.targets.global.role_id }).first()).organization_id, null);
    assert.equal(manifest.targets.blank.email, "");
    assert.equal(result.items.some(item => Object.hasOwn(item, "is_active")), false);
  }));
  await check("same-tenant peers agree while selected multi-membership tenants remain disjoint", () => unchanged(async () => {
    assert.deepEqual(await list("peer"), await list());
    assert.deepEqual((await list("other", b)).items, manifest.members.b);
    assert.deepEqual((await list("multi", a)).items, manifest.members.a.slice(0, 50));
    assert.deepEqual((await list("multi", b)).items, manifest.members.b);
    assert.equal((await list("reader", b, "", 403)).error.code, "organization_access_denied");
    assert.equal((await list("multi", null, "", 400)).error.code, "organization_required");
    assert.equal((await list("multi", randomUUID(), "", 403)).error.code, "organization_access_denied");
  }));
  await check("legacy pagination preserves defaults, cap, duplicate scalars, raw keys and huge integer wire values", () => unchanged(async () => {
    assert.deepEqual((await list("reader", a, "?page=2&page_size=1")).items, manifest.members.a.slice(1, 2));
    for (const suffix of ["?page=%2B01.00&page_size=999", "?page=%20%091%20&page_size=9999999999999999999999999", "?page=0__1&page_size=100", "?page=%C2%A01%E3%80%80&page_size=100"]) {
      const result = await list("reader", a, suffix); assert.equal(result.page, 1); assert.equal(result.page_size, 100); assert.deepEqual(result.items, manifest.members.a);
    }
    for (const query of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2"]) assert.equal((await list("reader", a, `?${query}`)).page, 1);
    assert.deepEqual((await list("reader", a, "?page=bad&page=2&page_size=1")).items, manifest.members.a.slice(1, 2));
    assert.equal((await list("reader", a, `?${"ignored=x&".repeat(1000)}page=2`)).page, 2);
    const huge = await api("/organizations/members?page=9007199254740993", { actor: actors.reader, organization: a, raw: true });
    assert.match(huge, /"page":9007199254740993(?:,|})/); assert.deepEqual(JSON.parse(huge).items, []);
    for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "1.5", "1e2", "", "one", "%EF%BB%BF1", "1".repeat(4301)])
      assert.equal((await list("reader", a, `?${field}=${value}`, 422)).error.code, "validation_error");
  }));
  await check("out-of-range empty pages retain full totals; query/body cannot choose organization", () => unchanged(async () => {
    assert.deepEqual(await list("reader", a, "?page=9"), { items: [], page: 9, page_size: 50, total: manifest.members.a.length });
    assert.deepEqual((await list("reader", a, `?organization_id=${b}&mine=true&unknown=ignored`)).items, manifest.members.a.slice(0, 50));
    const ctx = request(actors.reader, a); ctx.request.body = { organization_id: b, role_id: manifest.roles.b.reader, user_id: manifest.users.other.id };
    await app.alageum.organizationMembers.list(ctx); assert.deepEqual(ctx.body.items, manifest.members.a.slice(0, 50));
    assert.equal(ctx.headers["Cache-Control"], "private, no-store");
  }));
  await check("private failures reject absent/expired/native-CMS auth and exact missing permission", () => unchanged(async () => {
    await api("/organizations/members", { expected: 401 });
    assert.equal((await list("denied", a, "", 403)).error.code, "permission_denied");
    for (const secret of [app.config.get("admin.auth.secret"), app.config.get("plugin::users-permissions.jwtSecret")].filter(Boolean)) {
      const native = jwt.sign({ id: 1, type: "access" }, secret, { expiresIn: "15m" }); rememberSecret(native);
      await api("/organizations/members", { actor: { access_token: native }, organization: a, expected: 401 });
    }
    const now = Math.floor(Date.now() / 1000), payload = jwt.decode(actors.peer.access_token);
    const expired = jwt.sign({ ...payload, iat: now - 120, nbf: now - 120, exp: now - 1 }, app.config.get("alageum.jwtSecret"), { algorithm: "HS256" }); rememberSecret(expired);
    await api("/organizations/members", { actor: { access_token: expired }, organization: a, expected: 401 });
    // Profile-only permissions do not become member authority.
    const deniedRole = manifest.roles.a.denied;
    await table(db, "roles").where({ id: deniedRole }).update({ permissions: JSON.stringify(["organization.profile.read", "organization.profile.update"]) });
    try { await list("denied", a, "", 403); } finally { await table(db, "roles").where({ id: deniedRole }).update({ permissions: "[]" }); }
  }));
  await check("member invites, role writes, grants, exports and account actions remain unavailable", () => unchanged(async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) await api("/organizations/members", { actor: actors.reader, organization: a, method, data: {}, expected: 405 });
    for (const path of ["/organizations/members/invite", `/organizations/members/${manifest.targets.regular.membership_id}/role`, "/organizations/members/export", "/organizations/members/permissions", "/organizations/members/accounts"]) {
      await api(path, { actor: actors.reader, organization: a, expected: 404 });
      await api(path, { actor: actors.reader, organization: a, method: "POST", data: {}, expected: 405 });
    }
  }));
  await check("foreign target role fails only its affected page generically without filtering or label disclosure", () => unchanged(async () => {
    const target = manifest.targets.plainEmail, foreignRole = await table(db, "roles").where({ id: manifest.roles.b.reader }).first();
    await table(db, "memberships").where({ id: target.membership_id }).update({ role_id: foreignRole.id });
    try {
      const before = await snapshot(db);
      generic(await list("reader", a, "", 500), [target.email, target.display_name, foreignRole.name, foreignRole.id]);
      assert.deepEqual(await list("reader", a, "?page=2"), { items: manifest.members.a.slice(50), page: 2, page_size: 50, total: manifest.members.a.length });
      assert.equal(await snapshot(db), before);
    } finally { await table(db, "memberships").where({ id: target.membership_id }).update({ role_id: target.role_id }); }
  }));
  await check("missing user/role join projections fail generically without identity schema changes", () => unchanged(async () => {
    for (const patch of [{ joined_user_id: null, email: null, display_name: null }, { joined_role_id: null, role_name: null, role_organization_id: null }]) await project(patch, async () => {
      generic(await list("reader", a, "", 500), Object.values(manifest.targets.plainEmail));
      assert.deepEqual((await list("reader", a, "?page=2")).items, manifest.members.a.slice(50));
    });
  }));
  await check("malformed stored DTO types/nulls never become an empty success or expose identity in errors", () => unchanged(async () => {
    for (const field of ["membership_id", "user_id", "email", "display_name", "role_id", "role_name"]) for (const value of [null, 123])
      await project({ [field]: value }, async () => generic(await list("reader", a, "", 500), Object.values(manifest.targets.plainEmail)));
  }));
  await check("fresh transaction denies previously valid caller after user/membership/organization/role revocation", () => unchanged(async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    const guarded = createOrganizationMembers({ db, auth: { permission: async () => context } });
    for (const [name, id, revoked, restore, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, "authentication_required"],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["organizations", a, { is_active: false }, { is_active: true }, "organization_access_denied"],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, "permission_denied"],
      ["roles", context.membership.role.id, { organization_id: b, code: "member_fixture_moved_role" }, { organization_id: a, code: context.membership.role.code }, "organization_access_denied"],
    ]) {
      await table(db, name).where({ id }).update(revoked);
      try {
        const ctx = request(actors.reader, a); await assert.rejects(guarded.list(ctx), code(expected)); assert.equal(ctx.headers["Cache-Control"], "private, no-store");
        assert.equal((await list("reader", a, "", expected === "authentication_required" ? 401 : 403)).error.code, expected);
      } finally { await table(db, name).where({ id }).update(restore); }
    }
  }));
  await check("fresh role reassignment ignores stale cached grants and refuses cross-tenant authority", () => unchanged(async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    const guarded = createOrganizationMembers({ db, auth: { permission: async () => context } });
    for (const [role_id, expected] of [[manifest.roles.a.denied, "permission_denied"], [manifest.roles.b.reader, "organization_access_denied"], [manifest.roles.global, "permission_denied"]]) {
      await table(db, "memberships").where({ id: context.membership.id }).update({ role_id });
      try { await assert.rejects(guarded.list(request(actors.reader, a)), code(expected)); }
      finally { await table(db, "memberships").where({ id: context.membership.id }).update({ role_id: context.membership.role.id }); }
    }
  }));
  await check("global caller role keeps the same selected membership scope without an all-tenant bypass", () => unchanged(async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    await table(db, "roles").where({ id: context.membership.role.id }).update({ organization_id: null });
    try {
      assert.deepEqual((await list()).items, manifest.members.a.slice(0, 50));
      assert.equal((await list("reader", b, "", 403)).error.code, "organization_access_denied");
    } finally { await table(db, "roles").where({ id: context.membership.role.id }).update({ organization_id: a }); }
  }));
  await check("list holds caller authority locks through commit before concurrent revocation or reassignment", () => unchanged(async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    for (const [name, id, patch, restore, expected] of [
      ["users", context.user.id, { is_active: false }, { is_active: true }, 401],
      ["memberships", context.membership.id, { is_active: false }, { is_active: true }, 403],
      ["organizations", a, { is_active: false }, { is_active: true }, 403],
      ["roles", context.membership.role.id, { permissions: "[]" }, { permissions: JSON.stringify([READ]) }, 403],
      ["memberships", context.membership.id, { role_id: manifest.roles.a.denied }, { role_id: context.membership.role.id }, 403],
    ]) {
      let release, entered, revoke;
      const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
      const held = createOrganizationMembers({ db: { transaction: work => db.transaction(async tx => { const result = await work(tx); entered(); await barrier; return result; }) }, auth: app.alageum.auth });
      const ctx = request(actors.reader, a), reading = held.list(ctx), watchdog = setTimeout(release, 12000); reading.catch(() => {});
      try {
        await ready; revoke = table(db, name).where({ id }).update(patch).then(() => {});
        await blocked(`update%${name}%`); release(); await reading; await revoke;
        assert.deepEqual(ctx.body.items, manifest.members.a.slice(0, 50)); await list("reader", a, "", expected);
      } finally { release(); await reading; if (revoke) await revoke; clearTimeout(watchdog); await table(db, name).where({ id }).update(restore); }
    }
  }));
  await check("a revocation committed while fresh authorization waits is honored before any result", () => unchanged(async () => {
    const context = await app.alageum.auth.context(request(actors.reader, a));
    let release, entered;
    const barrier = new Promise(done => { release = done; }), ready = new Promise(done => { entered = done; });
    const revoking = db.transaction(async tx => { await table(tx, "roles").where({ id: context.membership.role.id }).update({ permissions: "[]" }); entered(); await barrier; });
    const watchdog = setTimeout(release, 12000); let reading;
    try {
      await ready;
      const guarded = createOrganizationMembers({ db, auth: { permission: async () => context } });
      reading = guarded.list(request(actors.reader, a)); reading.catch(() => {});
      await blocked('%"roles"%for share%'); release(); await revoking;
      await assert.rejects(reading, code("permission_denied"));
    } finally { release(); await revoking; if (reading) await reading.catch(() => {}); clearTimeout(watchdog); await table(db, "roles").where({ id: context.membership.role.id }).update({ permissions: JSON.stringify([READ]) }); }
  }));
  await check("all successful, invalid, denied and malformed reads preserve every row and original grant", async () => {
    assert.equal(await snapshot(db), baseline);
    assert.deepEqual(await table(db, "roles").orderBy("id"), originalRoles);
  });
  return actors;
};
module.exports.EXPECTED_CHECKS = 17;
module.exports.snapshot = snapshot;
