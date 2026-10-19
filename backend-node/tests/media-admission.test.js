"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Readable, PassThrough } = require("node:stream");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { readMediaConfig, fileType, providerIdentity, safeName, MAX_BYTES } = require("../src/domain/media-policy");
const { scanBytes } = require("../src/domain/media-scanner");
const { admitRaster, createMediaAdmission } = require("../src/domain/media-admission");
const { privateDirectory, readFileBounded } = require("../src/domain/media-quarantine");
const { scannerFixture, EICAR } = require("./helpers/media-scanner-fixture");
const { png, sharp } = require("./helpers/upload-image-fixtures");
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code); return true; });
async function input(root, name = "image.png", bytes = png(20, 10), mime = "image/png") {
  const filepath = path.join(root, `input-${Math.random().toString(16).slice(2)}`);
  await fs.writeFile(filepath, bytes);
  return { filepath, originalFilename: name, mimetype: mime, size: bytes.length };
}
const providerFile = bytes => ({ hash: "fixture_12345", ext: ".png", name: "image.png", mime: "image/png", buffer: bytes, stream: Readable.from(bytes) });

test("media config permits only explicit local/private scanner endpoints and bounded timeouts", () => {
  assert.equal(readMediaConfig((_name, fallback) => fallback).scanner.host, "");
  for (const values of [ { ALAGEUM_MEDIA_CLAMAV_HOST: "scanner.example.com" }, { ALAGEUM_MEDIA_CLAMAV_HOST: "8.8.8.8" },
    { ALAGEUM_MEDIA_CLAMAV_HOST: "169.254.169.254" }, { ALAGEUM_MEDIA_CLAMAV_HOST: "127.0.0.1", ALAGEUM_MEDIA_CLAMAV_SOCKET: "/tmp/a" },
    { ALAGEUM_MEDIA_SCAN_TIMEOUT_MS: "0" }, { ALAGEUM_MEDIA_SCAN_TIMEOUT_MS: "100000" }, { ALAGEUM_MEDIA_QUARANTINE_DIR: "public/uploads" } ]) {
    assert.throws(() => readMediaConfig((key, fallback) => values[key] ?? fallback));
  }
  assert.equal(readMediaConfig((key, fallback) => key === "ALAGEUM_MEDIA_CLAMAV_HOST" ? "10.2.3.4" : fallback).scanner.host, "10.2.3.4");
});
test("filename, MIME, SVG, HTML, PDF and traversal policy is fail closed", () => {
  for (const name of ["../image.png", "x\\image.png", "image%2f.png", "a\0.png", "NUL.png", "a.png ", "<script>.png"])
    assert.throws(() => safeName(name), { code: "media_invalid_filename" });
  for (const name of ["image.svg", "image.html", "catalog.pdf", "image.png.exe", "image.gif"])
    assert.throws(() => fileType(name, "", png(1, 1)), { code: "media_type_blocked" });
  assert.throws(() => fileType("image.png", "image/jpeg", png(1, 1)), { code: "media_type_mismatch" });
  assert.throws(() => fileType("image.png", "image/png", Buffer.from("<html>fake image</html>")), { code: "media_type_mismatch" });
  for (const update of [{ hash: "../../outside" }, { ext: ".html" }, { path: "../outside" }])
    assert.throws(() => providerIdentity({ ...providerFile(png(1, 1)), ...update }), { code: "media_invalid_path" });
});
test("scanner refuses missing, down, timeout, malformed and ERROR responses", async t => {
  await rejects(scanBytes(png(1, 1), {}), "media_scanner_unavailable");
  const fixture = await scannerFixture(t);
  await rejects(scanBytes(png(1, 1), { ...fixture.config.scanner, socketPath: path.join(fixture.root, "missing.sock") }), "media_scanner_unavailable");
  for (const response of ["stream: parse error ERROR\0", "OK\0", "stream: OK\0extra", "x".repeat(4097)]) {
    fixture.setResponder(() => response); await rejects(scanBytes(png(1, 1), fixture.config.scanner), "media_scanner_unavailable");
  }
  fixture.setResponder(() => null); await rejects(scanBytes(png(1, 1), { ...fixture.config.scanner, timeoutMs: 100 }), "media_scan_timeout");
});
test("standard harmless EICAR fixture is rejected before decode and never reaches native upload", async t => {
  const { config, root, scanned } = await scannerFixture(t);
  const admission = createMediaAdmission({ config }); let called = false;
  const service = admission.wrapUpload({ upload: async () => { called = true; }, replace() {} });
  const file = await input(root, "eicar.png", Buffer.concat([png(5, 5), EICAR]));
  await rejects(service.upload({ data: {}, files: [file] }), "media_malware_detected");
  assert.equal(called, false); assert.equal(scanned.length, 1);
  assert.deepEqual(await fs.readdir(config.quarantineRoot), []);
});
test("valid PNG/JPEG/WebP are decoded, normalized and scanned before and after transformation", async t => {
  const { config, scanned } = await scannerFixture(t);
  for (const [ext, mime, bytes] of [["png", "image/png", png(7, 4)],
    ["jpg", "image/jpeg", await sharp(png(7, 4)).jpeg().toBuffer()], ["webp", "image/webp", await sharp(png(7, 4)).webp().toBuffer()]]) {
    const safe = await admitRaster(Buffer.concat([bytes, Buffer.from("<script>trailing-payload</script>")]), `image.${ext}`, mime, config);
    assert.equal(safe.width, 7); assert.equal(safe.height, 4);
    assert.ok(!safe.bytes.includes(Buffer.from("trailing-payload")));
  }
  assert.equal(scanned.length, 6);
});
test("corrupt images, decompression limits, empty and oversized inputs never persist", async t => {
  const { config } = await scannerFixture(t);
  await rejects(admitRaster(Buffer.alloc(0), "image.png", "image/png", config), "media_empty");
  await rejects(admitRaster(Buffer.alloc(MAX_BYTES + 1), "image.png", "image/png", config), "media_too_large");
  await rejects(admitRaster(png(10, 10).subarray(0, 60), "image.png", "image/png", config), "media_invalid_image");
  await rejects(admitRaster(png(10, 10), "image.png", "image/png", { ...config, maxPixels: 20 }), "media_invalid_image");
  const animated = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]), { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  await rejects(admitRaster(animated, "image.webp", "image/webp", config), "media_invalid_image");
});
test("private quarantine refuses public roots and symlinks, reads actual sizes, cleans successful and failed work", async t => {
  const { config, root } = await scannerFixture(t);
  await fs.mkdir(path.join(root, "public"));
  await assert.rejects(privateDirectory({ ...config, quarantineRoot: path.join(root, "public", "bad") }, path.join(root, "public")), /publicly served/);
  await fs.symlink(root, path.join(root, "link"));
  await assert.rejects(privateDirectory({ ...config, quarantineRoot: path.join(root, "link") }), /without symlinks/);
  const original = await input(root), link = path.join(root, "input-link"); await fs.symlink(original.filepath, link);
  await rejects(readFileBounded(link, config), "media_invalid_source");
  const huge = await input(root, "large.png", Buffer.alloc(MAX_BYTES + 1));
  await rejects(readFileBounded(huge.filepath, config), "media_too_large");
  let admittedPath;
  const admission = createMediaAdmission({ config, publicRoot: path.join(root, "public") });
  const service = admission.wrapUpload({ upload: async ({ files }) => { admittedPath = files[0].filepath; assert.notEqual(admittedPath, original.filepath); return [{ id: 1 }]; }, replace() {} });
  assert.deepEqual(await service.upload({ data: {}, files: original }), [{ id: 1 }]);
  await assert.rejects(fs.stat(admittedPath), { code: "ENOENT" });
  assert.deepEqual(await fs.readdir(config.quarantineRoot), []); assert.ok(await fs.stat(original.filepath));
  const failing = admission.wrapUpload({ upload: async () => { throw new Error("provider failed"); }, replace() {} });
  await assert.rejects(failing.upload({ data: {}, files: original }), /provider failed/);
  assert.deepEqual(await fs.readdir(config.quarantineRoot), []);
});
test("whole batch input admission prevents clean sibling writes when a later input is blocked", async t => {
  const { config, root } = await scannerFixture(t); let called = 0;
  const service = createMediaAdmission({ config }).wrapUpload({ upload: async () => { called++; return []; }, replace() {} });
  await rejects(service.upload({ data: {}, files: [await input(root), await input(root, "bad.svg")] }), "media_type_blocked");
  assert.equal(called, 0); assert.deepEqual(await fs.readdir(config.quarantineRoot), []);
  await rejects(service.upload({ data: { path: "../outside" }, files: await input(root) }), "media_invalid_path");
});
test("every low-level upload provider method scans and canonicalizes bytes before persistence", async t => {
  const { config } = await scannerFixture(t);
  for (const method of ["upload", "uploadStream"]) {
    let called = 0;
    const provider = createMediaAdmission({ config }).wrapProvider({ [method]: async file => {
      called++; assert.ok(!file.buffer.includes(Buffer.from("polyglot"))); file.url = "/uploads/fixture_12345.png";
    } });
    const file = providerFile(Buffer.concat([png(5, 5), Buffer.from("polyglot")]));
    await provider[method](file, providerFile(png(5, 5))); assert.equal(called, 1); assert.ok(file.url);
    await rejects(provider[method](providerFile(Buffer.concat([png(5, 5), EICAR])), providerFile(png(5, 5))), "media_malware_detected");
    assert.equal(called, 1);
  }
});
test("provider stream size cannot trust client metadata; scanner outage never writes or replaces", async t => {
  const { config } = await scannerFixture(t); let calls = 0;
  const provider = createMediaAdmission({ config }).wrapProvider({ uploadStream: async () => { calls++; } });
  const stream = new PassThrough(); stream.end(Buffer.alloc(MAX_BYTES + 1));
  await rejects(provider.uploadStream({ ...providerFile(png(1, 1)), stream, sizeInBytes: 1 }), "media_too_large");
  const disabled = createMediaAdmission({ config: { ...config, scanner: {} } }).wrapProvider({ replace: async () => { calls++; } });
  await rejects(disabled.replace(providerFile(png(1, 1)), providerFile(png(1, 1))), "media_replace_disabled"); assert.equal(calls, 0);
});
test("service and low-level binary replacements fail before scanner, row or byte mutations", async t => {
  const { config, root, scanned } = await scannerFixture(t); let replaced = false;
  const service = createMediaAdmission({ config }).wrapUpload({ upload() {}, replace: async () => { replaced = true; },
    findOne: async () => { throw new Error("No database access should occur"); } });
  await rejects(service.replace(1, { data: {}, file: await input(root) }), "media_replace_disabled"); assert.equal(replaced, false);
  for (const method of ["replace", "replaceStream"]) {
    const provider = createMediaAdmission({ config }).wrapProvider({ [method]: async () => { replaced = true; } });
    await rejects(provider[method](providerFile(png(1, 1)), providerFile(png(1, 1))), "media_replace_disabled");
  }
  assert.equal(replaced, false); assert.equal(scanned.length, 0);
  await assert.rejects(fs.stat(config.quarantineRoot), { code: "ENOENT" });
});

