#!/usr/bin/env python3
"""Regenerate query-reference evidence without importing the app or a database.

Run with the exact frozen backend/uv.lock packages and Python >=3.12:
    python backend-node/tests/reference/generate_legacy_query.py [--check]

This executes genuine FastAPI/Starlette HTTP query extraction and Pydantic
coercion using the frozen PageParams AST and route scalar declarations. It does
not execute legacy endpoint bodies, authentication, SQLAlchemy, SQL, or DTOs.
"""

import argparse
import ast
import copy
import hashlib
import importlib.metadata
import json
import pathlib
import sys
import tomllib
import uuid
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


ROOT = pathlib.Path(__file__).resolve().parents[3]
FIXTURE = pathlib.Path(__file__).with_name("legacy-query.json")
VERSIONS = {
    "fastapi": "0.141.1", "starlette": "1.6.0", "pydantic": "2.13.4",
    "pydantic-core": "2.46.4", "httpx": "0.28.1",
}
SOURCE_HASHES = {
    "backend/app/core/pagination.py": "f85f96ebd448176bd0e9b214f0145ef2c5153c6735af61d33ec8a94cecb5c8a1",
    "backend/app/core/config.py": "9a04a04b490af73a7309b0d62966dfe4a409942f2a02ed4027b2e2c8c0e1fc14",
    "backend/app/core/errors.py": "31679dcc464399df31fad605749cbabd86d31b6d51a069e9250e9f57a93a890d",
    "backend/app/catalog/router.py": "1cab3bbacc46dd77bde04c1035d573f2ed62f182239434280811b1bcf8568aeb",
    "backend/app/commerce/router.py": "5bec87d8dc0bea983c188f6e22f2d6830cf35d6148289ed648230f0e974d0e5b",
    "backend/app/core/redaction.py": "e96fdee9b954b494dff43dd859bb7fe686de52354ad66848576fb08fc2b773f3",
    "backend/uv.lock": "80d93e2751be39e87ef0480761caa00369657f022bab5db4c51edeae36e7935e",
}


def verify_sources_and_versions():
    if sys.version_info < (3, 12):
        raise RuntimeError("Python >=3.12 is required to parse the unchanged frozen AST")
    for path, expected in SOURCE_HASHES.items():
        actual = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Frozen source drift: {path}: {actual} != {expected}")
    locked = {item["name"]: item["version"] for item in tomllib.loads((ROOT / "backend/uv.lock").read_text())["package"]}
    for package, expected in VERSIONS.items():
        actual = importlib.metadata.version(package)
        if actual != expected or locked[package] != expected:
            raise RuntimeError(f"Pinned runtime mismatch: {package}: installed={actual}, lock={locked[package]}, expected={expected}")


def source_ast(path):
    return ast.parse((ROOT / path).read_text(), filename=path)


def definition(path, name):
    return copy.deepcopy(next(item for item in source_ast(path).body if getattr(item, "name", None) == name))


def execute(nodes, namespace):
    module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))
    exec(compile(module, "<frozen-query-reference>", "exec", dont_inherit=True), namespace)


def reference_app():
    config = definition("backend/app/core/config.py", "Settings")
    settings = {item.target.id: ast.literal_eval(item.value) for item in config.body
                if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name)
                and item.target.id in {"default_page_size", "max_page_size"}}
    namespace = {"Query": Query, "Depends": Depends, "uuid": uuid,
                 "get_settings": lambda: SimpleNamespace(**settings),
                 "Any": Any, "Request": Request, "RequestValidationError": RequestValidationError}
    execute([definition("backend/app/core/pagination.py", "PageParams")], namespace)
    # Execute frozen redaction and error-detail handling, without importing the
    # full app (and thus without importing unavailable SQLAlchemy or structlog).
    redaction = source_ast("backend/app/core/redaction.py")
    execute([item for item in redaction.body if not isinstance(item, (ast.Import, ast.ImportFrom))], namespace)
    execute([definition("backend/app/core/errors.py", "safe_validation_errors"),
             definition("backend/app/core/errors.py", "error_payload")], namespace)
    app = FastAPI()

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse(status_code=422, content=namespace["error_payload"](
            request, "validation_error", "Invalid request", namespace["safe_validation_errors"](error)))

    for name, source, original, fields in [
        ("pagination", "backend/app/commerce/router.py", "list_quotes", {"page"}),
        ("filters", "backend/app/catalog/router.py", "filters", {"category_id", "page"}),
        ("quotes", "backend/app/commerce/router.py", "list_quotes", {"mine", "page"}),
    ]:
        endpoint = definition(source, original)
        args = endpoint.args.args
        defaults = {arg.arg: default for arg, default in zip(args[-len(endpoint.args.defaults):], endpoint.args.defaults)}
        endpoint.args.args = [arg for arg in args if arg.arg in fields]
        endpoint.args.defaults = [defaults[arg.arg] for arg in endpoint.args.args if arg.arg in defaults]
        endpoint.name = name
        endpoint.decorator_list = []
        endpoint.returns = None
        scalar = {"filters": "'category_id': str(category_id),", "quotes": "'mine': mine,", "pagination": ""}[name]
        endpoint.body = ast.parse("return {" + scalar + "'page': page.page, 'page_size': page.page_size, 'offset': str(page.offset)}").body
        execute([endpoint], namespace)
        app.get("/" + name)(namespace[name])
    return app, settings


