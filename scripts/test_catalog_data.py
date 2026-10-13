"""Standard-library regression tests for the lossless catalog representation."""

import json
from pathlib import Path
import tempfile
import unittest

from catalog_data import MAX_CHUNK_BYTES, json_text, module_text, read_products, split_records, write_catalog_data


ROOT = Path(__file__).resolve().parents[1]


class CatalogDataTests(unittest.TestCase):
    def test_committed_catalog_regenerates_byte_for_byte(self):
        records = read_products(ROOT / "docs/catalog-import/products.json")
        metadata = json.loads((ROOT / "docs/catalog-import/manifest.json").read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            write_catalog_data(records, metadata, output)
            generated = [path for path in output.rglob("*") if path.is_file()]
            self.assertEqual(len(generated), 54)
            for path in generated:
                relative = path.relative_to(output)
                self.assertEqual(path.read_bytes(), (ROOT / relative).read_bytes(), relative)

    def test_utf8_budget_includes_module_wrapper_and_preserves_order(self):
        records = [{"id": f"record-{i}", "text": "Я" * 20_000} for i in range(3)]
        chunks = split_records(records)
        self.assertEqual(len(chunks), 3)
        self.assertEqual([record for chunk in chunks for record in chunk], records)
        for chunk in chunks:
            self.assertLessEqual(len(module_text(chunk).encode("utf-8")), MAX_CHUNK_BYTES)
        self.assertEqual(split_records([]), [])

    def test_oversized_record_fails_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "exceeds chunk limit"):
                write_catalog_data([{"id": "huge", "text": "Я" * MAX_CHUNK_BYTES}], {"recordCount": 1}, root)
            self.assertEqual(list(root.iterdir()), [])

    def test_round_trip_validates_checksums_counts_and_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [{"id": "b", "spec": {"z": None, "a": "А"}}, {"id": "a", "value": False}]
            index = write_catalog_data(records, {"recordCount": 2}, root)
            path = root / "docs/catalog-import/products.json"
            self.assertEqual(json_text(read_products(path)), json_text(records))
            legacy = root / "legacy.json"
            legacy.write_text(json_text(records), encoding="utf-8")
            self.assertEqual(read_products(legacy), records)
            for field, value, message in [
                ("sha256", "incorrect", "checksum mismatch"),
                ("recordCount", 99, "record count mismatch"),
                ("path", "../outside.json", "inside the index directory"),
            ]:
                changed = json.loads(json_text(index))
                changed["chunks"][0][field] = value
                path.write_text(json_text(changed), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    read_products(path)

    def test_regeneration_removes_only_obsolete_numbered_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = [{"id": str(i), "text": "Я" * 20_000} for i in range(3)]
            write_catalog_data(records, {"recordCount": 3}, root)
            directories = [root / "docs/catalog-import/products", root / "frontend/lib/catalog/imported-data"]
            for folder in directories:
                (folder / "README.md").write_text("Keep this note.", encoding="utf-8")
            write_catalog_data(records[:1], {"recordCount": 1}, root)
            for folder in directories:
                self.assertEqual(len(list(folder.glob("part-*"))), 1)
                self.assertTrue((folder / "README.md").is_file())


if __name__ == "__main__":
    unittest.main()
