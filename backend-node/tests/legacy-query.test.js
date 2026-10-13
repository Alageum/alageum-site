"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { AppError } = require("../src/domain/errors");
const query = require("../src/domain/legacy-query");
const fixture = JSON.parse(readFileSync(path.join(__dirname, "reference/legacy-query.json"), "utf8"), (key, value, context) =>
  typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value) ? JSON.rawJSON(context.source) : value);

test("query reference identifies and verifies the frozen sources and exact runtime", () => {
  assert.equal(fixture.evidence, "query-reference; not full legacy endpoint execution");
  assert.deepEqual(fixture.runtime_versions, { fastapi: "0.141.1", starlette: "1.6.0", pydantic: "2.13.4", "pydantic-core": "2.46.4", httpx: "0.28.1" });
  for (const [file, digest] of Object.entries(fixture.source_sha256)) {
    const source = readFileSync(path.join(__dirname, "../..", file));
    assert.equal(createHash("sha256").update(source).digest("hex"), digest, `Frozen source changed: ${file}`);
  }
});

for (const vector of fixture.cases) test(`frozen ASGI query reference: ${vector.id}`, () => {
  let actual;
  try {
    // Deliberately conflicting nested/parser values prove the raw URL wins.
    const ctx = { querystring: vector.query, query: { page: "99", page_size: "9", mine: "true", category_id: "bad" } };
    const parser = { pagination: query.requestPagination, filters: query.requestFilterQuery, quotes: query.requestQuoteQuery }[vector.endpoint];
    const value = parser(ctx);
    actual = { status: 200, body: { ...value, offset: value.offset.toString() } };
  } catch (error) {
    assert.ok(error instanceof AppError, vector.id);
    actual = { status: error.status, body: { error: { code: error.code, message: error.message, details: error.details, request_id: null } } };
  }
  assert.deepEqual(actual, vector.expected);
});

test("support pagination exports preserve the original public function identities", () => {
  const support = require("../src/domain/support");
  assert.equal(support.pagination, query.pagination);
  assert.equal(support.requestPagination, query.requestPagination);
});

test("internal scalar fallback uses exact own names, last duplicates, and raw HTTP strings", () => {
  assert.equal(query.requestScalar({ query: { mine: ["false", "true"], "mine[]": "false" } }, "mine"), "true");
  assert.equal(query.requestScalar({ query: Object.create({ mine: "true" }) }, "mine"), undefined);
  assert.equal(query.requestScalar({ query: { mine: "true" }, querystring: "" }, "mine"), undefined);
  assert.equal(query.parseMine({}), false);
  assert.equal(query.parseMine({ query: { mine: ["bad", "yes"] } }), true);
  for (const mine of [true, false, 0, 1, null, {}, ["true", "bad"]])
    assert.throws(() => query.parseMine({ query: { mine } }), error => error.code === "validation_error");
});

test("far page remains an exact JSON integer with an exact BigInt offset", () => {
  const value = query.requestPagination({ querystring: "page=9007199254740993" });
  assert.equal(JSON.stringify(value.page), "9007199254740993");
  assert.equal(value.offset, 450359962737049600n);
  assert.equal(value.page_size, 50);
});