def vectors():
    category = "40000000-0000-4000-8000-00000000000a"
    result = []

    def add(name, endpoint, query=""):
        result.append({"id": name, "endpoint": endpoint, "query": query})

    def scalar(name, endpoint, field, value):
        query = urlencode({field: value})
        if endpoint == "filters" and field != "category_id":
            query = urlencode({"category_id": category}) + "&" + query
        add(name, endpoint, query)

    add("quotes-default", "quotes")
    add("pagination-default", "pagination")
    scalar("filters-default", "filters", "category_id", category)
    for field in ["page", "page_size"]:
        for label, raw in [
            ("one", "1"), ("twenty", "20"), ("hundred", "100"), ("clamp", "101"),
            ("leading-zero", "01"), ("plus", "+01"), ("decimal", "1.00"), ("underscore", "1_000"),
            ("leading-underscores", "0__1"), ("leading-zero-underscores", "0_0__1"),
            ("signed-leading-underscores", "+0__1.0"), ("space", " 1 "), ("control-space", "\t1\r\n"),
            ("unicode-space", "\u20031\u0085"), ("unsafe-integer", "9007199254740993"),
            ("postgres-offset-overflow", "9223372036854775808"), ("huge", "9" * 40),
            ("many-leading-zeros", "0" * 4400 + "1"), ("many-fractional-zeros", "1." + "0" * 4400),
            ("zero", "0"), ("negative", "-1"), ("blank", ""), ("fraction", "1.5"),
            ("scientific", "1e1"), ("bom", "\ufeff1"), ("bad-underscore", "1__0"),
            ("bad-decimal-underscore", "1_.0"), ("fractional-underscore", "1.0_0"),
            ("decimal-point", "1."), ("word", "one"), ("unicode-digit", "١"),
            ("infinite", "Infinity"), ("hex", "0x10"), ("size-limit", "1" * 4301),
            ("size-limit-signed", "+" + "1" * 4301), ("size-limit-spaced", " " + "1" * 4301),
        ]:
            scalar(f"{field}-{label}", "pagination", field, raw)
    for raw in ["0", "off", "f", "false", "n", "no", "1", "on", "t", "true", "y", "yes"]:
        for variant in [raw, raw.upper(), raw.title()]:
            scalar(f"mine-alias-{len(result)}", "quotes", "mine", variant)
    for label, raw in [("blank", ""), ("null", "null"), ("undefined", "undefined"), ("two", "2"),
                       ("zero-one", "01"), ("decimal", "1.0"), ("array-text", "[]"),
                       ("leading-space", " true"), ("trailing-space", "true "), ("newline", "true\n"),
                       ("nul", "true\x00"), ("unicode-space", "\u2003true"), ("mixed", "TrUe"),
                       ("long-s", "yeſ")]:
        scalar("mine-" + label, "quotes", "mine", raw)
    for label, raw in [
        ("uppercase", category.upper()), ("simple", category.replace("-", "")), ("braced", "{" + category + "}"),
        ("urn", "urn:uuid:" + category), ("nil", "00000000-0000-0000-0000-000000000000"),
        ("non-v4", "40000000-0000-1000-7000-00000000000a"),
        ("all-hex-bits", "ffffffff-ffff-ffff-ffff-ffffffffffff"),
        ("blank", ""), ("word", "power"), ("public-key", "category-transformers"), ("malformed", "x"),
        ("leading-space", " " + category), ("trailing-space", category + " "), ("uppercase-urn", "URN:UUID:" + category),
        ("braced-simple", "{" + category.replace("-", "") + "}"), ("urn-simple", "urn:uuid:" + category.replace("-", "")),
        ("nested-wrappers", "urn:uuid:{" + category + "}"), ("short-simple", "0" * 31), ("long-simple", "0" * 33),
        ("short-last", category[:-1]), ("long-last", category + "0"), ("bad-last", category[:-1] + "z"),
        ("bad-braced-last", "{" + category[:-1] + "z}"), ("bad-urn-last", "urn:uuid:" + category[:-1] + "z"),
        ("group-length", "400000000-000-4000-8000-00000000000a"), ("group-count", "a-b"),
        ("five-groups", "a-b-c-d-e"), ("unicode", "😀"), ("unicode-last", category[:-1] + "😀"),
        ("short-brace-bad", "{x}"), ("short-urn-bad", "urn:uuid:x"), ("brace-only", "{"), ("nul", "\x00"),
    ]:
        scalar("category-" + label, "filters", "category_id", raw)
    for name, endpoint, query in [
        ("missing-category", "filters", ""), ("all-invalid-filters", "filters", "category_id=x&page=zero&page_size=0"),
        ("all-invalid-quotes", "quotes", "mine=bad&page=zero&page_size=0"),
        ("missing-category-invalid-page", "filters", "page=0&page_size=bad"),
        ("page-duplicate", "pagination", "page=bad&page=2&page_size=0&page_size=3"),
        ("page-brackets", "pagination", "page[]=2&page[0]=3&page[x]=4&page_size[]=2"),
        ("page-exact-plus-brackets", "pagination", "page=2&page[]=9&page_size[x]=3&page_size=4"),
        ("many-keys-pagination", "pagination", "ignored=x&" * 1100 + "page=3&page_size=2"),
        ("mine-last-true", "quotes", "mine=false&mine=true"), ("mine-last-false", "quotes", "mine=true&mine=false"),
        ("mine-last-invalid", "quotes", "mine=true&mine=bad"), ("mine-last-blank", "quotes", "mine=false&mine="),
        ("mine-bare", "quotes", "mine"), ("mine-plus", "quotes", "mine=+true"),
        ("mine-brackets", "quotes", "mine[]=true&mine[0]=true&mine[x]=true"),
        ("mine-exact-plus-brackets", "quotes", "mine=true&mine[]=false&mine[x]=false"),
        ("mine-encoded-brackets", "quotes", "mine%5B%5D=true"),
        ("decoded-keys", "quotes", "m%69ne=TrUe&p%61ge=2&page_size=%2B01"),
        ("unknown-keys", "quotes", "organization_id=peer&created_by_id=peer&role=admin&mine=true"),
        ("many-keys-quotes", "quotes", "ignored=x&" * 1100 + "mine=true&page=3&page_size=2"),
        ("many-keys-filters", "filters", "ignored=x&" * 1100 + "category_id=" + category + "&page=2"),
        ("category-duplicate", "filters", "category_id=bad&category_id=" + category),
        ("category-last-invalid", "filters", "category_id=" + category + "&category_id=bad"),
        ("category-brackets", "filters", "category_id[]=" + category),
        ("category-exact-plus-brackets", "filters", "category_id=" + category + "&category_id[x]=bad"),
        ("invalid-percent", "quotes", "mine=%FF"), ("encoded-space-page", "pagination", "page=+1+"),
    ]:
        add(name, endpoint, query)
    return result


