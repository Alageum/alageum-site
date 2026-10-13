#!/usr/bin/env bash
# The process may be started before its socket and restored database are ready.
set -euo pipefail

url="http://localhost:8000/api/v1/readiness"
timeout="${BACKEND_READY_TIMEOUT_SECONDS:-120}"
if [[ ! "${timeout}" =~ ^[1-9][0-9]{0,2}$ ]] || (( timeout > 600 )); then
  printf 'BACKEND_READY_TIMEOUT_SECONDS must be an integer from 1 to 600\n' >&2
  exit 2
fi
command -v curl >/dev/null || { printf 'curl is required to verify backend readiness\n' >&2; exit 2; }
deadline=$((SECONDS + timeout))
last_error='No readiness response received'
while (( SECONDS < deadline )); do
  remaining=$((deadline - SECONDS))
  request_timeout=$((remaining < 5 ? remaining : 5))
  if last_error="$(curl --fail --silent --show-error --connect-timeout 2 \
    --max-time "${request_timeout}" --output /dev/null "${url}" 2>&1)"; then
    printf 'Backend ready: %s\n' "${url}"
    exit 0
  fi
  remaining=$((deadline - SECONDS))
  if (( remaining > 0 )); then
    sleep "$((remaining < 2 ? remaining : 2))"
  fi
done
printf 'Backend did not become ready within %s seconds: %s\n' "${timeout}" "${url}" >&2
printf 'Last readiness error: %.300s\n' "${last_error}" >&2
exit 1
