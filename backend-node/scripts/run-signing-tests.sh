#!/usr/bin/env bash
# Entire process tree belongs to this invocation; no shared/customer database.
set -euo pipefail
umask 077
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for binary in postgres initdb pg_ctl; do [[ -x "$PG/$binary" ]] || { echo 'Set PG_BIN to PostgreSQL 16+ binaries.' >&2; exit 2; }; done
WORK=$(mktemp -d /tmp/alageum-eds-check.XXXXXX)
STARTED=0
cleanup() { result=$?; trap - EXIT; if [[ "$STARTED" == 1 ]]; then "$PG/pg_ctl" -D "$WORK/database" -m fast -w stop >/dev/null || result=1; fi; echo "Signing test evidence: $WORK/tests.log (synthetic data only)"; exit "$result"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
PORT=$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PASSWORD" > "$WORK/password"
"$PG/initdb" -D "$WORK/database" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U eds_test --pwfile="$WORK/password" > "$WORK/init.log"
"$PG/pg_ctl" -D "$WORK/database" -l "$WORK/postgres.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -w start >/dev/null
STARTED=1
cd "$ROOT"
export APP_ENV=test ALAGEUM_EDS_TEST_DATABASE_URL="postgresql://eds_test:$PASSWORD@127.0.0.1:$PORT/alageum_strapi_eds_test"
node - <<'JS'
const { Client } = require('pg');
(async () => { const url = new URL(process.env.ALAGEUM_EDS_TEST_DATABASE_URL); url.pathname = '/postgres'; const c = new Client({ connectionString: url.href }); await c.connect(); await c.query('CREATE DATABASE alageum_strapi_eds_test'); await c.query('CREATE DATABASE alageum_strapi_eds_http_test'); await c.end(); })().catch(() => { console.error('Disposable database creation failed'); process.exitCode = 1; });
JS
node --test tests/document-signing.integration-signing.js 2>&1 | tee "$WORK/tests.log"
export XDG_CONFIG_HOME="$WORK/config" SWC_NATIVE_BINDING_CACHE="$WORK/swc"
export ALAGEUM_EDS_HTTP_TEST_DATABASE_URL="${ALAGEUM_EDS_TEST_DATABASE_URL%alageum_strapi_eds_test}alageum_strapi_eds_http_test"
node tests/document-signing.http-signing.js 2>&1 | tee "$WORK/http.log"
