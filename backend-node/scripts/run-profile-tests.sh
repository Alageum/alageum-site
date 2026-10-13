#!/usr/bin/env bash
# New cluster and exact database per invocation. Caller DATABASE_URL is ignored.
set -euo pipefail
PROFILE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROFILE_MODE=${1:---browser}
[[ "$PROFILE_MODE" == --browser || "$PROFILE_MODE" == --backend-only ]] || { echo 'Use --browser or --backend-only.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
PROFILE_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$PROFILE_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
PROFILE_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-profile-tests.XXXXXX")
chmod 700 "$PROFILE_WORK"
export XDG_CONFIG_HOME="$PROFILE_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME"
PROFILE_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$PROFILE_STARTED" == 1 ]]; then "$PROFILE_PG/pg_ctl" -D "$PROFILE_WORK/postgres" -m fast -w stop >/dev/null; fi
  rm -f "$PROFILE_WORK/pg-password"
  echo "Profile verification evidence: $PROFILE_WORK/evidence (disposable cluster stopped)"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
PROFILE_PORT=${PROFILE_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
PROFILE_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PROFILE_PASSWORD" > "$PROFILE_WORK/pg-password"
chmod 600 "$PROFILE_WORK/pg-password"
"$PROFILE_PG/initdb" -D "$PROFILE_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_profile_test --pwfile="$PROFILE_WORK/pg-password" > "$PROFILE_WORK/initdb.log"
"$PROFILE_PG/pg_ctl" -D "$PROFILE_WORK/postgres" -l "$PROFILE_WORK/postgres.log" -o "-h 127.0.0.1 -p $PROFILE_PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start
PROFILE_STARTED=1
PGPASSWORD="$PROFILE_PASSWORD" "$PROFILE_PG/createdb" -h 127.0.0.1 -p "$PROFILE_PORT" -U alageum_profile_test alageum_strapi_profile_test
export DATABASE_URL="postgresql://alageum_profile_test:$PROFILE_PASSWORD@127.0.0.1:$PROFILE_PORT/alageum_strapi_profile_test"
export APP_ENV=test ALAGEUM_TEST_PROFILE_FIXTURES=1 ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export E2E_PROFILE_PASSWORD="Aa1!$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
export E2E_PROFILE_EVIDENCE="$PROFILE_WORK/evidence"
cd "$PROFILE_ROOT"
node scripts/run-profile-browser.js "$PROFILE_MODE"
