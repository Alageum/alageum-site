"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../src/api/compat/controllers/compat");
const { AppError } = require("../src/domain/errors");

test("catalog controller charges the socket peer before any quote-domain work", async () => {
  const calls = [];
  const responseHeaders = {};
  const ctx = {
    req: { socket: { remoteAddress: "127.0.0.1" } },
    ip: "untrusted-wrapper-value",
    headers: { "x-forwarded-for": "203.0.113.1", forwarded: "for=203.0.113.2" },
    request: { body: { invalid: "Decoded schema failure still consumes an attempt" } },
    set: (key, value) => { responseHeaders[key] = value; },
  };
  const result = { summary: "test-only" };
  const routes = controller({ strapi: { alageum: {
    quoteCreateLimit: key => calls.push(["limit", key]),
    quotes: { create: request => { calls.push(["domain", request]); return result; } },
  } } });
  assert.equal(await routes.createQuote(ctx), result);
  assert.deepEqual(calls, [["limit", "127.0.0.1"], ["domain", ctx]]);
  assert.equal(responseHeaders["Cache-Control"], "private, no-store");
});

test("denied quote attempts never enter domain authentication or persistence", () => {
  const failure = new AppError("rate_limit_exceeded", "Too many requests", 429);
  let entered = false;
  const routes = controller({ strapi: { alageum: {
    quoteCreateLimit: () => { throw failure; },
    quotes: { create: () => { entered = true; } },
  } } });
  const responseHeaders = {};
  assert.throws(() => routes.createQuote({ req: { socket: { remoteAddress: "127.0.0.1" } }, set: (key, value) => { responseHeaders[key] = value; } }), error => error === failure);
  assert.equal(entered, false);
  assert.equal(responseHeaders["Cache-Control"], "private, no-store");
});

test("quote reads do not charge creation quota and generic creation stays unavailable", async () => {
  const calls = [];
  const routes = controller({ strapi: { alageum: {
    quoteCreateLimit: () => { throw new Error("Reads must not consume creation quota"); },
    quotes: { list: ctx => calls.push(["list", ctx]), detail: ctx => calls.push(["detail", ctx]) },
  } } });
  const ctx = {};
  await routes.quotes(ctx);
  await routes.quote(ctx);
  assert.deepEqual(calls, [["list", ctx], ["detail", ctx]]);
  const manifest = require("../src/api/compat/routes/compat").routes;
  assert.equal(manifest.filter(route => route.method === "POST" && route.path === "/quotes/catalog").length, 1);
  assert.equal(manifest.some(route => route.method === "POST" && route.path === "/quotes"), false);
});
