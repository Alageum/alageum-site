#!/usr/bin/env bash
# Reimplemented isolated Page runner; never consumes caller DATABASE_URL.
set -euo pipefail
PAGE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PAGE_MODE=${1:---contracts}
[[ "$PAGE_MODE" == --contracts || "$PAGE_MODE" == --delivery-http ]] || { echo 'Use --contracts or --delivery-http.' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
PAGE_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$PAGE_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
PAGE_WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-pages-tests.XXXXXX")
export XDG_CONFIG_HOME="$PAGE_WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
mkdir -p "$XDG_CONFIG_HOME"
PAGE_STARTED=0
cleanup() {
  result=$?; trap - EXIT
  if [[ "$PAGE_STARTED" == 1 ]]; then "$PAGE_PG/pg_ctl" -D "$PAGE_WORK/postgres" -m fast -w stop >/dev/null; fi
  echo "Page verification logs and stopped disposable database: $PAGE_WORK"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
PAGE_PORT=${PAGE_TEST_PG_PORT:-$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}
PAGE_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PAGE_PASSWORD" > "$PAGE_WORK/pg-password"
chmod 600 "$PAGE_WORK/pg-password"
"$PAGE_PG/initdb" -D "$PAGE_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_pages_test --pwfile="$PAGE_WORK/pg-password" > "$PAGE_WORK/initdb.log"
"$PAGE_PG/pg_ctl" -D "$PAGE_WORK/postgres" -l "$PAGE_WORK/postgres.log" -o "-h 127.0.0.1 -p $PAGE_PORT -c unix_socket_directories=''" -w start
PAGE_STARTED=1
PGPASSWORD="$PAGE_PASSWORD" "$PAGE_PG/createdb" -h 127.0.0.1 -p "$PAGE_PORT" -U alageum_pages_test alageum_strapi_pages_test
export DATABASE_URL="postgresql://alageum_pages_test:$PAGE_PASSWORD@127.0.0.1:$PAGE_PORT/alageum_strapi_pages_test"
cd "$PAGE_ROOT"
if [[ "$PAGE_MODE" == --contracts ]]; then
  node --test --test-concurrency=1 tests/pages.integration.cjs 2>&1 | tee "$PAGE_WORK/integration.log"
else
  APP_ENV=test ALAGEUM_TEST_PAGE_FIXTURES=1 node scripts/run-page-delivery.js --http-only 2>&1 | tee "$PAGE_WORK/delivery.log"
fi
