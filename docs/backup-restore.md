# PostgreSQL backup and restore

Create a custom-format, no-owner/no-ACL database backup:

```bash
make backup
```

The command prints `backups/alageum-<UTC>.dump` and writes a metadata sidecar containing PostgreSQL
server version, timestamp, format and scope. Dumps are ignored by Git.

Restore is destructive for the Compose database and requires an explicit artifact:

```bash
make restore BACKUP=/absolute/path/alageum-<UTC>.dump
make smoke
```

Restore validates the archive before stopping backend, recreates the database, restores with
`--exit-on-error`, and starts backend again. Empty/corrupt/missing artifacts fail non-zero.

Included: PostgreSQL schema and data. Not included: local/object-storage file bytes, environment
secrets, container images or external providers. Production destination, encryption, retention,
file-storage backups, schedule, RPO/RTO and restore authority are **NEEDS_CLIENT**.


After restarting the backend, restore waits for the database-backed `/api/v1/readiness` endpoint before reporting success. Requests have connection and total timeouts; the overall wait defaults to 120 seconds (`BACKEND_READY_TIMEOUT_SECONDS`, range 1–600). A timeout exits nonzero with the last bounded readiness error, so callers do not run smoke tests against a server that has only just started. Bootstrap uses the same readiness check.
