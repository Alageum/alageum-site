#!/usr/bin/env python3
"""Dependency-free smoke test for the deterministic Compose demo."""

import json
import urllib.error
import urllib.request

API = "http://localhost:8000/api/v1"


def request(path, *, method="GET", payload=None, headers=None, expected=200):
    body = json.dumps(payload).encode() if payload is not None else None
    values = {"Content-Type": "application/json", **(headers or {})}
    try:
        with urllib.request.urlopen(
            urllib.request.Request(API + path, data=body, method=method, headers=values),
            timeout=10,
        ) as response:
            status = response.status
            content = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        content = error.read()
    if status != expected:
        raise RuntimeError(f"{method} {path}: expected {expected}, got {status}: {content[:300]!r}")
    return json.loads(content) if content else None


def main() -> None:
    checks = 0
    request("/health"); checks += 1
    request("/readiness"); checks += 1
    pair = request(
        "/auth/login",
        method="POST",
        payload={"email": "admin@demo.example", "password": "ChangeMe123!"},
    ); checks += 1
    request("/auth/refresh", method="POST", payload={"refresh_token": pair["refresh_token"]}); checks += 1
    bearer = {"Authorization": f"Bearer {pair['access_token']}"}
    organizations = request("/organizations", headers=bearer); checks += 1
    organization_id = organizations["items"][0]["organization_id"]
    authorized = {**bearer, "X-Organization-ID": organization_id}
    request("/auth/me", headers=authorized); checks += 1
    request("/catalog/products", headers=authorized); checks += 1
    orders = request("/orders", headers=authorized); checks += 1
    documents = request("/documents", headers=authorized); checks += 1
    request("/finance/invoices", headers=authorized); checks += 1
    request("/quotes", headers=authorized); checks += 1
    categories = request("/support/categories", headers=authorized); checks += 1
    request("/support/tickets", headers=authorized); checks += 1
    request("/integrations/status", headers=authorized); checks += 1
    conversation = request(
        "/ai/chat", method="POST", headers=authorized, payload={"message": "DEV smoke"}
    ); checks += 1
    request(
        "/ai/tools/execute",
        method="POST",
        headers=authorized,
        payload={
            "conversation_id": conversation["conversation_id"],
            "tool": "get_order",
            "arguments": {"order_id": orders["items"][0]["id"]},
        },
    ); checks += 1
    write_payload = {
        "conversation_id": conversation["conversation_id"],
        "tool": "create_ticket",
        "arguments": {
            "category_id": categories["items"][0]["id"],
            "subject": "DEV smoke ticket",
            "message": "Deterministic technical smoke",
        },
    }
    denied = request(
        "/ai/tools/execute", method="POST", headers=authorized, payload=write_payload, expected=409
    ); checks += 1
    confirmation_id = denied["error"]["details"]["confirmation_id"]
    request(f"/ai/tools/confirm/{confirmation_id}", method="POST", headers=authorized); checks += 1
    request(
        "/ai/tools/execute",
        method="POST",
        headers=authorized,
        payload={**write_payload, "confirmation_id": confirmation_id},
    ); checks += 1
    request("/version"); checks += 1
    with urllib.request.urlopen("http://localhost:8000/api/openapi.json", timeout=10) as response:
        if response.status != 200:
            raise RuntimeError("OpenAPI unavailable")
    checks += 1
    with urllib.request.urlopen("http://localhost:3000", timeout=10) as response:
        if response.status != 200:
            raise RuntimeError("Frontend unavailable")
    checks += 1
    if not documents["items"]:
        raise RuntimeError("Seeded documents missing")
    print(json.dumps({"smoke": "passed", "checks": checks}))


if __name__ == "__main__":
    main()
