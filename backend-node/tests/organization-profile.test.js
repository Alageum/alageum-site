"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validatePatch, LIMITS, snapshot } = require("../src/domain/organization-profile");
const rejected = (error) => error.code === "validation_error" && error.status === 422;

test("company profile PATCH is strict and never accepts ownership, authority or legal fields", () => {
  for (const value of [null, [], "value", {}, { version: 0 }, { name: "Fixture" }, ...["0", null, -1, 0.1, 2147483648, Infinity].map(version => ({ version, name: "Fixture" }))])
    assert.throws(() => validatePatch(value), rejected);
  for (const field of ["id", "organization_id", "user_id", "role_id", "external_id", "is_active", "permissions", "updated_at", "bank_account", "legal_id", "contact_verified", "__proto__"])
    assert.throws(() => validatePatch(JSON.parse(JSON.stringify({ version: 0, name: "Fixture" }).slice(0, -1) + `,"${field}":"value"}`)), rejected);
});

test("company profile strings are bounded, typed, and optional blanks/nulls clear", () => {
  for (const [field, max] of Object.entries(LIMITS)) {
    for (const value of [10, true, {}, [], undefined, "x".repeat(max + 1), "nul\0byte"])
      assert.throws(() => validatePatch({ version: 0, [field]: value }), rejected, field);
    if (field !== "business_contact_email") assert.equal(validatePatch({ version: 0, [field]: "x".repeat(max) }).fields[field].length, max);
    if (field !== "name") for (const value of [null, "", "   ", " \t\r\n "]) assert.equal(validatePatch({ version: 0, [field]: value }).fields[field], null);
  }
  for (const value of [null, "", "  ", "line\nbreak", "name\tpart"]) assert.throws(() => validatePatch({ version: 0, name: value }), rejected);
  for (const value of ["no-at", "@example.test", "test@", "a@@example.test", "a@bad domain.test", "a@example", "a@example.test\nextra"]) assert.throws(() => validatePatch({ version: 0, business_contact_email: value }), rejected);
});

test("company contact normalization keeps literal spelling and address line breaks", () => {
  assert.deepEqual(validatePatch({ version: 2, name: " Fictional Company ", business_contact_name: " Fixture Person ", business_contact_email: " Fixture.Name+Business@Example.TEST ", business_contact_phone: " +000 (123) 45 ext. 67 ", business_address: "  Fictional Line 1\nSuite 2\r\nExample City  " }), { version: 2, fields: { name: "Fictional Company", business_contact_name: "Fixture Person", business_contact_email: "Fixture.Name+Business@Example.TEST", business_contact_phone: "+000 (123) 45 ext. 67", business_address: "Fictional Line 1\nSuite 2\r\nExample City" } });
  assert.deepEqual(validatePatch({ version: 0, name: "Same" }).fields, { name: "Same" });
  assert.deepEqual(validatePatch({ version: 0, name: "\t Fixture Company\n", business_contact_email: "\nFixture@Example.TEST\t" }).fields, { name: "Fixture Company", business_contact_email: "Fixture@Example.TEST" });
});

test("unsaved company profile is version zero with an allowlisted response", () => {
  assert.deepEqual(snapshot({ id: "fixture-id", name: "Fixture Company", updated_at: "time", external_id: "hidden", is_active: true }), { organization_id: "fixture-id", name: "Fixture Company", business_contact_name: null, business_contact_email: null, business_contact_phone: null, business_address: null, version: 0, updated_at: "time" });
});
