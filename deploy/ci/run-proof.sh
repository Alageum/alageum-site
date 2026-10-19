#!/usr/bin/env bash
# Disposable hosted-runner proof ONLY. Never point it at a server or real data.
set -euo pipefail
umask 077
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ||
      ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ || ! "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ||
      ! "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40,64}$ || "${RUNNER_TEMP:-}" != /* ]]; then
  echo 'This destructive disposable-fixture proof is restricted to a GitHub-hosted Actions runner.' >&2; exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
docker compose version --short | python3 -c 'import re,sys; v=tuple(map(int,re.search(r"(\d+)\.(\d+)\.(\d+)",sys.stdin.read()).groups())); assert v >= (2,30,0), "Compose 2.30+ required"'
work="$(mktemp -d "$RUNNER_TEMP/alageum-server-proof.XXXXXX")"
results="$RUNNER_TEMP/alageum-server-proof-results"
mkdir -p "$results"
run_id="$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
sink="alageum-ci-smtp-$run_id"
stage=prepare
active_env="$work/initial.env"
compose() { "$root/deploy/compose.sh" "$active_env" "$@"; }
cleanup() {
  result=$?
  trap - EXIT
  python3 - "$results/outcome.json" "$stage" "$result" "$GITHUB_SHA" <<'PY'
import json, pathlib, sys
pathlib.Path(sys.argv[1]).write_text(json.dumps({"schema_version": 1, "last_stage": sys.argv[2], "exit_code": int(sys.argv[3]), "commit": sys.argv[4], "production_cutover_approved": False}, indent=2) + "\n")
PY
  for target in initial restored; do
    docker ps -a --filter "label=com.docker.compose.project=alageum-ci-$run_id-$target" \
      --format '{{.Names}}\t{{.Status}}' > "$results/$target-containers.txt" 2>/dev/null || true
  done
  docker rm -f "$sink" >/dev/null 2>&1 || true
  for target in initial restored; do
    if [[ -f "$work/$target.env" ]]; then
      "$root/deploy/compose.sh" "$work/$target.env" down --volumes --remove-orphans >/dev/null 2>&1 || true
    fi
  done
  # Only the exact mktemp directory created above; it contains test tokens,
  # TLS private keys, synthetic DB credentials and disposable backup archives.
  if [[ "$work" == "$RUNNER_TEMP"/alageum-server-proof.* && -d "$work" && ! -L "$work" ]]; then
    sudo rm -rf -- "$work"
  fi
  exit "$result"
}
trap cleanup EXIT
python3 "$here/prepare-fixture.py" "$work" "$GITHUB_SHA" "$run_id"

stage=pull_pinned_images
compose pull postgres clamav proxy
image_for() {
  # Resolved config contains secrets: consume it directly and emit one public
  # image name only. Do not tee, save or print the whole Compose configuration.
  compose --profile tools config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"][sys.argv[1]]["image"])' "$1"
}
postgres_image="$(image_for postgres)"
clamav_image="$(image_for clamav)"
pg_uid="$(docker run --rm --entrypoint id "$postgres_image" -u postgres)"
pg_gid="$(docker run --rm --entrypoint id "$postgres_image" -g postgres)"
clam_uid="$(docker run --rm --entrypoint id "$clamav_image" -u clamav)"
clam_gid="$(docker run --rm --entrypoint id "$clamav_image" -g clamav)"
for value in "$pg_uid" "$pg_gid" "$clam_uid" "$clam_gid"; do [[ "$value" =~ ^[0-9]+$ ]]; done
sudo chown "$pg_uid:$pg_gid" "$work/tls/postgres/server.key" "$work/secrets/"*-password
sudo chmod 0600 "$work/tls/postgres/server.key"
sudo chmod 0400 "$work/secrets/"*-password
for target in initial restored; do
  mkdir -p "$work/$target"
  sudo install -d -o "$pg_uid" -g "$pg_gid" -m 0700 "$work/$target/postgres"
  sudo install -d -o "$clam_uid" -g "$clam_gid" -m 0750 "$work/$target/clamav"
  sudo install -d -o 1000 -g 1000 -m 0750 "$work/$target/public" "$work/$target/public/uploads"
  sudo install -d -o 1000 -g 1000 -m 0700 "$work/$target/private-quarantine"
done
"$root/deploy/scripts/check-config.sh" "$active_env"
stage=build_production_images
# Serial builds keep the Strapi and Next compilers within hosted-runner memory.
compose build --pull backend
compose build --pull frontend

