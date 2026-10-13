#!/usr/bin/env python3
"""Execute frozen quote limiter/client-key/error ASTs without app/DB imports.

Python >=3.12, standard library only:
    python backend-node/tests/reference/generate_legacy_quote_limit.py [--check]

The original class/function bodies execute unchanged. A fake monotonic clock,
request attributes, and literal default settings isolate their behavior from
FastAPI, the database, the settings loader, and deployment configuration.
"""

import argparse
import ast
import asyncio
import copy
import hashlib
import ipaddress
import json
import pathlib
import sys
from abc import ABC, abstractmethod
from collections import OrderedDict, deque
from dataclasses import dataclass
from enum import StrEnum
from types import SimpleNamespace
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURE = pathlib.Path(__file__).with_name("legacy-quote-limit.json")
SOURCE_REVISION = "8def4eb6b95588d11313f5df19f67bd80d1564a0"
SOURCE_HASHES = {
    "backend/app/core/rate_limit.py": "d507548c315462875bda0bcff4c1cd7e742be431dae901555fc563ce1a313186",
    "backend/app/core/errors.py": "31679dcc464399df31fad605749cbabd86d31b6d51a069e9250e9f57a93a890d",
    "backend/app/core/config.py": "9a04a04b490af73a7309b0d62966dfe4a409942f2a02ed4027b2e2c8c0e1fc14",
    "backend/app/commerce/router.py": "5bec87d8dc0bea983c188f6e22f2d6830cf35d6148289ed648230f0e974d0e5b",
}


def verify_sources():
    if sys.version_info < (3, 12):
        raise RuntimeError("Python >=3.12 is required for the frozen reference runtime")
    for path, expected in SOURCE_HASHES.items():
        actual = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Frozen source drift: {path}: {actual} != {expected}")


def source_ast(path):
    return ast.parse((ROOT / path).read_text(), filename=path)


def definition(path, name):
    return copy.deepcopy(next(item for item in source_ast(path).body if getattr(item, "name", None) == name))


def execute(nodes, namespace):
    module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))
    exec(compile(module, "<frozen-quote-limit-reference>", "exec", dont_inherit=True), namespace)


def default_settings():
    settings = definition("backend/app/core/config.py", "Settings")
    fields = {item.target.id: item.value for item in settings.body
              if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)}
    factory = next(item.value for item in fields["rate_limit_requests"].keywords if item.arg == "default_factory")
    requests = ast.literal_eval(factory.body)["quote_create"]
    trusted = next(item.value for item in fields["trusted_proxy_ips"].keywords if item.arg == "default_factory")
    if not isinstance(trusted, ast.Name) or trusted.id != "list":
        raise RuntimeError("Frozen default trusted_proxy_ips must be an empty list")
    policies = next(item.value for item in source_ast("backend/app/core/rate_limit.py").body
                    if isinstance(item, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "DEFAULT_POLICIES" for target in item.targets))
    quote_limit = next(value for key, value in zip(policies.keys, policies.values)
                       if isinstance(key, ast.Attribute) and key.attr == "QUOTE_CREATE")
    return {"policy": "quote_create", "requests": requests,
            "window_seconds": ast.literal_eval(quote_limit.args[1]),
            "max_keys": ast.literal_eval(fields["rate_limit_max_keys"]), "trusted_proxy_ips": []}


def frozen_definitions(settings, clock):
    namespace = {"__name__": __name__, "Any": Any, "ABC": ABC, "abstractmethod": abstractmethod,
                 "OrderedDict": OrderedDict, "deque": deque, "dataclass": dataclass,
                 "StrEnum": StrEnum, "asyncio": asyncio, "ipaddress": ipaddress,
                 "Request": SimpleNamespace, "settings": SimpleNamespace(**settings),
                 "time": SimpleNamespace(monotonic=lambda: clock[0])}
    execute([definition("backend/app/core/errors.py", "AppError")], namespace)
    execute([definition("backend/app/core/rate_limit.py", name) for name in
             ["RateLimitPolicy", "RateLimit", "RateLimiter", "MemoryRateLimiter", "client_key"]], namespace)
    return namespace


def quote_routes():
    routes = []
    for name in ["create_quote", "create_legacy_quote"]:
        function = definition("backend/app/commerce/router.py", name)
        dependency = next(item for item in function.args.defaults
                          if isinstance(item, ast.Call) and isinstance(item.func, ast.Name)
                          and item.func.id == "Depends" and item.args and isinstance(item.args[0], ast.Call)
                          and isinstance(item.args[0].func, ast.Name) and item.args[0].func.id == "rate_limit")
        policy = dependency.args[0].args[0].attr
        if policy != "QUOTE_CREATE":
            raise RuntimeError(f"Unexpected quote policy: {name}: {policy}")
        routes.append({"function": name, "path_suffix": ast.literal_eval(function.decorator_list[0].args[0]),
                       "policy": "quote_create"})
    return routes