test("operator scanner diagnostic requires clean acceptance plus EICAR rejection and no public writes", async t => {
  const fixture = await scannerFixture(t);
  const env = { ...process.env, ALAGEUM_MEDIA_CLAMAV_SOCKET: "", ALAGEUM_MEDIA_CLAMAV_HOST: "127.0.0.1",
    ALAGEUM_MEDIA_CLAMAV_PORT: String(fixture.config.scanner.port), ALAGEUM_MEDIA_SCAN_TIMEOUT_MS: "2000" };
  const script = path.join(__dirname, "../scripts/check-media-scanner.js");
  const success = await promisify(execFile)(process.execPath, [script], { env });
  assert.deepEqual(JSON.parse(success.stdout), { clean_fixture: "accepted", harmless_eicar_fixture: "rejected", public_writes: 0 });
  fixture.setResponder(() => "stream: OK\0");
  await assert.rejects(promisify(execFile)(process.execPath, [script], { env }), error => error.code === 1 && /Scanner accepted EICAR/.test(error.stderr));
  await assert.rejects(promisify(execFile)(process.execPath, [script], { env: { ...env, ALAGEUM_MEDIA_CLAMAV_HOST: "" } }), error => error.code === 1 && /media_scanner_unavailable/.test(error.stderr));
});
