"use strict";
const assert = require("node:assert/strict");
const { deflateSync } = require("node:zlib");
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");

// Exercise the sharp instance actually resolved by the pinned upload plugin.
const uploadPackage = require.resolve("@strapi/upload/package.json");
const uploadRequire = createRequire(uploadPackage);
const sharp = uploadRequire("sharp");
const imageService = require(path.join(path.dirname(uploadPackage), "dist/server/services/image-manipulation.js"));
const RED = Object.freeze([220, 40, 60, 255]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([length, name, bytes, crc]);
}
// PNG bytes are encoded without sharp, so a decoder is checked against independent pixels.
function png(width = 1200, height = 600) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const row = Buffer.alloc(width * 4 + 1);
  for (let x = 0; x < width; x++) Buffer.from(RED).copy(row, 1 + x * 4);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}
function svg(width = 120, height = 60) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="rgb(220,40,60)"/></svg>`);
}
async function assertSolidImage(input, width, height) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width); assert.equal(info.height, height); assert.equal(info.channels, 4);
  assert.equal(data.length, width * height * 4);
  const expected = Buffer.alloc(data.length);
  for (let offset = 0; offset < expected.length; offset += 4) expected.set(RED, offset);
  assert.deepEqual(data, expected, "Every decoded RGBA pixel must match the independently defined fixture");
}
function fileAt(directory, name, bytes, mime) {
  const filepath = path.join(directory, name); fs.writeFileSync(filepath, bytes, { flag: "wx" });
  return { name, hash: path.parse(name).name, ext: path.extname(name), mime,
    size: bytes.length / 1000, sizeInBytes: bytes.length, filepath,
    tmpWorkingDirectory: directory, getStream: () => fs.createReadStream(filepath) };
}
module.exports = { sharp, uploadPackage, imageService, png, svg, assertSolidImage, fileAt };
