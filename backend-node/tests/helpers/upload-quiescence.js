"use strict";
const assert = require("node:assert/strict");
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");

// Test-only ownership fence. HTTP response completion is not native completion:
// aborted clients and fail-fast Promise.all leave sibling provider work alive.
// Track the actual native request/service results without changing their return
// values, then drain repeatedly because settling work may start more work.
function createUploadQuiescence({ koa, server, header = "x-alageum-upload-test" }) {
  const context = new AsyncLocalStorage();
  const prefix = `${randomUUID()}:`, tickets = new Set(), pending = new Set(), restorers = [];
  const detachedObserved = new WeakSet(), detachedErrors = [];
  let accepting = true, generation = 0, restored = false, fenceRestored = false;
  const ownDescriptor = Object.getOwnPropertyDescriptor(koa, "handleRequest");
  const original = koa.handleRequest;
  assert.equal(typeof original, "function");
  function observe(value, reportRejection = false) {
    if (!value || typeof value.then !== "function") return value;
    if (reportRejection && !detachedObserved.has(value)) {
      detachedObserved.add(value);
      Promise.resolve(value).then(() => {}, error => detachedErrors.push(error));
    }
    if (pending.has(value)) return value;
    pending.add(value); generation++;
    // Both branches observe errors. The caller still receives the same promise.
    Promise.resolve(value).then(() => pending.delete(value), () => pending.delete(value));
    return value;
  }
  function run(work) { return context.run(true, () => observe(work())); }
  function handleRequest(...args) {
    const ctx = args[0], ticket = ctx?.get?.(header) || ctx?.request?.headers?.[header];
    if (typeof ticket !== "string" || !ticket.startsWith(prefix)) return Reflect.apply(original, this, args);
    if (!accepting || !tickets.delete(ticket)) {
      ctx.status = 503; ctx.body = { error: "Owned upload test admission closed" };
      // Run the normal Koa response path, but never the upload middleware.
      return Reflect.apply(original, this, [ctx, () => Promise.resolve()]);
    }
    return run(() => Reflect.apply(original, this, args));
  }
  Object.defineProperty(koa, "handleRequest", { ...(ownDescriptor || { configurable: true, writable: true, enumerable: false }), value: handleRequest });
  function restoreFence() {
    if (fenceRestored) return;
    assert.equal(koa.handleRequest, handleRequest, "Unexpected concurrent Koa instrumentation");
    if (ownDescriptor) Object.defineProperty(koa, "handleRequest", ownDescriptor); else delete koa.handleRequest;
    server.removeListener("close", restoreFence); fenceRestored = true;
  }
  server.once("close", restoreFence);
  function wrap(target, name, { reportRejection = false } = {}) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name), method = target[name];
    assert.equal(typeof method, "function", `Native method ${name}`);
    const replacement = function (...args) {
      const result = Reflect.apply(method, this, args);
      return context.getStore() ? observe(result, reportRejection) : result;
    };
    Object.defineProperty(target, name, { ...(descriptor || { configurable: true, writable: true, enumerable: true }), value: replacement });
    restorers.push(() => {
      assert.equal(target[name], replacement, `Unexpected concurrent ${name} instrumentation`);
      if (descriptor) Object.defineProperty(target, name, descriptor); else delete target[name];
    });
  }
  async function drain() {
    for (;;) {
      const before = generation;
      await Promise.allSettled([...pending]);
      // Flush native promise continuations before checking for newly registered
      // siblings/descendants. A one-time Promise.allSettled snapshot is unsafe.
      await new Promise(resolve => setImmediate(resolve));
      if (pending.size === 0 && generation === before) return;
    }
  }
  function closeAdmission() { accepting = false; tickets.clear(); }
  async function closeAndDrain() { closeAdmission(); await drain(); }
  async function restoreServices() {
    assert.equal(accepting, false, "Close admission before restoring native methods");
    await drain();
    if (!restored) { for (const restore of restorers.reverse()) restore(); restored = true; }
    // Never await outer server shutdown from an inner test. Keep only this narrow
    // fence until outer close, so a submitted but not admitted request cannot
    // enter restored services after fixture cleanup.
    if (!server.listening) restoreFence();
  }
  return { run, wrap, drain, closeAdmission, closeAndDrain, restoreServices,
    ticket() { assert.ok(accepting, "Upload admission is closed"); const ticket = `${prefix}${randomUUID()}`; tickets.add(ticket); return { [header]: ticket }; },
    get pending() { return pending.size; }, get owned() { return context.getStore() === true; },
    get detachedErrors() { return detachedErrors.slice(); },
    get accepting() { return accepting; }, get fenceRestored() { return fenceRestored; } };
}
module.exports = { createUploadQuiescence };