def generate():
    verify_sources_and_versions()
    app, settings = reference_app()
    cases = vectors()
    with TestClient(app) as client:
        for case in cases:
            response = client.get("/" + case["endpoint"] + "?" + case["query"])
            case["expected"] = {"status": response.status_code, "body": response.json()}
            if response.status_code not in {200, 422}:
                raise RuntimeError(f"Unexpected reference response: {case['id']}: {response.text}")
    return {"evidence": "query-reference; not full legacy endpoint execution",
            "source_revision": "2c762db62fd779595a3d78e336f7911f10953783",
            "source_sha256": SOURCE_HASHES, "runtime_versions": VERSIONS,
            "python_requirement": ">=3.12", "settings": settings,
            "http_targets": [
                {"method": "GET", "path": "/catalog/categories", "contracts": ["pagination"]},
                {"method": "GET", "path": "/catalog/products", "contracts": ["pagination"]},
                {"method": "GET", "path": "/catalog/filters", "contracts": ["pagination", "filters"],
                 "pagination_base_query": "category_id=40000000-0000-4000-8000-00000000000a"},
                {"method": "GET", "path": "/admin/catalog/categories", "contracts": ["pagination"]},
                {"method": "GET", "path": "/admin/catalog/products", "contracts": ["pagination"]},
                {"method": "GET", "path": "/organizations", "contracts": ["pagination"]},
                {"method": "GET", "path": "/quotes", "contracts": ["pagination", "quotes"]},
            ],
            "measured_corrections": ["During extraction, the previous support helper's oversize integer diagnostic was corrected to inspect the raw string before whitespace trimming; both page and page_size leading-space 4301-digit regressions are retained."],
            "limits": ["Only frozen query declarations, PageParams, and validation/redaction functions execute.",
                       "Endpoint bodies, authentication, database offsets, response DTOs, and deployment-specific settings are not exercised.",
                       "Successful bodies expose parsed query values and a decimal-string offset for comparison, not endpoint response payloads.",
                       "Pages beyond the PostgreSQL offset limit establish coercion only; database behavior remains outside this evidence."],
            "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the committed fixture without changing it")
    args = parser.parse_args()
    data = json.dumps(generate(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if FIXTURE.read_text() != data:
            raise SystemExit("Query-reference fixture differs; regenerate and review")
        print("Query-reference fixture matches frozen sources and pinned runtime")
    else:
        FIXTURE.write_text(data)
        print(f"Wrote {FIXTURE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
