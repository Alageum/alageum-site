"""Keep Vercel's uv lock aligned with the audited Docker/runtime pins."""

import re
import tomllib
from pathlib import Path

backend = Path(__file__).resolve().parents[1] / "backend"
expected = dict(
    re.findall(r"^([\w.-]+)==([^\s;]+)", (backend / "requirements.lock").read_text(), re.MULTILINE)
)
lock = tomllib.loads((backend / "uv.lock").read_text())
versions = {}
for package in lock["package"]:
    versions.setdefault(package["name"], set()).add(package["version"])
errors = [
    f"{name}: requirements.lock={version}, uv.lock={sorted(versions.get(name, set()))}"
    for name, version in expected.items()
    if versions.get(name) != {version}
]
if not expected:
    errors.append("No runtime pins found in requirements.lock")
if errors:
    raise SystemExit("Vercel runtime lock mismatch:\n" + "\n".join(errors))
print(f"Vercel runtime lock: {len(expected)} audited package versions match")
