#!/usr/bin/env bash
set -euo pipefail
WEBPACK_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WEBPACK_MODE=${1:---watch}
[[ "$WEBPACK_MODE" == --watch || "$WEBPACK_MODE" == --browser ]] || { echo 'Use --watch or --browser' >&2; exit 2; }
mkdir -p "${WEBPACK_COMPAT_WORK_ROOT:-$WEBPACK_ROOT/.tmp/webpack-compat}"
WEBPACK_WORK=$(mktemp -d "${WEBPACK_COMPAT_WORK_ROOT:-$WEBPACK_ROOT/.tmp/webpack-compat}/run.XXXXXX")
export TMPDIR="$WEBPACK_WORK/tmp" XDG_CONFIG_HOME="$WEBPACK_WORK/config" SWC_NATIVE_BINDING_CACHE="$WEBPACK_WORK/swc"
mkdir -p "$TMPDIR" "$XDG_CONFIG_HOME" "$SWC_NATIVE_BINDING_CACHE"
export APP_ENV=test HOST=127.0.0.1 STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true BROWSER=none
export NODE_OPTIONS="--max-old-space-size=${WEBPACK_COMPAT_HEAP_MB:-2048}"
export ALAGEUM_SEED_DEMO=1 ALAGEUM_IMPORT_CATALOG=1 ALAGEUM_TEST_ADMIN_FIXTURES=1
for key in APP_KEYS ADMIN_JWT_SECRET API_TOKEN_SALT TRANSFER_TOKEN_SALT ENCRYPTION_KEY ALAGEUM_JWT_SECRET; do
  export "$key=$(node -p 'require("node:crypto").randomBytes(48).toString("hex")')"
