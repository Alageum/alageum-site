"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createUploadQuiescence } = require("./helpers/upload-quiescence");
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const server = new EventEmitter(); server.listening = true;
  const koa = { handleRequest(ctx, fn) { assert.equal(this, koa); return fn(ctx); } };
  const guard = createUploadQuiescence({ koa, server });
  const request = (fn, headers = guard.ticket()) => koa.handleRequest({ get: key => headers[key] }, fn);
  const close = () => { server.listening = false; server.emit("close"); };
  return { server, koa, guard, request, close };
}
test("owned native request and methods preserve receiver, arguments, value, thrown error and descriptors", async () => {
  const { koa, guard, request, close } = fixture(), target = {};
  const token = {}, error = new Error("synchronous original error");
  Object.defineProperty(target, "work", { configurable: true, writable: true, enumerable: false,
    value(...args) { assert.equal(this, target); assert.deepEqual(args, [token]); return token; } });
  const before = Object.getOwnPropertyDescriptor(target, "work"); guard.wrap(target, "work");
  assert.equal(request(() => target.work(token)), token);
  const rejected = { work() { throw error; } }; guard.wrap(rejected, "work");
  assert.throws(() => request(() => rejected.work()), e => e === error);
  await guard.closeAndDrain(); await guard.restoreServices();
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "work"), before);
  assert.equal(guard.fenceRestored, false); close(); assert.equal(guard.fenceRestored, true);
  assert.equal(koa.handleRequest.name, "handleRequest");
});
test("client abort or rejected root cannot release an admitted native request", async () => {
  const { guard, request, close } = fixture(), native = deferred();
  const value = request(() => native.promise); assert.equal(value, native.promise);
  let finished = false; const drain = guard.closeAndDrain().then(() => { finished = true; });
  await tick(); assert.equal(finished, false);
  native.resolve(); await drain; assert.equal(guard.pending, 0);
  await guard.restoreServices(); close();
});
test("fail-fast root drains late provider sibling, late database work and a newly created descendant", async () => {
  const { guard, request, close } = fixture(), providerGate = deferred(), rowGate = deferred(), descendantGate = deferred();
  const events = [];
  const db = { async save() { await rowGate.promise; events.push("row"); await db.descendant(); },
    async descendant() { await descendantGate.promise; events.push("descendant"); } };
  const provider = { async upload() { await providerGate.promise; events.push("file"); await db.save(); } };
  guard.wrap(provider, "upload"); guard.wrap(db, "save"); guard.wrap(db, "descendant");
  const error = new Error("fail fast");
  await assert.rejects(request(() => Promise.all([Promise.reject(error), provider.upload()])), e => e === error);
  let finished = false; const drain = guard.closeAndDrain().then(() => { finished = true; });
  providerGate.resolve(); await tick(); assert.deepEqual(events, ["file"]); assert.equal(finished, false);
  rowGate.resolve(); await tick(); assert.deepEqual(events, ["file", "row"]); assert.equal(finished, false);
  descendantGate.resolve(); await drain; assert.deepEqual(events, ["file", "row", "descendant"]);
  await guard.restoreServices(); close();
});
test("cleanup promises and descendants drain before descriptor restoration", async () => {
  const { guard, close } = fixture(), deletion = deferred(), child = deferred();
  const provider = { async remove() { await deletion.promise; await provider.followup(); }, async followup() { await child.promise; } };
  const before = provider.remove; guard.wrap(provider, "remove"); guard.wrap(provider, "followup");
  await guard.closeAndDrain(); const cleanup = guard.run(() => provider.remove());
  let restored = false; const restoration = guard.restoreServices().then(() => { restored = true; });
  deletion.resolve(); await tick(); assert.equal(restored, false);
  child.resolve(); await cleanup; await restoration; assert.equal(provider.remove, before); close();
});
test("unresolved submitted request is fenced through inner restoration until outer close", async () => {
  const { koa, guard, close } = fixture(), headers = guard.ticket();
  const pendingSubmission = new Promise(() => {}); // Intentionally never native-admitted.
  assert.ok(pendingSubmission); await guard.closeAndDrain(); await guard.restoreServices();
  let entered = false; const ctx = { get: key => headers[key] };
  await koa.handleRequest(ctx, () => { entered = true; });
  assert.equal(ctx.status, 503); assert.equal(entered, false); assert.equal(guard.fenceRestored, false);
  assert.throws(() => guard.ticket(), /admission is closed/); close(); assert.equal(guard.fenceRestored, true);
});
test("unowned calls are unchanged and do not hold owned fixture teardown", async () => {
  const { guard, request, close } = fixture(), unrelated = deferred();
  const target = { work: () => unrelated.promise }; guard.wrap(target, "work");
  assert.equal(request(() => target.work(), {}), unrelated.promise);
  await guard.closeAndDrain(); assert.equal(guard.pending, 0); await guard.restoreServices(); close(); unrelated.resolve();
});
test("unawaited native event and its cleanup descendant remain owned after the root settles", async () => {
  const { guard, request, close } = fixture(), eventGate = deferred(), cleanupGate = deferred();
  const events = [];
  const cleanup = { async remove() { await cleanupGate.promise; events.push("cleanup"); } };
  const hub = { async emit() { await eventGate.promise; events.push("event"); await cleanup.remove(); } };
  guard.wrap(hub, "emit"); guard.wrap(cleanup, "remove");
  await request(async () => { hub.emit("media.create"); });
  let drained = false; const draining = guard.closeAndDrain().then(() => { drained = true; });
  eventGate.resolve(); await tick(); assert.equal(drained, false); assert.deepEqual(events, ["event"]);
  cleanupGate.resolve(); await draining; assert.deepEqual(events, ["event", "cleanup"]);
  await guard.restoreServices(); close();
});
test("detached event rejection is retained without skipping drain or restoration", async () => {
  const { guard, request, close } = fixture(), event = deferred(), descendant = deferred();
  const error = new Error("detached event subscriber failed");
  const provider = { async remove() { await descendant.promise; } };
  const hub = { emit() { provider.remove(); return event.promise; } };
  const original = hub.emit;
  guard.wrap(hub, "emit", { reportRejection: true }); guard.wrap(provider, "remove");
  let returned; await request(async () => { returned = hub.emit(); }); assert.equal(returned, event.promise);
  event.reject(error);
  let restored = false; guard.closeAdmission(); const restoring = guard.restoreServices().then(() => { restored = true; });
  await tick(); assert.equal(restored, false); assert.deepEqual(guard.detachedErrors, [error]);
  descendant.resolve(); await restoring; assert.equal(hub.emit, original); assert.deepEqual(guard.detachedErrors, [error]);
  close();
});
