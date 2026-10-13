#!/usr/bin/env bash
# Explicit, isolated Linux compatibility experiment. No browser acceptance claim.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
MODE=${1:---builds}
[[ "$MODE" == --builds || "$MODE" == --servers || "$MODE" == --watch ]] || { echo 'Use --builds, --servers, or --watch' >&2; exit 2; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || exit 2
mkdir -p "${VITE_COMPAT_WORK_ROOT:-$ROOT/.tmp/vite-compat}"
WORK=$(mktemp -d "${VITE_COMPAT_WORK_ROOT:-$ROOT/.tmp/vite-compat}/run.XXXXXX")
export TMPDIR="$WORK/tmp" XDG_CONFIG_HOME="$WORK/config"
export SWC_NATIVE_BINDING_CACHE="$WORK/swc-native"
mkdir -p "$TMPDIR" "$XDG_CONFIG_HOME" "$SWC_NATIVE_BINDING_CACHE"
export APP_ENV=test HOST=127.0.0.1 STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true BROWSER=none
export ALAGEUM_SEED_DEMO=0 ALAGEUM_IMPORT_CATALOG=0
export NODE_OPTIONS="--max-old-space-size=${VITE_COMPAT_HEAP_MB:-1280}"
for key in APP_KEYS ADMIN_JWT_SECRET API_TOKEN_SALT TRANSFER_TOKEN_SALT ENCRYPTION_KEY ALAGEUM_JWT_SECRET; do
  export "$key=$(node -p 'require("node:crypto").randomBytes(48).toString("hex")')"
done
free_port() { node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
api_pid= pg_started=0 types_existed=0
[[ ! -d "$ROOT/types" ]] || types_existed=1
stop_api() {
  [[ -n "$api_pid" ]] || return 0
  kill -TERM -- -"$api_pid" 2>/dev/null || true
  for unused in {1..60}; do kill -0 "$api_pid" 2>/dev/null || break; sleep 0.25; done
  if kill -0 "$api_pid" 2>/dev/null; then
    kill -KILL -- -"$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
    api_pid=
    echo 'Server did not shut down within 15 seconds' >&2
    return 1
  fi
  wait "$api_pid" 2>/dev/null || true
  api_pid=
  node "$ROOT/scripts/probe-vite-compat.js" stopped
}
cleanup() {
  local result=$?
  trap - EXIT
  stop_api || result=1
  if [[ "$pg_started" == 1 ]]; then "$PG_BIN/pg_ctl" -D "$WORK/postgres" -m fast -w stop > "$WORK/postgres-stop.log" 2>&1 || result=1; fi
  if [[ "$types_existed" == 0 && -d "$ROOT/types" ]]; then mv "$ROOT/types" "$WORK/generated-types"; fi
  # Strapi createBuildContext intentionally removes build/ when develop starts.
  # Preserve the exact previously verified output for repeatable server probes.
  if [[ -d "$WORK/built-assets" && ! -d "$ROOT/build" ]]; then cp -a "$WORK/built-assets" "$ROOT/build"; fi
  echo "Compatibility evidence: $WORK"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$ROOT"
node scripts/strapi-webpack-patch.js --check
export PORT=$(free_port)
export VITE_COMPAT_URL="http://127.0.0.1:$PORT"
if [[ "$MODE" == --builds ]]; then
  # The build reads configuration but must not connect to this unused endpoint.
  export DATABASE_URL=postgresql://unused@127.0.0.1:9/alageum_strapi_build_only
  [[ ! -d build ]] || mv build "$WORK/prior-build"
  [[ ! -d node_modules/.strapi/vite ]] || mv node_modules/.strapi/vite "$WORK/prior-vite-cache"
  for phase in cold warm; do
    NODE_ENV=production npm run build 2>&1 | tee "$WORK/$phase-build.log"
    node scripts/probe-vite-compat.js build | tee "$WORK/$phase-build-assets.log"
  done
  cp -a build "$WORK/built-assets"
  exit 0
fi
phases='cold warm'
if [[ "$MODE" == --servers ]]; then
  [[ -f build/index.html ]] || { echo 'Run --builds first; --servers requires its verified build/' >&2; exit 2; }
  cp -a build "$WORK/built-assets"
  phases='built cold warm'
fi
PG_BIN=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
[[ -x "$PG_BIN/initdb" && -x "$PG_BIN/pg_ctl" && -x "$PG_BIN/createdb" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ tools' >&2; exit 2; }
PG_PORT=$(free_port)
PG_PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PG_PASSWORD" > "$WORK/pg-password"
chmod 600 "$WORK/pg-password"
"$PG_BIN/initdb" -D "$WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U vite_compat --pwfile="$WORK/pg-password" > "$WORK/initdb.log"
"$PG_BIN/pg_ctl" -D "$WORK/postgres" -l "$WORK/postgres.log" -o "-h 127.0.0.1 -p $PG_PORT -c unix_socket_directories=''" -w start
pg_started=1
PGPASSWORD="$PG_PASSWORD" "$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U vite_compat alageum_strapi_vite_compat
export DATABASE_URL="postgresql://vite_compat:$PG_PASSWORD@127.0.0.1:$PG_PORT/alageum_strapi_vite_compat"
for phase in $phases; do
  if [[ "$phase" == built ]]; then
    NODE_ENV=production setsid node node_modules/@strapi/strapi/bin/strapi.js start > "$WORK/$phase-server.log" 2>&1 &
  else
    if [[ "$phase" == cold && -d node_modules/.strapi/vite ]]; then mv node_modules/.strapi/vite "$WORK/prior-vite-cache"; fi
    NODE_ENV=development setsid node node_modules/@strapi/strapi/bin/strapi.js develop --no-install-deps > "$WORK/$phase-server.log" 2>&1 &
  fi
  api_pid=$!
  export VITE_COMPAT_OUTSIDE_FILE="$WORK/outside-sentinel.txt"
  node scripts/probe-vite-compat.js "$phase" 2>&1 | tee "$WORK/$phase-probes.log"
  stop_api
done
