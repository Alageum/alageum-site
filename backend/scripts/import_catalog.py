"""Import the reviewed catalog after Alembic upgrade head.

Host, from repo root: PYTHONPATH=backend python backend/scripts/import_catalog.py
Container: mount docs/catalog-import read-only at /catalog, then run
python -m scripts.import_catalog --catalog-dir /catalog
No accounts, permissions, credentials, or prices are created by this command.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Direct script execution also works in the backend-only container layout.
if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.catalog.importer import import_records  # noqa: E402
from app.catalog.source import read_reviewed_catalog as read_source  # noqa: E402
from app.core.database import AsyncSessionFactory  # noqa: E402

DEFAULT_CATALOG_DIR = Path(__file__).resolve().parents[2] / "docs/catalog-import"


def read_reviewed_catalog(catalog_dir: Path = DEFAULT_CATALOG_DIR):
    return read_source(catalog_dir)


async def run(dry_run: bool, catalog_dir: Path = DEFAULT_CATALOG_DIR):
    records = read_reviewed_catalog(catalog_dir)
    async with AsyncSessionFactory() as session:
        result = await import_records(session, records)
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
        print(json.dumps({"dry_run": dry_run, "records": len(records), **result}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--catalog-dir", type=Path, default=DEFAULT_CATALOG_DIR)
    args = parser.parse_args()
    asyncio.run(run(args.dry_run, args.catalog_dir))
