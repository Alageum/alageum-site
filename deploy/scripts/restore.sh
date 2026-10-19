#!/usr/bin/env bash
# Restore only to a fresh, isolated target. Never drops a database or deletes media.
set -euo pipefail
umask 077
if [[ $# -ne 3 || "$3" != --restore-empty-target || "$2" != /* || ! -d "$2" ]]; then
  echo "Usage: $0 /absolute/private/stack.env /absolute/backup --restore-empty-target" >&2; exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$1"; backup="$2"
compose() { "$here/../compose.sh" "$env_file" "$@"; }
"$here/check-config.sh" "$env_file"
# Read only known checksummed files. Reject checksum-list path tricks.
python3 - "$backup" <<'PY'
import pathlib, sys, hashlib
root = pathlib.Path(sys.argv[1])
expected = {'database.dump', 'media.tar.gz', 'images.json', 'metadata.txt'}
if (root/'SHA256SUMS').is_symlink(): raise SystemExit('Backup manifest must not be a link.')
lines = (root/'SHA256SUMS').read_text().splitlines()
seen = set()
for line in lines:
    digest, name = line.split('  ', 1)
    path = root/name
    if name not in expected or name in seen or path.is_symlink() or not path.is_file():
        raise SystemExit('Backup manifest invalid; nothing restored.')
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != digest: raise SystemExit('Backup checksum mismatch; nothing restored.')
    seen.add(name)
if seen != expected: raise SystemExit('Backup incomplete; nothing restored.')
PY
python3 "$here/verify-media-archive.py" "$backup/media.tar.gz"
running="$(compose ps --status running --services)"
if printf '%s\n' "$running" | grep -Eq '^(backend|frontend|proxy)$'; then
  echo 'Refusing restore while application services run. Use an isolated stopped target.' >&2; exit 1
fi
compose up -d --wait --wait-timeout 180 postgres
compose exec -T postgres pg_restore --list < "$backup/database.dump" > /dev/null
count="$(compose exec -T postgres psql --no-psqlrc --tuples-only --no-align --username postgres --dbname alageum_strapi <<'SQL'
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') +
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') +
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') +
  (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname NOT LIKE 'pg_%');
SQL
)"
if [[ "$count" != 0 ]]; then echo 'Target database is not empty; restore refused without changing it.' >&2; exit 1; fi
compose run --rm -T --no-deps storage node -e '
const fs=require("node:fs");
const {inspectMediaStorage}=require("/app/src/domain/media-storage");
process.umask(0o022);
(async()=>{
const report=await inspectMediaStorage({publicRoot:"/var/lib/alageum/public",quarantineRoot:"/var/lib/alageum/private-quarantine"});
if (!report.directories_ready) process.exit(1);
for (const p of ["/var/lib/alageum/public/uploads","/var/lib/alageum/private-quarantine"]) {
  if (fs.lstatSync(p).isSymbolicLink() || fs.readdirSync(p).length) process.exit(1);
}
if (fs.readdirSync("/var/lib/alageum/public").some(p=>p!=="uploads")) process.exit(1);
})().catch(()=>process.exit(1));
' || { echo 'Target media must be empty pre-provisioned directories; nothing restored.' >&2; exit 1; }
# Single database transaction; ownership is the non-superuser app role.
compose exec -T postgres sh -eu -c \
  'pg_restore --exit-on-error --single-transaction --no-owner --no-acl --role=alageum_app --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' < "$backup/database.dump"
# Database is restored first. If media restore fails, leave all app services OFF.
# Do not retry into a partial target; investigate and provision another empty one.
compose run --rm -T --no-deps storage tar --extract --gzip --no-same-owner \
  --file - --directory /var/lib/alageum < "$backup/media.tar.gz"
compose run --rm -T --no-deps storage tar --compare --gzip \
  --file - --directory /var/lib/alageum < "$backup/media.tar.gz"
echo 'Paired snapshot restored and archive contents compared. Application remains stopped.'
echo 'Review schema/release compatibility, SMTP side effects, media URLs and record counts before starting.'
