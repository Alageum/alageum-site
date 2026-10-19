#!/usr/bin/env bash
# Own disposable cluster only; never consumes a caller's DATABASE_URL.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node.js 24 is required.' >&2; exit 2; }
PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for executable in initdb pg_ctl postgres; do [[ -x "$PG/$executable" ]] || { echo 'Set PG_BIN to PostgreSQL 16/17 binaries.' >&2; exit 2; }; done
"$PG/postgres" --version | grep -Eq 'PostgreSQL\) (16|17)\.' || { echo 'PostgreSQL 16/17 is required by the reviewed schema contract.' >&2; exit 2; }
WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-news-tests.XXXXXX")
STARTED=0
cleanup() { result=$?; trap - EXIT; if [[ "$STARTED" == 1 ]]; then "$PG/pg_ctl" -D "$WORK/postgres" -m fast -w stop > /dev/null; fi; echo "News verification logs and stopped disposable database: $WORK"; exit "$result"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
PORT=$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PASSWORD" > "$WORK/password"; chmod 600 "$WORK/password"
"$PG/initdb" -D "$WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_news_test --pwfile="$WORK/password" > "$WORK/initdb.log"
"$PG/pg_ctl" -D "$WORK/postgres" -l "$WORK/postgres.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -w start
STARTED=1
export DATABASE_URL="postgresql://alageum_news_test:$PASSWORD@127.0.0.1:$PORT/alageum_strapi_news_test"
export XDG_CONFIG_HOME="$WORK/config" STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
cd "$ROOT"
node -e 'const { Client }=require("pg"); const u=new URL(process.env.DATABASE_URL);u.pathname="/postgres";const c=new Client({connectionString:u.toString()});(async()=>{await c.connect();await c.query("CREATE DATABASE alageum_strapi_news_test");await c.end()})().catch(()=>{console.error("Disposable news database creation failed");process.exit(1)})'
node --test --test-concurrency=1 tests/news.integration.cjs 2>&1 | tee "$WORK/integration.log"
