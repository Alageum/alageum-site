"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { once } = require("node:events");
const { readFileSync } = require("node:fs");
const { spawnOwnedGroup, stopOwnedGroup, boundedDestroy } = require("../scripts/quote-print-process");

const live = pid => {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") return !["Z", "X"].includes(readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ")[0]);
    return true;
  } catch (error) { if (["ESRCH", "ENOENT"].includes(error.code)) return false; throw error; }
};
async function tree(orphan = false) {
  const code = `
    const { spawn } = require('node:child_process');
    process.on('SIGTERM', () => {});
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.once('message', () => { process.stdout.write(JSON.stringify({ parent: process.pid, descendant: child.pid }) + '\\n'); ${orphan ? 'setImmediate(() => process.exit(0));' : ''} });
    setInterval(() => {}, 1000);
  `;
  const child = spawnOwnedGroup(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  const ids = JSON.parse((await once(child.stdout, "data"))[0].toString());
  return { child, ids };
}
test("forced group stop kills a stubborn leader and its stubborn descendant", { timeout: 6000 }, async () => {
  const { child, ids } = await tree();
  try {
    assert.equal(live(ids.parent), true); assert.equal(live(ids.descendant), true);
    const started = Date.now();
    child.pid = process.pid; // Only the immutable spawn-time group may be signalled.
    await stopOwnedGroup(child, { graceMs: 70, forceMs: 1500 });
    assert.ok(Date.now() - started < 2000);
    assert.equal(live(ids.parent), false); assert.equal(live(ids.descendant), false);
  } finally { await stopOwnedGroup(child, { graceMs: 0, forceMs: 1500 }); }
});
test("an exited leader does not abandon its surviving owned descendant", { timeout: 6000 }, async () => {
  const { child, ids } = await tree(true);
  try {
    if (child.exitCode === null) await once(child, "exit");
    assert.equal(child.exitCode, 0); assert.equal(live(ids.descendant), true);
    await stopOwnedGroup(child, { graceMs: 70, forceMs: 1500 });
    assert.equal(live(ids.descendant), false);
  } finally { await stopOwnedGroup(child, { graceMs: 0, forceMs: 1500 }); }
});
test("cleanup refuses arbitrary PIDs and never signals the test process group", async () => {
  await assert.rejects(stopOwnedGroup({ pid: process.pid }), /unowned process group/);
});
test("a hung destroy with open handles reaches bounded failed-process exit after evidence", { timeout: 6000 }, async () => {
  const code = `
    const { boundedDestroy } = require(${JSON.stringify(require.resolve("../scripts/quote-print-process"))});
    setInterval(() => {}, 1000);
    boundedDestroy(() => new Promise(() => {}), 70).catch(() => {
      require('node:fs').writeSync(1, 'cleanup-failed-evidence-saved\\n');
      process.exit(1);
    });
  `;
  const child = spawnOwnedGroup(process.execPath, ["-e", code], { stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", chunk => { output += chunk; });
  try {
    const [code] = await once(child, "exit");
    assert.equal(code, 1); assert.match(output, /cleanup-failed-evidence-saved/);
  } finally { await stopOwnedGroup(child, { graceMs: 0, forceMs: 1500 }); }
});
test("bounded destroy preserves ordinary success and failures", async () => {
  assert.equal(await boundedDestroy(() => 42, 100), 42);
  await assert.rejects(boundedDestroy(() => { throw new Error('destroy failed'); }, 100), /destroy failed/);
});
