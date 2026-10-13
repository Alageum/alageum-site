#!/usr/bin/env bash
# Only a new, invocation-owned loopback cluster may be stopped by this runner.
set -euo pipefail
umask 077
# libpq environment (especially PGHOSTADDR/PGSERVICE) must not redirect the
# createdb command away from the explicitly owned loopback cluster.
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS PGSSLMODE PGREQUIRESSL PGSSLROOTCERT PGSSLCERT PGSSLKEY PGSSLCRL PGSSLCRLDIR PGGSSENCMODE PGCONNECT_TIMEOUT PGTARGETSESSIONATTRS
SYSTEM_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ $# == 0 ]] || { echo 'The system suite has no selection or external-database options.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
SYSTEM_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$SYSTEM_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
SYSTEM_PG=$(cd "$SYSTEM_PG" && pwd -P)
SYSTEM_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-system-tests.XXXXXX")
SYSTEM_WORK=$(cd "$SYSTEM_WORK" && pwd -P)
SYSTEM_TOKEN=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$SYSTEM_TOKEN" > "$SYSTEM_WORK/owner"
mkdir -p "$SYSTEM_WORK/config" "$SYSTEM_WORK/evidence"
chmod 700 "$SYSTEM_WORK"
owned() {
  [[ "$SYSTEM_WORK" == */alageum-system-tests.* && -d "$SYSTEM_WORK" && ! -L "$SYSTEM_WORK" && ! -L "$SYSTEM_WORK/postgres" && -f "$SYSTEM_WORK/owner" && ! -L "$SYSTEM_WORK/owner" && $(cat "$SYSTEM_WORK/owner") == "$SYSTEM_TOKEN" ]]
}
cleanup() {
  result=$?; trap - EXIT
  cluster_cleanup=passed
  private_cleanup=passed
  if ! owned; then
    echo 'Disposable PostgreSQL ownership check failed; no cluster was touched.' >&2
    cluster_cleanup=failed
    private_cleanup=failed
  else
    if [[ -d "$SYSTEM_WORK/postgres" ]]; then
      cluster_status=0
      "$SYSTEM_PG/pg_ctl" -D "$SYSTEM_WORK/postgres" status >/dev/null 2>&1 || cluster_status=$?
      if [[ "$cluster_status" == 0 ]]; then
        if ! "$SYSTEM_PG/pg_ctl" -D "$SYSTEM_WORK/postgres" -m fast -t 10 -w stop >/dev/null 2>&1; then
          echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
          cluster_cleanup=failed
        fi
      elif [[ "$cluster_status" != 3 ]]; then
        echo 'Disposable PostgreSQL state could not be confirmed; raw database was not removed.' >&2
        cluster_cleanup=failed
      fi
      if [[ "$cluster_cleanup" == passed ]]; then rm -rf -- "$SYSTEM_WORK/postgres" || cluster_cleanup=failed; fi
    fi
    rm -f -- "$SYSTEM_WORK/pg-password" "$SYSTEM_WORK/initdb.log" "$SYSTEM_WORK/postgres.log" "$SYSTEM_WORK/owner" || private_cleanup=failed
    rm -rf -- "$SYSTEM_WORK/config" "$SYSTEM_WORK/private-artifacts" || private_cleanup=failed
  fi
  if [[ "$cluster_cleanup" == failed || "$private_cleanup" == failed ]]; then [[ "$result" != 0 ]] || result=1; fi
  node - "$SYSTEM_WORK/evidence/results.json" "$result" "$cluster_cleanup" "$private_cleanup" <<'NODE'
const fs = require("node:fs"), path = process.argv[2], exitCode = Number(process.argv[3]);
let report;
try { report = JSON.parse(fs.readFileSync(path, "utf8")); }
catch { report = { kind: "isolated-system-reads", status: "failed", checks: [], error: "Runner did not produce a complete sanitized report" }; }
if (exitCode !== 0) { report.status = "failed"; report.shellExitCode = exitCode; }
report.clusterCleanup = process.argv[4];
report.privateFixtureCleanup = process.argv[5];
if (report.clusterCleanup !== "passed" || report.privateFixtureCleanup !== "passed") report.status = "failed";
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
NODE
  echo "System verification evidence: $SYSTEM_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
SYSTEM_PORT=$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
[[ "$SYSTEM_PORT" =~ ^[0-9]+$ && "$SYSTEM_PORT" -ge 1024 && "$SYSTEM_PORT" -le 65535 ]] || exit 2
SYSTEM_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$SYSTEM_PASSWORD" > "$SYSTEM_WORK/pg-password"
"$SYSTEM_PG/initdb" -D "$SYSTEM_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_system_test --pwfile="$SYSTEM_WORK/pg-password" > "$SYSTEM_WORK/initdb.log" 2>&1
"$SYSTEM_PG/pg_ctl" -D "$SYSTEM_WORK/postgres" -l "$SYSTEM_WORK/postgres.log" -o "-h 127.0.0.1 -p $SYSTEM_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -t 20 -w start >/dev/null
PGPASSWORD="$SYSTEM_PASSWORD" "$SYSTEM_PG/createdb" -h 127.0.0.1 -p "$SYSTEM_PORT" -U alageum_system_test alageum_strapi_system_test
# Never use an inherited connection, SSL setting, seed flag, or application secret.
export DATABASE_URL="postgresql://alageum_system_test:$SYSTEM_PASSWORD@127.0.0.1:$SYSTEM_PORT/alageum_strapi_system_test"
export DATABASE_SSL=false APP_ENV=test ALAGEUM_TEST_SYSTEM_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
export XDG_CONFIG_HOME="$SYSTEM_WORK/config" E2E_SYSTEM_WORK="$SYSTEM_WORK" E2E_SYSTEM_RUN_TOKEN="$SYSTEM_TOKEN" E2E_SYSTEM_PG_BIN="$SYSTEM_PG"
cd "$SYSTEM_ROOT"
node scripts/run-system-checks.js
