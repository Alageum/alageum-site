"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readCatalog } = require("../src/domain/catalog-source");
const v = require("../src/domain/catalog-validation");
const model = import("../src/plugins/alageum-catalog/admin/src/spec-draft.mjs");

test("all released reviewed records roundtrip their exact specification fields through the native draft", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  const keys = ["technicalSpecs", "configurations", "power", "voltage", "voltageUnit", "cooling", "installation", "subtype", "manufacturer", "manufacturers", "recordKind", "recordType", "isOrderableSku", "series", "familyId", "familyName", "variantIds", "variantSpecs", "notes"];
  const records = readCatalog();
  const expected = require("../data/catalog-release.json").recordCount;
  assert.equal(records.length, expected);
  for (const record of records) {
    const specs = Object.fromEntries(keys.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]));
    const result = serializeSpecsDraft(createSpecsDraft(specs));
    assert.deepEqual(result.errors, {}, record.id);
    assert.deepEqual(result.specs, specs, record.id);
    assert.deepEqual(v.parse(v.patch, { version: 1, specs: result.specs }).specs, specs, record.id);
  }
});

test("editing a typed row preserves literal strings, absent/null/empty units and nested evidence", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  const specs = {
    technicalSpecs: [
      { label: "Literal", value: "0001,20–2,0\nsecond source line", page: 12, source: { checked: true } },
      { label: "Number", value: 12.5, unit: null },
      { label: "Empty unit", value: "", unit: "" },
    ],
    configurations: [{ designation: "A", page: 31, kind: "configuration", specifications: [{ label: "Length", value: "001", unit: "мм", page: 31 }] }, { designation: "No rows", extra: false }],
    isOrderableSku: false, cooling: null, unknown: { values: [null, false, "12"] },
  };
  const draft = createSpecsDraft(specs);
  draft.technicalSpecs.rows[1].value.input = "13.75";
  const result = serializeSpecsDraft(draft);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.specs, { ...specs, technicalSpecs: [specs.technicalSpecs[0], { ...specs.technicalSpecs[1], value: 13.75 }, specs.technicalSpecs[2]] });
  assert.deepEqual(specs.technicalSpecs[1].value, 12.5, "original response is never mutated");
});

test("numbers require explicit type and reject lossy values with field errors", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  for (const literal of ["9007199254740993", "0.10000000000000001", "-0", "-0.0", "-0e5", "1e309", "Infinity", "12,5", " 12 ", "", "0x10"]) {
    const draft = createSpecsDraft({ technicalSpecs: [{ label: "Source", value: literal }] });
    assert.equal(serializeSpecsDraft(draft).specs.technicalSpecs[0].value, literal);
    assert.equal(JSON.parse(JSON.stringify(serializeSpecsDraft(draft).specs)).technicalSpecs[0].value, literal);
    draft.technicalSpecs.rows[0].value.mode = "number";
    assert.ok(serializeSpecsDraft(draft).errors["specs.technicalSpecs.0.value"], literal);
  }
  const draft = createSpecsDraft({ technicalSpecs: [{ label: "Measured", value: "12.50" }] });
  draft.technicalSpecs.rows[0].value.mode = "number";
  assert.equal(serializeSpecsDraft(draft).specs.technicalSpecs[0].value, 12.5);
  draft.technicalSpecs.rows[0].value.mode = "text";
  assert.equal(serializeSpecsDraft(draft).specs.technicalSpecs[0].value, "12.50");
});

test("negative power and nonpositive/fractional pages retain the draft and identify the exact control", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  const draft = createSpecsDraft({ power: 10, configurations: [{ designation: "A", specifications: [{ label: "Rated", value: "3", page: 2 }] }] });
  draft.fields.power.input = "-1";
  draft.configurations.rows[0].specifications.rows[0].page.input = "1.5";
  const result = serializeSpecsDraft(draft);
  assert.deepEqual(Object.keys(result.errors), ["specs.power", "specs.configurations.0.specifications.0.page"]);
  assert.equal(draft.fields.power.input, "-1");
  assert.equal(draft.configurations.rows[0].specifications.rows[0].page.input, "1.5");
});

test("numeric guidance offers only the types supported by each control", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  for (const input of ["1–2", "9007199254740993", "-0", "0.10000000000000001"]) {
    const draft = createSpecsDraft({ power: 1, technicalSpecs: [{ label: "Rated", value: 1, page: 1 }] });
    draft.fields.power.input = input;
    draft.technicalSpecs.rows[0].value.input = input;
    draft.technicalSpecs.rows[0].page.input = input;
    const { errors } = serializeSpecsDraft(draft);
    assert.match(errors["specs.power"], /text specification row/);
    assert.doesNotMatch(errors["specs.power"], /choose Text/i);
    assert.match(errors["specs.technicalSpecs.0.value"], /choose Text/i);
    assert.equal(errors["specs.technicalSpecs.0.page"], "Source page must be a positive safe integer");
  }
});

test("removing rows is explicit; empty arrays remain distinct from absent sections", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  const draft = createSpecsDraft({ technicalSpecs: [{ label: "Remove", value: "x" }], notes: [] });
  draft.technicalSpecs.rows = [];
  assert.deepEqual(serializeSpecsDraft(draft).specs, { technicalSpecs: [], notes: [] });
});

test("boolean authoring requires a selected true or false value", async () => {
  const { createSpecsDraft, serializeSpecsDraft } = await model;
  const draft = createSpecsDraft({});
  assert.equal(Object.hasOwn(serializeSpecsDraft(draft).specs, "isOrderableSku"), false);
  draft.fields.isOrderableSku = { mode: "boolean", input: "" };
  assert.ok(serializeSpecsDraft(draft).errors["specs.isOrderableSku"]);
  for (const input of ["false", "true"]) {
    draft.fields.isOrderableSku.input = input;
    const result = serializeSpecsDraft(draft);
    assert.deepEqual(result.errors, {});
    assert.equal(result.specs.isOrderableSku, input === "true");
  }
});

test("native 422 and category errors map to controls without changing v1 response shapes", async () => {
  const { validationErrors } = await model;
  const failure = (error) => ({ response: { data: { error } } });
  assert.deepEqual(validationErrors(failure({ code: "validation_error", details: [{ loc: ["specs", "technicalSpecs", 0, "value"], msg: "Expected text or number" }] })), { "specs.technicalSpecs.0.value": "Expected text or number" });
  assert.deepEqual(validationErrors(failure({ code: "category_not_published", message: "Publish the category before its products" })), { category_id: "Publish the category before its products" });
  assert.deepEqual(validationErrors(failure({ code: "catalog_version_conflict", details: { current_version: 3 } })), {});
});
