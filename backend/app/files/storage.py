import asyncio
import hashlib
import os
import re
import unicodedata
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from urllib.parse import quote

from app.core.config import get_settings


class FileStorage(ABC):
    @abstractmethod
    async def upload(self, content: bytes) -> tuple[str, str]: ...

    @abstractmethod
    async def download(self, key: str) -> bytes: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...

    @abstractmethod
    async def get_url(self, key: str) -> str: ...


class FileScanner(ABC):
    @abstractmethod
    async def scan(self, content: bytes, filename: str, content_type: str) -> None: ...


class NoopFileScanner(FileScanner):
    """DEV adapter only. Production must select an antivirus/content-scanning adapter."""

    async def scan(self, content: bytes, filename: str, content_type: str) -> None:
        return None


class LocalFileStorage(FileStorage):
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("Unsafe storage key")
        return path

    async def upload(self, content: bytes) -> tuple[str, str]:
        checksum = hashlib.sha256(content).hexdigest()
        key = f"{uuid.uuid4().hex[:2]}/{uuid.uuid4().hex}"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, content)
        return key, checksum

    async def download(self, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, missing_ok=True)

    async def get_url(self, key: str) -> str:
        raise NotImplementedError("Authorized file URLs are issued using FileObject IDs")


class S3CompatibleFileStorage(FileStorage):
    """Adapter boundary; credentials and vendor are selected after Discovery."""

    async def upload(self, content: bytes) -> tuple[str, str]:
        raise NotImplementedError("S3 adapter requires deployment configuration")

    async def download(self, key: str) -> bytes:
        raise NotImplementedError("S3 adapter requires deployment configuration")

    async def delete(self, key: str) -> None:
        raise NotImplementedError("S3 adapter requires deployment configuration")

    async def get_url(self, key: str) -> str:
        raise NotImplementedError("S3 adapter requires deployment configuration")


def get_file_storage() -> FileStorage:
    settings = get_settings()
    if settings.storage_backend == "local":
        return LocalFileStorage(settings.local_storage_path)
    if settings.storage_backend == "s3":
        return S3CompatibleFileStorage()
    raise RuntimeError(f"Unsupported storage backend: {settings.storage_backend}")


def get_file_scanner() -> FileScanner:
    settings = get_settings()
    if settings.file_scanner_backend == "noop":
        return NoopFileScanner()
    raise RuntimeError("Configured file scanner adapter is not installed")


def safe_filename(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", os.path.basename(value))
    normalized = re.sub(r"[\x00-\x1f\x7f]", "", normalized).strip(" .")
    return normalized[:200] or "file"


def content_disposition(filename: str) -> str:
    fallback = re.sub(r"[^A-Za-z0-9._-]", "_", safe_filename(filename)) or "file"
    encoded = quote(safe_filename(filename), safe="")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"
