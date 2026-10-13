#!/usr/bin/env python3
"""Generate isolated frozen system DTO/metrics evidence, without app/DB imports.

Run with Python >=3.12 and the exact installed backend/uv.lock packages:
    python backend-node/tests/reference/generate_legacy_system.py [--check]

Only the three response DTOs and two recorder class definitions are compiled
from their frozen ASTs. This is not full endpoint, ASGI, or database execution.
Python patch versions are deliberately absent from the deterministic fixture.
"""

import argparse
import ast
import copy
import hashlib
import importlib.metadata
import json
import math
import pathlib
import struct
import sys
import tomllib
from collections import defaultdict
from datetime import UTC, datetime
from threading import Lock

from pydantic import BaseModel


ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURE = pathlib.Path(__file__).with_name("legacy-system.json")
VERSIONS = {
    "fastapi": "0.141.1", "starlette": "1.6.0", "pydantic": "2.13.4",
    "pydantic-core": "2.46.4", "httpx": "0.28.1",
}
SOURCE_HASHES = {
    "backend/app/api/system.py": "d323369d9b7f23cbad18360228f455be20ff2f3f35dcb7f6645c952f84f7acf6",
    "backend/app/core/metrics.py": "f295284890abc1626ec0649af9f52aea61effb062719ea7e49f072e2022049a8",
    "backend/uv.lock": "80d93e2751be39e87ef0480761caa00369657f022bab5db4c51edeae36e7935e",
}
HTTP_DURATION = "http_request_duration_seconds"


def verify_sources_and_versions():
    if sys.version_info < (3, 12):
        raise RuntimeError("Python >=3.12 is required for the frozen reference runtime")
    for path, expected in SOURCE_HASHES.items():
        actual = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Frozen source drift: {path}: {actual} != {expected}")
    locked = {item["name"]: item["version"] for item in tomllib.loads((ROOT / "backend/uv.lock").read_text())["package"]}
    for package, expected in VERSIONS.items():
        actual = importlib.metadata.version(package)
        if actual != expected or locked[package] != expected:
            raise RuntimeError(f"Pinned runtime mismatch: {package}: installed={actual}, lock={locked[package]}, expected={expected}")


def execute_classes(path, names, namespace):
    source = ast.parse((ROOT / path).read_text(), filename=path)
    nodes = [copy.deepcopy(next(item for item in source.body if isinstance(item, ast.ClassDef) and item.name == name)) for name in names]
    module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))
    exec(compile(module, "<frozen-system-reference>", "exec", dont_inherit=True), namespace)


def frozen_definitions():
    namespace = {"BaseModel": BaseModel, "datetime": datetime, "defaultdict": defaultdict, "Lock": Lock}
    execute_classes("backend/app/api/system.py", ["HealthResponse", "ReadinessResponse", "VersionResponse"], namespace)
    execute_classes("backend/app/core/metrics.py", ["MetricsRecorder", "MemoryMetricsRecorder"], namespace)
    return namespace


def dto_cases(classes):
    poison = {"password": "fixture-secret", "database_url": "fixture-database-secret", "backend": "unapproved", "migration": "unapproved", "APP_VERSION": "spoofed"}
    moment = datetime(2026, 10, 3, 12, 34, 56, 123000, tzinfo=UTC)
    cases = []
    for kind, values in [
        ("health", {"status": "ok", "timestamp": moment}),
        ("readiness", {"status": "ok", "timestamp": moment, "database": "ok"}),
        ("version", {"name": "ALAGEUM API", "version": "0.1.0", "environment": "test"}),
    ]:
        model = classes[kind.title() + "Response"]
        response = model(**values, **poison)
        cases.append({"kind": kind, "input_timestamp": moment.isoformat(), "ignored_extras": poison,
                      "field_allowlist": list(model.model_fields), "expected": response.model_dump(mode="json")})
    return cases


def timestamp_cases(classes):
    values = [
        "2026-10-03T12:34:56.000Z", "2026-10-03T12:34:56.001Z",
        "2026-10-03T12:34:56.010Z", "2026-10-03T12:34:56.100Z",
        "2026-10-03T12:34:56.123Z", "2026-10-03T12:34:56.999Z",
        "1970-01-01T00:00:00.000Z", "1969-12-31T23:59:59.999Z",
        "2000-02-29T23:59:59.001Z", "0001-01-01T00:00:00.001Z",
        "9999-12-31T23:59:59.999Z", "2026-10-03T15:04:56.120+02:30",
    ]
    result = []
    for value in values:
        moment = datetime.fromisoformat(value).astimezone(UTC)
        encoded = classes["HealthResponse"](status="ok", timestamp=moment).model_dump(mode="json")["timestamp"]
        result.append({"input": value, "expected": encoded})
    return result


def http_step(recorder, status, duration):
    recorder.increment("http_requests_total")
    recorder.observe(HTTP_DURATION, duration)
    if status >= 400:
        recorder.increment("http_errors_total")


