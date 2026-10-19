# Portable server package

Start with [the server deployment guide](../docs/server-deployment.md).

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
