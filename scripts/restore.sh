#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s BACKUP.dump\n' "$0" >&2
  exit 2
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact="$1"
if [[ ! -f "${artifact}" || ! -s "${artifact}" ]]; then
  printf 'Backup does not exist or is empty: %s\n' "${artifact}" >&2
  exit 2
fi

docker compose -f "${project_dir}/docker-compose.yml" exec -T postgres \
  sh -eu -c 'pg_restore --list' < "${artifact}" > /dev/null
docker compose -f "${project_dir}/docker-compose.yml" stop backend >/dev/null 2>&1 || true
docker compose -f "${project_dir}/docker-compose.yml" exec -T postgres sh -eu -c '
  dropdb --if-exists --force --username "$POSTGRES_USER" "$POSTGRES_DB"
  createdb --username "$POSTGRES_USER" "$POSTGRES_DB"
'
docker compose -f "${project_dir}/docker-compose.yml" exec -T postgres \
  sh -eu -c 'pg_restore --exit-on-error --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' \
  < "${artifact}"
docker compose -f "${project_dir}/docker-compose.yml" start backend >/dev/null
"${project_dir}/scripts/wait-for-backend.sh"
printf 'Restore completed: %s\n' "${artifact}"