def request_attributes(vector):
    return SimpleNamespace(client=None if vector["peer"] is None else SimpleNamespace(host=vector["peer"]),
                           headers=vector.get("headers", {}))


def client_vectors():
    result = []
    for name, peer, headers in [
        ("plain-ipv4", "198.51.100.10", {}),
        ("untrusted-forwarded-for", "198.51.100.10", {"X-Forwarded-For": "203.0.113.9"}),
        ("untrusted-proxy-chain", "198.51.100.10", {"X-Forwarded-For": "203.0.113.9, 127.0.0.1"}),
        ("malformed-forwarded-for", "198.51.100.10", {"X-Forwarded-For": "not-an-ip, unknown"}),
        ("all-forwarding-headers", "198.51.100.10", {"X-Forwarded-For": "203.0.113.9", "X-Real-IP": "203.0.113.8", "Forwarded": "for=203.0.113.7", "CF-Connecting-IP": "203.0.113.6"}),
        ("loopback-is-untrusted", "127.0.0.1", {"X-Forwarded-For": "203.0.113.9"}),
        ("plain-ipv6", "2001:db8::1", {"X-Forwarded-For": "203.0.113.9"}),
        ("ipv4-mapped-peer-verbatim", "::ffff:198.51.100.10", {"X-Real-IP": "198.51.100.10"}),
        ("missing-peer", None, {"X-Forwarded-For": "203.0.113.9"}),
    ]:
        result.append({"id": name, "peer": peer, "headers": headers})
    return result


def vectors():
    def step(at, key="a", repeat=1, **extra):
        return {"at_seconds": at, "key": key, "repeat": repeat, **extra}

    return [
        {"id": "ten-attempts-and-exact-cutoff", "steps": [
            step(0, repeat=10), step(0, repeat=2), step(59.999), step(60, repeat=10), step(60)]},
        {"id": "sliding-window-not-fixed-window", "steps": [
            step(0), step(10, repeat=4), step(59, repeat=5), step(60, repeat=2),
            step(69.999), step(70, repeat=5), step(119, repeat=6)]},
        {"id": "denied-attempts-never-append", "steps": [
            step(0, repeat=10), step(30, repeat=7), step(59.5, repeat=3),
            step(60, repeat=10), step(60)]},
        {"id": "independent-keys", "steps": [
            step(0, "a", 10), step(0, "b", 10), step(0, "a"), step(0, "b"),
            step(0, "__proto__", 10), step(0, "__proto__"), step(0, "constructor")]},
        {"id": "accepted-access-refreshes-lru", "max_keys": 2, "steps": [
            step(0, "a", 9), step(0, "b", 10), step(1, "a"), step(2, "c"),
            step(3, "a"), step(4, "b")]},
        {"id": "denied-access-refreshes-lru", "max_keys": 2, "steps": [
            step(0, "a", 10), step(0, "b", 10), step(1, "a"), step(2, "c"),
            step(3, "a"), step(4, "b")]},
        {"id": "expired-key-keeps-lru-position-until-access", "max_keys": 2, "steps": [
            step(0, "a", 10), step(30, "b", 10), step(31, "a"), step(61, "c"),
            step(61, "b"), step(61, "a")]},
        {"id": "capacity-one-evicts-instead-of-rejecting-new-key", "max_keys": 1, "steps": [
            step(0, "a", 10), step(0, "a"), step(0, "b", 10), step(0, "b"), step(0, "a")]},
        {"id": "fractional-monotonic-seconds", "steps": [
            step(1000.125, repeat=10), step(1060.124), step(1060.125),
            step(1060.25, repeat=9), step(1120.125, repeat=2), step(1120.25, repeat=10)]},
        {"id": "application-instance-isolation", "steps": [
            step(0, repeat=10, instance="first"), step(0, instance="first"),
            step(0, repeat=10, instance="second"), step(0, instance="second"), step(0, instance="first")]},
        {"id": "peer-shared-across-users-tenants-and-idempotency-keys", "steps": [
            step(0, request={"peer": "198.51.100.10", "user": "user-a", "organization": "tenant-a", "idempotency_key": "same-key"}, repeat=5),
            step(0, request={"peer": "198.51.100.10", "user": "user-b", "organization": "tenant-b", "idempotency_key": "different-key"}, repeat=5),
            step(0, request={"peer": "198.51.100.10", "user": "user-c", "organization": "tenant-c", "idempotency_key": "third-key"}),
            step(0, request={"peer": "198.51.100.11", "user": "user-a", "organization": "tenant-a", "idempotency_key": "same-key"})]},
        {"id": "spoofing-forwarded-headers-cannot-open-a-bucket", "steps": [
            step(0, request={"peer": "198.51.100.10", "headers": {"X-Forwarded-For": "203.0.113.1"}}, repeat=10),
            step(0, request={"peer": "198.51.100.10", "headers": {"X-Forwarded-For": "203.0.113.2"}}),
            step(0, request={"peer": "198.51.100.10", "headers": {"X-Real-IP": "203.0.113.3", "Forwarded": "for=203.0.113.4"}}),
            step(0, request={"peer": "198.51.100.11", "headers": {"X-Forwarded-For": "203.0.113.1"}})]},
    ]


