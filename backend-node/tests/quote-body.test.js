"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { recoverQuoteJsonScalar } = require("../src/domain/quote-body");

function failure(body) {
  return Object.assign(new SyntaxError("invalid JSON, only supports object and array"), { status: 400, body });
}
function context(path = "/api/v1/quotes/catalog", method = "POST") {
  return { path, method, request: {} };
}

test("decoded quote JSON scalars reach quota/auth before domain model validation", () => {
  for (const value of [null, true, false, 0, 1.25, "text", "__proto__"]) {
    const ctx = context();
    recoverQuoteJsonScalar(failure(JSON.stringify(value)), ctx);
    assert.equal(ctx.request.body, value);
  }
  const ctx = context("/API/v1/quotes/catalog/");
  recoverQuoteJsonScalar(failure('"case/trailing slash"'), ctx);
  assert.equal(ctx.request.body, "case/trailing slash");
});

test("native syntax, byte-limit, prototype and object parsing protections remain unchanged", () => {
  const errors = [
    ...[" ", "undefined", '"unterminated', "{broken", '{"__proto__":{}}', "[]", "{}"].map(failure),
    Object.assign(new Error("request entity too large"), { status: 413, body: '"text"' }),
    Object.assign(new SyntaxError("Object contains forbidden prototype property"), { status: 400, body: '{"__proto__":{}}' }),
    Object.assign(new SyntaxError("Unexpected token"), { status: 400, body: '"text"' }),
  ];
  for (const error of errors) {
    const ctx = context();
    assert.throws(() => recoverQuoteJsonScalar(error, ctx), actual => actual === error);
    assert.deepEqual(ctx.request, {});
  }
});

test("all other routes and methods preserve the native parser error", () => {
  for (const [path, method] of [
    ["/admin/login", "POST"], ["/api/v1/auth/login", "POST"],
    ["/api/v1/quotes", "POST"], ["/api/v1/quotes/catalogue", "POST"],
    ["/api/v1/support/tickets", "POST"], ["/api/v1/quotes/catalog", "PUT"],
    ["/api/v1/quotes/catalog//", "POST"], ["/api/v1/quotes/catalog///", "POST"],
  ]) {
    const error = failure('"text"'), ctx = context(path, method);
    assert.throws(() => recoverQuoteJsonScalar(error, ctx), actual => actual === error);
  }
});

test("required native parser and existing limits remain configured", () => {
  const config = require("../config/middlewares")({ env: { array: (_name, fallback) => fallback } });
  const bodies = config.filter(item => item.name === "strapi::body");
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].config, {
    jsonLimit: "1mb", formLimit: "1mb", textLimit: "1mb",
    formidable: { maxFileSize: 1024 * 1024 }, onError: recoverQuoteJsonScalar,
  });
});
