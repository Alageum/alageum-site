"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { READ, memberOut, createOrganizationMembers } = require("../src/domain/organization-members");
const id = "70000000-0000-4000-8000-000000000001", foreign = "70000000-0000-4000-8000-000000000002";
const dto = () => ({ membership_id: id, user_id: id, email: " Unusual Email String ", display_name: "Айдана <script>synthetic</script>", role_id: id, role_name: "Fictitious role" });
const row = () => ({ ...dto(), joined_user_id: id, joined_role_id: id, role_organization_id: id, password_hash: "hidden", permissions: [READ], is_active: false });

test("member route is exclusively the authorized GET using the existing manage_users permission", () => {
  const routes = require("../src/api/compat/routes/compat").routes.filter(route => route.path.startsWith("/organizations/members"));
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [["GET", "/organizations/members"]]);
  assert.equal(READ, "organization.manage_users");
  assert.deepEqual(Object.keys(createOrganizationMembers({})), ["list"]);
});
test("member DTO preserves exactly six fields, inactive rows, plain email text and local/global roles", () => {
  assert.deepEqual(memberOut(row(), id), dto());
  for (const email of ["", " ", "nonstandard", "Case@EXAMPLE.invalid", "名@example.invalid"])
    assert.equal(memberOut({ ...row(), email }, id).email, email);
  assert.deepEqual(memberOut({ ...row(), role_organization_id: null }, id), dto());
  assert.equal(memberOut({ ...row(), display_name: "", role_name: "" }, id).display_name, "");
});
test("member DTO rejects missing, null and wrongly typed fields with no stored identity in errors", () => {
  for (const key of Object.keys(dto())) for (const value of [undefined, null, 123, {}, []]) {
    const input = { ...row(), [key]: value };
    assert.throws(() => memberOut(input, id), error => error instanceof TypeError && error.message === "Invalid organization member DTO");
  }
  for (const key of ["membership_id", "user_id", "role_id"])
    assert.throws(() => memberOut({ ...row(), [key]: "bad" }, id), /Invalid organization member DTO/);
});
test("member DTO fails the page for missing users/roles and foreign target role ownership", () => {
  for (const patch of [{ joined_user_id: null }, { joined_role_id: null }, { joined_user_id: foreign }, { joined_role_id: foreign }, { role_organization_id: undefined }, { role_organization_id: foreign }])
    assert.throws(() => memberOut({ ...row(), ...patch }, id), /Invalid organization member DTO/);
});
test("member errors set private no-store before authentication and never invoke a transaction", async () => {
  const headers = {}, rejected = new Error("Fictitious authentication failure"); let transactions = 0;
  const domain = createOrganizationMembers({ db: { transaction() { transactions++; } }, auth: { permission: async (_ctx, permission) => { assert.equal(permission, READ); throw rejected; } } });
  await assert.rejects(domain.list({ set: (key, value) => { headers[key] = value; } }), error => error === rejected);
  assert.equal(headers["Cache-Control"], "private, no-store"); assert.equal(transactions, 0);
});
