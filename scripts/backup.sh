#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backup_dir="${BACKUP_DIR:-${project_dir}/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
artifact="${backup_dir}/alageum-${timestamp}.dump"
temporary="${artifact}.partial"

mkdir -p "${backup_dir}"
trap 'rm -f "${temporary}"' EXIT

docker compose -f "${project_dir}/docker-compose.yml" exec -T postgres \
  sh -eu -c 'pg_dump --format=custom --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
  > "${temporary}"
test -s "${temporary}"
docker compose -f "${project_dir}/docker-compose.yml" exec -T postgres \
  sh -eu -c 'pg_restore --list' < "${temporary}" > /dev/null
mv "${temporary}" "${artifact}"
trap - EXIT

server_version="$(docker compose -f "${project_dir}/docker-compose.yml" exec -T postgres \
  sh -eu -c 'psql --tuples-only --no-align --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SHOW server_version"')"
cat > "${artifact}.metadata" <<EOF
created_utc=${timestamp}
postgres_server_version=${server_version}
format=pg_dump-custom
scope=postgresql-database-only
EOF
printf '%s\n' "${artifact}"

