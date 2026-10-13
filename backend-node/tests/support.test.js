"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { categoryUuid, validateTicket, pagination, requestPagination, summary, createSupport } = require("../src/domain/support");
const id = "40000000-0000-4000-8000-000000000001";
const valid = () => ({ category_id: id, subject: "Fictitious request", message: "Fictitious initial message" });
const rejected = error => error.code === "validation_error" && error.status === 422 && error.message === "Invalid request" && Array.isArray(error.details);

test("support accepts only three explicit v1 routes without ticket detail or state mutation", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(route => route.path.startsWith("/support"));
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [["GET", "/support/categories"], ["GET", "/support/tickets"], ["POST", "/support/tickets"]]);
});
test("ticket request rejects missing, mistyped and server-owned fields", () => {
  for (const input of [null, [], 1, "request", {}, ...Object.keys(valid()).map(key => { const value = valid(); delete value[key]; return value; })]) assert.throws(() => validateTicket(input), rejected);
  for (const field of Object.keys(valid())) for (const value of [null, 1, true, {}, []]) assert.throws(() => validateTicket({ ...valid(), [field]: value }), rejected);
  for (const field of ["organization_id", "created_by_id", "author_user_id", "status_id", "status", "source", "id", "created_at", "messages", "attachments", "permissions", "idempotency_key", "__proto__"])
    assert.throws(() => validateTicket(JSON.parse(JSON.stringify(valid()).slice(0, -1) + `,"${field}":"forbidden"}`)), rejected);
});
test("ticket subject/message preserve whitespace and Unicode code points exactly", () => {
  for (const text of [" ", "\t\r\n", " A\nБ\r\n中\t ", "e\u0301", "😀", "\u0000"]) {
    const result = validateTicket({ category_id: id, subject: text, message: text });
    assert.equal(result.subject, text); assert.equal(result.message, text);
  }
  for (const [field, maximum] of [["subject", 300], ["message", 10000]]) {
    assert.equal(validateTicket({ ...valid(), [field]: "😀".repeat(maximum) })[field], "😀".repeat(maximum));
    for (const value of ["", "a".repeat(maximum + 1), "😀".repeat(maximum + 1)]) assert.throws(() => validateTicket({ ...valid(), [field]: value }), rejected);
  }
});
test("category UUID formats match preserved Pydantic UUID identity including nil/non-v4", () => {
  for (const value of [id, id.toUpperCase(), id.replaceAll("-", ""), `{${id}}`, `urn:uuid:${id}`, "00000000-0000-0000-0000-000000000000"])
    assert.equal(categoryUuid(value), value.includes("00000000-0000-0000-0000") ? value : id);
  for (const value of [` ${id}`, `${id} `, `URN:UUID:${id}`, `{${id.replaceAll("-", "")}}`, `urn:uuid:${id.replaceAll("-", "")}`, `urn:uuid:{${id}}`, "x", null, 1]) assert.equal(categoryUuid(value), null);
});
test("ticket validation retains v1 error envelope details and redacts credential extras", () => {
  try { validateTicket({ ...valid(), password: "fictitious-secret", nested: { api_key: "fictitious-key" } }); assert.fail(); }
  catch (error) {
    assert.ok(rejected(error));
    assert.deepEqual(error.details[0], { type: "extra_forbidden", loc: ["body", "password"], msg: "Extra inputs are not permitted", input: "[REDACTED]" });
    assert.equal(error.details[1].input.api_key, "[REDACTED]");
  }
});
test("support page default50, size clamp100 and ignored extra query keys match legacy", () => {
  assert.deepEqual(pagination(), { page: 1, page_size: 50, offset: 0n });
  assert.deepEqual(pagination({ page: "3", page_size: "999", organization_id: id, arbitrary: "ignored" }), { page: 3, page_size: 100, offset: 200n });
  assert.deepEqual(pagination({ page: ["broken", "2"], page_size: ["0", "3"] }), { page: 2, page_size: 3, offset: 3n });
  for (const value of ["01", "+1", " 1 ", "1.00", "\t1\r\n", "1\u0085", "0__1", "0_0__1", "+0__1.0", "0".repeat(4400) + "1", "1." + "0".repeat(4400)]) assert.equal(pagination({ page: value }).page, 1);
  assert.equal(pagination({ page: "1_000" }).page, 1000);
  assert.equal(pagination({ page_size: "999999999999999999999999999" }).page_size, 100);
  const huge = pagination({ page: "9007199254740993" });
  assert.equal(JSON.stringify(huge.page), "9007199254740993"); assert.equal(huge.offset, 450359962737049600n);
});
test("support pagination rejects nonpositive/fractional/noninteger scalars", () => {
  for (const field of ["page", "page_size"]) for (const value of ["0", "-1", "", "1.5", "1e1", "\ufeff1", "1__0", "1_.0", "1.0_0", "1.", "one", "١", "1".repeat(4301)])
    assert.throws(() => pagination({ [field]: value }), rejected);
});
test("support DTO allowlist excludes initial message, creator, tenant, and timestamps", () => {
  assert.deepEqual(summary({ id, subject: "Fictitious", category: "other", status: "new", message: "private", created_by_id: id, organization_id: id, created_at: "hidden" }), { id, subject: "Fictitious", category: "other", status: "new" });
  assert.throws(() => createSupport({}), /Transactional audit writer is required/);
});

test("support consumes exact query keys before Strapi nesting and key limits", () => {
  for (const querystring of ["page[]=2", "page[0]=2", "page[x]=2", "page=1&page[]=2"]) assert.equal(requestPagination({ querystring }).page, 1);
  assert.equal(requestPagination({ querystring: "page=1&page=2" }).page, 2);
  assert.equal(requestPagination({ querystring: "ignored=x&".repeat(1000) + "page=2" }).page, 2);
});
