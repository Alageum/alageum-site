import copy
import json
import shutil
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.catalog.assets import public_assets
from app.catalog.importer import (
    CATEGORIES,
    NAMESPACE,
    PROVENANCE_FIELDS,
    SPEC_FIELDS,
    import_records,
)
from app.catalog.models import Category, Product
from app.core.database import AsyncSessionFactory
from scripts.import_catalog import DEFAULT_CATALOG_DIR, read_reviewed_catalog, run

ROOT = Path(__file__).resolve().parents[2]


async def test_import_preserves_all_238_canonical_records_and_references(client):
    records = read_reviewed_catalog()
    overlay = json.loads((DEFAULT_CATALOG_DIR / "database-overlay.json").read_text())
    assert len(records) == len({record["id"] for record in records}) == 238
    assert [record["id"] for record in records] == overlay["order"]
    assert records[0]["id"] == "tmg-400"
    original = copy.deepcopy(records)
    async with AsyncSessionFactory() as session:
        result = await import_records(session, records)
        assert result == {"categories_created": 5, "created": 238, "skipped": 0}
        await session.commit()
    assert records == original
    async with AsyncSessionFactory() as session:
        stored = list((await session.scalars(select(Product).order_by(Product.sort_order))).all())
        assert [item.public_key for item in stored] == overlay["order"]
        by_key = {item.public_key: item for item in stored}
        for position, (record, item) in enumerate(zip(records, stored, strict=True)):
            assert item.id == uuid.uuid5(NAMESPACE, f"product:{record['id']}")
            assert item.public_key == item.slug == record["id"]
            assert item.sort_order == position
            assert item.category.public_key == record["category"]
            assert item.category.id == uuid.uuid5(NAMESPACE, f"category:{record['category']}")
            assert item.source_data == record
            assert item.sku == record.get("sku")
            assert item.translations == {
                "ru": {"name": record["name"], "description": record.get("description", "")}
            }
            assert item.specs == {key: record[key] for key in SPEC_FIELDS if key in record}
            assert item.provenance == {
                key: record[key] for key in PROVENANCE_FIELDS if key in record
            }
            expected_media = (
                [{"path": record["image"], "kind": "image", "alt": record.get("imageCaption", "")}]
                if record.get("image")
                else []
            )
            assert item.media == expected_media
            assert item.price is None and item.currency is None
            assert item.price_mode == "on_request" and item.status == "published"
            assert item.version == 1
            if record.get("familyId"):
                assert record["familyId"] in by_key
            for variant_id in record.get("variantIds", []):
                assert variant_id in by_key
        assert await session.scalar(select(func.count()).select_from(Category)) == 5
    fetched = []
    for page in (1, 2, 3):
        response = await client.get(
            "/api/v1/catalog/products", params={"page": page, "page_size": 100}
        )
        assert response.status_code == 200
        assert response.json()["total"] == 238
        fetched.extend(response.json()["items"])
    assert [item["public_key"] for item in fetched] == overlay["order"]
    assert all("source_data" not in item for item in fetched)
    detail = await client.get("/api/v1/catalog/products/tmg-400")
    assert detail.status_code == 200 and "source_data" not in detail.json()
    compared = await client.post(
        "/api/v1/catalog/compare", json={"product_ids": [item["id"] for item in fetched[:2]]}
    )
    assert compared.status_code == 200 and all(
        "source_data" not in item for item in compared.json()
    )


async def test_import_rerun_never_overwrites_reviewed_edits():
    records = read_reviewed_catalog()
    async with AsyncSessionFactory() as session:
        await import_records(session, records)
        await session.commit()
        product = await session.scalar(
            select(Product).where(Product.public_key == records[0]["id"])
        )
        identity = product.id
        evidence = copy.deepcopy(product.source_data)
        product.translations = {"ru": {"name": "Edited by catalog manager"}}
        product.price_mode = "fixed"
        product.price = Decimal("199.95")
        product.currency = "EUR"
        product.status = "hidden"
        product.version = 7
        product.specs = {"notes": ["Reviewed edit"]}
        product.slug = "reviewed-slug"
        product.sort_order = 999
        await session.commit()
    async with AsyncSessionFactory() as session:
        result = await import_records(session, records)
        await session.commit()
        assert result == {"categories_created": 0, "created": 0, "skipped": 238}
        product = await session.get(Product, identity)
        assert product.translations["ru"]["name"] == "Edited by catalog manager"
        assert product.price == Decimal("199.95") and product.currency == "EUR"
        assert product.status == "hidden" and product.version == 7
        assert product.specs == {"notes": ["Reviewed edit"]}
        assert product.slug == "reviewed-slug" and product.sort_order == 999
        assert product.source_data == evidence
        assert await session.scalar(select(func.count()).select_from(Product)) == 238


