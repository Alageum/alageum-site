#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 2 || "$1" != /* || ! -f "$1" ]]; then
  echo "Usage: $0 /absolute/private/stack.env <compose command...>" >&2; exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$1"; shift
# Never source an env file as executable shell. Never print resolved secrets.
exec docker compose --project-directory "$root/deploy" --env-file "$env_file" \
  -f "$root/deploy/compose.production.yml" "$@"
