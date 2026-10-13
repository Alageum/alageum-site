from pathlib import Path

import pytest

from app.core.config import get_settings
from app.core.database import AsyncSessionFactory
from app.files.storage import LocalFileStorage, content_disposition, safe_filename
from tests.factories import login, tenant_fixture


async def authenticated_headers(client):
    async with AsyncSessionFactory() as session:
        data = await tenant_fixture(session)
    token = await login(client, "a@example.test")
    return {
        "Authorization": f"Bearer {token}",
        "X-Organization-ID": str(data["org_a"].id),
    }


async def test_upload_validates_extension_signature_and_size(client, monkeypatch):
    headers = await authenticated_headers(client)
    mismatch = await client.post(
        "/api/v1/files",
        headers=headers,
        files={"upload": ("payload.png", b"%PDF-test", "image/png")},
    )
    assert mismatch.status_code == 415
    extension = await client.post(
        "/api/v1/files",
        headers=headers,
        files={"upload": ("payload.jpg", b"%PDF-test", "application/pdf")},
    )
    assert extension.status_code == 415
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 4)
    oversized = await client.post(
        "/api/v1/files",
        headers=headers,
        files={"upload": ("payload.pdf", b"%PDF-test", "application/pdf")},
    )
    assert oversized.status_code == 413


async def test_valid_upload_and_tenant_authorized_download(client, monkeypatch):
    headers = await authenticated_headers(client)
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 1024)
    uploaded = await client.post(
        "/api/v1/files",
        headers=headers,
        files={"upload": ("report.pdf", b"%PDF-mock", "application/pdf")},
    )
    assert uploaded.status_code == 201
    downloaded = await client.get(f"/api/v1/files/{uploaded.json()['id']}", headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-mock"
    assert "filename*=UTF-8''report.pdf" in downloaded.headers["content-disposition"]


async def test_storage_rejects_path_traversal(tmp_path: Path):
    storage = LocalFileStorage(tmp_path)
    with pytest.raises(ValueError, match="Unsafe storage key"):
        await storage.download("../outside")


def test_filename_and_content_disposition_strip_control_characters():
    assert safe_filename("../../evil\r\nname.pdf") == "evilname.pdf"
    header = content_disposition('bad"\r\nX-Test: yes.pdf')
    assert "\r" not in header and "\n" not in header
    assert "X-Test:" not in header
