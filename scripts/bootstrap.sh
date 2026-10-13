#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v docker >/dev/null || { printf 'Docker is required\n' >&2; exit 2; }
docker compose version >/dev/null
if [[ ! -f "${project_dir}/.env" ]]; then
  cp "${project_dir}/.env.example" "${project_dir}/.env"
  printf 'Created .env from DEV-only example\n'
fi
docker compose -f "${project_dir}/docker-compose.yml" up -d --build
"${project_dir}/scripts/wait-for-backend.sh"
docker compose -f "${project_dir}/docker-compose.yml" exec -T backend python -m scripts.seed
printf 'Frontend: http://localhost:3000\nAPI: http://localhost:8000/docs\n'

