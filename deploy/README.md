# Portable server package

Start with [the administrator handoff](../docs/ADMINISTRATOR-RU.md), then
[the server deployment guide](../docs/server-deployment.md).

- `compose.production.yml`: the standalone production topology, not an override.
- `.env.example`, `backend.env.example`: configuration templates; all secrets blank.
- `compose.sh`: explicit private env path; does not source shell code.
- `nginx/`: same-origin HTTPS routing and sanitized proxy headers.
- `postgres/`: TLS-only app network access and non-superuser app-role initialization.
- `scripts/check-config.sh`: read-only path/topology validation, no secret output.
- `scripts/backup.sh`: maintenance-window paired PostgreSQL/media/quarantine snapshot.
- `scripts/restore.sh`: isolated empty-target restore; no drop/delete or auto-start.

Only the edge publishes 80/443. The app requires operator-provisioned persistent
paths, DB/HTTPS certificates, SMTP and runtime secrets. Real-server acceptance,
recovery rehearsal and operator cutover are not implied by checked-in files.

## Private document files

Provision `${ALAGEUM_DATA_DIR}/private-documents` as an empty, app-UID-owned
mode `0700` directory alongside (never inside) public storage and quarantine.
The backend mounts it at `/var/lib/alageum/private-documents`; set
`ALAGEUM_DOCUMENT_ROOT` accordingly. No proxy alias or public URL may expose it.
Uploads require `document.create` (currently administrator), downloads require
`document.read` and the active company/session. Only PDF/JPEG/PNG up to **1 MiB**
are accepted; the limit matches the existing multipart parser. Admission uses
the configured ClamAV daemon and fails closed. PDFs are delivered as attachments,
not executed or rendered on the server. This is not a PDF semantic validator.

Paired backup format **v2** now includes private document bytes with the database,
public media and quarantine. Restore intentionally rejects older v1 snapshots
rather than silently restore document references without their bytes. Keep v1
backups and their matching old release for an isolated legacy recovery; do not
rename a format marker to bypass validation. Rehearse v2 recovery before cutover.
