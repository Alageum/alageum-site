"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const manifest = require("../data/compatibility/native-page-editor.json");

function verifyPageEditorAdapter(projectRoot = path.resolve(__dirname, ".."), expected = manifest) {
  const lock = JSON.parse(fs.readFileSync(path.join(projectRoot, "package-lock.json"), "utf8"));
  verifyPackage(projectRoot, lock, expected, "@strapi/content-manager", 18, "dist/admin/");
  if (!Array.isArray(expected.selection_packages) || expected.selection_packages.length !== 2) {
    throw new Error("Incomplete native Page selection compatibility manifest");
  }
  for (const [index, name] of ["slate", "slate-react"].entries()) {
    verifyPackage(projectRoot, lock, expected.selection_packages[index], name, 2, "dist/");
  }
  return { version: expected.version, files: 18, selectionFiles: 4 };
}

function verifyPackage(projectRoot, lock, expected, name, count, prefix) {
  if (!expected || expected.package !== name) throw new Error("Invalid native Page editor package identity");
  const packageRoot = path.join(projectRoot, "node_modules", name);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (packageJson.name !== expected.package || packageJson.version !== expected.version ||
      lock.packages?.[`node_modules/${name}`]?.integrity !== expected.package_integrity) {
    throw new Error("Review the pinned native Page editor adapter before changing its package or lock integrity");
  }
  const realRoot = fs.realpathSync(packageRoot);
  const entries = Object.entries(expected.files);
  if (entries.length !== count) throw new Error("Incomplete native Page editor integrity manifest");
  for (const [relative, digest] of entries) {
    if (!relative.startsWith(prefix) || relative.split("/").includes("..") || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error("Invalid native Page editor integrity entry");
    }
    const filename = path.join(packageRoot, relative);
    if (!fs.lstatSync(filename).isFile() || !fs.realpathSync(filename).startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`Native Page editor must use an unredirected package file: ${relative}`);
    }
    if (createHash("sha256").update(fs.readFileSync(filename)).digest("hex") !== digest) {
      throw new Error(`Native Page editor package bytes changed; review the adapter: ${relative}`);
    }
  }
}

if (require.main === module) {
  const result = verifyPageEditorAdapter();
  console.log(`Native Page editor adapter verified: Strapi ${result.version}, ${result.files} unchanged official package files and ${result.selectionFiles} unchanged Slate runtime files`);
}

module.exports = { verifyPageEditorAdapter };
