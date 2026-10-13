#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
umask 077
DOCUMENT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DOCUMENT_MODE=${1:---browser}
[[ $# -le 1 && ( "$DOCUMENT_MODE" == --browser || "$DOCUMENT_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
DOCUMENT_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$DOCUMENT_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
DOCUMENT_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-document-tests.XXXXXX")
chmod 700 "$DOCUMENT_WORK"
export XDG_CONFIG_HOME="$DOCUMENT_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME" "$DOCUMENT_WORK/evidence"
DOCUMENT_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$DOCUMENT_STARTED" == 1 ]]; then
    if "$DOCUMENT_PG/pg_ctl" -D "$DOCUMENT_WORK/postgres" -m fast -w stop >/dev/null; then
      # Exact mktemp child owned by this invocation, removed after confirmed stop.
      rm -rf -- "$DOCUMENT_WORK/postgres"
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      result=1
    fi
  elif [[ -d "$DOCUMENT_WORK/postgres" ]]; then
    if "$DOCUMENT_PG/pg_ctl" -D "$DOCUMENT_WORK/postgres" status >/dev/null 2>&1; then
      if "$DOCUMENT_PG/pg_ctl" -D "$DOCUMENT_WORK/postgres" -m fast -w stop >/dev/null; then rm -rf -- "$DOCUMENT_WORK/postgres"; else result=1; fi
    else rm -rf -- "$DOCUMENT_WORK/postgres"; fi
  fi
  rm -f -- "$DOCUMENT_WORK/pg-password" "$DOCUMENT_WORK/initdb.log" "$DOCUMENT_WORK/postgres.log"
  rm -rf -- "$DOCUMENT_WORK/config" "$DOCUMENT_WORK/private-artifacts"
  echo "Document verification evidence: $DOCUMENT_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
DOCUMENT_PORT=${DOCUMENT_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
DOCUMENT_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$DOCUMENT_PASSWORD" > "$DOCUMENT_WORK/pg-password"
chmod 600 "$DOCUMENT_WORK/pg-password"
"$DOCUMENT_PG/initdb" -D "$DOCUMENT_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_document_test --pwfile="$DOCUMENT_WORK/pg-password" > "$DOCUMENT_WORK/initdb.log"
"$DOCUMENT_PG/pg_ctl" -D "$DOCUMENT_WORK/postgres" -l "$DOCUMENT_WORK/postgres.log" -o "-h 127.0.0.1 -p $DOCUMENT_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
DOCUMENT_STARTED=1
PGPASSWORD="$DOCUMENT_PASSWORD" "$DOCUMENT_PG/createdb" -h 127.0.0.1 -p "$DOCUMENT_PORT" -U alageum_document_test alageum_strapi_document_test
export DATABASE_URL="postgresql://alageum_document_test:$DOCUMENT_PASSWORD@127.0.0.1:$DOCUMENT_PORT/alageum_strapi_document_test"
export APP_ENV=test ALAGEUM_TEST_DOCUMENT_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_DOCUMENT_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_DOCUMENT_EVIDENCE="$DOCUMENT_WORK/evidence"
cd "$DOCUMENT_ROOT"
node scripts/run-document-browser.js "$DOCUMENT_MODE"