def metric_cases(classes):
    recorder = classes["MemoryMetricsRecorder"]()
    steps = []
    for status, duration in [(200, 0.0078125), (200, 0.1), (399, 0.2), (400, 0.0), (429, 0.0234375), (500, 1.1234565)]:
        before = recorder.snapshot()
        http_step(recorder, status, duration)
        steps.append({"status": status, "duration_seconds": duration, "before": before, "after": recorder.snapshot()})
    return steps


def rounding_cases(classes):
    vectors = [("zero", [0.0]), ("negative-zero", [-0.0]), ("decimal-addition", [0.1, 0.2]),
               ("accumulated-unrounded", [0.0000004, 0.0000004]), ("tiny-sample-after-large", [1e16, 0.1])]
    for label, value in [
        ("binary-tie-even-down", 0.0078125), ("binary-tie-even-up", 0.0234375),
        ("binary-tie-second-down", 0.0390625), ("decimal-half-micro", 0.0000005),
        ("decimal-one-and-half-micro", 0.0000015), ("decimal-six-digits", 1.2345675),
        ("decimal-carry", 0.9999995), ("large-decimal", 123456789.1234565),
    ]:
        for direction, sample in [("below", math.nextafter(value, 0.0)), ("at", value), ("above", math.nextafter(value, math.inf))]:
            vectors.append((label + "-" + direction, [sample]))
    # Exact binary64 bit patterns cover subnormals, extremes, and magnitudes
    # where multiply-then-round and decimal conversion can double-round.
    bit_patterns = [1, 0x000fffffffffffff, 0x0010000000000000, 0x3fffffffffffffff,
                    0x4340000000000000, 0x7fefffffffffffff]
    state = 0x123456789abcdef
    for _ in range(64):
        state = (state * 6364136223846793005 + 1442695040888963407) & ((1 << 64) - 1)
        bit_patterns.append(state & 0x7fefffffffffffff)
    for bits in bit_patterns:
        vectors.append((f"binary64-{bits:016x}", [struct.unpack(">d", bits.to_bytes(8, "big"))[0]]))
    cases = []
    for name, samples in vectors:
        recorder = classes["MemoryMetricsRecorder"]()
        for sample in samples:
            http_step(recorder, 200, sample)
        cases.append({"id": name, "samples": samples, "expected": recorder.snapshot()})
    return cases


def integer_cases(classes):
    cases = []
    for seed in [2**53 - 1, 2**53, 2**53 + 1, 10**30]:
        recorder = classes["MemoryMetricsRecorder"]()
        # Isolated boundary seeding is test scaffolding, not a public reset or
        # a claim that quadrillions of HTTP requests were executed.
        recorder.increment("http_requests_total", seed)
        recorder.increment("http_errors_total", seed)
        recorder._samples[HTTP_DURATION] = seed
        recorder._totals[HTTP_DURATION] = 0.0
        http_step(recorder, 500, 0.0)
        cases.append({"seed": str(seed), "expected": recorder.snapshot()})
    return cases


def generate():
    verify_sources_and_versions()
    classes = frozen_definitions()
    if any(name == "app" or name.startswith("app.") or name == "sqlalchemy" or name.startswith("sqlalchemy.") for name in sys.modules):
        raise RuntimeError("Reference generation unexpectedly imported an app/database module")
    return {
        "evidence": "system DTO/metrics reference; not full legacy endpoint execution",
        "source_revision": "74b92855d1dcc2997c471823f83686ac66972649",
        "source_sha256": SOURCE_HASHES, "runtime_versions": VERSIONS, "python_requirement": ">=3.12",
        "limits": [
            "Only frozen HealthResponse, ReadinessResponse, VersionResponse, MetricsRecorder, and MemoryMetricsRecorder class ASTs execute.",
            "No legacy app, endpoint body, middleware, database, settings loader, or SQLAlchemy import executes.",
            "Timestamp vectors cover Date-representable milliseconds, rendered as UTC with the frozen Pydantic zero/six-digit fractional shape.",
            "Metrics steps reproduce literal HTTP increment/observe/error calls; middleware scope and safe-500 behavior are separately approved Node adaptations.",
            "Boundary integer vectors seed isolated recorder internals to test exact integer output without executing quadrillions of requests.",
            "Node version intentionally uses the checked-in package version, constant ALAGEUM API name, and guarded application mode; configurable legacy metadata is not reproduced.",
        ],
        "dto_cases": dto_cases(classes), "timestamp_cases": timestamp_cases(classes),
        "metric_steps": metric_cases(classes), "rounding_cases": rounding_cases(classes),
        "integer_cases": integer_cases(classes),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the committed fixture without changing it")
    args = parser.parse_args()
    data = json.dumps(generate(), ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.check:
        if FIXTURE.read_text() != data:
            raise SystemExit("System-reference fixture differs; regenerate and review")
        print("System-reference fixture matches frozen sources and pinned runtime")
    else:
        FIXTURE.write_text(data)
        print(f"Wrote {FIXTURE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
