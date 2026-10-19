#!/usr/bin/env python3
"""Consume resolved Compose JSON on stdin; print issue names, never env values."""
import json
import pathlib
import re
import sys

def inspect(config):
    errors = []
    services = config.get("services", {})
    expected = {"postgres", "clamav", "backend", "frontend", "proxy", "storage"}
    if set(services) != expected:
        errors.append("service_set_mismatch")
    for name, service in services.items():
        if name != "proxy" and service.get("ports"):
            errors.append(f"{name}_must_not_publish_ports")
        if name in {"postgres", "clamav", "proxy"} and not re.search(r"@sha256:[a-f0-9]{64}$", service.get("image", "")):
            errors.append(f"{name}_image_digest_required")
        for mount in service.get("volumes", []):
            if mount.get("type") == "bind":
                source = pathlib.Path(mount["source"])
                if not source.is_absolute() or not source.exists() or source.is_symlink() or source.resolve() != source:
                    errors.append(f"{name}_bind_source_missing_or_unsafe")
    backend = services.get("backend", {}).get("environment", {})
    wanted = {"APP_ENV": "production", "NODE_ENV": "production", "DATABASE_SSL": "true",
              "ALAGEUM_TRUSTED_PROXY_IPS": "172.30.44.2", "ALAGEUM_MEDIA_CLAMAV_HOST": "172.30.45.2",
              "ALAGEUM_MEDIA_PUBLIC_ROOT": "/var/lib/alageum/public",
              "ALAGEUM_MEDIA_QUARANTINE_DIR": "/var/lib/alageum/private-quarantine",
              "ALAGEUM_SEED_DEMO": "0", "ALAGEUM_IMPORT_CATALOG": "0", "ALAGEUM_EDS_ENABLED": "0"}
    for key, value in wanted.items():
        if str(backend.get(key, "")) != value:
            errors.append(f"backend_{key.lower()}_mismatch")
    host = services.get("proxy", {}).get("environment", {}).get("ALAGEUM_HOSTNAME", "")
    if not re.fullmatch(r"(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?", host):
        errors.append("public_dns_hostname_required")
    if backend.get("ALAGEUM_BROWSER_ORIGIN") != f"https://{host}":
        errors.append("browser_origin_mismatch")
    if backend.get("CORS_ORIGINS") != backend.get("ALAGEUM_BROWSER_ORIGIN"):
        errors.append("cors_origin_mismatch")
    for secret in config.get("secrets", {}).values():
        path = pathlib.Path(secret.get("file", ""))
        if not path.is_absolute() or not path.is_file() or path.is_symlink():
            errors.append("secret_file_missing_or_unsafe")
        elif path.stat().st_mode & 0o077:
            errors.append("secret_file_must_be_private")
    return sorted(set(errors))

def main():
    try:
        errors = inspect(json.load(sys.stdin))
    except Exception:
        print("Deployment check failed: invalid_configuration_input", file=sys.stderr)
        return 1
    for code in errors:
        print(f"Deployment check failed: {code}", file=sys.stderr)
    if errors:
        return 1
    print("Compose paths/topology valid. Live TLS, SMTP, scanner, persistence and restore remain separate checks.")
    return 0
if __name__ == "__main__":
    sys.exit(main())
