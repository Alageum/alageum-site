#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${project_dir}/.env"
if [[ ! -f "${env_file}" ]]; then
  printf '.env is required; copy .env.example first\n' >&2
  exit 2
fi
app_env="$(sed -n 's/^APP_ENV=//p' "${env_file}" | tail -1 | tr -d '[:space:]')"
if [[ "${app_env}" == "production" || "${app_env}" == "staging" ]]; then
  printf 'Refusing destructive reset for APP_ENV=%s\n' "${app_env}" >&2
  exit 3
fi
docker compose -f "${project_dir}/docker-compose.yml" down -v
docker compose -f "${project_dir}/docker-compose.yml" up -d --build
docker compose -f "${project_dir}/docker-compose.yml" exec -T backend python -m scripts.seed

