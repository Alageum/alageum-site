#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
umask 077
SUPPORT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SUPPORT_MODE=${1:---browser}
[[ $# -le 1 && ( "$SUPPORT_MODE" == --browser || "$SUPPORT_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
SUPPORT_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$SUPPORT_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
SUPPORT_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-support-tests.XXXXXX")
chmod 700 "$SUPPORT_WORK"
export XDG_CONFIG_HOME="$SUPPORT_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME" "$SUPPORT_WORK/evidence"
SUPPORT_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$SUPPORT_STARTED" == 1 ]]; then
    if "$SUPPORT_PG/pg_ctl" -D "$SUPPORT_WORK/postgres" -m fast -w stop >/dev/null; then
      # Exact mktemp child owned by this invocation, removed after confirmed stop.
      rm -rf -- "$SUPPORT_WORK/postgres"
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      result=1
    fi
  elif [[ -d "$SUPPORT_WORK/postgres" ]]; then
    if "$SUPPORT_PG/pg_ctl" -D "$SUPPORT_WORK/postgres" status >/dev/null 2>&1; then
      if "$SUPPORT_PG/pg_ctl" -D "$SUPPORT_WORK/postgres" -m fast -w stop >/dev/null; then rm -rf -- "$SUPPORT_WORK/postgres"; else result=1; fi
    else rm -rf -- "$SUPPORT_WORK/postgres"; fi
  fi
  rm -f -- "$SUPPORT_WORK/pg-password" "$SUPPORT_WORK/initdb.log" "$SUPPORT_WORK/postgres.log"
  rm -rf -- "$SUPPORT_WORK/config" "$SUPPORT_WORK/private-artifacts"
  echo "Support verification evidence: $SUPPORT_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
SUPPORT_PORT=${SUPPORT_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
SUPPORT_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$SUPPORT_PASSWORD" > "$SUPPORT_WORK/pg-password"
chmod 600 "$SUPPORT_WORK/pg-password"
"$SUPPORT_PG/initdb" -D "$SUPPORT_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_support_test --pwfile="$SUPPORT_WORK/pg-password" > "$SUPPORT_WORK/initdb.log"
"$SUPPORT_PG/pg_ctl" -D "$SUPPORT_WORK/postgres" -l "$SUPPORT_WORK/postgres.log" -o "-h 127.0.0.1 -p $SUPPORT_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
SUPPORT_STARTED=1
PGPASSWORD="$SUPPORT_PASSWORD" "$SUPPORT_PG/createdb" -h 127.0.0.1 -p "$SUPPORT_PORT" -U alageum_support_test alageum_strapi_support_test
export DATABASE_URL="postgresql://alageum_support_test:$SUPPORT_PASSWORD@127.0.0.1:$SUPPORT_PORT/alageum_strapi_support_test"
export APP_ENV=test ALAGEUM_TEST_SUPPORT_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_SUPPORT_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_SUPPORT_EVIDENCE="$SUPPORT_WORK/evidence"
cd "$SUPPORT_ROOT"
node scripts/run-support-browser.js "$SUPPORT_MODE"