stage=start_production_compose
# Official FreshClam downloads official signatures; failures fail the gate.
# There is no fake scanner, empty signature DB or acceptance bypass.
compose up -d --no-build --wait --wait-timeout 900
compose images --format json > "$results/images.json"
for service in postgres clamav backend frontend; do
  [[ -z "$(docker port "$(compose ps -q "$service")")" ]]
done
compose exec -T clamav clamdscan --version > "$results/clamav-version.txt"
start_sink() {
  docker rm -f "$sink" >/dev/null 2>&1 || true
  rm -f "$work/capture/messages.json"
  # Sharing this backend's private network namespace preserves the fixture's
  # loopback bind. No host port, relay, public mail service or credentials exist.
  docker run -d --name "$sink" --network "container:$(compose ps -q backend)" \
    --user "$(id -u):$(id -g)" --read-only --cap-drop ALL --security-opt no-new-privileges:true \
    --mount "type=bind,src=$here,dst=/ci,readonly" \
    --mount "type=bind,src=$work/tls/smtp,dst=/fixture-tls,readonly" \
    --mount "type=bind,src=$work/capture,dst=/capture" \
    --entrypoint node "alageum-backend:$GITHUB_SHA" /ci/smtp-sink.cjs >/dev/null
  for ((attempt=0; attempt<60; attempt++)); do
    [[ -f "$work/capture/messages.json" ]] && return 0
    sleep 1
  done
  echo 'Disposable SMTP sink did not become ready.' >&2; return 1
}
start_sink
stage=production_tls_and_mail
node "$here/prove-http.mjs" "$work" "$results" initial
compose exec -T backend node - initial < "$here/prove-container.cjs"
stage=chromium_frontend_and_cms
mkdir -p "$work/browser-home/.pki/nssdb"
certutil -N --empty-password -d "sql:$work/browser-home/.pki/nssdb"
certutil -A -n alageum-disposable-ci -t 'C,,' -i "$work/ca/cert.pem" -d "sql:$work/browser-home/.pki/nssdb"
node "$here/prove-browser.mjs" "$work" "$results"

stage=container_recreation
docker rm -f "$sink" >/dev/null
# Recreate both applications and the DB process against the same bind mounts.
compose up -d --no-build --force-recreate --wait --wait-timeout 300 postgres backend frontend proxy
start_sink
node "$here/prove-http.mjs" "$work" "$results" recreated
compose exec -T backend node - recreated < "$here/prove-container.cjs"

stage=paired_backup
"$root/deploy/scripts/backup.sh" "$active_env" "$work/backup"
mapfile -t backups < <(find "$work/backup" -mindepth 1 -maxdepth 1 -type d -name 'alageum-*')
[[ ${#backups[@]} -eq 1 ]]
backup="${backups[0]}"
docker rm -f "$sink" >/dev/null
compose down --volumes
# Fixed isolated production subnets are deliberately retained, so the restore
# rehearsal runs after the original project is stopped, on fresh independent
# DB/media directories. Only downloaded scanner signatures are copied over.
sudo cp -a "$work/initial/clamav/." "$work/restored/clamav/"
active_env="$work/restored.env"
stage=paired_restore
"$root/deploy/scripts/restore.sh" "$active_env" "$backup" --restore-empty-target
! compose ps --status running --services | grep -Eq '^(backend|frontend|proxy)$'
if "$root/deploy/scripts/restore.sh" "$active_env" "$backup" --restore-empty-target > "$work/restore-refusal.log" 2>&1; then
  echo 'Restore unexpectedly accepted a nonempty target.' >&2; exit 1
fi
grep -Fq 'Target database is not empty' "$work/restore-refusal.log"
! compose ps --status running --services | grep -Eq '^(backend|frontend|proxy)$'
compose up -d --no-build --wait --wait-timeout 900
start_sink
node "$here/prove-http.mjs" "$work" "$results" restored
compose exec -T backend node - restored < "$here/prove-container.cjs"
node "$here/prove-http.mjs" "$work" "$results" reset
stage=complete
python3 - "$results/checks.json" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1]); report = json.loads(path.read_text())
report["checks"].extend({"name": name, "status": "passed"} for name in [
    "production_compose_builds_locked_source_images", "only_https_edge_publishes_ports",
    "postgres_verified_tls_least_privilege_and_plaintext_rejection",
    "official_clamav_clean_and_eicar_rejection", "exact_private_quarantine_bytes_survive_recreate_and_paired_restore",
    "restore_leaves_application_stopped_until_explicit_start", "nonempty_restore_target_is_refused"])
path.write_text(json.dumps(report, indent=2) + "\n")
PY
echo 'Disposable production Compose, browser, TLS mail, scanner, persistence and paired restore proof passed.'
