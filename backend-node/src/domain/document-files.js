"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { constants } = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const { AppError } = require("./errors");
const { safeName, readMediaConfig } = require("./media-policy");
const { scanBytes } = require("./media-scanner");
const { readFileBounded, within } = require("./media-quarantine");
const { trustedAncestors } = require("./media-storage");
const MAX_BYTES = 1024 * 1024;
const BACKEND = "private-local-v1";
const fail = (code, message, status = 422) => { throw new AppError(code, message, status); };
function readDocumentConfig(env = (key, fallback) => process.env[key] ?? fallback) {
  const root = env("ALAGEUM_DOCUMENT_ROOT", "");
  if (root && (typeof root !== "string" || !path.isAbsolute(root) || path.resolve(root) !== root || root === path.parse(root).root || root.includes("\0"))) throw new Error("document_storage_root_invalid");
  const media = readMediaConfig(env);
  return { root, maxBytes: MAX_BYTES, maxPixels: media.maxPixels, scanner: media.scanner, publicRoot: media.storage.publicRoot, quarantineRoot: media.quarantineRoot };
}
async function assertRoot(config) {
  if (!config.root) fail("document_storage_unavailable", "Private document storage is not configured", 503);
  const root = config.root;
  if (!path.isAbsolute(root) || path.resolve(root) !== root || root === path.parse(root).root) fail("document_storage_unavailable", "Private document storage is unavailable", 503);
  for (const other of [config.publicRoot, config.quarantineRoot].filter(Boolean)) if (within(root, path.resolve(other)) || within(path.resolve(other), root)) fail("document_storage_unavailable", "Private document storage must be separate", 503);
  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(root) !== root || stat.mode & 0o077 || (typeof process.getuid === "function" && stat.uid !== process.getuid()) || !await trustedAncestors(root)) throw new Error("unsafe");
    await fs.access(root, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch { fail("document_storage_unavailable", "Private document storage is unavailable", 503); }
}
function validateInput(ctx) {
  const body = ctx.request.body || {}, files = ctx.request.files || {};
  const file = Array.isArray(files.file) && files.file.length === 1 ? files.file[0] : files.file;
  if (!/^multipart\/form-data(?:;|$)/i.test(ctx.get("content-type") || "")) fail("document_multipart_required", "Use a multipart document upload");
  if (Object.keys(body).some(k => !["title", "type_code", "number"].includes(k)) || Object.keys(files).length !== 1 || !file || Array.isArray(file)) fail("document_invalid_upload", "Supply exactly one document file");
  const valid = (value, max) => typeof value === "string" && value.isWellFormed() && value.trim() === value && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  if (!valid(body.title, 300) || !valid(body.type_code, 100) || (body.number !== undefined && !valid(body.number, 120))) fail("document_invalid_metadata", "Document title, type or number is invalid");
  return { title: body.title, type_code: body.type_code, number: body.number ?? null, file };
}
function documentType(name, mime, bytes) {
  try { safeName(name); } catch { fail("document_invalid_filename", "Invalid document filename"); }
  const ext = path.extname(name).toLowerCase();
  const wanted = ({ ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" })[ext];
  if (!wanted || mime !== wanted) fail("document_type_blocked", "Only PDF, JPEG and PNG with matching types are accepted");
  const actual = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ? "image/png"
    : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
      : /^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(bytes.subarray(0, 16).toString("latin1")) && /%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1")) ? "application/pdf" : null;
  if (actual !== wanted) fail("document_type_mismatch", "Document bytes do not match the file type");
  return wanted;
}
async function admit(file, config) {
  let bytes;
  try { bytes = await readFileBounded(file.filepath, config); }
  catch (error) { if (error.name === "MediaAdmissionError") fail(error.code, error.message, error.status); throw error; }
  return admitBytes({ bytes, name: file.originalFilename, mime: file.mimetype }, config);
}
async function admitBytes(input, config) {
  if (!input || !Buffer.isBuffer(input.bytes) || input.bytes.length === 0) fail("document_invalid_bytes", "Document bytes are required");
  if (input.bytes.length > Math.min(MAX_BYTES, config.maxBytes ?? MAX_BYTES)) fail("document_too_large", "Document exceeds the 1 MiB limit", 413);
  // Snapshot before asynchronous scanning; callers cannot mutate the admitted payload.
  const bytes = Buffer.from(input.bytes);
  const mime = documentType(input.name, input.mime, bytes);
  try { await scanBytes(bytes, config.scanner); }
  catch (error) { if (error.name === "MediaAdmissionError") fail(error.code, error.message, error.status); throw error; }
  if (mime !== "application/pdf") {
    try {
      const sharp = require("node:module").createRequire(require.resolve("@strapi/upload/package.json"))("sharp");
      const image = sharp(bytes, { limitInputPixels: config.maxPixels, failOn: "warning", animated: false });
      const meta = await image.metadata();
      if (!meta.width || !meta.height || (meta.pages || 1) !== 1 || meta.width * meta.height > config.maxPixels) throw new Error("invalid");
      await image.raw().toBuffer();
    } catch { fail("document_invalid_image", "Document image could not be safely decoded"); }
  }
  // Keep exact admitted bytes: signatures bind these bytes, not a rewritten image.
  return { bytes, mime, name: input.name, checksum: createHash("sha256").update(bytes).digest("hex") };
}
function keyPath(root, key) {
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) fail("document_file_unavailable", "Document file is unavailable", 404);
  return path.join(root, key);
}
function createDocumentStorage(config = readDocumentConfig()) {
  async function store(input) {
    await assertRoot(config);
    const key = randomUUID(), target = keyPath(config.root, key);
    let handle;
    try { handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); await handle.writeFile(input.bytes); await handle.sync(); }
    catch (error) { if (handle) await fs.unlink(target).catch(() => {}); throw error; }
    finally { await handle?.close(); }
    try {
      const directory = await fs.open(config.root, constants.O_RDONLY | constants.O_DIRECTORY);
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) { await fs.unlink(target).catch(() => {}); throw error; }
    return key;
  }
  async function remove(key) { await assertRoot(config); await fs.unlink(keyPath(config.root, key)); }
  async function read(row) {
    if (row.storage_backend !== BACKEND) fail("document_file_unavailable", "Document file is unavailable", 404);
    await assertRoot(config);
    let handle;
    try {
      handle = await fs.open(keyPath(config.root, row.storage_key), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077 || (typeof process.getuid === "function" && stat.uid !== process.getuid()) || stat.size > MAX_BYTES || stat.size !== Number(row.size_bytes)) throw new Error("invalid");
      const buffer = Buffer.alloc(MAX_BYTES + 1); let length = 0;
      while (length < buffer.length) { const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length); if (!bytesRead) break; length += bytesRead; }
      const bytes = buffer.subarray(0, length);
      if (length !== Number(row.size_bytes) || createHash("sha256").update(bytes).digest("hex") !== row.checksum_sha256) throw new Error("invalid");
      documentType(row.original_name, row.content_type, bytes);
      return bytes;
    } catch (error) { if (error instanceof AppError) throw error; fail("document_file_unavailable", "Document file is unavailable", 404); }
    finally { await handle?.close(); }
  }
  return { admit: file => admit(file, config), admitBytes: input => admitBytes(input, config), store, remove, read, ready: () => assertRoot(config) };
}
module.exports = { MAX_BYTES, BACKEND, readDocumentConfig, assertRoot, validateInput, documentType, admit, admitBytes, keyPath, createDocumentStorage };
