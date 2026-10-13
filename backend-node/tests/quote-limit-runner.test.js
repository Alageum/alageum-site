"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const { validateEnvironment } = require("./quote-limit.integration-support");

test("quote throttle fixture guard requires exact loopback URL, test flags and owned nonsymlink cluster", () => {
  const root = mkdtempSync(join(tmpdir(), "alageum-quote-limit-tests."));
  const token = "a".repeat(64), password = "b".repeat(64);
  mkdirSync(join(root, "postgres")); mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "owner"), token); writeFileSync(join(root, "bin/pg_ctl"), "inert");
  const env = { APP_ENV: "test", ALAGEUM_TEST_QUOTE_LIMIT_FIXTURES: "1", ALAGEUM_SEED_DEMO: "0", ALAGEUM_IMPORT_CATALOG: "1", DATABASE_SSL: "false", E2E_QUOTE_LIMIT_WORK: root, E2E_QUOTE_LIMIT_RUN_TOKEN: token, E2E_QUOTE_LIMIT_PG_BIN: join(root, "bin"), DATABASE_URL: `postgresql://alageum_quote_limit_test:${password}@127.0.0.1:55432/alageum_strapi_quote_limit_test` };
  try {
    assert.equal(validateEnvironment(env).data, join(root, "postgres"));
    for (const change of [
      { APP_ENV: "production" }, { APP_ENV: "development" }, { ALAGEUM_TEST_QUOTE_LIMIT_FIXTURES: "0" }, { ALAGEUM_SEED_DEMO: "1" }, { ALAGEUM_IMPORT_CATALOG: "0" }, { DATABASE_SSL: "true" }, { PGHOSTADDR: "203.0.113.1" }, { PGSERVICE: "unrelated" },
      { E2E_QUOTE_LIMIT_RUN_TOKEN: "c".repeat(64) },
      ...["postgresql://ignored:ignored@customer.invalid/live", env.DATABASE_URL.replace("127.0.0.1", "localhost"), env.DATABASE_URL.replace("quote_limit_test", "member_test"), `${env.DATABASE_URL}?sslmode=disable`, `${env.DATABASE_URL}#other`].map(DATABASE_URL => ({ DATABASE_URL })),
    ]) assert.throws(() => validateEnvironment({ ...env, ...change }));
    rmSync(join(root, "postgres"), { recursive: true }); symlinkSync(join(root, "bin"), join(root, "postgres"));
    assert.throws(() => validateEnvironment(env), /symlinks/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Real shell wrapper, inert fake child commands. These tests never start or
// inspect any PostgreSQL cluster. All files belong to this mkdtemp invocation.
function shellCase({ testExit = 0, stopExit = 0, statusExit = 0, confirmExit = 3, removeExit = 0, loseOwnership = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "alageum-quote-limit-wrapper-unit."));
  const bin = join(root, "bin"), scratch = join(root, "scratch"), events = join(root, "events.log");
  mkdirSync(bin); mkdirSync(scratch);
  const realRm = ["/bin/rm", "/usr/bin/rm"].find(existsSync);
  const executable = (name, body) => writeFileSync(join(bin, name), `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`, { mode: 0o700 });
  executable("initdb", 'while [[ $# -gt 0 ]]; do if [[ "$1" == -D ]]; then mkdir -p -- "$2"; printf "inert fixture\\n" > "$2/PG_VERSION"; exit 0; fi; shift; done; exit 2');
  executable("createdb", 'exit 0');
  executable("pg_ctl", `printf '%s\\n' "\${@: -1}" >> "$QUOTE_LIMIT_WRAPPER_EVENTS"
case "\${@: -1}" in
start) exit 0 ;;
status) if [[ -e "$QUOTE_LIMIT_WRAPPER_EVENTS.stopped" ]]; then exit "$QUOTE_LIMIT_WRAPPER_CONFIRM_EXIT"; fi; exit "$QUOTE_LIMIT_WRAPPER_STATUS_EXIT" ;;
stop) if [[ "$QUOTE_LIMIT_WRAPPER_STOP_EXIT" == 0 ]]; then touch "$QUOTE_LIMIT_WRAPPER_EVENTS.stopped"; fi; exit "$QUOTE_LIMIT_WRAPPER_STOP_EXIT" ;;
*) exit 2 ;;
esac`);
  executable("rm", `if [[ "\${@: -1}" == */postgres && "$QUOTE_LIMIT_WRAPPER_REMOVE_EXIT" != 0 ]]; then exit "$QUOTE_LIMIT_WRAPPER_REMOVE_EXIT"; fi
exec "$QUOTE_LIMIT_WRAPPER_RM" "$@"`);
  executable("node", `if [[ "\${1:-}" == scripts/run-quote-limit-checks.js ]]; then
exec "$QUOTE_LIMIT_WRAPPER_NODE" - <<'NODE'
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
assert.equal(new URL(process.env.DATABASE_URL).pathname, "/alageum_strapi_quote_limit_test");
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
assert.notEqual(process.env.DATABASE_URL, "postgresql://customer:secret@customer.invalid/production");
assert.equal(process.env.APP_ENV, "test");
for (const key of ["PGHOSTADDR", "PGSERVICE", "PGOPTIONS", "PGPASSFILE", "PGSYSCONFDIR"]) assert.equal(process.env[key], undefined);
const code = Number(process.env.QUOTE_LIMIT_WRAPPER_TEST_EXIT);
fs.writeFileSync(path.join(process.env.E2E_QUOTE_LIMIT_WORK, "evidence/results.json"), JSON.stringify({ kind: "isolated-catalog-quote-throttle", status: code ? "failed" : "passed", cleanup: "passed", checks: [], ...(code ? { error: "Synthetic assertion failed" } : {}) }));
if (process.env.QUOTE_LIMIT_WRAPPER_LOSE_OWNERSHIP === "1") fs.writeFileSync(path.join(process.env.E2E_QUOTE_LIMIT_WORK, "owner"), "unowned");
process.exit(code);
NODE
fi
exec "$QUOTE_LIMIT_WRAPPER_NODE" "$@"`);
  try {
    const result = spawnSync("bash", [resolve(__dirname, "../scripts/run-quote-limit-tests.sh")], { cwd: resolve(__dirname, ".."), encoding: "utf8", timeout: 10000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PG_BIN: bin, TMPDIR: scratch, DATABASE_URL: "postgresql://customer:secret@customer.invalid/production", PGHOSTADDR: "203.0.113.1", PGSERVICE: "unrelated-service", PGOPTIONS: "unrelated-options", PGPASSFILE: "/unowned/pass", PGSYSCONFDIR: "/unowned/config", QUOTE_LIMIT_WRAPPER_NODE: process.execPath, QUOTE_LIMIT_WRAPPER_EVENTS: events, QUOTE_LIMIT_WRAPPER_TEST_EXIT: String(testExit), QUOTE_LIMIT_WRAPPER_STOP_EXIT: String(stopExit), QUOTE_LIMIT_WRAPPER_STATUS_EXIT: String(statusExit), QUOTE_LIMIT_WRAPPER_CONFIRM_EXIT: String(confirmExit), QUOTE_LIMIT_WRAPPER_REMOVE_EXIT: String(removeExit), QUOTE_LIMIT_WRAPPER_LOSE_OWNERSHIP: loseOwnership ? "1" : "0", QUOTE_LIMIT_WRAPPER_RM: realRm } });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    const owned = readdirSync(scratch); assert.equal(owned.length, 1);
    const work = join(scratch, owned[0]), report = JSON.parse(readFileSync(join(work, "evidence/results.json"), "utf8"));
    const commands = readFileSync(events, "utf8").trim().split("\n");
    assert.equal(commands.filter(value => value === "start").length, 1);
    if (!loseOwnership) for (const name of ["pg-password", "initdb.log", "postgres.log", "owner", "config", "private-artifacts"]) assert.equal(existsSync(join(work, name)), false);
    assert.match(result.stdout, /only sanitized evidence is publishable/);
    return { code: result.status, report, commands, clusterRetained: existsSync(join(work, "postgres/PG_VERSION")), stderr: result.stderr };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("quote throttle wrapper independently reports passed checks and confirmed owned cluster cleanup", () => {
  const result = shellCase(); assert.equal(result.code, 0); assert.equal(result.report.status, "passed");
  assert.equal(result.report.cleanup, "passed"); assert.equal(result.report.clusterCleanup, "passed"); assert.equal(result.report.privateFixtureCleanup, "passed"); assert.equal(result.clusterRetained, false);
  assert.equal(result.commands.filter(value => value === "stop").length, 1);
});
test("quote throttle wrapper preserves the test failure while completing cluster cleanup", () => {
  const result = shellCase({ testExit: 7 }); assert.equal(result.code, 7); assert.equal(result.report.status, "failed");
  assert.equal(result.report.error, "Synthetic assertion failed"); assert.equal(result.report.clusterCleanup, "passed"); assert.equal(result.report.shellExitCode, 7);
});
test("quote throttle wrapper fails closed on stop failure and preserves the original test exit", () => {
  for (const testExit of [0, 7]) {
    const result = shellCase({ testExit, stopExit: 1 }); assert.equal(result.code, testExit || 1);
    assert.equal(result.report.clusterCleanup, "failed"); assert.equal(result.report.privateFixtureCleanup, "passed"); assert.equal(result.clusterRetained, true);
    assert.match(result.stderr, /raw database was not removed/);
  }
});
test("quote throttle wrapper removes a confirmed stopped cluster without starting or stopping it again", () => {
  const result = shellCase({ statusExit: 3 }); assert.equal(result.code, 0); assert.equal(result.clusterRetained, false);
  assert.equal(result.commands.includes("stop"), false); assert.equal(result.report.clusterCleanup, "passed");
});
test("quote throttle wrapper refuses deletion when cluster state is uncertain or removal fails", () => {
  for (const options of [{ statusExit: 1 }, { confirmExit: 0 }, { confirmExit: 1 }, { removeExit: 9 }]) {
    const result = shellCase(options); assert.equal(result.code, 1); assert.equal(result.report.clusterCleanup, "failed"); assert.equal(result.clusterRetained, true);
  }
});
test("quote throttle wrapper never inspects or stops a cluster after losing ownership proof", () => {
  const result = shellCase({ loseOwnership: true }); assert.equal(result.code, 1); assert.deepEqual(result.commands, ["start"]);
  assert.equal(result.report.clusterCleanup, "failed"); assert.equal(result.report.privateFixtureCleanup, "failed"); assert.equal(result.clusterRetained, true);
});