@pytest.mark.parametrize("collision", ["sku", "slug", "category", "public_key"])
async def test_import_collision_rolls_back_entire_batch_even_when_caller_catches(collision):
    records = copy.deepcopy(read_reviewed_catalog()[:2])
    async with AsyncSessionFactory() as session:
        category = Category(
            public_key="existing-category",
            slug="existing-category",
            translations={},
            is_published=True,
        )
        if collision == "category":
            category.slug = list(CATEGORIES)[1]  # first category is inserted before collision
        session.add(category)
        await session.flush()
        existing = Product(
            public_key="existing-product",
            slug="existing-product",
            category_id=category.id,
            sku="EXISTING",
            translations={},
        )
        if collision == "sku":
            existing.sku = records[1]["sku"]
        elif collision == "slug":
            existing.slug = records[1]["id"]
        elif collision == "public_key":
            existing.public_key = records[1]["id"]
        session.add(existing)
        await session.commit()
        existing_id = existing.id
        existing_key = existing.public_key
        with pytest.raises(ValueError, match="collision"):
            await import_records(session, records)
        # If a caller catches the exception and commits, no partial imported records can survive.
        await session.commit()
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(Category)) == 1
        assert await session.scalar(select(func.count()).select_from(Product)) == 1
        assert (await session.get(Product, existing_id)).public_key == existing_key


async def test_import_rejects_duplicate_keys_and_bad_assets_atomically():
    first, second = copy.deepcopy(read_reviewed_catalog()[:2])
    async with AsyncSessionFactory() as session:
        with pytest.raises(ValueError, match="Duplicate"):
            await import_records(session, [first, first])
        second["image"] = "/catalog-products/not-a-shipped-file.webp"
        with pytest.raises(ValueError, match="not included"):
            await import_records(session, [first, second])
        await session.commit()
        assert await session.scalar(select(func.count()).select_from(Category)) == 0
        assert await session.scalar(select(func.count()).select_from(Product)) == 0


def test_asset_allowlist_exactly_matches_shipped_files():
    public = ROOT / "frontend/public"
    extensions = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".pdf"}
    actual = {
        "/" + path.relative_to(public).as_posix()
        for prefix in ("catalog-products", "catalog-source", "brand")
        for path in (public / prefix).rglob("*")
        if path.is_file() and path.suffix.lower() in extensions
    }
    assert set(public_assets()) == actual
    assert "/brand/transformer.png" in actual
    assert all(
        not record.get("image") or record["image"] in actual for record in read_reviewed_catalog()
    )


@pytest.mark.parametrize(
    "corruption", ["checksum", "duplicate_order", "duplicate_overlay", "traversal"]
)
def test_source_reader_checks_chunks_and_canonical_overlay(tmp_path, corruption):
    directory = tmp_path / "catalog"
    shutil.copytree(DEFAULT_CATALOG_DIR, directory)
    index_path = directory / "products.json"
    index = json.loads(index_path.read_text())
    overlay_path = directory / "database-overlay.json"
    overlay = json.loads(overlay_path.read_text())
    if corruption == "checksum":
        index["chunks"][0]["sha256"] = "0" * 64
    elif corruption == "traversal":
        index["chunks"][0]["path"] = "../secret.json"
    elif corruption == "duplicate_order":
        overlay["order"].append(overlay["order"][0])
    else:
        overlay["records"].append(overlay["records"][0])
    index_path.write_text(json.dumps(index))
    overlay_path.write_text(json.dumps(overlay))
    with pytest.raises(ValueError):
        read_reviewed_catalog(directory)


async def test_import_cli_dry_run_rolls_back_and_supports_mounted_catalog(tmp_path, capsys):
    directory = tmp_path / "catalog"
    shutil.copytree(DEFAULT_CATALOG_DIR, directory)
    await run(True, directory)
    output = json.loads(capsys.readouterr().out)
    assert output["records"] == output["created"] == 238
    assert output["dry_run"] is True
    async with AsyncSessionFactory() as session:
        assert await session.scalar(select(func.count()).select_from(Product)) == 0
        assert await session.scalar(select(func.count()).select_from(Category)) == 0


async def test_import_cli_runs_in_backend_only_container_layout(tmp_path):
    import os
    import subprocess
    import sys

    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.database import Base

    image = tmp_path / "backend-image"
    image.mkdir()
    shutil.copytree(
        ROOT / "backend/app", image / "app", ignore=shutil.ignore_patterns("__pycache__")
    )
    shutil.copytree(
        ROOT / "backend/scripts", image / "scripts", ignore=shutil.ignore_patterns("__pycache__")
    )
    assert not (image / "docs").exists()
    assert not (image / "scripts/catalog_data.py").exists()
    database_url = f"sqlite+aiosqlite:///{tmp_path / 'container.db'}"
    engine = create_async_engine(database_url)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    env = {**os.environ, "APP_DATABASE_URL": database_url}
    env.pop("PYTHONPATH", None)
    completed = subprocess.run(
        [
            sys.executable,
            "scripts/import_catalog.py",
            "--catalog-dir",
            str(DEFAULT_CATALOG_DIR),
            "--dry-run",
        ],
        cwd=image,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout)["created"] == 238
    async with engine.begin() as connection:
        assert await connection.scalar(select(func.count()).select_from(Product)) == 0
    await engine.dispose()
