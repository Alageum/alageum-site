"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { documentId, documentOut, createDocuments, READ } = require("../src/domain/documents");
const id = "60000000-0000-4000-8000-000000000001";
const dto = () => ({ id, number: null, title: "Fictitious document", external_id: null, source: "manual", type_code: "opaque_inactive_type", latest_file_id: null });

test("documents retain metadata reads and add a separate permission-protected upload route", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(route => ["/documents", "/documents/:id"].includes(route.path));
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [["POST", "/documents"], ["GET", "/documents"], ["GET", "/documents/:id"]]);
  assert.equal(READ, "document.read");
  assert.throws(() => createDocuments({}), /Transactional audit writer/);
});
test("document DTO preserves seven required fields with nullable metadata and no storage disclosure", () => {
  const row = { ...dto(), storage_key: "hidden", organization_id: "hidden", created_at: "hidden", version: 9, file: { private: "hidden" } };
  assert.deepEqual(documentOut(row), dto());
  assert.equal(documentOut({ ...row, latest_file_id: id, number: "", external_id: "" }).latest_file_id, id);
  for (const field of Object.keys(dto())) {
    const missing = { ...row }; delete missing[field];
    assert.throws(() => documentOut(missing), /Invalid document metadata DTO/);
    assert.throws(() => documentOut({ ...row, [field]: 123 }), /Invalid document metadata DTO/);
  }
  for (const patch of [{ id: "bad" }, { latest_file_id: "bad" }, { title: null }, { source: null }, { type_code: null }])
    assert.throws(() => documentOut({ ...row, ...patch }), /Invalid document metadata DTO/);
});
test("document UUID parsing preserves Pydantic forms and structured invalid-path 422", () => {
  for (const value of [id, id.toUpperCase(), id.replaceAll("-", ""), `{${id}}`, `urn:uuid:${id}`]) assert.equal(documentId(value), id);
  for (const value of ["bad", ` ${id}`, `URN:UUID:${id}`, null, undefined]) assert.throws(() => documentId(value), error => error.status === 422 && error.code === "validation_error" && error.details[0].loc.join(".") === "path.document_id");
});

function detailFixture(row, failAudit = false) {
  const organization_id = id, log = [], audits = [];
  const records = {
    users: { id, is_active: true }, memberships: { id, user_id: id, organization_id, role_id: id, is_active: true },
    organizations: { id, is_active: true }, roles: { id, organization_id, permissions: [READ] }, documents: row,
  };
  const tx = { raw() {}, withSchema() { return this; }, table(name) {
    const builder = { where() { return this; }, forShare() { return this; }, join() { return this; }, select() { return this; }, first: async () => records[name] };
    return builder;
  } };
  const db = { transaction: async work => {
    log.push("begin"); const initial = audits.length;
    try { const result = await work(tx); log.push("commit"); return result; }
    catch (error) { audits.splice(initial); log.push("rollback"); throw error; }
  } };
  const context = { user: records.users, membership: records.memberships, organization_id };
  const audit = async (_tx, _ctx, event) => { log.push("audit"); audits.push(event); if (failAudit) throw new Error("Fictitious audit failure"); };
  return { domain: createDocuments({ db, auth: { permission: async () => context }, audit }), ctx: { params: { id }, set() {} }, log, audits };
}
test("document detail commits its audit before DTO serialization, matching the legacy failure sequence", async () => {
  const fixture = detailFixture({ ...dto(), title: 123 });
  await assert.rejects(fixture.domain.detail(fixture.ctx), /Invalid document metadata DTO/);
  assert.deepEqual(fixture.log, ["begin", "audit", "commit"]);
  assert.deepEqual(fixture.audits, [{ action: "document.view", actor_user_id: id, organization_id: id, entity_type: "document", entity_id: id }]);
  assert.equal(fixture.ctx.body, undefined);
});
test("document audit failure rolls back the event and produces no success DTO", async () => {
  const fixture = detailFixture(dto(), true);
  await assert.rejects(fixture.domain.detail(fixture.ctx), /Fictitious audit failure/);
  assert.deepEqual(fixture.log, ["begin", "audit", "rollback"]); assert.deepEqual(fixture.audits, []); assert.equal(fixture.ctx.body, undefined);
});
test("valid missing document raises the exact legacy 404 without audit", async () => {
  const fixture = detailFixture(undefined);
  await assert.rejects(fixture.domain.detail(fixture.ctx), error => error.status === 404 && error.code === "document_not_found" && error.message === "Document not found");
  assert.deepEqual(fixture.log, ["begin", "rollback"]); assert.deepEqual(fixture.audits, []);
});
