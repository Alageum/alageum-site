#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ALAGEUM_REGISTRATION_MAIL_TEST_DATABASE_URL:?Provide a fresh dedicated alageum_registration_mail_test database}"
command -v openssl >/dev/null || { echo "OpenSSL is required to generate the ephemeral local test certificate" >&2; exit 1; }
temporary="$(mktemp -d "${TMPDIR:-/tmp}/alageum-mail-test.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
# Synthetic ephemeral TLS identity, used only by the loopback SMTP sink.
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$temporary/key.pem" -out "$temporary/cert.pem" \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' >/dev/null 2>&1
chmod 600 "$temporary/key.pem"
export ALAGEUM_SMTP_TEST_KEY="$temporary/key.pem" ALAGEUM_SMTP_TEST_CERT="$temporary/cert.pem"
# Certificate verification remains enabled; trust is scoped to this test process.
export NODE_EXTRA_CA_CERTS="$temporary/cert.pem"
node --test tests/registration-mail.test.js tests/registration-mail.smtp-integration.js
