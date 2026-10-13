#!/usr/bin/env bash
# Only a new, invocation-owned loopback cluster may be stopped by this runner.
set -euo pipefail
umask 077
# libpq environment (especially PGHOSTADDR/PGSERVICE) must not redirect the
# createdb command away from the explicitly owned loopback cluster.
for inherited in ${!PG@}; do [[ "$inherited" == PG_BIN ]] || unset "$inherited"; done
unset DATABASE_URL DATABASE_SSL
QUOTE_LIMIT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ $# == 0 ]] || { echo 'The quote-limit suite has no selection or external-database options.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
QUOTE_LIMIT_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$QUOTE_LIMIT_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
QUOTE_LIMIT_PG=$(cd "$QUOTE_LIMIT_PG" && pwd -P)
QUOTE_LIMIT_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-quote-limit-tests.XXXXXX")
QUOTE_LIMIT_WORK=$(cd "$QUOTE_LIMIT_WORK" && pwd -P)
QUOTE_LIMIT_TOKEN=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$QUOTE_LIMIT_TOKEN" > "$QUOTE_LIMIT_WORK/owner"
mkdir -p "$QUOTE_LIMIT_WORK/config" "$QUOTE_LIMIT_WORK/evidence"
chmod 700 "$QUOTE_LIMIT_WORK"
owned() {
  [[ "$QUOTE_LIMIT_WORK" == */alageum-quote-limit-tests.* && -d "$QUOTE_LIMIT_WORK" && ! -L "$QUOTE_LIMIT_WORK" && ! -L "$QUOTE_LIMIT_WORK/postgres" && -f "$QUOTE_LIMIT_WORK/owner" && ! -L "$QUOTE_LIMIT_WORK/owner" && $(cat "$QUOTE_LIMIT_WORK/owner") == "$QUOTE_LIMIT_TOKEN" ]]
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
    if [[ -d "$QUOTE_LIMIT_WORK/postgres" ]]; then
      cluster_status=0
      "$QUOTE_LIMIT_PG/pg_ctl" -D "$QUOTE_LIMIT_WORK/postgres" status >/dev/null 2>&1 || cluster_status=$?
      if [[ "$cluster_status" == 0 ]]; then
        if ! "$QUOTE_LIMIT_PG/pg_ctl" -D "$QUOTE_LIMIT_WORK/postgres" -m fast -t 10 -w stop >/dev/null 2>&1; then
          echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
          cluster_cleanup=failed
        fi
      elif [[ "$cluster_status" != 3 ]]; then
        echo 'Disposable PostgreSQL state could not be confirmed; raw database was not removed.' >&2
        cluster_cleanup=failed
      fi
      if [[ "$cluster_cleanup" == passed ]]; then
        confirmed=0
        "$QUOTE_LIMIT_PG/pg_ctl" -D "$QUOTE_LIMIT_WORK/postgres" status >/dev/null 2>&1 || confirmed=$?
        if [[ "$confirmed" != 3 ]]; then
          echo 'Disposable PostgreSQL stopped state was not confirmed; raw database was not removed.' >&2
          cluster_cleanup=failed
        fi
      fi
      if [[ "$cluster_cleanup" == passed ]]; then rm -rf -- "$QUOTE_LIMIT_WORK/postgres" || cluster_cleanup=failed; fi
    fi
    rm -f -- "$QUOTE_LIMIT_WORK/pg-password" "$QUOTE_LIMIT_WORK/initdb.log" "$QUOTE_LIMIT_WORK/postgres.log" "$QUOTE_LIMIT_WORK/owner" || private_cleanup=failed
    rm -rf -- "$QUOTE_LIMIT_WORK/config" "$QUOTE_LIMIT_WORK/private-artifacts" || private_cleanup=failed
  fi
  if [[ "$cluster_cleanup" == failed || "$private_cleanup" == failed ]]; then [[ "$result" != 0 ]] || result=1; fi
  node - "$QUOTE_LIMIT_WORK/evidence/results.json" "$result" "$cluster_cleanup" "$private_cleanup" <<'NODE'
const fs = require("node:fs"), path = process.argv[2], exitCode = Number(process.argv[3]);
let report;
try { report = JSON.parse(fs.readFileSync(path, "utf8")); }
catch { report = { kind: "isolated-catalog-quote-throttle", status: "failed", checks: [], error: "Runner did not produce a complete sanitized report" }; }
if (exitCode !== 0) { report.status = "failed"; report.shellExitCode = exitCode; }
report.clusterCleanup = process.argv[4];
report.privateFixtureCleanup = process.argv[5];
if (report.clusterCleanup !== "passed" || report.privateFixtureCleanup !== "passed") report.status = "failed";
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
NODE
  echo "Quote throttle verification evidence: $QUOTE_LIMIT_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
QUOTE_LIMIT_PORT=$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
[[ "$QUOTE_LIMIT_PORT" =~ ^[0-9]+$ && "$QUOTE_LIMIT_PORT" -ge 1024 && "$QUOTE_LIMIT_PORT" -le 65535 ]] || exit 2
QUOTE_LIMIT_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$QUOTE_LIMIT_PASSWORD" > "$QUOTE_LIMIT_WORK/pg-password"
"$QUOTE_LIMIT_PG/initdb" -D "$QUOTE_LIMIT_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_quote_limit_test --pwfile="$QUOTE_LIMIT_WORK/pg-password" > "$QUOTE_LIMIT_WORK/initdb.log" 2>&1
"$QUOTE_LIMIT_PG/pg_ctl" -D "$QUOTE_LIMIT_WORK/postgres" -l "$QUOTE_LIMIT_WORK/postgres.log" -o "-h 127.0.0.1 -p $QUOTE_LIMIT_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -t 20 -w start >/dev/null
PGPASSWORD="$QUOTE_LIMIT_PASSWORD" "$QUOTE_LIMIT_PG/createdb" -h 127.0.0.1 -p "$QUOTE_LIMIT_PORT" -U alageum_quote_limit_test alageum_strapi_quote_limit_test
# Never use an inherited connection, SSL setting, seed flag, or application secret.
export DATABASE_URL="postgresql://alageum_quote_limit_test:$QUOTE_LIMIT_PASSWORD@127.0.0.1:$QUOTE_LIMIT_PORT/alageum_strapi_quote_limit_test"
export DATABASE_SSL=false APP_ENV=test ALAGEUM_TEST_QUOTE_LIMIT_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=1
export STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
export XDG_CONFIG_HOME="$QUOTE_LIMIT_WORK/config" E2E_QUOTE_LIMIT_WORK="$QUOTE_LIMIT_WORK" E2E_QUOTE_LIMIT_RUN_TOKEN="$QUOTE_LIMIT_TOKEN" E2E_QUOTE_LIMIT_PG_BIN="$QUOTE_LIMIT_PG"
cd "$QUOTE_LIMIT_ROOT"
node scripts/run-quote-limit-checks.js
