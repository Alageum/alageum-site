#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
umask 077
QUOTE_PRINT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
QUOTE_PRINT_MODE=${1:---browser}
[[ $# -le 1 && ( "$QUOTE_PRINT_MODE" == --browser || "$QUOTE_PRINT_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
QUOTE_PRINT_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$QUOTE_PRINT_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
QUOTE_PRINT_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-quote-print-tests.XXXXXX")
export XDG_CONFIG_HOME="$QUOTE_PRINT_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME" "$QUOTE_PRINT_WORK/evidence"
QUOTE_PRINT_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$QUOTE_PRINT_STARTED" == 1 ]]; then
    if "$QUOTE_PRINT_PG/pg_ctl" -D "$QUOTE_PRINT_WORK/postgres" -m fast -w stop >/dev/null; then
      # Exact mktemp child owned by this invocation, removed after confirmed stop.
      rm -rf -- "$QUOTE_PRINT_WORK/postgres"
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      result=1
    fi
  elif [[ -d "$QUOTE_PRINT_WORK/postgres" ]]; then
    if "$QUOTE_PRINT_PG/pg_ctl" -D "$QUOTE_PRINT_WORK/postgres" status >/dev/null 2>&1; then
      if "$QUOTE_PRINT_PG/pg_ctl" -D "$QUOTE_PRINT_WORK/postgres" -m fast -w stop >/dev/null; then rm -rf -- "$QUOTE_PRINT_WORK/postgres"; else result=1; fi
    else rm -rf -- "$QUOTE_PRINT_WORK/postgres"; fi
  fi
  rm -f -- "$QUOTE_PRINT_WORK/pg-password" "$QUOTE_PRINT_WORK/initdb.log" "$QUOTE_PRINT_WORK/postgres.log"
  rm -rf -- "$QUOTE_PRINT_WORK/config" "$QUOTE_PRINT_WORK/private-artifacts"
  echo "Quote print verification evidence: $QUOTE_PRINT_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
QUOTE_PRINT_PORT=${QUOTE_PRINT_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
QUOTE_PRINT_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$QUOTE_PRINT_PASSWORD" > "$QUOTE_PRINT_WORK/pg-password"
"$QUOTE_PRINT_PG/initdb" -D "$QUOTE_PRINT_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_quote_print_test --pwfile="$QUOTE_PRINT_WORK/pg-password" > "$QUOTE_PRINT_WORK/initdb.log"
"$QUOTE_PRINT_PG/pg_ctl" -D "$QUOTE_PRINT_WORK/postgres" -l "$QUOTE_PRINT_WORK/postgres.log" -o "-h 127.0.0.1 -p $QUOTE_PRINT_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
QUOTE_PRINT_STARTED=1
PGPASSWORD="$QUOTE_PRINT_PASSWORD" "$QUOTE_PRINT_PG/createdb" -h 127.0.0.1 -p "$QUOTE_PRINT_PORT" -U alageum_quote_print_test alageum_strapi_quote_print_test
export DATABASE_URL="postgresql://alageum_quote_print_test:$QUOTE_PRINT_PASSWORD@127.0.0.1:$QUOTE_PRINT_PORT/alageum_strapi_quote_print_test"
export ALAGEUM_QUOTE_PRINT_DATABASE_URL="$DATABASE_URL"
export APP_ENV=test ALAGEUM_TEST_QUOTE_PRINT_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_QUOTE_PRINT_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_QUOTE_PRINT_EVIDENCE="$QUOTE_PRINT_WORK/evidence"
cd "$QUOTE_PRINT_ROOT"
node scripts/run-quote-print-browser.js "$QUOTE_PRINT_MODE"
