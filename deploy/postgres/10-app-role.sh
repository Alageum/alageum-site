#!/usr/bin/env bash
set -euo pipefail
# Runs ONLY on first initialization of an empty PGDATA, as the official image does.
# Keep credentials out of arguments, logs and SQL string interpolation.
export ALAGEUM_DB_APP_PASSWORD
ALAGEUM_DB_APP_PASSWORD="$(cat "${ALAGEUM_DB_APP_PASSWORD_FILE:?}")"
test -n "$ALAGEUM_DB_APP_PASSWORD"
psql --no-psqlrc --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password ALAGEUM_DB_APP_PASSWORD
SELECT format('CREATE ROLE alageum_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_password') \gexec
ALTER DATABASE alageum_strapi OWNER TO alageum_app;
REVOKE ALL ON DATABASE alageum_strapi FROM PUBLIC;
ALTER SCHEMA public OWNER TO alageum_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
unset ALAGEUM_DB_APP_PASSWORD
