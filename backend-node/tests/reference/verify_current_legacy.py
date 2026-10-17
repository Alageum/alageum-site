#!/usr/bin/env python3
"""Re-execute archived vectors against the separately pinned, sanitized checkout.

The archived generator/fixture files are never rewritten. Each child imports one
original generator, uses the current-source hash map only for this new run, then
compares every non-provenance output byte semantically with the archived result.
No historical approval, deployment readiness or full endpoint execution is claimed.
"""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
MANIFEST = HERE / "current-legacy-reference.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def behavior(value):
    return {key: item for key, item in value.items() if key not in {"source_revision", "source_sha256"}}


def execute_reference(name):
    manifest = json.loads(MANIFEST.read_text())
    archive = manifest["archives"][name]
    for field in ("fixture", "generator"):
        if sha(HERE / archive[field]) != archive[field + "_sha256"]:
            raise RuntimeError(f"Archived {field} changed: {name}")
    original = json.loads((HERE / archive["fixture"]).read_text())
    if original["source_revision"] != archive["source_revision"]:
        raise RuntimeError("Historical revision mismatch")
    changed = []
    current = {}
    for path, old_digest in original["source_sha256"].items():
        current[path] = manifest["source_sha256"][path]
        if sha(ROOT / path) != current[path]:
            raise RuntimeError(f"Current source drift: {path}")
        if current[path] != old_digest:
            changed.append(path)
    if changed != ["backend/app/core/config.py"]:
        raise RuntimeError(f"Only the documented sanitized config may differ: {changed}")
    module_name = "current_reference_" + name
    spec = importlib.util.spec_from_file_location(module_name, HERE / archive["generator"])
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    if module.SOURCE_HASHES != original["source_sha256"]:
        raise RuntimeError("Archived generator and fixture disagree about source identity")
    # Original verification still checks every source and pinned runtime. Only
    # this fresh execution's explicitly reviewed source map is different.
    module.SOURCE_HASHES = current
    actual = module.generate()
    if behavior(actual) != behavior(original):
        raise RuntimeError(f"Current behavior differs from archived contract: {name}")
    encoded = json.dumps(behavior(actual), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return {"cases": len(actual["cases"]), "client_key_cases": len(actual.get("client_key_cases", [])),
            "behavior_sha256": hashlib.sha256(encoded).hexdigest(), "all_archived_outputs_equal": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--reference", choices=("query", "quote_limit"))
    args = parser.parse_args()
    if args.reference:
        print(json.dumps(execute_reference(args.reference), sort_keys=True))
        return
    # The standard-library-only limiter proof must run in a separate process:
    # importing FastAPI from the query proof would violate its isolation guard.
    results = {}
    for name in ("query", "quote_limit"):
        child = subprocess.run([sys.executable, __file__, "--reference", name], check=True,
                               capture_output=True, text=True, timeout=90)
        results[name] = json.loads(child.stdout)
    manifest = json.loads(MANIFEST.read_text())
    if args.check:
        if manifest["execution"] != results:
            raise SystemExit("Current reference evidence differs; re-execute and review")
    else:
        manifest["execution"] = results
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"current_source_reference": "passed", "historical_files_modified": False, "execution": results}))


if __name__ == "__main__":
    main()
