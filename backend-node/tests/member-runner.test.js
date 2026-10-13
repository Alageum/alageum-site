"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnOwnedGroup, stopOwnedGroup } = require("../scripts/quote-print-process");

// Exercise the actual shell wrapper while replacing PostgreSQL and the browser
// entrypoint with finite, task-owned subprocesses. No database or HTTP server is
// started, and every fake command/file lives below this test's mkdtemp directory.
async function runCleanupCase({ testExit, stopExit, removeExit = 0 }) {
  const root = mkdtempSync(join(tmpdir(), "alageum-member-runner-unit."));
  const bin = join(root, "bin"), scratch = join(root, "scratch"), events = join(root, "events.log");
  mkdirSync(bin); mkdirSync(scratch);
  const realRm = ["/bin/rm", "/usr/bin/rm"].find(existsSync);
  assert.ok(realRm, "A POSIX rm executable is required by the shell harness");
  const executable = (name, body) => writeFileSync(join(bin, name), `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o700 });
  executable("initdb", `
while [[ $# -gt 0 ]]; do
  if [[ "$1" == -D ]]; then
    mkdir -p -- "$2"
    printf 'synthetic cluster marker\\n' > "$2/synthetic-cluster"
    exit 0
  fi
  shift
done
exit 2`);
  executable("createdb", "exit 0");
  executable("rm", `
if [[ "\${@: -1}" == */postgres && "$MEMBER_HARNESS_REMOVE_EXIT" != 0 ]]; then
  exit "$MEMBER_HARNESS_REMOVE_EXIT"
fi
exec "$MEMBER_HARNESS_RM" "$@"`);
  executable("pg_ctl", `
action=\${@: -1}
printf '%s\\n' "$action $*" >> "$MEMBER_HARNESS_EVENTS"
case "$action" in
  start|status) exit 0 ;;
  stop) exit "$MEMBER_HARNESS_STOP_EXIT" ;;
  *) exit 2 ;;
esac`);
  executable("node", `
if [[ "\${1:-}" == scripts/run-member-browser.js ]]; then
  exec "$MEMBER_HARNESS_NODE" - <<'NODE'
const fs = require("node:fs"), path = require("node:path");
const code = Number(process.env.MEMBER_HARNESS_TEST_EXIT);
fs.writeFileSync(path.join(process.env.E2E_MEMBER_EVIDENCE, "results.json"), JSON.stringify({
  kind: "isolated-organization-members", status: code ? "failed" : "passed",
  browser: code ? "failed" : "passed", cleanup: "passed", checks: [],
  ...(code ? { error: "Synthetic browser assertion failed" } : {}),
}));
process.exit(code);
NODE
fi
exec "$MEMBER_HARNESS_NODE" "$@"`);
  let child, timer, stdout = "", stderr = "";
  try {
    child = spawnOwnedGroup("bash", [resolve(__dirname, "../scripts/run-member-tests.sh"), "--browser"], {
      cwd: resolve(__dirname, ".."), stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PG_BIN: bin, TMPDIR: scratch,
        MEMBER_TEST_PG_PORT: "55432", MEMBER_HARNESS_NODE: process.execPath,
        MEMBER_HARNESS_EVENTS: events, MEMBER_HARNESS_TEST_EXIT: String(testExit), MEMBER_HARNESS_STOP_EXIT: String(stopExit),
        MEMBER_HARNESS_REMOVE_EXIT: String(removeExit), MEMBER_HARNESS_RM: realRm },
    });
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    const outcome = await Promise.race([
      new Promise((done, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => done({ code, signal }));
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Synthetic member shell runner timed out")), 8000); }),
    ]);
    assert.equal(outcome.signal, null, stderr);
    const owned = readdirSync(scratch);
    assert.equal(owned.length, 1);
    assert.match(owned[0], /^alageum-member-tests\.[A-Za-z0-9]+$/);
    const work = join(scratch, owned[0]);
    const report = JSON.parse(readFileSync(join(work, "evidence/results.json"), "utf8"));
    const commands = readFileSync(events, "utf8").trim().split("\n");
    assert.equal(commands.filter(line => line.startsWith("start ")).length, 1);
    const stops = commands.filter(line => line.startsWith("stop "));
    assert.equal(stops.length, 1);
    assert.ok(stops[0].includes(`-D ${join(work, "postgres")} -m fast -t 10 -w stop`), "Only the owned cluster receives a bounded stop");
    for (const name of ["pg-password", "initdb.log", "postgres.log", "config", "private-artifacts"])
      assert.equal(existsSync(join(work, name)), false, `${name} must be removed`);
    assert.match(stdout, /only sanitized evidence is publishable/);
    return { code: outcome.code, report, clusterRetained: existsSync(join(work, "postgres/synthetic-cluster")), stderr };
  } finally {
    clearTimeout(timer);
    await stopOwnedGroup(child, { graceMs: 100, forceMs: 1000 });
    // These are inert harness files, including the deliberately retained fake
    // cluster from a failed-stop case. No real PostgreSQL process ever existed.
    rmSync(root, { recursive: true, force: true });
  }
}

test("member shell reports successful tests and confirmed cluster cleanup independently", { timeout: 12000 }, async () => {
  const result = await runCleanupCase({ testExit: 0, stopExit: 0 });
  assert.equal(result.code, 0);
  assert.equal(result.report.status, "passed");
  assert.equal(result.report.cleanup, "passed");
  assert.equal(result.report.clusterCleanup, "passed");
  assert.equal(result.report.shellExitCode, undefined);
  assert.equal(result.clusterRetained, false);
});

test("member shell preserves failed tests while correctly reporting successful cluster cleanup", { timeout: 12000 }, async () => {
  const result = await runCleanupCase({ testExit: 7, stopExit: 0 });
  assert.equal(result.code, 7);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.browser, "failed");
  assert.equal(result.report.error, "Synthetic browser assertion failed");
  assert.equal(result.report.cleanup, "passed");
  assert.equal(result.report.clusterCleanup, "passed");
  assert.equal(result.report.shellExitCode, 7);
  assert.equal(result.clusterRetained, false);
});

test("member shell fails closed and retains its cluster when PostgreSQL stop fails", { timeout: 12000 }, async () => {
  const result = await runCleanupCase({ testExit: 0, stopExit: 1 });
  assert.equal(result.code, 1);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.cleanup, "failed");
  assert.equal(result.report.clusterCleanup, "failed");
  assert.equal(result.report.shellExitCode, 1);
  assert.equal(result.clusterRetained, true);
  assert.match(result.stderr, /raw database was not removed/);
});

test("member shell preserves the original failed-test exit code when cluster cleanup also fails", { timeout: 12000 }, async () => {
  const result = await runCleanupCase({ testExit: 7, stopExit: 1 });
  assert.equal(result.code, 7);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.cleanup, "failed");
  assert.equal(result.report.clusterCleanup, "failed");
  assert.equal(result.report.shellExitCode, 7);
  assert.equal(result.report.error, "Synthetic browser assertion failed");
  assert.equal(result.clusterRetained, true);
});


test("member shell fails closed when a stopped cluster directory cannot be removed", { timeout: 12000 }, async () => {
  const result = await runCleanupCase({ testExit: 0, stopExit: 0, removeExit: 9 });
  assert.equal(result.code, 1);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.cleanup, "failed");
  assert.equal(result.report.clusterCleanup, "failed");
  assert.equal(result.report.shellExitCode, 1);
  assert.equal(result.clusterRetained, true);
});
