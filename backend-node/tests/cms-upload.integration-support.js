"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");
const { Readable } = require("node:stream");
const { createUploadQuiescence } = require("./helpers/upload-quiescence");
const { png, svg, assertSolidImage } = require("./helpers/upload-image-fixtures");
const { scannerFixture, EICAR } = require("./helpers/media-scanner-fixture");
const DATABASES = new Set(["alageum_strapi_ci", "alageum_strapi_test", "alageum_strapi_cms_test", "alageum_strapi_browser_test"]);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function validateUploadEnvironment(env, app) {
  assert.equal(env.APP_ENV, "test"); assert.equal(env.ALAGEUM_TEST_ADMIN_FIXTURES, "1");
  const url = new URL(env.DATABASE_URL);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Only disposable loopback PostgreSQL is allowed");
  assert.ok(!url.search && !url.hash);
  const database = decodeURIComponent(url.pathname.slice(1)); assert.ok(DATABASES.has(database));
  assert.equal(app.config.get("alageum.env"), "test");
  assert.equal(app.config.get("plugin::upload.provider"), "local");
  assert.equal(app.server.httpServer.address().address, "127.0.0.1");
  return database;
}
async function snapshotFiles(root) {
  const result = {};
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), "Upload fixture refuses symbolic links");
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else { assert.ok(entry.isFile()); result[name] = createHash("sha256").update(await fs.readFile(path.join(root, name))).digest("hex"); }
    }
  }
  await walk(""); return result;
}

