"use strict";
const path = require("node:path");
const fs = require("node:fs/promises");
const { constants } = require("node:fs");
function readMediaStorageConfig(env = (key, fallback) => process.env[key] ?? fallback) {
  const publicRoot = env("ALAGEUM_MEDIA_PUBLIC_ROOT", "");
  if (!publicRoot) return { publicRoot: null };
  if (typeof publicRoot !== "string" || !path.isAbsolute(publicRoot) || publicRoot.includes("\0") ||
      path.resolve(publicRoot) !== publicRoot || publicRoot === path.parse(publicRoot).root)
    throw new Error("media_storage_root_invalid");
  return { publicRoot };
}
function serverPublicRoot(env) { return readMediaStorageConfig(env).publicRoot || "./public"; }
function secureMediaCreationMask() { return (process.umask() & 0o022) === 0o022; }
function within(root, value) {
  const relative = path.relative(root, value);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function trustedAncestors(directory) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  for (let current = path.dirname(directory); ; current = path.dirname(current)) {
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        (uid !== null && stat.uid !== uid && stat.uid !== 0) ||
        ((stat.mode & 0o022) && !(stat.mode & 0o1000))) return false;
    if (current === path.dirname(current)) return true;
  }
}
async function inspectDirectory(directory, prefix, { privateMode = false } = {}) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) return [`${prefix}_missing`];
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory)
      return [`${prefix}_unsafe_path`];
    if ((typeof process.getuid === "function" && stat.uid !== process.getuid()) || (stat.mode & (privateMode ? 0o077 : 0o022)))
      return [`${prefix}_unsafe_permissions`];
    if (!(await trustedAncestors(directory))) return [`${prefix}_unsafe_ancestor`];
    await fs.access(directory, constants.R_OK | constants.W_OK | constants.X_OK);
    return [];
  } catch (error) {
    return [`${prefix}_${error.code === "ENOENT" ? "missing" : "inaccessible"}`];
  }
}
async function inspectExistingUploads(directory) {
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const stat = await fs.lstat(path.join(directory, entry.name));
      // The native local provider uses a flat directory. Do not follow links or
      // inspect content: preserve existing approved legacy bytes/extensions.
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
          (typeof process.getuid === "function" && stat.uid !== process.getuid()) || (stat.mode & 0o022))
        return ["media_storage_upload_entry_unsafe"];
    }
    return [];
  } catch { return ["media_storage_upload_entries_inaccessible"]; }
}
// Read-only local inspection. It deliberately cannot certify a persistent mount,
// backup, or restore. Do not print supplied paths or underlying filesystem errors.
async function inspectMediaStorage({ publicRoot, quarantineRoot } = {}) {
  const issues = [];
  if (!secureMediaCreationMask()) issues.push("media_storage_umask_unsafe");
  if (!publicRoot) issues.push("media_storage_root_missing");
  else if (typeof publicRoot !== "string" || !path.isAbsolute(publicRoot) || path.resolve(publicRoot) !== publicRoot || publicRoot === path.parse(publicRoot).root)
    issues.push("media_storage_root_invalid");
  else {
    issues.push(...await inspectDirectory(publicRoot, "media_storage_root"));
    issues.push(...await inspectDirectory(path.join(publicRoot, "uploads"), "media_storage_uploads"));
    if (!issues.length) issues.push(...await inspectExistingUploads(path.join(publicRoot, "uploads")));
    if (!issues.length) {
      try { if ((await fs.readdir(publicRoot)).some(entry => entry !== "uploads")) issues.push("media_storage_root_not_dedicated"); }
      catch { issues.push("media_storage_root_inaccessible"); }
    }
  }
  issues.push(...await inspectDirectory(quarantineRoot, "media_quarantine", { privateMode: true }));
  if (typeof publicRoot === "string" && typeof quarantineRoot === "string" && path.isAbsolute(publicRoot) && path.isAbsolute(quarantineRoot) &&
      (within(publicRoot, quarantineRoot) || within(quarantineRoot, publicRoot))) issues.push("media_storage_quarantine_overlap");
  return { configured: Boolean(publicRoot), directories_ready: issues.length === 0, issues,
    volume_persistence_verified: false, backup_restore_verified: false };
}
async function assertConfiguredMediaStorage({ publicRoot, quarantineRoot, effectivePublicRoot }) {
  if (!publicRoot) return;
  if (effectivePublicRoot && path.resolve(effectivePublicRoot) !== publicRoot) throw new Error("media_storage_root_mismatch");
  const result = await inspectMediaStorage({ publicRoot, quarantineRoot });
  if (!result.directories_ready) throw new Error(`Media storage unavailable: ${result.issues.join(", ")}`);
}
module.exports = { readMediaStorageConfig, serverPublicRoot, inspectMediaStorage, assertConfiguredMediaStorage, trustedAncestors, secureMediaCreationMask };
