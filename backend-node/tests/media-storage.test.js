"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const Koa = require("koa");
const { readMediaStorageConfig, serverPublicRoot, inspectMediaStorage, assertConfiguredMediaStorage } = require("../src/domain/media-storage");
const { createMediaAdmission } = require("../src/domain/media-admission");
const { scannerFixture } = require("./helpers/media-scanner-fixture");
const { png, assertSolidImage, uploadPackage } = require("./helpers/upload-image-fixtures");
const env = value => (name, fallback) => name === "ALAGEUM_MEDIA_PUBLIC_ROOT" ? value : fallback;
async function directories(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alageum-media-volume-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicRoot = path.join(root, "public"), quarantineRoot = path.join(root, "private");
  await fs.mkdir(publicRoot, { mode: 0o700 }); await fs.mkdir(path.join(publicRoot, "uploads"), { mode: 0o700 });
  await fs.mkdir(quarantineRoot, { mode: 0o700 });
  return { root, publicRoot, quarantineRoot };
}
test("explicit media root is absolute and canonical; developer default is unchanged", () => {
  assert.deepEqual(readMediaStorageConfig(env("")), { publicRoot: null });
  assert.equal(serverPublicRoot(env("")), "./public");
  assert.equal(serverPublicRoot(env("/var/lib/alageum/public")), "/var/lib/alageum/public");
  for (const value of ["relative", "/", "/private/../public", "/private/public/", "/private/\0public", 12])
    assert.throws(() => readMediaStorageConfig(env(value)), /media_storage_root_invalid/);
});
test("storage inspection is read-only, redacted and cannot certify durability or backup", async t => {
  const dirs = await directories(t);
  const result = await inspectMediaStorage(dirs);
  assert.deepEqual(result, { configured: true, directories_ready: true, issues: [], volume_persistence_verified: false, backup_restore_verified: false });
  assert.ok(!JSON.stringify(result).includes(dirs.root));
  await assertConfiguredMediaStorage({ ...dirs, effectivePublicRoot: dirs.publicRoot });
  await assert.rejects(assertConfiguredMediaStorage({ ...dirs, effectivePublicRoot: path.join(dirs.root, "other") }), /media_storage_root_mismatch/);
  const missing = path.join(dirs.root, "missing");
  assert.ok((await inspectMediaStorage({ publicRoot: missing, quarantineRoot: missing })).issues.includes("media_storage_root_missing"));
  await assert.rejects(fs.stat(missing), { code: "ENOENT" });
  await fs.writeFile(path.join(dirs.publicRoot, "private-config.json"), "synthetic fixture");
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_root_not_dedicated"));
  assert.ok((await inspectMediaStorage({ publicRoot: 12, quarantineRoot: 15 })).issues.includes("media_storage_root_invalid"));
});
test("explicit startup refuses missing volume, symlinks, unsafe permissions and quarantine overlap", async t => {
  const dirs = await directories(t);
  await fs.rm(path.join(dirs.publicRoot, "uploads"), { recursive: true });
  await assert.rejects(assertConfiguredMediaStorage(dirs), /media_storage_uploads_missing/);
  await fs.mkdir(path.join(dirs.publicRoot, "uploads"), { mode: 0o700 });
  await fs.chmod(dirs.publicRoot, 0o777);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_root_unsafe_permissions")); await fs.chmod(dirs.publicRoot, 0o700);
  await fs.chmod(dirs.quarantineRoot, 0o755);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_quarantine_unsafe_permissions")); await fs.chmod(dirs.quarantineRoot, 0o700);
  const link = path.join(dirs.root, "link"); await fs.symlink(dirs.publicRoot, link);
  assert.ok((await inspectMediaStorage({ ...dirs, publicRoot: link })).issues.includes("media_storage_root_unsafe_path"));
  assert.ok((await inspectMediaStorage({ ...dirs, quarantineRoot: path.join(dirs.publicRoot, "uploads") })).issues.includes("media_storage_quarantine_overlap"));
  assert.ok((await inspectMediaStorage({ ...dirs, quarantineRoot: dirs.root })).issues.includes("media_storage_quarantine_overlap"));
});
test("unsafe process creation mask cannot produce writable-by-others public uploads", async t => {
  const dirs = await directories(t); t.mock.method(process, "umask", () => 0o002);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_umask_unsafe"));
  let written = false;
  const provider = createMediaAdmission({ config: {} }).wrapProvider({ upload: async () => { written = true; } });
  await assert.rejects(provider.upload({ hash: "fixture", ext: ".png", name: "fixture.png", mime: "image/png", buffer: png(1, 1) }), { code: "media_storage_umask_unsafe" });
  assert.equal(written, false);
});
test("a writable non-sticky ancestor cannot let another UID replace an admitted root", async t => {
  const dirs = await directories(t);
  await fs.chmod(dirs.root, 0o777);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_root_unsafe_ancestor"));
  await fs.chmod(dirs.root, 0o1777);
  assert.equal((await inspectMediaStorage(dirs)).directories_ready, true, "Trusted-owner sticky ancestor prevents unrelated users from replacing app-owned children");
  await fs.chmod(dirs.root, 0o700);
});
test("existing upload entries cannot expose private files through symlinks, hard links or nested directories", async t => {
  const dirs = await directories(t), outside = path.join(dirs.quarantineRoot, "private-fixture");
  await fs.writeFile(outside, "private synthetic fixture", { mode: 0o600 });
  const link = path.join(dirs.publicRoot, "uploads", "image.png");
  await fs.symlink(outside, link);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_upload_entry_unsafe")); await fs.unlink(link);
  await fs.link(outside, link);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_upload_entry_unsafe")); await fs.unlink(link);
  await fs.mkdir(link);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_upload_entry_unsafe")); await fs.rmdir(link);
  await fs.writeFile(link, "existing approved legacy bytes", { mode: 0o600 });
  assert.equal((await inspectMediaStorage(dirs)).directories_ready, true);
  await fs.chmod(link, 0o666);
  assert.ok((await inspectMediaStorage(dirs)).issues.includes("media_storage_upload_entry_unsafe"));
  assert.equal(await fs.readFile(outside, "utf8"), "private synthetic fixture");
});
test("configured native provider and serving lifecycle retain scanned bytes across provider restart", async t => {
  const dirs = await directories(t), scanner = await scannerFixture(t);
  const config = { ...scanner.config, quarantineRoot: dirs.quarantineRoot, storage: { publicRoot: dirs.publicRoot } };
  await assertConfiguredMediaStorage(dirs);
  const oldGlobal = global.strapi;
  const registered = [];
  const koa = new Koa();
  const strapi = { dirs: { static: { public: dirs.publicRoot } }, config: { get: (_key, fallback) => fallback },
    server: { app: koa, routes: routes => registered.push(...routes) } };
  global.strapi = strapi; t.after(() => { global.strapi = oldGlobal; });
  const providerModule = require("@strapi/provider-upload-local");
  let provider = createMediaAdmission({ config, publicRoot: dirs.publicRoot }).wrapProvider(providerModule.init());
  const file = { hash: "persistent_fixture", ext: ".png", name: "persistent.png", mime: "image/png", buffer: png(4, 3) };
  await provider.upload(file);
  assert.equal(file.url, "/uploads/persistent_fixture.png");
  const original = await fs.readFile(path.join(dirs.publicRoot, "uploads/persistent_fixture.png"));
  // A second provider instance models a process restart against the same supplied
  // volume. This proves path wiring, not that the host actually persists its mount.
  provider = createMediaAdmission({ config, publicRoot: dirs.publicRoot }).wrapProvider(providerModule.init());
  assert.equal(typeof provider.upload, "function");
  assert.deepEqual(await fs.readFile(path.join(dirs.publicRoot, "uploads/persistent_fixture.png")), original);
  const register = require(path.join(path.dirname(uploadPackage), "dist/server/middlewares/upload.js"));
  await register({ strapi });
  const route = registered.find(route => route.path === "/uploads/(.*)"); assert.ok(route);
  koa.use(async (ctx, next) => route.handler[0](ctx, () => route.handler[1](ctx, next)));
  const server = http.createServer(koa.callback()); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}${file.url}`); assert.equal(response.status, 200);
  const served = Buffer.from(await response.arrayBuffer()); assert.deepEqual(served, original); await assertSolidImage(served, 4, 3);
});
