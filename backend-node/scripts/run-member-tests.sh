#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
umask 077
MEMBER_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MEMBER_MODE=${1:---browser}
[[ $# -le 1 && ( "$MEMBER_MODE" == --browser || "$MEMBER_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
MEMBER_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$MEMBER_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
MEMBER_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-member-tests.XXXXXX")
chmod 700 "$MEMBER_WORK"
export XDG_CONFIG_HOME="$MEMBER_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME" "$MEMBER_WORK/evidence"
MEMBER_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  cluster_cleanup=passed
  if [[ "$MEMBER_STARTED" == 1 ]]; then
    if "$MEMBER_PG/pg_ctl" -D "$MEMBER_WORK/postgres" -m fast -t 10 -w stop >/dev/null; then
      # Exact mktemp child owned by this invocation, removed after confirmed stop.
      rm -rf -- "$MEMBER_WORK/postgres" || cluster_cleanup=failed
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      cluster_cleanup=failed
    fi
  elif [[ -d "$MEMBER_WORK/postgres" ]]; then
    if "$MEMBER_PG/pg_ctl" -D "$MEMBER_WORK/postgres" status >/dev/null 2>&1; then
      if "$MEMBER_PG/pg_ctl" -D "$MEMBER_WORK/postgres" -m fast -t 10 -w stop >/dev/null; then
        rm -rf -- "$MEMBER_WORK/postgres" || cluster_cleanup=failed
      else cluster_cleanup=failed; fi
    else rm -rf -- "$MEMBER_WORK/postgres" || cluster_cleanup=failed; fi
  fi
  if [[ "$cluster_cleanup" == failed && "$result" == 0 ]]; then result=1; fi
  rm -f -- "$MEMBER_WORK/pg-password" "$MEMBER_WORK/initdb.log" "$MEMBER_WORK/postgres.log"
  rm -rf -- "$MEMBER_WORK/config" "$MEMBER_WORK/private-artifacts"
  node - "$MEMBER_WORK/evidence/results.json" "$result" "$cluster_cleanup" <<'NODE'
const fs = require("node:fs"), path = process.argv[2], exitCode = Number(process.argv[3]);
const clusterCleanup = process.argv[4];
let report;
try { report = JSON.parse(fs.readFileSync(path, "utf8")); }
catch { report = { kind: "isolated-organization-members", status: "failed", checks: [], browser: "not-run", error: "Runner did not produce a complete sanitized report" }; }
if (exitCode !== 0) { report.status = "failed"; if (report.cleanup !== "failed") report.shellExitCode = exitCode; }
report.clusterCleanup = clusterCleanup;
if (clusterCleanup !== "passed") { report.status = "failed"; report.cleanup = "failed"; }
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
NODE
  echo "Member verification evidence: $MEMBER_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
MEMBER_PORT=${MEMBER_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
[[ "$MEMBER_PORT" =~ ^[0-9]+$ && "$MEMBER_PORT" -ge 1024 && "$MEMBER_PORT" -le 65535 ]] || { echo 'Member PostgreSQL port must be 1024..65535.' >&2; exit 2; }
MEMBER_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$MEMBER_PASSWORD" > "$MEMBER_WORK/pg-password"
chmod 600 "$MEMBER_WORK/pg-password"
"$MEMBER_PG/initdb" -D "$MEMBER_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_member_test --pwfile="$MEMBER_WORK/pg-password" > "$MEMBER_WORK/initdb.log"
"$MEMBER_PG/pg_ctl" -D "$MEMBER_WORK/postgres" -l "$MEMBER_WORK/postgres.log" -o "-h 127.0.0.1 -p $MEMBER_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -t 20 -w start
MEMBER_STARTED=1
PGPASSWORD="$MEMBER_PASSWORD" "$MEMBER_PG/createdb" -h 127.0.0.1 -p "$MEMBER_PORT" -U alageum_member_test alageum_strapi_member_test
export DATABASE_URL="postgresql://alageum_member_test:$MEMBER_PASSWORD@127.0.0.1:$MEMBER_PORT/alageum_strapi_member_test"
export APP_ENV=test ALAGEUM_TEST_MEMBER_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_MEMBER_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_MEMBER_EVIDENCE="$MEMBER_WORK/evidence"
cd "$MEMBER_ROOT"
node scripts/run-member-browser.js "$MEMBER_MODE"
