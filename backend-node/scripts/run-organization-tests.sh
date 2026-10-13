#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
ORGANIZATION_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ORGANIZATION_MODE=${1:---browser}
[[ $# -le 1 && ( "$ORGANIZATION_MODE" == --browser || "$ORGANIZATION_MODE" == --backend-only ) ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
ORGANIZATION_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$ORGANIZATION_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
ORGANIZATION_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-organization-tests.XXXXXX")
chmod 700 "$ORGANIZATION_WORK"
export XDG_CONFIG_HOME="$ORGANIZATION_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME"
ORGANIZATION_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$ORGANIZATION_STARTED" == 1 ]]; then
    if "$ORGANIZATION_PG/pg_ctl" -D "$ORGANIZATION_WORK/postgres" -m fast -w stop >/dev/null; then
      # This exact mktemp child was created only by this invocation. Dispose its
      # password hashes and token rows only after PostgreSQL confirms shutdown.
      rm -rf -- "$ORGANIZATION_WORK/postgres"
    else
      echo 'Disposable PostgreSQL shutdown failed; raw database was not removed.' >&2
      result=1
    fi
  fi
  rm -f "$ORGANIZATION_WORK/pg-password"
  echo "Organization verification evidence: $ORGANIZATION_WORK/evidence (only sanitized evidence is publishable)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ORGANIZATION_PORT=${ORGANIZATION_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
ORGANIZATION_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$ORGANIZATION_PASSWORD" > "$ORGANIZATION_WORK/pg-password"
chmod 600 "$ORGANIZATION_WORK/pg-password"
"$ORGANIZATION_PG/initdb" -D "$ORGANIZATION_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_organization_test --pwfile="$ORGANIZATION_WORK/pg-password" > "$ORGANIZATION_WORK/initdb.log"
"$ORGANIZATION_PG/pg_ctl" -D "$ORGANIZATION_WORK/postgres" -l "$ORGANIZATION_WORK/postgres.log" -o "-h 127.0.0.1 -p $ORGANIZATION_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
ORGANIZATION_STARTED=1
PGPASSWORD="$ORGANIZATION_PASSWORD" "$ORGANIZATION_PG/createdb" -h 127.0.0.1 -p "$ORGANIZATION_PORT" -U alageum_organization_test alageum_strapi_organization_test
export DATABASE_URL="postgresql://alageum_organization_test:$ORGANIZATION_PASSWORD@127.0.0.1:$ORGANIZATION_PORT/alageum_strapi_organization_test"
export APP_ENV=test ALAGEUM_TEST_ORGANIZATION_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_ORGANIZATION_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_ORGANIZATION_EVIDENCE="$ORGANIZATION_WORK/evidence"
cd "$ORGANIZATION_ROOT"
node scripts/run-organization-browser.js "$ORGANIZATION_MODE"