done
for key in E2E_CMS_EDITOR_PASSWORD E2E_CMS_DENIED_PASSWORD; do export "$key=Aa1!$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"; done
free_port() { node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
export PORT=$(free_port)
WEBPACK_PG_PORT=$(free_port)
export WEBPACK_COMPAT_URL="http://127.0.0.1:$PORT" VITE_COMPAT_URL="http://127.0.0.1:$PORT"
export E2E_CMS_BASE_URL="$WEBPACK_COMPAT_URL/cms" E2E_API_URL="$WEBPACK_COMPAT_URL/api/v1"
export E2E_BASE_URL=http://127.0.0.1:3141
WEBPACK_PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl createdb; do [[ -x "$WEBPACK_PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL tools' >&2; exit 2; }; done
WEBPACK_PID= WEBPACK_PG_STARTED=0 WEBPACK_TYPES_EXISTED=0
[[ ! -d "$WEBPACK_ROOT/types" ]] || WEBPACK_TYPES_EXISTED=1
stop_api() {
  [[ -n "$WEBPACK_PID" ]] || return 0
  local forced=0
  kill -TERM -- -"$WEBPACK_PID" 2>/dev/null || true
  for unused in {1..40}; do kill -0 "$WEBPACK_PID" 2>/dev/null || break; sleep 0.25; done
  if kill -0 "$WEBPACK_PID" 2>/dev/null; then
    forced=1
    kill -KILL -- -"$WEBPACK_PID" 2>/dev/null || true
    for unused in {1..20}; do kill -0 "$WEBPACK_PID" 2>/dev/null || break; sleep 0.1; done
  fi
  if kill -0 "$WEBPACK_PID" 2>/dev/null; then echo 'Webpack process did not exit after KILL' >&2; return 1; fi
  wait "$WEBPACK_PID" 2>/dev/null || true
  WEBPACK_PID=
  node "$WEBPACK_ROOT/scripts/probe-vite-compat.js" stopped
  if [[ "$forced" == 1 ]]; then echo 'Webpack shutdown required KILL after 10s' >&2; return 1; fi
}
cleanup() {
  result=$?; trap - EXIT
  stop_api || result=1
  if [[ "$WEBPACK_PG_STARTED" == 1 ]]; then
    if ! timeout --signal=TERM --kill-after=3s 12s "$WEBPACK_PG/pg_ctl" -D "$WEBPACK_WORK/postgres" -m fast -t 10 -w stop > "$WEBPACK_WORK/postgres-stop.log" 2>&1; then
      result=1
      timeout --signal=TERM --kill-after=2s 8s "$WEBPACK_PG/pg_ctl" -D "$WEBPACK_WORK/postgres" -m immediate -t 5 -w stop >> "$WEBPACK_WORK/postgres-stop.log" 2>&1 || true
    fi
    [[ ! -f "$WEBPACK_WORK/postgres/postmaster.pid" ]] || result=1
  fi
  if [[ "$WEBPACK_TYPES_EXISTED" == 0 && -d "$WEBPACK_ROOT/types" ]]; then mv "$WEBPACK_ROOT/types" "$WEBPACK_WORK/generated-types"; fi
  if [[ -d "$WEBPACK_WORK/prior-build" && ! -d "$WEBPACK_ROOT/build" ]]; then cp -a "$WEBPACK_WORK/prior-build" "$WEBPACK_ROOT/build"; fi
  WEBPACK_SANITIZE_PG_PASSWORD="${WEBPACK_PASSWORD:-}" timeout --signal=TERM --kill-after=2s 5s node "$WEBPACK_ROOT/scripts/sanitize-webpack-evidence.js" "$WEBPACK_WORK" || result=1
  echo "Webpack evidence and stopped disposable database: $WEBPACK_WORK"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$WEBPACK_ROOT"
node scripts/strapi-webpack-patch.js --check
[[ ! -d build ]] || cp -a build "$WEBPACK_WORK/prior-build"
WEBPACK_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$WEBPACK_PASSWORD" > "$WEBPACK_WORK/pg-password"; chmod 600 "$WEBPACK_WORK/pg-password"
"$WEBPACK_PG/initdb" -D "$WEBPACK_WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U webpack_compat --pwfile="$WEBPACK_WORK/pg-password" > "$WEBPACK_WORK/initdb.log"
"$WEBPACK_PG/pg_ctl" -D "$WEBPACK_WORK/postgres" -l "$WEBPACK_WORK/postgres.log" -o "-h 127.0.0.1 -p $WEBPACK_PG_PORT -c unix_socket_directories=''" -w start
WEBPACK_PG_STARTED=1
PGPASSWORD="$WEBPACK_PASSWORD" "$WEBPACK_PG/createdb" -h 127.0.0.1 -p "$WEBPACK_PG_PORT" -U webpack_compat alageum_strapi_browser_test
export DATABASE_URL="postgresql://webpack_compat:$WEBPACK_PASSWORD@127.0.0.1:$WEBPACK_PG_PORT/alageum_strapi_browser_test"
if [[ ${GITHUB_ACTIONS:-false} == true ]]; then
  printf '::add-mask::%s\n' "$WEBPACK_PASSWORD"
  for key in APP_KEYS ADMIN_JWT_SECRET API_TOKEN_SALT TRANSFER_TOKEN_SALT ENCRYPTION_KEY ALAGEUM_JWT_SECRET E2E_CMS_EDITOR_PASSWORD E2E_CMS_DENIED_PASSWORD DATABASE_URL; do
    printf '::add-mask::%s\n' "${!key}"
  done
fi
node scripts/seed-test-cms-admins.js > "$WEBPACK_WORK/fixtures.log" 2>&1
for phase in cold warm; do
  if [[ "$phase" == cold && -d node_modules/.cache/webpack ]]; then mv node_modules/.cache/webpack "$WEBPACK_WORK/prior-webpack-cache"; fi
  NODE_ENV=development setsid node node_modules/@strapi/strapi/bin/strapi.js develop --bundler webpack --no-install-deps > "$WEBPACK_WORK/$phase-server.log" 2>&1 &
  WEBPACK_PID=$!
  node scripts/probe-webpack-strapi.js 2>&1 | tee "$WEBPACK_WORK/$phase-probes.log"
  if [[ "$WEBPACK_MODE" == --browser && "$phase" == cold ]]; then
    (cd ../frontend && PLAYWRIGHT_JSON_OUTPUT_FILE="$WEBPACK_WORK/browser-cms.json" ./node_modules/.bin/playwright test --config=playwright.cms.config.js --grep-invert 'native CMS login and guarded edits publish' --retries=0 --reporter=line,json) 2>&1 | tee "$WEBPACK_WORK/browser-cms.log"
    node - "$WEBPACK_WORK/browser-cms.json" <<'NODE'
const assert = require("node:assert/strict");
const report = require(process.argv[2]);
assert.equal(report.stats.expected, 4, "all four scoped native CMS cases must pass");
for (const key of ["unexpected", "flaky", "skipped"]) assert.equal(report.stats[key], 0, key);
assert.deepEqual(report.errors, []);
NODE
  fi
  stop_api
done
printf '{"mode":"%s","cold":true,"warm":true,"browserCases":%s}\n' "$WEBPACK_MODE" "$([[ "$WEBPACK_MODE" == --browser ]] && echo 4 || echo 0)" > "$WEBPACK_WORK/acceptance.json"
