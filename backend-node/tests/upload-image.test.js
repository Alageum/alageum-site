"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { sharp, uploadPackage, imageService: images, png, svg, assertSolidImage, fileAt } = require("./helpers/upload-image-fixtures");

async function fixture(t, settings = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "alageum-upload-image-"));
  const descriptor = Object.getOwnPropertyDescriptor(global, "strapi");
  global.strapi = { config: { get: (_key, fallback) => fallback },
    plugin: () => ({ service: () => ({ getSettings: async () => settings }) }) };
  t.after(async () => {
    if (descriptor) Object.defineProperty(global, "strapi", descriptor); else delete global.strapi;
    await fs.rm(directory, { recursive: true, force: true });
    await assert.rejects(fs.stat(directory), { code: "ENOENT" });
  });
  return directory;
}

test("native upload resolves only the bounded sharp patch and current prebuilt librsvg", () => {
  assert.equal(require(uploadPackage).version, "5.56.0");
  assert.equal(sharp.versions.sharp, "0.35.5");
  assert.equal(sharp.versions.rsvg, "2.63.2");
  const manifest = require("../package.json");
  assert.deepEqual(manifest.overrides["@strapi/upload"], { sharp: "0.35.5" });
  assert.equal(manifest.dependencies["@strapi/strapi"], "5.56.0");
});
test("real upload PNG detection, validation, thumbnail and responsive outputs decode completely", async t => {
  const directory = await fixture(t, { responsiveDimensions: true });
  const file = fileAt(directory, "native-red.png", png(), "image/png");
  assert.equal(await images.isImage(file), true); assert.equal(await images.isFaultyImage(file), false);
  assert.equal(await images.isResizableImage(file), true); assert.equal(await images.isOptimizableImage(file), true);
  Object.assign(file, await images.getDimensions(file));
  assert.deepEqual({ width: file.width, height: file.height }, { width: 1200, height: 600 });
  await assertSolidImage(file.filepath, 1200, 600);
  const thumbnail = await images.generateThumbnail(file);
  await assertSolidImage(thumbnail.filepath, 245, 123);
  assert.ok(thumbnail.sizeInBytes > 0);
  const formats = await images.generateResponsiveFormats(file);
  assert.deepEqual(formats.map(row => row.key), ["large", "medium", "small"]);
  for (const { key, file: output } of formats) {
    const width = { large: 1000, medium: 750, small: 500 }[key];
    await assertSolidImage(output.filepath, width, width / 2);
    assert.equal(output.width, width); assert.equal(output.height, width / 2);
  }
});
test("real PNG optimization and stream processing preserve full decoded pixels", async t => {
  const directory = await fixture(t, { sizeOptimization: true, autoOrientation: true });
  const file = fileAt(directory, "optimized-red.png", png(80, 40), "image/png");
  const optimized = await images.optimize(file);
  await assertSolidImage(optimized.filepath, 80, 40);
  const streamFile = { ...file, filepath: undefined };
  assert.deepEqual(await images.getDimensions(streamFile), { width: 80, height: 40 });
  // The pinned stream isFaultyImage API returns stats on success; do not silently
  // assert the filepath-only boolean contract for it.
  assert.ok(await images.isFaultyImage(streamFile));
  assert.equal(await images.generateThumbnail({ ...file, width: 80, height: 40 }), null);
  assert.deepEqual(await images.generateResponsiveFormats(file), []);
});
test("native SVG validation decodes safe pixels but does not invent SVG responsive formats", async t => {
  const directory = await fixture(t);
  const file = fileAt(directory, "safe.svg", svg(), "image/svg+xml");
  assert.equal(await images.isImage(file), true); assert.equal(await images.isFaultyImage(file), false);
  assert.equal(await images.isResizableImage(file), false); assert.equal(await images.isOptimizableImage(file), false);
  assert.deepEqual(await images.getDimensions(file), { width: 120, height: 60 });
  await assertSolidImage(file.filepath, 120, 60);
  assert.equal(await images.optimize(file), file);
});
test("corrupt and truncated raster and malformed SVG fail native full-decode validation", async t => {
  const directory = await fixture(t);
  const truncated = png().subarray(0, 60);
  for (const [name, bytes, mime] of [["truncated.png", truncated, "image/png"],
    ["junk.png", Buffer.from("not an image"), "image/png"], ["broken.svg", Buffer.from('<svg><broken'), "image/svg+xml"]]) {
    const file = fileAt(directory, name, bytes, mime);
    assert.equal(await images.isFaultyImage(file), true, name);
    await assert.rejects(sharp(bytes).raw().toBuffer());
  }
});