async def run_cases(classes, settings, clock):
    policy = classes["RateLimitPolicy"].QUOTE_CREATE
    cases = vectors()
    for case in cases:
        instances = {}
        previous = float("-inf")
        for step in case["steps"]:
            clock[0] = step["at_seconds"]
            if clock[0] < previous:
                raise RuntimeError(f"Non-monotonic reference vector: {case['id']}")
            previous = clock[0]
            instance = step.get("instance", "default")
            if instance not in instances:
                instances[instance] = classes["MemoryRateLimiter"](
                    {policy: classes["RateLimit"](settings["requests"], settings["window_seconds"])},
                    case.get("max_keys", settings["max_keys"]))
            limiter = instances[instance]
            key = classes["client_key"](request_attributes(step["request"])) if "request" in step else step["key"]
            step["expected_key"] = key
            outcomes = []
            for _ in range(step["repeat"]):
                try:
                    await limiter.check(policy, key)
                    outcomes.append({"accepted": True})
                except classes["AppError"] as error:
                    outcomes.append({"accepted": False, "error": {"code": error.code, "message": error.message,
                                     "status": error.status_code, "details": error.details}})
            # Batch counts avoid repeating an identical error envelope in the
            # fixture; all calls within a batch use the same key and instant.
            step["expected_accepted"] = sum(outcome["accepted"] for outcome in outcomes)
            step["expected_denied"] = len(outcomes) - step["expected_accepted"]
            if any(outcome["accepted"] for outcome in outcomes[step["expected_accepted"]:]):
                raise RuntimeError("A fixed-time batch accepted an attempt after a denial")
            for outcome in outcomes:
                if not outcome["accepted"] and outcome["error"] != {"code": "rate_limit_exceeded", "message": "Too many requests", "status": 429, "details": None}:
                    raise RuntimeError(f"Unexpected frozen denial: {outcome}")
    return cases


def generate():
    verify_sources()
    settings, clock = default_settings(), [0]
    classes = frozen_definitions(settings, clock)
    client_keys = client_vectors()
    for case in client_keys:
        case["expected"] = classes["client_key"](request_attributes(case))
    error = classes["AppError"]("rate_limit_exceeded", "Too many requests", 429)
    cases = asyncio.run(run_cases(classes, settings, clock))
    if any(name == "app" or name.startswith("app.") or name == "sqlalchemy" or name.startswith("sqlalchemy.")
           or name == "fastapi" or name.startswith("fastapi.") for name in sys.modules):
        raise RuntimeError("Reference generation unexpectedly imported an app, database, or FastAPI module")
    return {
        "evidence": "quote limiter/client-key/error AST reference; not full legacy endpoint execution",
        "source_revision": SOURCE_REVISION, "source_sha256": SOURCE_HASHES,
        "python_requirement": ">=3.12", "runtime_dependencies": "Python standard library only",
        "settings": settings, "quote_policy_routes": quote_routes(),
        "denial": {"code": error.code, "message": error.message, "status": error.status_code, "details": error.details},
        "limits": [
            "Only frozen RateLimitPolicy, RateLimit, RateLimiter, MemoryRateLimiter, client_key, and AppError AST definitions execute.",
            "No legacy app, HTTP endpoint, authentication, permission, settings loader, middleware, database, or dependency injection executes.",
            "Client-key vectors use request attribute stand-ins and the frozen default empty trusted_proxy_ips; configured trusted-proxy parity is not claimed.",
            "Quote route declarations establish shared policy only; the generic Node quote-create route remains unregistered.",
            "Injected monotonic seconds and small capacities are isolated test scaffolding; actual application defaults remain 10 requests, 60 seconds, and 10000 keys.",
            "In-memory limits are per application process; eviction can discard an active bucket and this is not distributed protection.",
        ],
        "client_key_cases": client_keys, "cases": cases,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the committed fixture without changing it")
    args = parser.parse_args()
    data = json.dumps(generate(), ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.check:
        if FIXTURE.read_text() != data:
            raise SystemExit("Quote-limit reference fixture differs; regenerate and review")
        print("Quote-limit reference fixture matches frozen sources and standard-library execution")
    else:
        FIXTURE.write_text(data)
        print(f"Wrote {FIXTURE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
