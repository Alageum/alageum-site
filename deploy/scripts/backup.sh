#!/usr/bin/env bash
# Consistent maintenance-window snapshot of PostgreSQL + media + quarantine.
set -euo pipefail
umask 077
if [[ $# -ne 2 || "$2" != /* || ! -d "$2" ]]; then
  echo "Usage: $0 /absolute/private/stack.env /absolute/existing/backup-directory" >&2; exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$1"; output="$2"
compose() { "$here/../compose.sh" "$env_file" "$@"; }
"$here/check-config.sh" "$env_file"
running_text="$(compose ps --status running --services)"
mapfile -t running <<< "$running_text"
resume=(); resume_ids=()
for service in backend frontend proxy; do
  if printf '%s\n' "${running[@]}" | grep -Fxq "$service"; then
    id="$(compose ps --all --quiet "$service")"
    if [[ ! "$id" =~ ^[a-f0-9]{12,64}$ ]]; then
      echo 'Expected exactly one existing container per application service; no services changed.' >&2; exit 1
    fi
    resume+=("$service"); resume_ids+=("$id")
  fi
done
if ! printf '%s\n' "${running[@]}" | grep -Fxq postgres; then
  echo 'PostgreSQL must already be running; no services changed.' >&2; exit 1
fi
partial="$(mktemp -d "$output/.alageum-$(date -u +%Y%m%dT%H%M%SZ).partial.XXXXXX")"
wait_for_original_services() {
  local deadline=$((SECONDS + 180)) id state ready
  while (( SECONDS < deadline )); do
    ready=1
    for id in "${resume_ids[@]}"; do
      state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$id")" || return 1
      case "$state" in
        'running healthy') ;;
        'running starting') ready=0 ;;
        *) return 1 ;;
      esac
    done
    (( ready )) && return 0
    sleep 2
  done
  return 1
}
cleanup() {
  result=$?
  trap - EXIT
  if (( ${#resume[@]} )); then
    # Compose 2.30 supports up --wait but not start --wait. Start only the
    # captured existing services, then inspect those exact original containers.
    # Do not use up: maintenance must never recreate or add services.
    if ! compose start "${resume[@]}" || ! wait_for_original_services; then
      echo 'Backup maintenance ended, but application restart needs operator attention.' >&2
      if [[ $result -eq 0 ]]; then result=1; fi
    fi
  fi
  if [[ $result -ne 0 ]]; then echo "Incomplete or unconfirmed backup retained privately at: $partial" >&2; fi
  exit "$result"
}
trap cleanup EXIT
# No database or filesystem writers may run outside these named services.
compose stop --timeout 60 proxy frontend backend
compose exec -T postgres sh -eu -c \
  'pg_dump --format=custom --no-owner --no-acl --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' > "$partial/database.dump"
test -s "$partial/database.dump"
compose exec -T postgres pg_restore --list < "$partial/database.dump" > /dev/null
compose run --rm -T --no-deps storage tar --create --gzip --file - \
  --directory /var/lib/alageum public private-quarantine > "$partial/media.tar.gz"
python3 "$here/verify-media-archive.py" "$partial/media.tar.gz"
compose images --format json > "$partial/images.json"
cat > "$partial/metadata.txt" <<META
format=alageum-paired-backup-v1
created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
writer_state=backend-frontend-proxy-stopped
scope=postgresql-public-uploads-private-quarantine
META
(cd "$partial" && sha256sum database.dump media.tar.gz images.json metadata.txt > SHA256SUMS)
final="${partial/\/.alageum-/\/alageum-}"
final="${final/.partial./-}"
mv "$partial" "$final"
partial="$final"
echo "Paired backup created: $final"
echo 'Keep encrypted off-host; secrets/certificates require a separate approved secure backup.'
