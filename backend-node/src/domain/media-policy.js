"use strict";
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { readMediaStorageConfig } = require("./media-storage");

const MAX_BYTES = 1024 * 1024;
const MAX_FILES = 10;
const MAX_PIXELS = 16 * 1024 * 1024;
const TYPES = Object.freeze({
  ".png": { mime: "image/png", format: "png" },
  ".jpg": { mime: "image/jpeg", format: "jpeg" },
  ".jpeg": { mime: "image/jpeg", format: "jpeg" },
  ".webp": { mime: "image/webp", format: "webp" },
});
class MediaAdmissionError extends require("http-errors").BadRequest {
  constructor(code, message, status = 400) {
    super(message); this.name = "MediaAdmissionError"; this.code = code;
    this.status = status; this.statusCode = status; this.expose = true; this.details = { code };
  }
}
function fail(code, message, status) { throw new MediaAdmissionError(code, message, status); }
function privateHost(host) {
  if (host === "::1") return true;
  if (net.isIP(host) !== 4) return false;
  const [a, b] = host.split(".").map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function integer(value, name, min, max) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max)
    throw new Error(`${name} is outside the supported range`);
  return Number(value);
}
function readMediaConfig(env = (name, fallback) => process.env[name] ?? fallback) {
  const socketPath = env("ALAGEUM_MEDIA_CLAMAV_SOCKET", "");
  const host = env("ALAGEUM_MEDIA_CLAMAV_HOST", "");
  if (socketPath && host) throw new Error("Configure one media scanner connection, not both socket and host");
  if (socketPath && (!path.isAbsolute(socketPath) || socketPath.includes("\0"))) throw new Error("Media scanner socket must be an absolute local path");
  if (host && !privateHost(host)) throw new Error("Media scanner host must be a literal loopback or RFC1918 address");
  const quarantineRoot = env("ALAGEUM_MEDIA_QUARANTINE_DIR", path.join(os.tmpdir(), "alageum-media-quarantine"));
  if (!path.isAbsolute(quarantineRoot) || quarantineRoot.includes("\0")) throw new Error("Media quarantine must be an absolute private path");
  return {
    maxBytes: MAX_BYTES, maxFiles: MAX_FILES, maxPixels: MAX_PIXELS, quarantineRoot, storage: readMediaStorageConfig(env),
    scanner: { socketPath, host, port: integer(env("ALAGEUM_MEDIA_CLAMAV_PORT", "3310"), "Media scanner port", 1, 65535),
      timeoutMs: integer(env("ALAGEUM_MEDIA_SCAN_TIMEOUT_MS", "10000"), "Media scanner timeout", 100, 60000) },
  };
}
function safeName(name) {
  if (typeof name !== "string" || !name || name.length > 200 || name !== name.trim() ||
      /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) || /%(?:2e|2f|5c|00)/i.test(name) ||
      name === "." || name === ".." || /\.$/.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name))
    fail("media_invalid_filename", "Media filename is invalid");
  return name;
}
function fileType(name, mime, bytes) {
  safeName(name);
  const ext = path.extname(name).toLowerCase(), type = TYPES[ext];
  if (!type) fail("media_type_blocked", "New public uploads support PNG, JPEG and WebP only. SVG, HTML and documents are not accepted.");
  if (mime && mime !== "application/octet-stream" && mime.toLowerCase() !== type.mime)
    fail("media_type_mismatch", "Media filename and declared type do not match");
  const actual = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ? "image/png"
    : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
      : bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  if (actual !== type.mime) fail("media_type_mismatch", "Media content does not match its allowed image type");
  return { ...type, ext };
}
function boundedBytes(bytes, config) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail("media_empty", "Media file is empty");
  if (bytes.length > config.maxBytes) fail("media_too_large", "Media file exceeds the 1 MiB limit", 413);
}
function providerIdentity(file) {
  if (!file || typeof file.hash !== "string" || !/^[\p{L}\p{N}_-]{1,240}$/u.test(file.hash) ||
      !Object.hasOwn(TYPES, file.ext) || (file.path !== undefined && file.path !== null && file.path !== ""))
    fail("media_invalid_path", "Media storage path is invalid");
  safeName(file.name || `${file.hash}${file.ext}`);
}
module.exports = { MAX_BYTES, MAX_FILES, MAX_PIXELS, TYPES, MediaAdmissionError, fail, readMediaConfig, privateHost, safeName, fileType, boundedBytes, providerIdentity };
