#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
umask 077
ORDERS_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ORDERS_MODE=${1:---browser}
[[ $# -le 1 && ( "$ORDERS_MODE" == --browser || "$ORDERS_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
ORDERS_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$ORDERS_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
ORDERS_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-orders-tests.XXXXXX")
chmod 700 "$ORDERS_WORK"
export XDG_CONFIG_HOME="$ORDERS_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME" "$ORDERS_WORK/evidence"
ORDERS_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$ORDERS_STARTED" == 1 ]]; then
    if "$ORDERS_PG/pg_ctl" -D "$ORDERS_WORK/postgres" -m fast -w stop >/dev/null; then
      # Exact mktemp child owned by this invocation, removed after confirmed stop.
      rm -rf -- "$ORDERS_WORK/postgres"
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      result=1
    fi
  elif [[ -d "$ORDERS_WORK/postgres" ]]; then
    if "$ORDERS_PG/pg_ctl" -D "$ORDERS_WORK/postgres" status >/dev/null 2>&1; then
      if "$ORDERS_PG/pg_ctl" -D "$ORDERS_WORK/postgres" -m fast -w stop >/dev/null; then rm -rf -- "$ORDERS_WORK/postgres"; else result=1; fi
    else rm -rf -- "$ORDERS_WORK/postgres"; fi
  fi
  rm -f -- "$ORDERS_WORK/pg-password" "$ORDERS_WORK/initdb.log" "$ORDERS_WORK/postgres.log"
  rm -rf -- "$ORDERS_WORK/config" "$ORDERS_WORK/private-artifacts"
  echo "Orders verification evidence: $ORDERS_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ORDERS_PORT=${ORDERS_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
ORDERS_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$ORDERS_PASSWORD" > "$ORDERS_WORK/pg-password"
chmod 600 "$ORDERS_WORK/pg-password"
"$ORDERS_PG/initdb" -D "$ORDERS_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_orders_test --pwfile="$ORDERS_WORK/pg-password" > "$ORDERS_WORK/initdb.log"
"$ORDERS_PG/pg_ctl" -D "$ORDERS_WORK/postgres" -l "$ORDERS_WORK/postgres.log" -o "-h 127.0.0.1 -p $ORDERS_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
ORDERS_STARTED=1
PGPASSWORD="$ORDERS_PASSWORD" "$ORDERS_PG/createdb" -h 127.0.0.1 -p "$ORDERS_PORT" -U alageum_orders_test alageum_strapi_orders_test
export DATABASE_URL="postgresql://alageum_orders_test:$ORDERS_PASSWORD@127.0.0.1:$ORDERS_PORT/alageum_strapi_orders_test"
export APP_ENV=test ALAGEUM_TEST_ORDERS_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_ORDERS_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_ORDERS_EVIDENCE="$ORDERS_WORK/evidence"
cd "$ORDERS_ROOT"
node scripts/run-orders-browser.js "$ORDERS_MODE"
