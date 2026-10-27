#!/usr/bin/env python3
"""Read an app-owned archive without extracting; refuse links, devices or escapes."""
import pathlib
import sys
import tarfile

def verify(path):
    seen = set()
    with tarfile.open(path, "r:gz") as archive:
        for item in archive:
            name = item.name.rstrip("/")
            p = pathlib.PurePosixPath(name)
            if (not name or name in seen or p.is_absolute() or ".." in p.parts or
                    str(p) != name or p.parts[0] not in {"public", "private-quarantine", "private-documents"} or
                    not (item.isdir() or item.isfile()) or item.mode & 0o7022):
                raise ValueError("unsafe_archive_entry")
            if name in {"public", "public/uploads", "private-quarantine", "private-documents"} and not item.isdir():
                raise ValueError("archive_roots_must_be_directories")
            if p.parts[0] == "public":
                if len(p.parts) > 1 and p.parts[1] != "uploads":
                    raise ValueError("public_root_not_dedicated")
                if len(p.parts) > 3 or (len(p.parts) == 3 and not item.isfile()):
                    raise ValueError("uploads_must_be_flat_files")
            if name == "private-quarantine" and (not item.isdir() or item.mode & 0o077):
                raise ValueError("quarantine_permissions_invalid")
            if p.parts[0] == "private-documents":
                if item.mode & 0o077 or len(p.parts) > 2 or (len(p.parts) == 2 and not item.isfile()):
                    raise ValueError("private_documents_invalid")
            seen.add(name)
    if not {"public", "public/uploads", "private-quarantine", "private-documents"}.issubset(seen):
        raise ValueError("archive_roots_missing")
    return True

def main():
    try:
        if len(sys.argv) != 2: raise ValueError("archive_path_required")
        verify(sys.argv[1])
    except Exception:
        print("Media archive validation failed; nothing extracted.", file=sys.stderr)
        return 1
    print("Media archive paths/types/permissions verified; no extraction performed.")
    return 0
if __name__ == "__main__":
    sys.exit(main())
