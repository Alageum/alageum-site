"""Stdlib-only current-manifest negatives; never start a database via pytest."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "current_generic", HERE / "run_current_generic_quote.py")
CURRENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CURRENT)


class CurrentGenericManifestTests(unittest.TestCase):
    def reader(self, replacements):
        def read(path):
            if path in replacements:
                value = replacements[path]
                if value is None:
                    raise FileNotFoundError(path)
                return value
            return (CURRENT.REPO / path).read_bytes()
        return read

    def test_current_exact_closure_and_runtime_versions(self):
        selected = CURRENT.current_manifest()
        reference = json.loads((HERE / "generic_quote_manifest.json").read_text())
        self.assertEqual(len(selected["source_sha256"]), 86)
        self.assertEqual(len(selected["locked_python_packages"]), 72)
        changed = {p for p, h in reference["source_sha256"].items()
                   if selected["source_sha256"][p] != h}
        self.assertEqual(changed, CURRENT.MIGRATED)
        expected = copy.deepcopy(reference["locked_python_packages"])
        expected["certifi"] = "2026.10.19"
        self.assertEqual(selected["locked_python_packages"], expected)
        self.assertFalse(selected["historical_approval"])
        self.assertNotIn("frozen_revision", selected)

    def test_every_current_input_missing_or_tampered_refuses(self):
        selected = CURRENT.current_manifest()
        for path in selected["source_sha256"]:
            for value in (None, (CURRENT.REPO / path).read_bytes() + b"\n# extra\n"):
                with self.subTest(path=path, missing=value is None):
                    with self.assertRaises((RuntimeError, FileNotFoundError)):
                        CURRENT.current_manifest(self.reader({path: value}))

    def test_original_manifest_and_both_harnesses_are_immutable(self):
        for name in ("generic_quote_manifest.json", "run_generic_quote_reference.py",
                     "generic_quote_cases.py"):
            path = "backend/tests/reference/" + name
            for value in (None, (CURRENT.REPO / path).read_bytes() + b"\n"):
                with self.subTest(name=name, missing=value is None):
                    with self.assertRaises((RuntimeError, FileNotFoundError)):
                        CURRENT.current_manifest(self.reader({path: value}))

    def test_missing_extra_stale_and_self_reauthorized_edges_refuse(self):
        path = "backend/tests/reference/current_generic_quote_manifest.json"
        original = json.loads((CURRENT.REPO / path).read_text())
        variants = []
        for key in CURRENT.MIGRATED:
            changed = copy.deepcopy(original)
            del changed["migrations"][key]
            variants.append(changed)
            changed = copy.deepcopy(original)
            changed["migrations"][key]["after_sha256"] = changed["migrations"][key]["before_sha256"]
            variants.append(changed)
        changed = copy.deepcopy(original)
        changed["migrations"]["backend/app/main.py"] = {"before_sha256": "0" * 64,
                                                          "after_sha256": "1" * 64}
        variants.append(changed)
        changed = copy.deepcopy(original)
        changed["package_migrations"]["fastapi"] = {"before": "0", "after": "1"}
        variants.append(changed)
        for changed in variants:
            with self.assertRaisesRegex(RuntimeError, "Current migration manifest differs"):
                CURRENT.current_manifest(self.reader({path: json.dumps(changed).encode()}))

    def test_extra_executable_migrations_and_symlinks_refuse(self):
        import shutil
        import tempfile
        from unittest.mock import patch
        selected = CURRENT.current_manifest()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = set(selected["source_sha256"]) | {
                "backend/tests/reference/" + name for name in (
                    "current_generic_quote_manifest.json", "generic_quote_manifest.json",
                    "run_generic_quote_reference.py", "generic_quote_cases.py")}
            for path in paths:
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(CURRENT.REPO / path, target)
            with patch.object(CURRENT, "REPO", root):
                CURRENT.current_manifest()
                for path in ("backend/app/unauthorized.py",
                             "backend/alembic/versions/unauthorized.py"):
                    target = root / path
                    target.write_text("# unauthorized executable input\n")
                    with self.assertRaisesRegex(RuntimeError, "Executable inventory differs"):
                        CURRENT.current_manifest()
                    target.unlink()
                for path in ("backend/app/core/config.cpython-312-x86_64-linux-gnu.so",
                             "backend/app/core/config.pyc",
                             "backend/alembic/versions/unlisted.pyc"):
                    target = root / path
                    target.write_bytes(b"untrusted import artifact")
                    with self.assertRaisesRegex(RuntimeError, "Unmanifested executable artifact"):
                        CURRENT.current_manifest()
                    target.unlink()
                for path in ("backend/app/main.py",
                             "backend/tests/reference/generic_quote_cases.py"):
                    target = root / path
                    data = target.read_bytes()
                    outside = root / "outside.py"
                    outside.write_bytes(data)
                    target.unlink()
                    target.symlink_to(outside)
                    with self.assertRaisesRegex(RuntimeError, "Symlinked"):
                        CURRENT.current_manifest()
                    target.unlink()
                    target.write_bytes(data)
                    outside.unlink()

    def test_runtime_mismatch_fails_before_postgres_setup(self):
        # Actual original runtime verifier, not an imitation or application mock.
        spec = importlib.util.spec_from_file_location(
            "original_runtime_check", HERE / "run_generic_quote_reference.py")
        reference = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reference)
        reference.MANIFEST = CURRENT.current_manifest()
        from unittest.mock import patch
        correct = reference.MANIFEST["locked_python_packages"]
        for package, value in (("certifi", "2026.7.22"), ("fastapi", "WRONG"),
                               ("asyncpg", None)):
            def installed(name, package=package, value=value):
                if name == package:
                    if value is None:
                        raise reference.importlib.metadata.PackageNotFoundError(name)
                    return value
                return correct[name]
            with self.subTest(package=package), patch.object(
                    reference.importlib.metadata, "version", side_effect=installed), patch.object(
                    reference.subprocess, "run") as command, patch.object(
                    reference.tempfile, "mkdtemp") as fixture:
                with self.assertRaises((reference.ReferenceFailure,
                                        reference.importlib.metadata.PackageNotFoundError)):
                    reference.provenance(runtime=True)
                command.assert_not_called()
                fixture.assert_not_called()


if __name__ == "__main__":
    unittest.main()
