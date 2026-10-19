"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const sampler = path.resolve(__dirname, "../scripts/run-native-generic-quote-storage.py");
const preamble = `
import errno
import importlib.util
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("native_storage_runner", sys.argv[1])
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
`;

function runPython(source) {
  const result = spawnSync("python3", ["-B", "-c", preamble + source, sampler], {
    encoding: "utf8",
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("native storage fixture excludes only the private editorial archive and preserves runtime data", () => {
  runPython(`
with tempfile.TemporaryDirectory(prefix="native-storage-copy-") as temporary:
    root = Path(temporary)
    source, destination = root / "source", root / "fixture"
    source.mkdir()
    destination.mkdir()
    files = {
        "config/server.js": b"server",
        "src/catalog-editorial/keep.js": b"runtime directory with the same name",
        "data/catalog-import/products.json": b"reviewed records",
        "data/catalog-transformers-2026/products.json": b"additional records",
        "data/catalog-identity-completion/manifest.json": b"identity binding",
        "data/catalog-media/source.webp": b"reviewed image bytes",
        "data/catalog-media-manifest.json": b"media hash binding",
        "data/catalog-sources.json": b"source registry",
        "data/public-assets.json": b"asset allowlist",
        "data/catalog-release.json": b"release binding",
        "public/uploads/.gitkeep": b"",
        "scripts/check-media-package.js": b"runtime check",
        "package.json": b"package",
        "package-lock.json": b"locked dependencies",
    }
    for name, content in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    archive = source / "data/catalog-editorial/releases/private.bin"
    archive.parent.mkdir(parents=True)
    archive.write_bytes(b"unpublished archive" * 1000)

    runner.copy_runtime_app(source, destination)
    assert not (destination / "data/catalog-editorial").exists()
    for name, content in files.items():
        assert (destination / name).read_bytes() == content
        assert (source / name).read_bytes() == content
    assert archive.read_bytes() == b"unpublished archive" * 1000
    assert runner.bytes_used(destination) == sum(map(len, files.values()))
    assert runner.CAP == 180 * 1024 * 1024
`);
});

test("native storage sampler counts regular bytes and excludes symlinks and directories", () => {
  runPython(`
with tempfile.TemporaryDirectory(prefix="native-storage-sampler-") as temporary:
    base = Path(temporary)
    root = base / "fixture"
    nested = root / "nested"
    nested.mkdir(parents=True)
    (root / "regular").write_bytes(b"regular")
    (nested / "another").write_bytes(b"bytes")
    (nested / "empty").touch()
    (root / "file-link").symlink_to(root / "regular")
    (root / "dangling-link").symlink_to(base / "missing")
    outside = base / "outside"
    outside.mkdir()
    (outside / "unowned").write_bytes(b"x" * 1000)
    (root / "directory-link").symlink_to(outside, target_is_directory=True)
    assert runner.bytes_used(root) == len(b"regularbytes")
`);
});

test("native storage sampler tolerates physical disappearance after enumeration", () => {
  runPython(`
with tempfile.TemporaryDirectory(prefix="native-storage-sampler-") as temporary:
    root = Path(temporary)
    (root / "retained").write_bytes(b"retained")
    vanished = root / "transient"
    vanished.write_bytes(b"removed before observation")
    real_lstat = Path.lstat
    removed = []

    def disappear_before_lstat(path, *args, **kwargs):
        if path == vanished:
            # rglob has yielded this real file; remove it before the OS stat.
            path.unlink()
            removed.append(path)
        return real_lstat(path, *args, **kwargs)

    with patch.object(Path, "lstat", disappear_before_lstat):
        assert runner.bytes_used(root) == len(b"retained")
    assert removed == [vanished]
    assert not vanished.exists()
`);
});

test("native storage sampler propagates permission and other I/O errors", () => {
  runPython(`
with tempfile.TemporaryDirectory(prefix="native-storage-sampler-") as temporary:
    root = Path(temporary)
    unreadable = root / "unreadable"
    unreadable.write_bytes(b"must not silently undercount")
    real_lstat = Path.lstat

    for error in (
        PermissionError(errno.EACCES, "permission denied", str(unreadable)),
        OSError(errno.EIO, "I/O error", str(unreadable)),
    ):
        def fail_lstat(path, *args, **kwargs):
            if path == unreadable:
                raise error
            return real_lstat(path, *args, **kwargs)

        with patch.object(Path, "lstat", fail_lstat):
            try:
                runner.bytes_used(root)
            except OSError as observed:
                assert observed is error
            else:
                raise AssertionError("The sampler swallowed an observation error")
`);
});

