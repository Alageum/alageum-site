#!/usr/bin/env python3
"""Current technical acceptance using the unchanged isolated reference scenario.

Only the harness's explicit input/version manifest is selected differently. No
application function, case, database isolation or cleanup behavior is overridden.
"""
import copy
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
CURRENT_MANIFEST_SHA256 = "e256bdcf0e649b50042dbf98d607723e8ef49f0fad1da7268a862004ad590674"
REFERENCE_MANIFEST_SHA256 = "76a9a7117cf314bbcce78c7581db4f5d79477bcdaf4c487f748bbbb3c0f1b9d7"
MIGRATED = frozenset({"backend/alembic.ini", "backend/app/core/config.py",
                      "backend/requirements.lock", "backend/requirements-dev.lock",
                      "backend/uv.lock"})


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def current_manifest(read_bytes=None):
    """Authenticate all 86 inputs before importing any executable reference code."""
    def safe_read(path):
        target = REPO / path
        require(not any(p.is_symlink() for p in [target, *target.parents]
                        if p == REPO or REPO in p.parents), "Symlinked input refuses")
        return target.read_bytes()
    read = read_bytes or safe_read
    prefix = "backend/tests/reference/"
    raw = read(prefix + "current_generic_quote_manifest.json")
    require(digest(raw) == CURRENT_MANIFEST_SHA256, "Current migration manifest differs")
    migration = json.loads(raw)
    original = read(prefix + "generic_quote_manifest.json")
    require(digest(original) == REFERENCE_MANIFEST_SHA256
            == migration["reference_manifest_sha256"], "Original manifest differs")
    reference = json.loads(original)
    require(len(reference["source_sha256"]) == 86, "Original input closure differs")
    for directory in ("backend/app", "backend/alembic/versions"):
        expected = {p for p in reference["source_sha256"]
                    if p.startswith(directory + "/") and p.endswith(".py")}
        actual = {p.relative_to(REPO).as_posix()
                  for p in (REPO / directory).rglob("*.py")}
        require(actual == expected, f"Executable inventory differs: {directory}")
        require(not any(p.is_symlink() for p in (REPO / directory).rglob("*")),
                "Symlinked executable inventory refuses")
    for directory in ("backend/app", "backend/alembic"):
        require(not any(p.name == "__pycache__" or p.suffix in {".pyc", ".pyo", ".so", ".pyd"}
                        for p in (REPO / directory).rglob("*")),
                "Unmanifested executable artifact refuses; use a fresh source checkout")
    require(len([p for p in reference["source_sha256"]
                 if p.startswith("backend/alembic/versions/")]) == 7,
            "Migration inventory must contain seven files")
    require(len(reference["locked_python_packages"]) == 72
            and migration["package_migrations"] == {
                "certifi": {"before": "2026.7.22", "after": "2026.10.19"}},
            "Runtime package migration differs")
    require(set(migration["migrations"]) == MIGRATED, "Migration set differs")
    require(migration["reference_revision"] == reference["frozen_revision"],
            "Original revision differs")
    selected = copy.deepcopy(reference)
    for path, edge in migration["migrations"].items():
        require(edge["before_sha256"] == reference["source_sha256"][path],
                "Migration predecessor differs")
        selected["source_sha256"][path] = edge["after_sha256"]
    for path, expected in selected["source_sha256"].items():
        require(digest(read(path)) == expected, f"Current source differs: {path}")
    for path, expected in migration["reference_harness_sha256"].items():
        require(digest(read(prefix + path)) == expected, f"Original harness differs: {path}")
    for name, edge in migration["package_migrations"].items():
        require(selected["locked_python_packages"][name] == edge["before"],
                "Package predecessor differs")
        selected["locked_python_packages"][name] = edge["after"]
    selected.update(verification_scope=migration["scope"], historical_approval=False,
                    reference_revision=selected.pop("frozen_revision"),
                    current_migration_manifest_sha256=digest(raw),
                    migration_edges=migration["migrations"])
    # Current reports omit the legacy frozen_revision key: this is not a rerun
    # of the old revision, even though the scenario itself remains unchanged.
    return selected


def main():
    selected = current_manifest()
    if sys.argv[1:] == ["--verify-only"]:
        import ast
        for path in HERE.glob("*generic_quote*.py"):
            ast.parse(path.read_text(), filename=str(path))
        print(json.dumps({"status": "current-source-and-AST-verified",
                          "runtime_executed": False, "historical_approval": False,
                          "source_count": len(selected["source_sha256"]),
                          "migration_count": len(MIGRATED)}))
        return
    require("--verify-only" not in sys.argv, "Use --verify-only without runtime arguments")
    spec = importlib.util.spec_from_file_location(
        "unchanged_generic_quote_reference", HERE / "run_generic_quote_reference.py")
    reference = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reference)
    reference.MANIFEST = selected
    if "--output" not in sys.argv:
        sys.argv += ["--output", str(REPO / "current-generic-quote-report.json")]
    reference.main()


if __name__ == "__main__":
    main()
