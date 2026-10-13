#!/usr/bin/env bash
# Linux local verification with a NEW PostgreSQL cluster, never DATABASE_URL from
# the caller. Install npm dependencies and Playwright Chromium before running.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
MODE=${1:---all}
case "$MODE" in
  --all|--backend-only|--integration-only|--fixtures-only) ;;
  *) echo "Usage: $0 [--all|--backend-only|--integration-only|--fixtures-only]" >&2; exit 2 ;;
esac
if [[ $(node -p 'process.versions.node.split(".")[0]') != 24 ]]; then
  echo 'Node.js 24 is required.' >&2; exit 2
fi
if [[ -z ${PG_BIN:-} ]]; then
  PG_BIN=$(pg_config --bindir 2>/dev/null || true)
fi
for executable in initdb pg_ctl createdb; do
  [[ -x "$PG_BIN/$executable" ]] || { echo "Set PG_BIN to a PostgreSQL 16+ bin directory containing $executable." >&2; exit 2; }
done
command -v setsid >/dev/null || { echo 'This script requires Linux setsid.' >&2; exit 2; }
command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 2; }
WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-node-tests.XXXXXX")
export SWC_NATIVE_BINDING_CACHE=${SWC_NATIVE_BINDING_CACHE:-$WORK/swc-native}
export XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$WORK/config}
mkdir -p "$SWC_NATIVE_BINDING_CACHE" "$XDG_CONFIG_HOME" "$WORK/home/.config"
PG_DATA="$WORK/postgres"
api_pid= web_pid= pg_started=0
cleanup() {
  local result=$?
  trap - EXIT
  [[ -z "$api_pid" ]] || kill -- -"$api_pid" 2>/dev/null || true
  [[ -z "$web_pid" ]] || kill -- -"$web_pid" 2>/dev/null || true
  [[ -z "$api_pid" ]] || wait "$api_pid" 2>/dev/null || true
  [[ -z "$web_pid" ]] || wait "$web_pid" 2>/dev/null || true
  if [[ "$pg_started" == 1 ]]; then "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast -w stop >/dev/null; fi
  echo "Verification logs and disposable database retained at $WORK"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
free_port() {
  node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}
PG_PORT=$(free_port)
export PORT=${NODE_TEST_API_PORT:-$(free_port)}
WEB_PORT=${NODE_TEST_FRONTEND_PORT:-$(free_port)}
PG_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PG_PASSWORD" > "$WORK/pg-password"
chmod 600 "$WORK/pg-password"
"$PG_BIN/initdb" -D "$PG_DATA" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 \
  -U alageum_node_test --pwfile="$WORK/pg-password" > "$WORK/initdb.log"
"$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$WORK/postgres.log" \
  -o "-h 127.0.0.1 -p $PG_PORT -c unix_socket_directories=''" -w start
pg_started=1
PGPASSWORD="$PG_PASSWORD" "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U alageum_node_test alageum_strapi_test
PGPASSWORD="$PG_PASSWORD" "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U alageum_node_test alageum_strapi_domain_test
PGPASSWORD="$PG_PASSWORD" "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U alageum_node_test alageum_strapi_browser_test
export DATABASE_URL="postgresql://alageum_node_test:$PG_PASSWORD@127.0.0.1:$PG_PORT/alageum_strapi_test"
export ALAGEUM_DOMAIN_TEST_DATABASE_URL="postgresql://alageum_node_test:$PG_PASSWORD@127.0.0.1:$PG_PORT/alageum_strapi_domain_test"
export ALAGEUM_CMS_BROWSER_DATABASE_URL="postgresql://alageum_node_test:$PG_PASSWORD@127.0.0.1:$PG_PORT/alageum_strapi_browser_test"
export APP_ENV=test HOST=127.0.0.1 ALAGEUM_SEED_DEMO=1 ALAGEUM_IMPORT_CATALOG=1
export ALAGEUM_TEST_ADMIN_FIXTURES=1
export STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true NEXT_TELEMETRY_DISABLED=1
export CORS_ORIGINS="http://127.0.0.1:$WEB_PORT"
export E2E_API_URL="http://127.0.0.1:$PORT/api/v1" E2E_BASE_URL="http://127.0.0.1:$WEB_PORT"
export E2E_CMS_BASE_URL="http://127.0.0.1:$PORT/cms"
export E2E_QUOTES_BASE_URL="$E2E_BASE_URL" NEXT_PUBLIC_API_URL="$E2E_API_URL" NEXT_PUBLIC_CATALOG_SOURCE=api
for key in APP_KEYS ADMIN_JWT_SECRET API_TOKEN_SALT TRANSFER_TOKEN_SALT ENCRYPTION_KEY ALAGEUM_JWT_SECRET; do
  value=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
  if [[ "$key" == APP_KEYS ]]; then value="$value,$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"; fi
  export "$key=$value"
done
for key in E2E_CMS_EDITOR_PASSWORD E2E_CMS_DENIED_PASSWORD; do
  export "$key=Aa1!$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"
done
cd "$ROOT/backend-node"
if [[ "$MODE" == --fixtures-only ]]; then
  DATABASE_URL="$ALAGEUM_CMS_BROWSER_DATABASE_URL" node scripts/seed-test-cms-admins.js 2>&1 | tee "$WORK/cms-fixtures.log"
  exit 0
fi
if [[ "$MODE" != --integration-only ]]; then
  npm run check 2>&1 | tee "$WORK/backend-check.log"
fi
npm run test:integration 2>&1 | tee "$WORK/backend-integration.log"
[[ "$MODE" != --integration-only ]] || exit 0
HOME="$WORK/home" NODE_ENV=production npm run build 2>&1 | tee "$WORK/backend-build.log"
[[ "$MODE" != --backend-only ]] || exit 0
cd "$ROOT/frontend"
npm run lint 2>&1 | tee "$WORK/frontend-lint.log"
NEXT_PUBLIC_CATALOG_SOURCE=static npm run test:unit 2>&1 | tee "$WORK/frontend-unit.log"
npm run build 2>&1 | tee "$WORK/frontend-build.log"
cd "$ROOT/backend-node"
DATABASE_URL="$ALAGEUM_CMS_BROWSER_DATABASE_URL" node scripts/seed-test-cms-admins.js > "$WORK/cms-fixtures.log" 2>&1
DATABASE_URL="$ALAGEUM_CMS_BROWSER_DATABASE_URL" HOME="$WORK/home" NODE_ENV=production setsid npm run start > "$WORK/api.log" 2>&1 &
api_pid=$!
cd "$ROOT/frontend"
NODE_ENV=production setsid npm run start -- --hostname 127.0.0.1 --port "$WEB_PORT" > "$WORK/frontend.log" 2>&1 &
web_pid=$!
deadline=$((SECONDS + 150))
until curl --fail --silent --connect-timeout 2 --max-time 5 "$E2E_API_URL/readiness" >/dev/null \
  && curl --fail --silent --connect-timeout 2 --max-time 5 "$E2E_BASE_URL/inquiry?source=api" >/dev/null; do
  if ! kill -0 "$api_pid" || ! kill -0 "$web_pid" || (( SECONDS >= deadline )); then
    tail -100 "$WORK/api.log" "$WORK/frontend.log"; exit 1
  fi
  sleep 2
done
curl --fail --silent --max-time 10 "http://127.0.0.1:$PORT/_health" >/dev/null
curl --location --fail --silent --max-time 10 "http://127.0.0.1:$PORT/cms" >/dev/null
npx playwright test --config=playwright.cms.config.js 2>&1 | tee "$WORK/browser-cms.log"
npm run test:e2e:admin -- --max-failures=1 2>&1 | tee "$WORK/browser-admin.log"
npx playwright test --config=playwright.node.config.js --max-failures=1 2>&1 | tee "$WORK/browser-node-rfq.log"
env -u E2E_QUOTES_BASE_URL NEXT_PUBLIC_CATALOG_SOURCE=static NODE_ENV=development E2E_QUOTES_PORT="$(free_port)" \
  npm run test:e2e:quotes -- --max-failures=3 2>&1 | tee "$WORK/browser-quotes.log"
