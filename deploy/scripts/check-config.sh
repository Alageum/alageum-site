#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: $0 /absolute/private/stack.env" >&2; exit 2; fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# --format json contains secret runtime values. Pipe straight into the local
# checker; never save it, use tee, enable shell tracing, or attach it to reports.
"$here/../compose.sh" "$1" --profile tools config --format json | python3 "$here/validate-config.py"
