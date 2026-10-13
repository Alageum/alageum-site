#!/usr/bin/env python3
"""Refresh/check the backend allowlist against the frontend assets shipped in this release."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend/public"
TARGET = ROOT / "backend/app/catalog/public_assets.json"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".pdf"}


def expected_manifest():
    paths = sorted(
        "/" + path.relative_to(PUBLIC).as_posix()
        for prefix in ("catalog-products", "catalog-source", "brand")
        for path in (PUBLIC / prefix).rglob("*")
        if path.is_file() and path.suffix.lower() in EXTENSIONS
    )
    return json.dumps(paths, ensure_ascii=False, indent=2) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = expected_manifest()
    if args.check:
        if not TARGET.exists() or TARGET.read_text() != content:
            raise SystemExit("Catalog asset manifest is stale; run scripts/update_catalog_assets.py")
        print("Catalog asset manifest matches shipped frontend files")
    else:
        TARGET.write_text(content)
        print(f"Wrote {TARGET.relative_to(ROOT)}")
