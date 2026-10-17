"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { constants } = require("node:fs");
const { fail, boundedBytes } = require("./media-policy");
const { trustedAncestors } = require("./media-storage");
function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function privateDirectory(config, publicRoot) {
  const root = path.resolve(config.quarantineRoot);
  if (publicRoot && within(path.resolve(publicRoot), root)) throw new Error("Media quarantine cannot be publicly served");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root), actual = await fs.realpath(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || actual !== root || (stat.mode & 0o077) !== 0 ||
      !(await trustedAncestors(root)) ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
      (publicRoot && within(await fs.realpath(publicRoot), actual)))
    throw new Error("Media quarantine must be an app-owned private directory without symlinks");
  return fs.mkdtemp(path.join(root, "request-"));
}
async function readFileBounded(filepath, config) {
  if (typeof filepath !== "string" || !path.isAbsolute(filepath)) fail("media_invalid_source", "Media input file is invalid");
  let handle;
  try {
    handle = await fs.open(filepath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) fail("media_invalid_source", "Media input must be a regular file");
    if (stat.size > config.maxBytes) fail("media_too_large", "Media file exceeds the 1 MiB limit", 413);
    const bytes = Buffer.alloc(config.maxBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const result = bytes.subarray(0, offset); boundedBytes(result, config); return result;
  } catch (error) {
    if (error.code === "ELOOP" || error.code === "ENOENT") fail("media_invalid_source", "Media input file is invalid");
    throw error;
  } finally { await handle?.close(); }
}
async function streamBytes(stream, config) {
  const chunks = []; let length = 0;
  const timer = setTimeout(() => stream.destroy(new Error("Media input stream timed out")), 10000);
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); length += bytes.length;
      if (length > config.maxBytes) fail("media_too_large", "Media file exceeds the 1 MiB limit", 413);
      chunks.push(bytes);
    }
    const result = Buffer.concat(chunks, length); boundedBytes(result, config); return result;
  } finally { clearTimeout(timer); stream.destroy(); }
}
module.exports = { privateDirectory, readFileBounded, streamBytes, within };
