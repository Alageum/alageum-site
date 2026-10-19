#!/usr/bin/env python3
"""Emit only fixed diagnostic labels; never echo raw container log content."""
import json
import re
import sys

ERROR_CODES = (
    "EACCES", "EPERM", "ENOENT", "ENOSPC", "EROFS", "MODULE_NOT_FOUND",
    "ERR_MODULE_NOT_FOUND", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN",
    "ETIMEDOUT", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "CERT_HAS_EXPIRED", "ERR_OSSL_EVP_UNSUPPORTED",
)
CATEGORIES = {
    "production_configuration_rejected": r"Production startup blocked|\"configuration_valid\":\s*false",
    "media_storage_rejected": r"Media storage unavailable|\"directories_ready\":\s*false",
    "missing_module": r"Cannot find module|Cannot find package",
    "permission_denied": r"permission denied|EACCES|EPERM",
    "database_authentication_failed": r"password authentication failed",
    "database_hba_rejected": r"no pg_hba.conf entry",
    "database_permission_denied": r"permission denied for (?:database|schema|table|sequence)",
    "database_pool_timeout": r"KnexTimeoutError|Timeout acquiring a connection",
    "database_version_rejected": r"Unsupported production PostgreSQL major",
    "database_schema_rejected": r"(?:schema|constraint)[^\r\n]{0,100}(?:mismatch|missing|invalid|unsupported|incompatible)",
    "certificate_validation_failed": r"certificate verify failed|self[- ]signed certificate|unable to verify|certificate has expired|certificate.*altnames",
    "native_page_editor_integrity_rejected": r"(?:Incomplete|Invalid) native Page editor|Native Page editor package bytes changed|Review the pinned native Page editor",
    "catalog_media_integrity_rejected": r"Catalog media package integrity failure|Unexpected catalog media package files|Unknown or stale catalog media package",
    "webpack_patch_rejected": r"webpack[^\r\n]{0,100}(?:patch|mismatch|failed|invalid)",
    "scanner_startup_failed": r"clamd[^\r\n]{0,100}(?:failed|error)|Can't open file or directory",
}


def summarize(raw):
    # Fixed literals are the only log-derived output. Match offsets, source
    # strings, free-form error messages, file paths and stack frames are omitted.
    return {
        "schema_version": 1,
        "error_codes": [code for code in ERROR_CODES if re.search(r"(?<![A-Z_])" + code + r"(?![A-Z_])", raw)],
        "categories": [name for name, pattern in CATEGORIES.items() if re.search(pattern, raw, re.IGNORECASE)],
        "raw_logs_retained": False,
    }


if __name__ == "__main__":
    print(json.dumps(summarize(sys.stdin.read()), indent=2))
