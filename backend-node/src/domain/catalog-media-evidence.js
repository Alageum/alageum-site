"use strict";
const { createHash } = require("node:crypto");
// JSONB changes key order. Evidence and media identity must not depend on it.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sourceDigest = (value) => digest(JSON.stringify(canonical(value)));
function sameMediaEntry(a, b) {
  return Boolean(a && b && a.path === b.path && a.kind === b.kind &&
    Object.hasOwn(a, "alt") === Object.hasOwn(b, "alt") && a.alt === b.alt);
}
function sameMedia(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((entry, index) => sameMediaEntry(entry, b[index]));
}
module.exports = { canonical, digest, sourceDigest, sameMediaEntry, sameMedia };