async function runCmsUploadTests(t, app, { base, editor, denied, businessToken, fixtures }) {
  const database = validateUploadEnvironment(process.env, app);
  const scanner = await scannerFixture(t);
  const mediaConfig = app.config.get("media-security");
  const oldScanner = mediaConfig.scanner, oldQuarantine = mediaConfig.quarantineRoot;
  mediaConfig.scanner = scanner.config.scanner; mediaConfig.quarantineRoot = scanner.config.quarantineRoot;
  assert.equal((await app.db.connection.raw("SELECT current_database() AS database")).rows[0].database, database);
  const plugin = app.plugin("upload"), upload = plugin.service("upload"), provider = plugin.service("provider");
  const files = app.db.query("plugin::upload.file"), root = path.join(app.dirs.static.public, "uploads");
  const prefix = `uploadsecurity_${randomBytes(12).toString("hex")}`;
  const beforeRows = await files.findMany({ orderBy: { id: "asc" } });
  const beforeFiles = await snapshotFiles(root);
  const settingsStore = app.store({ type: "plugin", name: "upload", key: "settings" });
  const beforeSettings = await settingsStore.get({});
  const beforeConfig = app.config.get("plugin::upload");
  const permissions = app.service("admin::permission");
  const permissionBefore = await permissions.findMany({ where: { role: { id: fixtures.roles.editor } }, orderBy: { id: "asc" } });
  const ownPaths = new Set(), releaseGates = new Set(); let hook = null, metricHook = null, createHook = null;
  const originalProviderDescriptor = Object.getOwnPropertyDescriptor(provider, "upload");
  const originalProvider = provider.upload;
  provider.upload = function (...args) {
    if (!guard.owned) return Reflect.apply(originalProvider, this, args);
    const [file] = args;
    assert.ok(file.hash.includes(prefix), "Provider fixture may own only explicitly prefixed files");
    const filename = `${file.hash}${file.ext}`;
    assert.equal(path.basename(filename), filename); ownPaths.add(filename);
    return hook ? hook.call(this, file, originalProvider) : Reflect.apply(originalProvider, this, args);
  };
  const guard = createUploadQuiescence({ koa: app.server.app, server: app.server.httpServer });
  const metrics = plugin.service("metrics"), metricDescriptor = Object.getOwnPropertyDescriptor(metrics, "trackUsage");
  const createDescriptor = Object.getOwnPropertyDescriptor(files, "create");
  metrics.trackUsage = function (...args) {
    return guard.owned && metricHook ? metricHook.call(this, args, metricDescriptor.value) : Reflect.apply(metricDescriptor.value, this, args);
  };
  files.create = function (...args) {
    return guard.owned && createHook ? createHook.call(this, args, createDescriptor.value) : Reflect.apply(createDescriptor.value, this, args);
  };
  for (const name of ["upload", "remove", "replace"]) guard.wrap(upload, name);
  for (const name of ["upload", "checkFileSize", "replace"]) guard.wrap(provider, name);
  for (const name of ["create", "update", "delete"]) guard.wrap(files, name);
  for (const name of Object.keys(plugin.service("image-manipulation"))) {
    if (typeof plugin.service("image-manipulation")[name] === "function") guard.wrap(plugin.service("image-manipulation"), name);
  }
  for (const name of Object.keys(plugin.service("file"))) {
    if (typeof plugin.service("file")[name] === "function") guard.wrap(plugin.service("file"), name);
  }
  guard.wrap(metrics, "trackUsage");
  // Native upload emits asynchronously without awaiting subscribers. Retain the
  // owned event promise, including events raised by fixture removal.
  guard.wrap(app.eventHub, "emit", { reportRejection: true });
  if (typeof plugin.provider.delete === "function") guard.wrap(plugin.provider, "delete");
  let cleanupPromise;
  function releaseAll() { guard.closeAdmission(); for (const release of releaseGates) release(); }
  async function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      releaseAll(); await guard.drain(); hook = null; metricHook = null; createHook = null;
      const current = await files.findMany();
      for (const file of current.filter(file => file.name.startsWith(prefix))) {
        assert.ok(!beforeRows.some(row => row.id === file.id));
        await guard.run(() => upload.remove(file));
      }
      await guard.drain();
      // Failed native uploads can leave provider bytes without a database row.
      // Delete only names registered before an owned provider operation began.
      for (const filename of ownPaths) {
        assert.ok(!Object.hasOwn(beforeFiles, filename)); await fs.rm(path.join(root, filename), { force: true });
      }
      await guard.drain();
      await settingsStore.set({ value: beforeSettings });
      app.config.set("plugin::upload", beforeConfig);
      // Keep original permission rows/IDs; delete only the extra fixture grants.
      const permissionAfter = await permissions.findMany({ where: { role: { id: fixtures.roles.editor } } });
      const originalIds = new Set(permissionBefore.map(row => row.id));
      const ownedIds = permissionAfter.filter(row => !originalIds.has(row.id)).map(row => row.id);
      if (ownedIds.length) await permissions.deleteByIds(ownedIds);
      await guard.restoreServices();
      Object.defineProperty(provider, "upload", originalProviderDescriptor);
      Object.defineProperty(metrics, "trackUsage", metricDescriptor);
      Object.defineProperty(files, "create", createDescriptor);
      assert.deepEqual(await files.findMany({ orderBy: { id: "asc" } }), beforeRows, "Preexisting upload rows preserved");
      assert.deepEqual(await snapshotFiles(root), beforeFiles, "Preexisting upload bytes preserved; owned bytes removed");
      assert.deepEqual(await settingsStore.get({}), beforeSettings);
      assert.equal(app.config.get("plugin::upload"), beforeConfig);
      assert.deepEqual(await permissions.findMany({ where: { role: { id: fixtures.roles.editor } }, orderBy: { id: "asc" } }), permissionBefore);
      t.signal.removeEventListener("abort", releaseAll);
      assert.deepEqual(guard.detachedErrors, [], "No detached native event subscriber may fail silently");
      assert.deepEqual(await fs.readdir(mediaConfig.quarantineRoot), [], "All request and admission quarantine files removed");
      mediaConfig.scanner = oldScanner; mediaConfig.quarantineRoot = oldQuarantine;
    })();
    return cleanupPromise;
  }
  t.after(cleanup); t.signal.addEventListener("abort", releaseAll, { once: true });
  function body(inputs) {
    const form = new FormData();
    for (const { name, bytes, mime } of inputs) form.append("files", new Blob([bytes], { type: mime }), `${prefix}_${name}`);
    if (inputs.some(input => input.caption)) form.append("fileInfo", JSON.stringify(inputs.map(input => ({ name: `${prefix}_${input.name}`, caption: input.caption }))));
    return form;
  }
  const send = (inputs, token = editor, options = {}) => fetch(`${base}/upload`, {
    method: "POST", headers: { ...guard.ticket(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body(inputs), ...options,
  });
  async function json(response, status) { assert.equal(response.status, status, await response.clone().text()); return response.json(); }
  const raster = { name: "red.png", bytes: png(), mime: "image/png" };
  try {
    // Additional grants apply only to already-owned disposable CMS roles.
    await app.service("admin::role").addPermissions(fixtures.roles.editor, [
      { action: "plugin::upload.read", subject: null, properties: {}, conditions: [] },
      { action: "plugin::upload.assets.create", subject: null, properties: {}, conditions: [] },
      { action: "plugin::upload.assets.update", subject: null, properties: {}, conditions: [] },
    ]);
    await settingsStore.set({ value: { ...beforeSettings, responsiveDimensions: true, sizeOptimization: true, autoOrientation: true } });
    app.config.set("plugin::upload", { ...beforeConfig, concurrentUploadSize: 2 });
    await t.test("native upload rejects anonymous, B2B and denied-role identities without writes", async () => {
      const rows = await files.findMany(), bytes = await snapshotFiles(root);
      for (const [token, status] of [[null, 401], [businessToken, 401], [denied, 403]]) await json(await send([raster], token), status);
      await guard.drain(); assert.deepEqual(await files.findMany(), rows); assert.deepEqual(await snapshotFiles(root), bytes);
    });
    await t.test("native HTTP PNG upload persists and serves completely decoded original and responsive images", async () => {
      const scansBefore = scanner.scanned.length;
      const [file] = await json(await send([raster]), 201);
      assert.equal(scanner.scanned.length - scansBefore, 12, "Raw/canonical input and original plus four variants each scanned before persistence");
      assert.equal(file.mime, "image/png"); assert.equal(file.width, 1200); assert.equal(file.height, 600);
      assert.ok(await files.findOne({ where: { id: file.id } }));
      assert.deepEqual(Object.keys(file.formats).sort(), ["large", "medium", "small", "thumbnail"]);
      for (const output of [file, ...Object.values(file.formats)]) {
        const response = await fetch(`${base}${output.url}`); assert.equal(response.status, 200);
        await assertSolidImage(Buffer.from(await response.arrayBuffer()), output.width, output.height);
      }
    });
    await t.test("binary replacement preserves original, all variants and database rows even with scanner failure", async () => {
      const rows = await files.findMany(), bytes = await snapshotFiles(root);
      const old = rows.find(file => file.name === `${prefix}_red.png`); assert.ok(old);
      const scansBefore = scanner.scanned.length;
      for (const scannerDown of [false, true]) {
        if (scannerDown) scanner.setResponder(() => "stream: scanner failure ERROR\0");
        try {
          const response = await fetch(`${base}/upload/files/${old.id}/replace`, {
            method: "POST", headers: { ...guard.ticket(), Authorization: `Bearer ${editor}` }, body: body([raster]),
          });
          const result = await json(response, 409); assert.equal(result.error.details.code, "media_replace_disabled");
          await guard.drain(); assert.deepEqual(await files.findMany(), rows); assert.deepEqual(await snapshotFiles(root), bytes);
        } finally { scanner.setResponder(bytes => bytes.includes(EICAR) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0"); }
      }
      assert.equal(scanner.scanned.length, scansBefore, "Replacement refusal precedes scanner and all writes");
    });
    await t.test("native SVG, HTML and PDF uploads are refused without touching public storage", async () => {
      const rows = await files.findMany(), bytes = await snapshotFiles(root);
      for (const item of [ { name: "safe.svg", bytes: svg(), mime: "image/svg+xml" },
        { name: "page.html", bytes: Buffer.from("<html>blocked</html>"), mime: "text/html" },
        { name: "catalog.pdf", bytes: Buffer.from("%PDF-1.7\nblocked"), mime: "application/pdf" } ]) {
        const response = await send([item]); assert.equal(response.status, 400, await response.text());
      }
      await guard.drain(); assert.deepEqual(await files.findMany(), rows); assert.deepEqual(await snapshotFiles(root), bytes);
    });
    await t.test("native scanner rejects harmless EICAR fixture and scanner outage before writes", async () => {
      const rows = await files.findMany(), bytes = await snapshotFiles(root);
      await json(await send([{ name: "eicar.png", bytes: Buffer.concat([png(5, 5), EICAR]), mime: "image/png" }]), 400);
      scanner.setResponder(() => "stream: scanner failure ERROR\0");
      try { await json(await send([raster]), 503); }
      finally { scanner.setResponder(bytes => bytes.includes(EICAR) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0"); }
      await guard.drain(); assert.deepEqual(await files.findMany(), rows); assert.deepEqual(await snapshotFiles(root), bytes);
    });
    await t.test("native malformed image upload rejects without persisted rows or provider files", async () => {
      const rows = await files.findMany(), bytes = await snapshotFiles(root);
      const response = await send([{ name: "broken.png", bytes: png().subarray(0, 60), mime: "image/png" }]);
      assert.ok([400, 422].includes(response.status), await response.text()); await guard.drain();
      assert.deepEqual(await files.findMany(), rows); assert.deepEqual(await snapshotFiles(root), bytes);
    });
    await t.test("admitted HTTP client abort drains native provider and persisted row before cleanup", async () => {
      const entered = deferred(), release = deferred(); releaseGates.add(release.resolve);
      hook = async function (file, original) { entered.resolve(); await release.promise; return original.call(this, file); };
      const controller = new AbortController();
      const response = send([{ name: "aborted.png", bytes: png(5, 5), mime: "image/png" }], editor, { signal: controller.signal });
      response.catch(() => {});
      try {
        await entered.promise; controller.abort(); await assert.rejects(response, { name: "AbortError" });
        assert.ok(guard.pending > 0); release.resolve(); await guard.drain();
        assert.ok((await files.findMany()).some(file => file.name === `${prefix}_aborted.png`));
      } finally { release.resolve(); hook = null; releaseGates.delete(release.resolve); await guard.drain(); }
    });
    await t.test("serial multipart persistence stops before later siblings after provider failure", async () => {
      const rows = await files.findMany(), bytes = await snapshotFiles(root); let lateStarted = false;
      hook = async function (file, original) {
        if (file.name.endsWith("_fail.png")) throw new Error("owned upload failure regression");
        lateStarted = true; return original.call(this, file);
      };
      try {
        const response = await send([
          { name: "fail.png", bytes: png(5, 5), mime: "image/png" },
          { name: "late.png", bytes: png(5, 5), mime: "image/png" },
        ]);
        assert.equal(response.status, 500, await response.text()); await guard.drain();
        assert.equal(lateStarted, false); assert.deepEqual(await files.findMany(), rows); assert.deepEqual(await snapshotFiles(root), bytes);
      } finally { hook = null; await guard.drain(); }
    });
  } finally { await cleanup(); }
}
module.exports = { runCmsUploadTests, validateUploadEnvironment, snapshotFiles };
