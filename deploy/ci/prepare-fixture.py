#!/usr/bin/env python3
"""Create synthetic short-lived fixture material, never use real credentials."""
import os
import pathlib
import re
import secrets
import subprocess
import sys


def prepare(root, release, run_id):
    if not re.fullmatch(r"[a-f0-9]{40,64}", release):
        raise ValueError("An immutable Git commit is required")
    if not re.fullmatch(r"[0-9]+-[0-9]+", run_id):
        raise ValueError("A GitHub run identifier is required")
    if not root.is_absolute() or root.is_symlink() or not root.is_dir() or any(root.iterdir()):
        raise ValueError("A fresh private absolute fixture directory is required")
    os.umask(0o077)
    for name in ["ca", "tls/postgres", "tls/https", "tls/smtp", "secrets", "capture", "backup", "browser-home"]:
        (root / name).mkdir(parents=True, exist_ok=True)
    # The runner owns this CA. It is only trusted inside this short-lived job.
    def openssl(*args):
        subprocess.run(["openssl", *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    openssl("req", "-x509", "-newkey", "rsa:3072", "-nodes", "-days", "2", "-sha256",
            "-subj", "/CN=ALAGEUM disposable CI CA", "-keyout", str(root / "ca/key.pem"), "-out", str(root / "ca/cert.pem"),
            "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign")
    for service, dns in [("postgres", "postgres"), ("https", "site.example.test"), ("smtp", "smtp.example.test")]:
        target = root / "tls" / service
        extensions = target / "extensions.cnf"
        extensions.write_text(f"subjectAltName=DNS:{dns}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
        openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256", "-subj", f"/CN={dns}",
                "-keyout", str(target / "server.key"), "-out", str(target / "request.csr"))
        openssl("x509", "-req", "-in", str(target / "request.csr"), "-CA", str(root / "ca/cert.pem"),
                "-CAkey", str(root / "ca/key.pem"), "-set_serial", str(secrets.randbits(120)), "-days", "2", "-sha256",
                "-extfile", str(extensions), "-out", str(target / "server.crt"))
        (target / "ca.crt").write_bytes((root / "ca/cert.pem").read_bytes())
        for path in target.glob("*.crt"):
            path.chmod(0o644)
        target.chmod(0o755)
        extensions.unlink()
        (target / "request.csr").unlink()
    (root / "tls/https/fullchain.pem").write_bytes((root / "tls/https/server.crt").read_bytes() + (root / "ca/cert.pem").read_bytes())
    (root / "tls/https/privkey.pem").write_bytes((root / "tls/https/server.key").read_bytes())
    app_password = secrets.token_hex(48)
    (root / "secrets/postgres-admin-password").write_text(secrets.token_hex(48) + "\n")
    (root / "secrets/postgres-app-password").write_text(app_password + "\n")
    env = {
        "APP_KEYS": f"{secrets.token_hex(48)},{secrets.token_hex(48)}",
        **{name: secrets.token_hex(48) for name in ["ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]},
        "DATABASE_URL": f"postgresql://alageum_app:{app_password}@postgres:5432/alageum_strapi",
        "ALAGEUM_REGISTRATION_MAIL_PROVIDER": "smtp", "ALAGEUM_SMTP_HOST": "127.0.0.1", "ALAGEUM_SMTP_PORT": "2525",
        "ALAGEUM_SMTP_TLS_SERVERNAME": "smtp.example.test", "ALAGEUM_MAIL_FROM": "noreply@example.test",
        "ALAGEUM_SMTP_USER": "synthetic-test-user", "ALAGEUM_SMTP_PASSWORD": "synthetic-test-password",
    }
    (root / "backend.env").write_text("".join(f"{key}={value}\n" for key, value in env.items()))
    for target in ["initial", "restored"]:
        (root / f"{target}.env").write_text(
            f"ALAGEUM_PROJECT_NAME=alageum-ci-{run_id}-{target}\nALAGEUM_RELEASE={release}\nALAGEUM_HOSTNAME=site.example.test\n"
            f"ALAGEUM_DATA_DIR={root}/{target}\nALAGEUM_TLS_DIR={root}/tls\nALAGEUM_SECRET_DIR={root}/secrets\n"
            f"ALAGEUM_BACKEND_ENV_FILE={root}/backend.env\n")
    # No private key needs to remain available for further signing.
    (root / "ca/key.pem").unlink()


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: prepare-fixture.py /fresh/private/directory commit run-attempt")
    prepare(pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3])
