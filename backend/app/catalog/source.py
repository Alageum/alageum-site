"""Read reviewed source chunks without depending on repository-only utility scripts."""

import hashlib
import json
from pathlib import Path

CHUNK_FORMAT = "alageum-catalog-chunks-v1"
OVERLAY_FORMAT = "alageum-catalog-overlay-v1"


def read_reviewed_catalog(catalog_dir: Path) -> list[dict]:
    directory = catalog_dir.resolve()
    index = json.loads((directory / "products.json").read_text(encoding="utf-8"))
    if isinstance(index, list):
        base = index
    else:
        if index.get("format") != CHUNK_FORMAT:
            raise ValueError("Unknown catalog source format")
        base = []
        for chunk in index["chunks"]:
            relative = Path(chunk["path"])
            target = (directory / relative).resolve()
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or not target.is_relative_to(directory)
            ):
                raise ValueError("Catalog chunk must remain inside the source directory")
            content = target.read_bytes()
            if hashlib.sha256(content).hexdigest() != chunk["sha256"]:
                raise ValueError(f"Catalog chunk checksum mismatch: {relative}")
            items = json.loads(content)
            if not isinstance(items, list) or len(items) != chunk["recordCount"]:
                raise ValueError(f"Catalog chunk record count mismatch: {relative}")
            base.extend(items)
        if len(base) != index["recordCount"]:
            raise ValueError("Catalog record count mismatch")
    if len(base) != len({item["id"] for item in base}):
        raise ValueError("Duplicate source catalog public keys")
    overlay = json.loads((directory / "database-overlay.json").read_text(encoding="utf-8"))
    if overlay.get("format") != OVERLAY_FORMAT:
        raise ValueError("Unknown catalog overlay")
    by_id = {item["id"]: item for item in base}
    by_id.update({item["id"]: item for item in overlay["records"]})
    if (
        len(by_id) != overlay["recordCount"]
        or len(overlay["order"]) != len(set(overlay["order"]))
        or len(overlay["records"]) != len({item["id"] for item in overlay["records"]})
        or set(by_id) != set(overlay["order"])
    ):
        raise ValueError("Catalog overlay is incomplete or contains duplicate identities")
    return [by_id[key] for key in overlay["order"]]
