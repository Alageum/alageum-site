"use strict";

const { spawn } = require("node:child_process");
const { readdirSync, readFileSync } = require("node:fs");
const ownedGroups = new WeakMap();
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Only children created here own a fresh process group. Never accept a PID from
// configuration or signal the caller's/shared process group.
function spawnOwnedGroup(command, args, options = {}) {
  if (process.platform === "win32") throw new Error("Quote print runner requires POSIX process groups");
  const child = spawn(command, args, { ...options, detached: true });
  ownedGroups.set(child, child.pid);
  return child;
}
function signalGroup(child, signal) {
  if (!ownedGroups.has(child)) throw new Error("Refusing to signal an unowned process group");
  const groupId = ownedGroups.get(child);
  if (!Number.isInteger(groupId) || groupId <= 1) return false;
  try { process.kill(-groupId, signal); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}
function liveGroup(child) {
  if (!signalGroup(child, 0)) return false;
  if (process.platform !== "linux") return true;
  // A killed orphan may briefly remain a zombie until init reaps it. Zombies
  // cannot execute or hold sockets; kill(0) alone would misreport them as live.
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    let stat;
    try { stat = readFileSync(`/proc/${name}/stat`, "utf8"); }
    catch (error) { if (["ENOENT", "ESRCH"].includes(error.code)) continue; throw error; }
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    if (Number(fields[2]) === ownedGroups.get(child) && !["Z", "X"].includes(fields[0])) return true;
  }
  return false;
}
async function waitForGroup(child, milliseconds) {
  const until = Date.now() + milliseconds;
  while (liveGroup(child)) {
    if (Date.now() >= until) return false;
    await pause(Math.min(25, Math.max(1, until - Date.now())));
  }
  // Close the /proc snapshot race: any still-addressable owned group receives
  // SIGKILL even if its only observed members were already zombies.
  signalGroup(child, "SIGKILL");
  return true;
}
async function stopOwnedGroup(child, { graceMs = 5000, forceMs = 2000 } = {}) {
  if (!child) return;
  // The leader may already have exited while its descendants remain alive.
  // Checking child.exitCode here would abandon those owned descendants.
  if (!signalGroup(child, "SIGTERM")) return;
  try {
    if (await waitForGroup(child, graceMs)) return;
    signalGroup(child, "SIGKILL");
    if (!await waitForGroup(child, forceMs)) throw new Error("Owned quote print process group did not stop before the deadline");
  } finally {
    // Even an unexpected liveness-probe failure must not strand descendants.
    signalGroup(child, "SIGKILL");
  }
}
async function boundedDestroy(destroy, milliseconds = 10000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(destroy),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Strapi cleanup exceeded its deadline")), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}
module.exports = { spawnOwnedGroup, stopOwnedGroup, boundedDestroy };
