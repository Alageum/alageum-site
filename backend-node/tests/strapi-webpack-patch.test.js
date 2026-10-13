"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { applyPatch, transform, sha256, manifest } = require("../scripts/strapi-webpack-patch");

function fixture(t) {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "strapi-webpack-patch-"));
  t.after(() => fs.rmSync(appDir, { recursive: true, force: true }));
  const root = path.join(appDir, "node_modules/@strapi/strapi");
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(appDir, "node_modules/webpack-dev-middleware"), { recursive: true });
  fs.writeFileSync(path.join(appDir, "package.json"), "{}");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "@strapi/strapi", version: manifest.strapiVersion }));
  fs.writeFileSync(path.join(appDir, "node_modules/webpack-dev-middleware/package.json"), JSON.stringify({ name: "webpack-dev-middleware", version: manifest.middlewareVersion }));
  const sourceRoot = process.env.STRAPI_PATCH_TEST_SOURCE_ROOT || path.dirname(require.resolve("@strapi/strapi/package.json"));
  for (const file of manifest.files) {
    let source = fs.readFileSync(path.join(sourceRoot, file.path), "utf8");
    if (sha256(source) === file.patchedSha256) source = transform(source, file.format, true);
    assert.equal(sha256(source), file.originalSha256, "test fixture derives from exact upstream source");
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
  }
  return { appDir, root, paths: manifest.files.map(file => path.join(root, file.path)) };
}
test("guarded CJS and ESM patch is exact, idempotent and verifiable after installation", t => {
  const f = fixture(t);
  assert.throws(() => applyPatch({ appDir: f.appDir, checkOnly: true }), /unpatched/);
  assert.equal(applyPatch(f).changed, 2);
  assert.equal(applyPatch(f).changed, 0);
  assert.equal(applyPatch({ appDir: f.appDir, checkOnly: true }).changed, 0);
  manifest.files.forEach((file, i) => {
    const source = fs.readFileSync(f.paths[i], "utf8");
    assert.equal(sha256(source), file.patchedSha256);
    assert.match(source, /koaWrapper\(compiler, \{/);
    assert.match(source, /modifyResponseData: function closeHeadStream/);
    assert.match(source, /koaDevMiddleware\.devMiddleware/);
    assert.doesNotMatch(source, /getHeader: context\.get/);
  });
});
test("a drifted ESM file fails before the pristine CJS file is modified", t => {
  const f = fixture(t);
  const original = fs.readFileSync(f.paths[0], "utf8");
  fs.appendFileSync(f.paths[1], "\n// unreviewed package change\n");
  assert.throws(() => applyPatch(f), /source drift/);
  assert.equal(fs.readFileSync(f.paths[0], "utf8"), original);
});
test("patched source tampering fails verification and is not silently repaired", t => {
  const f = fixture(t);
  applyPatch(f);
  fs.appendFileSync(f.paths[0], "\n// changed after install\n");
  assert.throws(() => applyPatch({ appDir: f.appDir, checkOnly: true }), /source drift/);
  assert.throws(() => applyPatch(f), /source drift/);
});
for (const name of ["@strapi/strapi", "webpack-dev-middleware"]) {
  test(`${name} version drift refuses all patch writes`, t => {
    const f = fixture(t);
    const before = f.paths.map(filename => fs.readFileSync(filename, "utf8"));
    fs.writeFileSync(path.join(f.appDir, "node_modules", name, "package.json"), JSON.stringify({ name, version: "99.0.0" }));
    assert.throws(() => applyPatch(f), /version drift/);
    f.paths.forEach((filename, i) => assert.equal(fs.readFileSync(filename, "utf8"), before[i]));
  });
}
test("an interrupted installation with one verified patched file is safely completed", t => {
  const f = fixture(t);
  fs.writeFileSync(f.paths[0], transform(fs.readFileSync(f.paths[0], "utf8"), "cjs"));
  assert.throws(() => applyPatch({ appDir: f.appDir, checkOnly: true }), /unpatched/);
  assert.equal(applyPatch(f).changed, 1);
  assert.equal(applyPatch({ appDir: f.appDir, checkOnly: true }).changed, 0);
});
test("redirected patch targets are refused", t => {
  const f = fixture(t);
  const redirected = path.join(f.appDir, "redirected.js");
  fs.renameSync(f.paths[0], redirected);
  fs.symlinkSync(redirected, f.paths[0]);
  assert.throws(() => applyPatch(f), /non-file or redirected/);
});
test("a symlinked node_modules root cannot patch a different checkout", t => {
  const candidate = fixture(t), shared = fixture(t);
  const before = shared.paths.map(filename => fs.readFileSync(filename, "utf8"));
  const modules = path.join(candidate.appDir, "node_modules");
  fs.rmSync(modules, { recursive: true, force: true });
  fs.symlinkSync(path.join(shared.appDir, "node_modules"), modules, "dir");
  assert.throws(() => applyPatch(candidate), /symlinked or non-directory node_modules/);
  shared.paths.forEach((filename, i) => assert.equal(fs.readFileSync(filename, "utf8"), before[i]));
});
test("a failed second rename restores the first format and removes staging files", t => {
  const f = fixture(t), rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (target === f.paths[1]) throw new Error("Injected second rename failure");
    return rename(source, target);
  };
  try { assert.throws(() => applyPatch(f), /second rename failure/); }
  finally { fs.renameSync = rename; }
  f.paths.forEach((filename, i) => assert.equal(sha256(fs.readFileSync(filename)), manifest.files[i].originalSha256));
  assert.equal(fs.readdirSync(path.dirname(f.paths[0])).some(name => name.includes(".alageum-")), false);
});
for (const redirect of [false, true]) {
  test(`rollback preserves concurrent ${redirect ? "symlink replacement" : "file updates"}`, t => {
    const f = fixture(t), rename = fs.renameSync;
    const outside = path.join(f.appDir, "concurrent.js");
    fs.writeFileSync(outside, "concurrent source");
    let injected = false;
    fs.renameSync = (source, target) => {
      const result = rename(source, target);
      if (target === f.paths[0] && !injected) {
        injected = true;
        if (redirect) { fs.unlinkSync(target); fs.symlinkSync(outside, target); }
        else fs.writeFileSync(target, "concurrent source");
        fs.writeFileSync(f.paths[1], "concurrent second format");
      }
      return result;
    };
    try { assert.throws(() => applyPatch(f), /changed while patching; rollback/); }
    finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(f.paths[0], "utf8"), "concurrent source");
    assert.equal(fs.readFileSync(outside, "utf8"), "concurrent source");
    assert.equal(fs.readFileSync(f.paths[1], "utf8"), "concurrent second format");
  });
}
test("a partially written staging file is removed after a write failure", t => {
  const f = fixture(t), write = fs.writeFileSync;
  fs.writeFileSync = (filename, ...args) => {
    const result = write(filename, ...args);
    if (filename.includes(".alageum-")) throw new Error("Injected partial staging failure");
    return result;
  };
  try { assert.throws(() => applyPatch(f), /partial staging failure/); }
  finally { fs.writeFileSync = write; }
  assert.equal(fs.readdirSync(path.dirname(f.paths[0])).some(name => name.includes(".alageum-")), false);
  f.paths.forEach((filename, i) => assert.equal(sha256(fs.readFileSync(filename)), manifest.files[i].originalSha256));
});
