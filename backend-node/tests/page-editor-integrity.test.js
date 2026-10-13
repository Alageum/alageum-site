"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { verifyPageEditorAdapter } = require("../scripts/check-page-editor-adapter");
const official = require("../data/compatibility/native-page-editor.json");

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-editor-integrity-"));
  const packageRoot = path.join(root, "node_modules/@strapi/content-manager");
  const expected = structuredClone(official);
  const packages = {};
  for (const definition of [expected, ...expected.selection_packages]) {
    const dir = path.join(root, "node_modules", definition.package);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: definition.package, version: definition.version }));
    packages[`node_modules/${definition.package}`] = { integrity: definition.package_integrity };
    for (const relative of Object.keys(definition.files)) {
      const filename = path.join(dir, relative);
      const bytes = `synthetic integrity fixture: ${definition.package}/${relative}`;
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, bytes);
      definition.files[relative] = createHash("sha256").update(bytes).digest("hex");
    }
  }
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ packages }));
  try { run({ root, packageRoot, expected, first: Object.keys(expected.files)[0] }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("Page editor adapter verifies the installed official package without rewriting it", () => {
  assert.deepEqual(verifyPageEditorAdapter(), { version: "5.56.0", files: 18, selectionFiles: 4 });
});

test("Page editor adapter refuses package version and lock integrity drift", () => {
  fixture(({ root, packageRoot, expected }) => {
    assert.equal(verifyPageEditorAdapter(root, expected).files, 18);
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ name: official.package, version: "5.56.1" }));
    assert.throws(() => verifyPageEditorAdapter(root, expected), /package or lock integrity/);
  });
  fixture(({ root, expected }) => {
    fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ packages: {} }));
    assert.throws(() => verifyPageEditorAdapter(root, expected), /package or lock integrity/);
  });
});

test("Page selection adapter refuses Slate package, lock, runtime and compatibility-map drift", () => {
  for (const name of ["slate", "slate-react"]) {
    for (const change of ["version", "integrity", "runtime", "missing", "symlink"]) fixture(({ root, expected }) => {
      const dir = path.join(root, "node_modules", name);
      if (change === "version") {
        fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "99.0.0" }));
      } else if (change === "integrity") {
        const filename = path.join(root, "package-lock.json");
        const lock = JSON.parse(fs.readFileSync(filename, "utf8"));
        lock.packages[`node_modules/${name}`].integrity = "changed";
        fs.writeFileSync(filename, JSON.stringify(lock));
      } else {
        const filename = path.join(dir, "dist/index.es.js");
        if (change === "runtime") fs.appendFileSync(filename, "altered");
        else {
          fs.unlinkSync(filename);
          if (change === "symlink") fs.symlinkSync(path.join(dir, "dist/index.js"), filename);
        }
      }
      assert.throws(() => verifyPageEditorAdapter(root, expected), `${name}/${change}`);
    });
  }
  for (const change of ["missing", "identity", "incomplete", "traversal"]) fixture(({ root, expected }) => {
    if (change === "missing") delete expected.selection_packages;
    else if (change === "identity") expected.selection_packages[0].package = "../outside";
    else {
      const files = expected.selection_packages[0].files;
      const hash = files["dist/index.js"];
      delete files["dist/index.js"];
      if (change === "traversal") files["dist/../../outside.js"] = hash;
    }
    assert.throws(() => verifyPageEditorAdapter(root, expected));
  });
});

test("Page editor adapter refuses changed, missing, or redirected native bytes", () => {
  for (const change of ["changed", "missing", "symlink"]) fixture(({ root, packageRoot, expected, first }) => {
    const filename = path.join(packageRoot, first);
    if (change === "changed") fs.appendFileSync(filename, "altered");
    else {
      fs.unlinkSync(filename);
      if (change === "symlink") fs.symlinkSync(path.join(packageRoot, "package.json"), filename);
    }
    assert.throws(() => verifyPageEditorAdapter(root, expected));
  });
});

test("Page editor adapter refuses incomplete or traversing manifests", () => {
  fixture(({ root, expected, first }) => {
    const incomplete = { ...expected, files: { ...expected.files } };
    delete incomplete.files[first];
    assert.throws(() => verifyPageEditorAdapter(root, incomplete), /Incomplete/);
    const traversing = { ...expected, files: { ...incomplete.files, "dist/admin/../../outside.js": expected.files[first] } };
    assert.throws(() => verifyPageEditorAdapter(root, traversing), /Invalid native Page editor integrity entry/);
  });
});
