#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
umask 077
INVOICE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
INVOICE_MODE=${1:---browser}
[[ $# -le 1 && ( "$INVOICE_MODE" == --browser || "$INVOICE_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
INVOICE_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$INVOICE_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
INVOICE_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-invoice-tests.XXXXXX")
chmod 700 "$INVOICE_WORK"
export XDG_CONFIG_HOME="$INVOICE_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME" "$INVOICE_WORK/evidence"
INVOICE_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$INVOICE_STARTED" == 1 ]]; then
    if "$INVOICE_PG/pg_ctl" -D "$INVOICE_WORK/postgres" -m fast -w stop >/dev/null; then
      # Exact mktemp child owned by this invocation, removed after confirmed stop.
      rm -rf -- "$INVOICE_WORK/postgres"
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      result=1
    fi
  elif [[ -d "$INVOICE_WORK/postgres" ]]; then
    if "$INVOICE_PG/pg_ctl" -D "$INVOICE_WORK/postgres" status >/dev/null 2>&1; then
      if "$INVOICE_PG/pg_ctl" -D "$INVOICE_WORK/postgres" -m fast -w stop >/dev/null; then rm -rf -- "$INVOICE_WORK/postgres"; else result=1; fi
    else rm -rf -- "$INVOICE_WORK/postgres"; fi
  fi
  rm -f -- "$INVOICE_WORK/pg-password" "$INVOICE_WORK/initdb.log" "$INVOICE_WORK/postgres.log"
  rm -rf -- "$INVOICE_WORK/config" "$INVOICE_WORK/private-artifacts"
  echo "Invoice verification evidence: $INVOICE_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
INVOICE_PORT=${INVOICE_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
INVOICE_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$INVOICE_PASSWORD" > "$INVOICE_WORK/pg-password"
chmod 600 "$INVOICE_WORK/pg-password"
"$INVOICE_PG/initdb" -D "$INVOICE_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_invoice_test --pwfile="$INVOICE_WORK/pg-password" > "$INVOICE_WORK/initdb.log"
"$INVOICE_PG/pg_ctl" -D "$INVOICE_WORK/postgres" -l "$INVOICE_WORK/postgres.log" -o "-h 127.0.0.1 -p $INVOICE_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
INVOICE_STARTED=1
PGPASSWORD="$INVOICE_PASSWORD" "$INVOICE_PG/createdb" -h 127.0.0.1 -p "$INVOICE_PORT" -U alageum_invoice_test alageum_strapi_invoice_test
export DATABASE_URL="postgresql://alageum_invoice_test:$INVOICE_PASSWORD@127.0.0.1:$INVOICE_PORT/alageum_strapi_invoice_test"
export APP_ENV=test ALAGEUM_TEST_INVOICE_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_INVOICE_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_INVOICE_EVIDENCE="$INVOICE_WORK/evidence"
cd "$INVOICE_ROOT"
node scripts/run-invoice-browser.js "$INVOICE_MODE"
