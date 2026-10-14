"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const Koa = require("koa");
const { readMediaConfig } = require("../src/domain/media-policy");
const temporary = require("../src/middlewares/media-upload-temporary");
const { onFileBegin } = require("../src/domain/media-temporary");
const bodyFactory = require(path.join(path.dirname(require.resolve("@strapi/core/package.json")), "dist/middlewares/body.js")).body;
const os = require("node:os");
async function harness(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alageum-parser-test-"));
  const publicRoot = path.join(root, "public"); await fs.mkdir(publicRoot);
  const config = readMediaConfig((name, fallback) => name === "ALAGEUM_MEDIA_QUARANTINE_DIR" ? path.join(root, "quarantine") : fallback);
  const strapi = { config: { get: () => config }, dirs: { static: { public: publicRoot } }, plugin: () => null };
  const app = new Koa(); app.on("error", () => {}); let route = ctx => { ctx.body = { ok: true }; }, fileBegan = () => {};
  app.use(async (ctx, next) => { try { await next(); } catch (error) { ctx.status = error.status || 400; ctx.body = { error: "rejected" }; } });
  app.use(temporary({}, { strapi }));
  app.use(bodyFactory({ multipart: true, formidable: {
    maxFileSize: 1024, maxTotalFileSize: 2048, maxFiles: 2, allowEmptyFiles: false,
    onFileBegin: (field, file) => { onFileBegin(field, file); fileBegan(file); },
  } }, { strapi }));
  app.use(async ctx => route(ctx));
  const server = http.createServer(app.callback());
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  return { config, publicRoot, server, base: `http://127.0.0.1:${server.address().port}`,
    route: next => { route = next; }, fileBegan: next => { fileBegan = next; } };
}
function form(name = "files", bytes = "small harmless file") {
  const body = new FormData(); body.append(name, new Blob([bytes], { type: "image/png" }), "fixture.png"); return body;
}
async function emptyEventually(root) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await fs.readdir(root)).length) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(await fs.readdir(root), []);
}
test("actual multipart parser writes only owned private paths and awaits cleanup on success and rejection", async t => {
  const h = await harness(t);
  for (const reject of [false, true]) {
    h.route(async ctx => {
      const file = ctx.request.files.files;
      assert.ok(file.filepath.startsWith(h.config.quarantineRoot));
      assert.equal((await fs.stat(path.dirname(file.filepath))).mode & 0o777, 0o700);
      if (reject) throw new Error("controller rejects");
      ctx.body = { ok: true };
    });
    const response = await fetch(h.base, { method: "POST", body: form() }); assert.equal(response.status, reject ? 400 : 200);
    await emptyEventually(h.config.quarantineRoot); assert.deepEqual(await fs.readdir(h.publicRoot), []);
  }
});
test("parser cleanup covers unexpected fields and parse-limit failures before request.files is assigned", async t => {
  const h = await harness(t);
  let response = await fetch(h.base, { method: "POST", body: form("unexpected") }); assert.equal(response.status, 200);
  await emptyEventually(h.config.quarantineRoot);
  response = await fetch(h.base, { method: "POST", body: form("files", Buffer.alloc(2049)) });
  assert.ok([400, 413].includes(response.status)); await emptyEventually(h.config.quarantineRoot);
  assert.deepEqual(await fs.readdir(h.publicRoot), []);
});
test("aborted multipart request removes partially written quarantine files", async t => {
  const h = await harness(t);
  let began; const gate = new Promise(resolve => { began = resolve; }); h.fileBegan(began);
  const request = http.request(h.base, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=fixture", "Content-Length": "2000" } });
  request.on("error", () => {});
  request.write('--fixture\r\nContent-Disposition: form-data; name="files"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\npartial');
  await gate; request.destroy();
  await emptyEventually(h.config.quarantineRoot); assert.deepEqual(await fs.readdir(h.publicRoot), []);
});
