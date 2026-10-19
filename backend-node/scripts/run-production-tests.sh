#!/usr/bin/env bash
# Creates only a disposable, invocation-owned loopback PostgreSQL/TLS fixture.
set -euo pipefail
umask 077
[[ $# == 0 ]] || { echo 'This proof accepts no external database or selection arguments.' >&2; exit 2; }
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PG=${PG_BIN:-$(pg_config --bindir 2>/dev/null || true)}
for name in initdb pg_ctl postgres; do [[ -x "$PG/$name" ]] || { echo 'Set PG_BIN to PostgreSQL16+ binaries.' >&2; exit 2; }; done
PG=$(cd "$PG" && pwd -P)
command -v openssl >/dev/null
WORK=$(mktemp -d "${TMPDIR:-/tmp}/alageum-production-test.XXXXXX")
WORK=$(cd "$WORK" && pwd -P)
OWNER=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$OWNER" > "$WORK/owner"
owned() { [[ "$WORK" == */alageum-production-test.* && ! -L "$WORK" && ! -L "$WORK/postgres" && ! -L "$WORK/owner" && $(cat "$WORK/owner") == "$OWNER" ]]; }
cleanup() {
  status=$?; trap - EXIT
  if owned; then
    if [[ -d "$WORK/postgres" ]]; then
      state=0; "$PG/pg_ctl" -D "$WORK/postgres" status >/dev/null 2>&1 || state=$?
      if [[ "$state" == 0 ]]; then "$PG/pg_ctl" -D "$WORK/postgres" -m fast -t 15 -w stop >/dev/null || { echo 'Owned database cleanup failed.' >&2; exit 1; }
      elif [[ "$state" != 3 ]]; then echo 'Owned database state unknown; preserving it.' >&2; exit 1; fi
    fi
    rm -rf -- "$WORK"
  else echo 'Fixture ownership changed; cleanup refused.' >&2; exit 1; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS NODE_TLS_REJECT_UNAUTHORIZED
PORT=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
PASSWORD=$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')
printf '%s\n' "$PASSWORD" > "$WORK/password"
"$PG/initdb" -D "$WORK/postgres" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=scram-sha-256 -U alageum_production_test --pwfile="$WORK/password" > "$WORK/init.log" 2>&1
"$PG/pg_ctl" -D "$WORK/postgres" -l "$WORK/postgres.log" -o "-h127.0.0.1 -p$PORT -c unix_socket_directories='' -c log_statement=none -c log_min_error_statement=panic" -t 20 -w start >/dev/null
export ALAGEUM_PRODUCTION_TEST_DATABASE_URL="postgresql://alageum_production_test:$PASSWORD@127.0.0.1:$PORT/alageum_strapi_production_test"
cd "$ROOT"
node <<'NODE'
const {Client}=require('pg');
(async()=>{ const url=new URL(process.env.ALAGEUM_PRODUCTION_TEST_DATABASE_URL);url.pathname='/postgres';
const db=new Client({connectionString:url.href});await db.connect();
try {await db.query('CREATE DATABASE alageum_strapi_production_test');}finally{await db.end();}})().catch(()=>{console.error('Fresh local database creation failed');process.exitCode=1;});
NODE
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$WORK/key.pem" -out "$WORK/cert.pem" -subj '/CN=site.example.test' -addext 'subjectAltName=DNS:site.example.test,IP:127.0.0.1' >/dev/null 2>&1
export NODE_EXTRA_CA_CERTS="$WORK/cert.pem" ALAGEUM_PRODUCTION_TEST_WORK="$WORK" ALAGEUM_PRODUCTION_TEST_OWNER="$OWNER"
export XDG_CONFIG_HOME="$WORK/config"
node --test tests/production-runtime.production-integration.js
