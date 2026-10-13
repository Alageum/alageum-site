"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const guards = () => import("../src/plugins/alageum-catalog/admin/src/client-guards.mjs");

test("CMS error messages read pinned Strapi FetchError.status and keep validation useful", async () => {
  const { errorMessage } = await guards();
  for (const status of [401, 403]) {
    assert.match(errorMessage({ status, response: { data: { error: { message: "Forbidden" } } } }), /does not have access/);
  }
  assert.match(errorMessage({ status: 409, response: { data: { error: { code: "catalog_version_conflict" } } } }), /Reload the product/);
  assert.equal(errorMessage({ status: 409, response: { data: { error: { code: "catalog_unique_conflict", message: "SKU already in use" } } } }), "SKU already in use");
  assert.equal(errorMessage({ status: 422, response: { data: { error: { details: [{ loc: ["translations", "ru", "name"], msg: "Too long" }] } } } }), "translations.ru.name: Too long");
});

test("CMS mutation accepts 401 only to reject outside native automatic retry, with captured identity", async () => {
  const { mutationOptions, acceptMutationResponse } = await guards();
  const options = mutationOptions("original-session-token");
  assert.equal(options.headers.Authorization, "Bearer original-session-token");
  assert.equal(options.validateStatus(401), true);
  for (const status of [403, 409, 422, 500]) assert.equal(options.validateStatus(status), false);
  assert.throws(() => acceptMutationResponse({ data: { error: { code: "authentication_required", message: "Expired" } } }), { status: 401, message: "Expired" });
  const response = { data: { id: "saved-product", version: 2 } };
  assert.equal(acceptMutationResponse(response), response);
});

test("CMS editor keys preserve drafts across native rotation and reset on account change", async () => {
  const { accountKey } = await guards();
  const token = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
  assert.equal(accountKey(token({ userId: "1", sessionId: "session-a" })), "1");
  assert.notEqual(accountKey(token({ userId: "1", sessionId: "session-a" })), accountKey(token({ userId: "2", sessionId: "session-a" })));
  assert.equal(accountKey(token({ userId: "1", sessionId: "session-a" })), accountKey(token({ userId: "1", sessionId: "session-b" })));
  for (const malformed of ["", "no-token", token({ sessionId: "session-a" })]) assert.equal(accountKey(malformed), null);
});

const previewModel = () => import("../src/plugins/alageum-catalog/admin/src/media-preview.mjs");
const previewEntry = { id: "reviewed-crop", mime: "image/png" };
const imageResponse = () => ({ status: 200, data: new Blob(["image bytes"], { type: "image/png" }), headers: new Headers({ "content-type": "image/png" }) });

test("native Blob previews pin the token, reject 401 without replay and keep tokens out of URLs", async () => {
  const { startMediaPreview } = await previewModel();
  let calls = 0;
  const states = [];
  const request = startMediaPreview({ productId: "product-id", entry: previewEntry, token: "captured-secret", onState: (state) => states.push(state), get: async (url, options) => {
    ++calls;
    assert.equal(url, "/alageum-catalog/products/product-id/media-preview/reviewed-crop");
    assert.equal(url.includes("captured-secret"), false);
    assert.equal(options.headers.Authorization, "Bearer captured-secret");
    assert.equal(options.responseType, "blob");
    assert.equal(options.validateStatus(401), true);
    assert.equal(options.validateStatus(403), false);
    assert.equal(options.signal.aborted, false);
    return { status: 401, data: new Blob(["Unauthorized"], { type: "application/json" }) };
  }, createObjectURL: () => { assert.fail("401 must not create an image URL"); } });
  await request.promise;
  assert.equal(calls, 1);
  assert.equal(states.at(-1).error.status, 401);
  assert.match((await guards()).errorMessage(states.at(-1).error), /does not have access/);
  request.cancel();
});

test("preview responses require a successful, nonempty reviewed image of the expected MIME", async () => {
  const { acceptPreviewResponse } = await previewModel();
  const valid = imageResponse();
  assert.equal(acceptPreviewResponse(valid, previewEntry), valid.data);
  for (const response of [
    { ...valid, status: 404 },
    { ...valid, status: undefined },
    { ...valid, data: new Blob([], { type: "image/png" }) },
    { ...valid, data: { type: "image/png", size: 8 } },
    { ...valid, headers: new Headers({ "content-type": "text/html" }) },
    { ...valid, data: new Blob(["image"], { type: "image/jpeg" }) },
    { ...valid, headers: new Headers({ "content-type": "image/svg+xml" }), data: new Blob(["svg"], { type: "image/svg+xml" }) },
  ]) assert.throws(() => acceptPreviewResponse(response, previewEntry));
});

test("preview cancellation aborts and ignores late success or errors after selection/account/unmount", async () => {
  const { startMediaPreview } = await previewModel();
  for (const failure of [false, true]) {
    let settle;
    let signal;
    const states = [];
    const request = startMediaPreview({ productId: "product-id", entry: previewEntry, token: "token", onState: (state) => states.push(state), get: (url, options) => {
      signal = options.signal;
      return new Promise((resolve, reject) => { settle = () => failure ? reject(new Error("Late failure")) : resolve(imageResponse()); });
    }, createObjectURL: () => assert.fail("stale response must not create an object URL") });
    request.cancel();
    assert.equal(signal.aborted, true);
    settle();
    await request.promise;
    assert.equal(states.length, 1, "only the initial loading state is emitted");
  }
});

test("displayed preview Blob URLs are revoked once when discarded", async () => {
  const { startMediaPreview } = await previewModel();
  const states = [];
  const revoked = [];
  const request = startMediaPreview({ productId: "product-id", entry: previewEntry, token: "token", get: async () => imageResponse(), onState: (state) => states.push(state), createObjectURL: () => "blob:preview-1", revokeObjectURL: (url) => revoked.push(url) });
  await request.promise;
  assert.equal(states.at(-1).url, "blob:preview-1");
  request.cancel();
  request.cancel();
  assert.deepEqual(revoked, ["blob:preview-1"]);
});
