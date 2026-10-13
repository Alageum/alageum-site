#!/usr/bin/env python3
"""Fail when an unapproved variable can be embedded into the browser bundle."""

from pathlib import Path

ALLOWED = {"NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_CATALOG_SOURCE"}
root = Path(__file__).resolve().parents[1]
violations: list[str] = []
for path in [root / ".env.example", *sorted((root / "frontend").glob(".env*"))]:
    if not path.is_file():
        continue
    for line_number, line in enumerate(path.read_text().splitlines(), 1):
        key = line.split("=", 1)[0].strip()
        if key.startswith("NEXT_PUBLIC_") and key not in ALLOWED:
            violations.append(f"{path.relative_to(root)}:{line_number}: {key}")
if violations:
    raise SystemExit("Unapproved browser environment variables:\n" + "\n".join(violations))
print("Frontend public environment allowlist: PASS")
