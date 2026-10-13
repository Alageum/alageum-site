"""Finite actual legacy application reference; launched only by its private-cluster runner.

No dependency overrides, auth/session/route stubs, limiter mutations, retries, or fake time.
ASGITransport's explicit synthetic socket peers isolate cases without changing the app.
"""

# Identity guards must run before importing application settings.
# ruff: noqa: E402

import asyncio
import json
import os
import secrets
import signal
import sys
import tempfile
import time
import uuid
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

# The parent defers these signals across spawn until it owns this process handle.
# Restore default delivery before any database/app work; cleanup never relies on our finally.
signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGINT, signal.SIGTERM})

OWNED_ROOT = Path(os.environ["REFERENCE_OWNED_ROOT"]).resolve()
if (OWNED_ROOT.parent != Path(tempfile.gettempdir())
        or not OWNED_ROOT.name.startswith("generic-quote-owned-")
        or Path(sys.argv[1]).resolve() != OWNED_ROOT / "cases.json"):
    raise RuntimeError("Case runner requires a newly owned fixture directory")
ownership = json.loads((OWNED_ROOT / "ownership.json").read_text())
if (ownership != {"nonce": os.environ["REFERENCE_OWNERSHIP_NONCE"],
                  "database": "generic_quote_reference_test", "port": 39203}
        or not (OWNED_ROOT / "data" / "postmaster.pid").is_file()):
    raise RuntimeError("Case runner ownership attestation failed")
for key, username in (("APP_DATABASE_URL", "reference_app"),
                      ("REFERENCE_OWNER_URL", "reference_owner")):
    selected = urlsplit(os.environ[key])
    if (selected.scheme != "postgresql+asyncpg" or selected.hostname != "127.0.0.1"
            or selected.port != 39203 or selected.username != username
            or selected.path != "/generic_quote_reference_test" or selected.query):
        raise RuntimeError("Case runner refuses non-fixture connection configuration")

from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.audit.models import AuditEvent
from app.auth.security import hash_password
from app.catalog.models import Category, Product
from app.commerce.models import QuoteRequest, QuoteRequestItem
from app.core.database import engine
from app.core.rate_limit import DEFAULT_POLICIES, RateLimitPolicy
from app.identity.models import Membership, Organization, Permission, RefreshSession, Role, User
from app.main import app

REPORT = {
    "status": "failed",
    "transport": "actual in-process ASGI + real auth/session/SQLAlchemy + loopback PostgreSQL",
    "limitations": [
        "ASGI peers are explicit transport fixture identities, not physical network clients",
        "No deployed HTTP listener, proxy/TLS, compressed/chunked network behavior, or real data",
        "Finite representative corpus; no exhaustive Decimal/Unicode/security claim",
        "Natural rate-limit expiry is measured without patching clocks or clearing buckets",
    ],
    "requests": [],
    "checks": [],
}
OWNER_ENGINE = create_async_engine(os.environ.pop("REFERENCE_OWNER_URL"))
OWNER_SESSION = async_sessionmaker(OWNER_ENGINE, expire_on_commit=False)
SQL_ERRORS = []
REQUESTS = 0
QUOTE_REQUESTS = 0


def checkpoint():
    REPORT["quote_endpoint_requests"] = QUOTE_REQUESTS
    REPORT["recorded_requests"] = REQUESTS
    destination = Path(sys.argv[1])
    temporary = destination.with_suffix(".partial")
    temporary.write_text(json.dumps(REPORT, indent=2, sort_keys=True, ensure_ascii=True) + "\n")
    temporary.replace(destination)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def handle_sql_error(context):
    original = context.original_exception
    # asyncpg's adapter copies SQLSTATE; the driver cause carries constraint metadata.
    # Retain only known synthetic/schema identifiers, never exception text or parameters.
    constraint = None
    cause = original
    for _ in range(4):
        candidate = getattr(cause, "constraint_name", None)
        if candidate in {"reference_audit_rejection",
                         "ck_quote_request_items_quantity_positive",
                         "fk_quote_request_items_product_id_catalog_products"}:
            constraint = candidate
            break
        cause = getattr(cause, "__cause__", None)
        if cause is None:
            break
    SQL_ERRORS.append({"exception_type": type(original).__name__,
                       "sqlstate": getattr(original, "sqlstate", None)
                       or getattr(original, "pgcode", None), "constraint": constraint})


event.listen(engine.sync_engine, "handle_error", handle_sql_error)


async def seed():
    password = secrets.token_urlsafe(30)
    password_hash = hash_password(password)
    async with OWNER_SESSION() as session:
        permissions = [Permission(code="quote.create"), Permission(code="quote.read")]
        org_a = Organization(name="Synthetic quote organization A")
        org_b = Organization(name="Synthetic quote organization B")
        session.add_all([*permissions, org_a, org_b])
        await session.flush()
        role_a = Role(code="quote_fixture_a", name="Quote fixture A", organization_id=org_a.id,
                      permissions=permissions)
        role_b = Role(code="quote_fixture_b", name="Quote fixture B", organization_id=org_b.id,
                      permissions=permissions)
        empty_role = Role(code="quote_fixture_empty", name="No quote permissions",
                          organization_id=org_a.id, permissions=[])
        session.add_all([role_a, role_b, empty_role])
        await session.flush()
        users = {}
        memberships = {}
        for name, org, role in [("owner", org_a, role_a), ("peer", org_a, role_a),
                                ("foreign", org_b, role_b), ("denied", org_a, empty_role)]:
            user = User(email=f"quote-{name}@example.test", display_name=f"Synthetic {name}",
                        password_hash=password_hash)
            session.add(user)
            await session.flush()
            member = Membership(user_id=user.id, organization_id=org.id, role_id=role.id)
            session.add(member)
            users[name] = user
            memberships[name] = member
        category = Category(slug="reference-public", public_key="reference-public",
                            is_published=True)
        hidden_category = Category(slug="reference-hidden", public_key="reference-hidden",
                                   is_published=False)
        session.add_all([category, hidden_category])
        await session.flush()
        products = {}
        for name, status, selected in [("published", "published", category),
                                        ("hidden", "hidden", category),
                                        ("draft", "draft", category),
                                        ("hidden_category", "published", hidden_category)]:
            product = Product(slug=f"reference-{name}", public_key=f"reference-{name}",
                              status=status, category_id=selected.id, price_mode="on_request",
                              translations={"en": {"name": f"Synthetic {name}"}})
            products[name] = product
            session.add(product)
        await session.commit()
    return {"password": password, "users": users, "memberships": memberships,
            "org_a": org_a, "org_b": org_b, "role_a": role_a, "products": products}


def client(peer):
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False,
                                               client=(peer, 45000)),
                       base_url="http://legacy-reference.invalid")


async def counts():
    async with OWNER_SESSION() as session:
        return [await session.scalar(select(func.count()).select_from(model))
                for model in (QuoteRequest, QuoteRequestItem)] + [
                    await session.scalar(select(func.count()).select_from(AuditEvent)
                                         .where(AuditEvent.action == "quote.create"))]


async def request(name, *, body=None, raw=None, headers=None, path="/api/v1/quotes",
                  method="POST", peer=None, status=201, code=None, media="application/json",
                  sqlstate=None, constraint=None):
    global REQUESTS, QUOTE_REQUESTS
    REQUESTS += 1
    if path.startswith("/api/v1/quotes"):
        QUOTE_REQUESTS += 1
    require(QUOTE_REQUESTS <= 100, "Exceeded the 100 quote endpoint request budget")
    peer = peer or f"127.0.0.{REQUESTS + 1}"
    request_id = f"reference-{REQUESTS:03d}-{name}"
    values = {**(headers or {}), "X-Request-ID": request_id}
    if media is not None:
        values["Content-Type"] = media
    before = await counts()
    error_start = len(SQL_ERRORS)
    async with client(peer) as connection:
        if raw is not None:
            response = await connection.request(method, path, headers=values, content=raw)
        elif method == "POST":
            response = await connection.request(method, path, headers=values, json=body)
        else:
            response = await connection.request(method, path, headers=values)
    after = await counts()
    result = response.json()
    record = {"name": name, "method": method, "route": path.split("?")[0],
              "peer": peer, "request_id": request_id, "status": response.status_code,
              "expected_status": status, "counts_before": before, "counts_after": after,
              "sql_errors": SQL_ERRORS[error_start:],
              "response_headers": {key: response.headers[key] for key in
                                   ("content-type", "x-request-id", "cache-control", "location")
                                   if key in response.headers}}
    if sqlstate is not None:
        record["expected_sqlstate"] = sqlstate
    if constraint is not None:
        record["expected_constraint"] = constraint
    if "error" in result:
        err = result["error"]
        record["error"] = {key: err.get(key) for key in ("code", "message", "request_id")}
        if isinstance(err.get("details"), list):
            record["validation"] = [{"type": item.get("type"), "loc": item.get("loc")}
                                    for item in err["details"]]
    elif isinstance(result, dict) and "id" in result:
        record["result"] = {key: result[key] for key in
                            ("id", "status", "item_count") if key in result}
    REPORT["requests"].append(record)
    checkpoint()
    require(response.status_code == status, f"{name}: unexpected response status")
    if code:
        require(result.get("error", {}).get("code") == code, f"{name}: unexpected error code")
        require(result["error"]["request_id"] == request_id, f"{name}: missing error request ID")
        if status == 500:
            require(result["error"]["message"] == "Internal server error",
                    f"{name}: unexpected internal error message")
        if status == 422 and code == "validation_error":
            require(result["error"]["message"] == "Invalid request",
                    f"{name}: unexpected validation error message")
    if status >= 400:
        require(before == after, f"{name}: failure persisted quote/items/audit")
    if sqlstate is not None:
        require(record["sql_errors"]
                and all(error["sqlstate"] == sqlstate for error in record["sql_errors"]),
                f"{name}: intended database SQLSTATE was not observed")
    if constraint is not None:
        require(record["sql_errors"]
                and all(error["constraint"] == constraint for error in record["sql_errors"]),
                f"{name}: intended database constraint was not observed")
    return result, record, response


async def login(data):
    headers = {}
    # Actual password login creates real refresh sessions. Token values are never reported.
    for name, user in data["users"].items():
        async with client("127.0.0.240") as connection:
            response = await connection.post("/api/v1/auth/login", json={
                "email": user.email, "password": data["password"]})
        require(response.status_code == 200, "Real fixture login failed")
        token = response.json()["access_token"]
        org = data["org_b"] if name == "foreign" else data["org_a"]
        headers[name] = {"Authorization": f"Bearer {token}", "X-Organization-ID": str(org.id)}
    async with OWNER_SESSION() as session:
        require(await session.scalar(select(func.count()).select_from(RefreshSession)) == 4,
                "Actual login did not persist four refresh sessions")
    REPORT["checks"].append({"name": "real_password_login", "logins": 4,
                             "refresh_sessions": 4, "tokens_retained": False})
    return headers


def body(quantity="1", **item):
    return {"items": [{"quantity": quantity, **item}]}


def integer_decode_rejections():
    # Keep every over-limit token in raw bytes: JSON decoding must see even a
    # duplicate value that would otherwise be overwritten before DTO validation.
    digits = b"9" * 4301
    return [
        ("quantity", b'{"items":[{"quantity":' + digits + b'}]}'),
        ("quantity-overwritten", b'{"items":[{"quantity":' + digits
         + b',"quantity":"1"}]}'),
        ("parameter", b'{"items":[{"quantity":"1","parameters":{"nested":{"integer":'
         + digits + b'}}}]}'),
        ("parameter-overwritten",
         b'{"items":[{"quantity":"1","parameters":{"nested":{"integer":'
         + digits + b',"integer":1}}}]}'),
    ]


async def integer_decode_rejection(name, raw, **common):
    # Frozen Starlette json.loads raises ValueError, not JSONDecodeError. FastAPI
    # converts it to HTTP 400 before solve_dependencies (including quota/auth).
    result, record, response = await request(name, raw=raw, status=400,
                                             code="http_error", **common)
    expected_error = {"code": "http_error", "message": "There was an error parsing the body",
                      "details": None, "request_id": record["request_id"]}
    record["expected_error"] = expected_error
    checkpoint()
    require(result == {"error": expected_error}, f"{name}: integer decode envelope differs")
    require(response.headers.get("x-request-id") == record["request_id"],
            f"{name}: integer decode response request ID differs")
    require(not record["sql_errors"], f"{name}: integer decode unexpectedly reached a SQL fault")


def item_signature(product, quantity, parameters):
    return str(product) if product is not None else None, str(Decimal(quantity)), parameters


async def success(name, data, headers, payload=None, raw=None, expected=None, comment=None,
                  peer=None, media="application/json", check_detail=False):
    result, record, response = await request(name, body=payload, raw=raw, headers=headers,
                                             peer=peer, media=media)
    require(set(result) == {"id", "status", "comment", "item_count", "created_at"},
            f"{name}: generic summary allowlist changed")
    require(result["status"] == "submitted" and result["comment"] == comment,
            f"{name}: generic summary values changed")
    require("location" not in response.headers and "cache-control" not in response.headers,
            f"{name}: generic route headers changed")
    require(datetime.fromisoformat(result["created_at"]).utcoffset().total_seconds() == 0,
            f"{name}: creation time is not UTC")
    quote_id = uuid.UUID(result["id"])
    async with OWNER_SESSION() as session:
        quote = await session.get(QuoteRequest, quote_id)
        require(quote is not None, f"{name}: parent not committed")
        require(quote.organization_id == uuid.UUID(headers["X-Organization-ID"]),
                f"{name}: wrong tenant")
        actor = "foreign" if quote.organization_id == data["org_b"].id else "owner"
        require(quote.created_by_id == data["users"][actor].id, f"{name}: wrong actor")
        require(quote.comment == comment and quote.status == "submitted",
                f"{name}: wrong stored parent values")
        require(quote.idempotency_key is None and quote.request_hash is None
                and quote.external_id is None, f"{name}: generic metadata not null")
        rows = quote.items
        require(len(rows) == result["item_count"], f"{name}: item count differs")
        require(all(row.position == 0 and row.product_snapshot == {} for row in rows),
                f"{name}: generic defaults changed")
        require([row.id for row in rows] == sorted(row.id for row in rows),
                f"{name}: actual reload ordering is not (position,id)")
        actual = [item_signature(row.product_id, row.quantity, row.parameters) for row in rows]
        if expected is not None:
            def normalize(values):
                return Counter(json.dumps(v, sort_keys=True) for v in values)

            require(normalize(actual) == normalize(expected), f"{name}: stored item values differ")
        audits = (await session.scalars(select(AuditEvent).where(
            AuditEvent.action == "quote.create", AuditEvent.entity_id == str(quote_id)))).all()
        require(len(audits) == 1, f"{name}: audit count differs")
        audit = audits[0]
        require(audit.event_metadata == {} and audit.entity_type == "quote"
                and audit.actor_user_id == quote.created_by_id
                and audit.organization_id == quote.organization_id
                and audit.request_id == record["request_id"]
                and audit.ip_address == record["peer"] and audit.source == "api",
                f"{name}: audit authority or metadata differs")
        require([record["counts_after"][i] - record["counts_before"][i] for i in range(3)]
                == [1, len(rows), 1], f"{name}: transaction delta differs")
        record["stored"] = {"items": actual, "all_positions_zero": True,
                            "snapshots_empty": True, "submission_metadata_null": True,
                            "empty_metadata_audits": 1,
                            "actor_matches_parent": True, "source": audit.source,
                            "ip_address": audit.ip_address}
    if check_detail:
        detail, _, _ = await request(f"{name}-detail", method="GET",
                                     path=f"/api/v1/quotes/{quote_id}", headers=headers, status=200)
        require(set(detail) == set(result) | {"items"}, f"{name}: detail allowlist differs")
        require(all(set(line) == {"id", "product_id", "quantity", "product_snapshot"}
                    for line in detail["items"]), f"{name}: parameters leaked to detail")
    return result


async def ordinary_cases(data, headers):
    h = headers["owner"]
    p = data["products"]
    product = str(p["published"].id)
    values = [
        {"quantity": "1.2345", "product_id": product,
         "parameters": {"size": "synthetic", "price": 999, "status": "untrusted"}},
        {"quantity": "2", "product_id": product},
        {"quantity": "3", "product_id": None, "parameters": {"nested": [True, None, {}]}},
        {"quantity": "4"},
    ]
    first = await success("nullable-repeated-products", data, h,
                          payload={"comment": "  Synthetic RFQ\n", "items": values},
                          comment="  Synthetic RFQ\n", check_detail=True,
                          expected=[item_signature(product, "1.235", values[0]["parameters"]),
                                    item_signature(product, "2.000", {}),
                                    item_signature(None, "3.000", values[2]["parameters"]),
                                    item_signature(None, "4.000", {})])
    for name in ("hidden", "draft", "hidden_category"):
        await success(f"existing-{name}", data, h, payload=body(product_id=str(p[name].id)),
                      expected=[item_signature(p[name].id, "1.000", {})])
    await success("global-product-from-other-tenant", data, headers["foreign"],
                  payload=body(product_id=product), expected=[item_signature(product, "1.000", {})])
    for name, value, stored in [("round-half", "0.0005", "0.001"),
                                ("upper-round-down", "999999999999999.9994", "999999999999999.999"),
                                ("unicode-decimal", "\u2003١_٢.٥\u2003", "12.500"),
                                ("decimal-exponent", "1e_2", "100.000")]:
        await success(name, data, h, payload=body(value),
                      expected=[item_signature(None, stored, {})])
    for name, value, sqlstate in [("rounded-zero", "0.0001", "23514"),
                                  ("boundary-carry-overflow", "999999999999999.9995", "22003"),
                                  ("overflow", "1000000000000000", "22003"),
                                  ("large-exponent", "1e100", "22003")]:
        await request(name, body=body(value), headers=h, status=500, code="internal_error",
                      sqlstate=sqlstate)
    await request("unknown-product", body=body(product_id=str(uuid.uuid4())), headers=h,
                  status=500, code="internal_error", sqlstate="23503")
    await request("middle-item-fk-rollback", body={"items": [
        {"quantity": "1", "product_id": product},
        {"quantity": "1", "product_id": str(uuid.uuid4())}, {"quantity": "1"}]},
        headers=h, status=500, code="internal_error", sqlstate="23503")
    await request("middle-item-quantity-rollback", body={"items": [
        {"quantity": "1"}, {"quantity": "0.0001"}, {"quantity": "1"}]},
        headers=h, status=500, code="internal_error", sqlstate="23514")
    raw = (b'{"items":[{"quantity":"1","parameters":{"integer":9007199254740993,'
           b'"fraction":9007199254740993.0,"exponent":9007199254740993e0,'
           b'"fractional":1.234567890123456789,"underflow":1e-1000,"negative_zero":-0.0}}]}')
    numbers = {"integer": 9007199254740993, "fraction": 9007199254740992.0,
               "exponent": 9007199254740992.0, "fractional": 1.2345678901234567,
               "underflow": 0.0, "negative_zero": 0.0}
    exact = await success("nested-json-number-decoding", data, h, raw=raw,
                          expected=[item_signature(None, "1.000", numbers)])
    async with OWNER_SESSION() as session:
        stored = (await session.execute(text(
            "SELECT parameters->>'integer', parameters->>'fraction', parameters->>'exponent' "
            "FROM quote_request_items WHERE quote_request_id=:id"),
            {"id": uuid.UUID(exact["id"])})).one()
        require(stored[0] == "9007199254740993" and Decimal(stored[1]) == 9007199254740992
                and Decimal(stored[2]) == 9007199254740992, "SQL JSONB numeric values differ")
        REPORT["checks"].append({"name": "jsonb-numeric-sql", "values": list(stored)})
    # Quantity tokens deliberately use a storage-safe magnitude while showing float decoding.
    await success("quantity-fraction-token", data, h,
                  raw=b'{"items":[{"quantity":1.234567890123456789}]}',
                  expected=[item_signature(None, "1.235", {})])
    await request("quantity-exact-large-integer-overflow",
                  raw=b'{"items":[{"quantity":9007199254740993}]}', headers=h,
                  status=500, code="internal_error", sqlstate="22003")
    for name, raw in [
        ("parameter-infinity", b'{"items":[{"quantity":"1","parameters":{"n":1e1000}}]}'),
        ("parameter-nan", b'{"items":[{"quantity":"1","parameters":{"n":NaN}}]}'),
        ("parameter-nul", b'{"items":[{"quantity":"1","parameters":{"s":"\\u0000"}}]}'),
        ("parameter-surrogate", b'{"items":[{"quantity":"1","parameters":{"s":"\\ud800"}}]}'),
        ("comment-nul", b'{"comment":"\\u0000","items":[{"quantity":"1"}]}'),
        ("comment-surrogate-handler", b'{"comment":"\\ud800","items":[{"quantity":"1"}]}'),
        ("quantity-nonfinite-handler", b'{"items":[{"quantity":Infinity}]}'),
    ]:
        await request(name, raw=raw, headers=h, status=500, code="internal_error")
    await success("unicode-4000-codepoints", data, h,
                  payload={"comment": "😀" * 4000, "items": [{"quantity": "1"}]},
                  comment="😀" * 4000, expected=[item_signature(None, "1.000", {})])
    for name, payload in [
        ("unicode-4001-codepoints", {"comment": "😀" * 4001, "items": [{"quantity": "1"}]}),
        ("unknown-root-key", {**body(), "status": "draft"}),
        ("unknown-item-key", body(product_snapshot={})),
        ("invalid-uuid", body(product_id="not-a-uuid")),
        ("null-parameters", body(parameters=None)),
        ("null-quantity", body(None)),
        ("zero-quantity", body("0")),
        ("nan-string-quantity", body("NaN")),
        ("empty-items", {"items": []}),
        ("101-items", {"items": [{"quantity": "1"}] * 101}),
    ]:
        await request(name, body=payload, headers=h, status=422, code="validation_error")
    await success("uuid-normalization", data, h,
                  payload=body(product_id="{" + product.upper() + "}"),
                  expected=[item_signature(product, "1.000", {})])
    await success("100-items", data, h, payload={"items": [{"quantity": "1"}] * 100},
                  expected=[item_signature(None, "1.000", {})] * 100)
    await success("prototype-like-parameter-is-data", data, h,
                  payload=body(parameters={"__proto__": {"synthetic": True}}),
                  expected=[item_signature(None, "1.000", {"__proto__": {"synthetic": True}})])
    await request("wrong-media-handler", raw=b'{"items":[{"quantity":"1"}]}', headers=h,
                  media="text/plain", status=500, code="internal_error")
    await request("absent-media-handler", raw=b'{"items":[{"quantity":"1"}]}', headers=h,
                  media=None, status=500, code="internal_error")
    await success("structured-json-media", data, h, raw=b'{"items":[{"quantity":"1"}]}',
                  media="application/vnd.synthetic+json",
                  expected=[item_signature(None, "1.000", {})])
    return first


async def integer_boundary_cases(data, headers):
    h = headers["owner"]
    started = QUOTE_REQUESTS
    digits = "9" * 4300
    raw_digits = digits.encode("ascii")
    # A 4,300-digit bare integer decodes and reaches Numeric(18,3); digit strings
    # at either length bypass the integer decoder and reach the same range error.
    await request("quantity-integer-4300-overflow",
                  raw=b'{"items":[{"quantity":' + raw_digits + b'}]}', headers=h,
                  status=500, code="internal_error", sqlstate="22003")
    for length in (4300, 4301):
        await request(f"quantity-digit-string-{length}-overflow", body=body("9" * length),
                      headers=h, status=500, code="internal_error", sqlstate="22003")
    integer_parameters = {"nested": {"integer": int(digits)}}
    exact = await success("nested-parameter-integer-4300", data, h,
                          raw=b'{"items":[{"quantity":"1","parameters":{"nested":{"integer":'
                          + raw_digits + b'}}}]}',
                          expected=[item_signature(None, "1.000", integer_parameters)])
    async with OWNER_SESSION() as session:
        stored = (await session.execute(text(
            "SELECT parameters #>> '{nested,integer}', "
            "jsonb_typeof(parameters #> '{nested,integer}') "
            "FROM quote_request_items WHERE quote_request_id=:id"),
            {"id": uuid.UUID(exact["id"])})).one()
        require(tuple(stored) == (digits, "number"), "SQL JSONB 4300-digit integer differs")
    string_parameters = {"nested": {f"digits{length}": "9" * length for length in (4300, 4301)}}
    strings = await success("nested-parameter-digit-strings-4300-4301", data, h,
                            payload=body(parameters=string_parameters),
                            expected=[item_signature(None, "1.000", string_parameters)])
    async with OWNER_SESSION() as session:
        stored = (await session.execute(text(
            "SELECT parameters #>> '{nested,digits4300}', "
            "jsonb_typeof(parameters #> '{nested,digits4300}'), "
            "parameters #>> '{nested,digits4301}', "
            "jsonb_typeof(parameters #> '{nested,digits4301}') "
            "FROM quote_request_items WHERE quote_request_id=:id"),
            {"id": uuid.UUID(strings["id"])})).one()
        require(tuple(stored) == (digits, "string", digits + "9", "string"),
                "SQL JSONB quoted-digit strings differ")
    await success("overwritten-integers-4300", data, h,
                  raw=b'{"items":[{"quantity":' + raw_digits
                  + b',"quantity":"1","parameters":{"nested":{"integer":' + raw_digits
                  + b',"integer":1}}}]}',
                  expected=[item_signature(None, "1.000", {"nested": {"integer": 1}})])
    require(QUOTE_REQUESTS - started == 6, "Independent integer boundary request count differs")
    REPORT["checks"].append({"name": "integer-boundary-controls", "quote_requests": 6,
                             "bare_quantity_digits": 4300,
                             "quoted_quantity_digits": [4300, 4301],
                             "quantity_failure_sqlstate": "22003",
                             "nested_integer_digits": 4300,
                             "nested_integer_sql_type": "number", "nested_integer_exact": True,
                             "nested_quoted_digits": [4300, 4301],
                             "nested_quoted_sql_type": "string", "nested_quoted_exact": True,
                             "overwritten_4300_quantity_and_parameter": True})


async def repetition_cases(data, headers):
    ids = []
    key = str(uuid.uuid4())
    for index, value in enumerate([key, key, "malformed", "malformed", None, None]):
        h = dict(headers["owner"])
        if value is not None:
            h["Idempotency-Key"] = value
        result = await success(f"ignored-idempotency-{index}", data, h, payload=body(),
                               expected=[item_signature(None, "1.000", {})])
        ids.append(result["id"])
    require(len(set(ids)) == 6, "Generic repeated submissions replayed an existing quote")
    REPORT["checks"].append({"name": "ignored-idempotency", "distinct_new_ids": ids})


async def authority_cases(data, headers, first):
    h = headers["owner"]
    for name, selected, status, code in [
        ("missing-auth", {}, 401, "authentication_required"),
        ("invalid-token", {**h, "Authorization": "Bearer synthetic-invalid-token"},
         401, "invalid_token"),
        ("foreign-tenant-selection", {**h, "X-Organization-ID": str(data["org_b"].id)},
         403, "organization_access_denied"),
        ("permission-denial", headers["denied"], 403, "permission_denied"),
    ]:
        await request(name, body=body(), headers=selected, status=status, code=code)
    for name, table, object_id, code, status in [
        ("inactive-user", "users", data["users"]["owner"].id, "authentication_required", 401),
        ("inactive-membership", "memberships", data["memberships"]["owner"].id,
         "organization_access_denied", 403),
        ("inactive-organization", "organizations", data["org_a"].id,
         "organization_access_denied", 403),
    ]:
        async with OWNER_ENGINE.begin() as conn:
            await conn.execute(text(f"UPDATE {table} SET is_active=false WHERE id=:id"),
                               {"id": object_id})
        try:
            await request(name, body=body(), headers=h, status=status, code=code)
        finally:
            async with OWNER_ENGINE.begin() as conn:
                await conn.execute(text(f"UPDATE {table} SET is_active=true WHERE id=:id"),
                                   {"id": object_id})
    responses = []
    for name, selected, quote_id in [("foreign-detail", headers["foreign"], first["id"]),
                                      ("peer-detail", headers["peer"], first["id"]),
                                      ("missing-detail", h, str(uuid.uuid4()))]:
        result, _, _ = await request(name, method="GET", path=f"/api/v1/quotes/{quote_id}",
                                     headers=selected, status=404, code="quote_not_found")
        responses.append({k: v for k, v in result["error"].items() if k != "request_id"})
    require(responses[0] == responses[1] == responses[2], "Scoped detail errors differ")
    mine, _, _ = await request("peer-mine", method="GET", path="/api/v1/quotes?mine=true",
                               headers=headers["peer"], status=200)
    organization, _, _ = await request("peer-organization-summaries", method="GET",
                                       headers=headers["peer"], status=200)
    require(mine["total"] == 0 and organization["total"] > 0,
            "Existing organization summary / mine authority changed")
    require(all("items" not in row for row in organization["items"]),
            "Summary list exposed item details")
    REPORT["checks"].append({"name": "scoped-reads", "peer_mine_total": mine["total"],
                             "peer_organization_total": organization["total"],
                             "foreign_peer_missing_error_equal": True})


async def audit_failure_case(data, headers):
    # A narrow DB-only failure after parent/items flush. The app's audit function is untouched.
    async with OWNER_ENGINE.begin() as conn:
        await conn.execute(text("""
            CREATE FUNCTION reference_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.action = 'quote.create' AND NEW.request_id LIKE '%-audit-rollback' THEN
                    RAISE EXCEPTION 'synthetic audit rejection' USING ERRCODE='23514',
                        CONSTRAINT='reference_audit_rejection';
                END IF;
                RETURN NEW;
            END $$
        """))
        await conn.execute(text(
            "CREATE TRIGGER reference_reject_audit BEFORE INSERT ON audit_events "
            "FOR EACH ROW EXECUTE FUNCTION reference_reject_audit()"))
    try:
        await request("audit-rollback", body={"items": [{"quantity": "1"}, {"quantity": "2"}]},
                      headers=headers["owner"], status=500, code="internal_error",
                      sqlstate="23514", constraint="reference_audit_rejection")
    finally:
        async with OWNER_ENGINE.begin() as conn:
            await conn.execute(text("DROP TRIGGER reference_reject_audit ON audit_events"))
            await conn.execute(text("DROP FUNCTION reference_reject_audit()"))
    await success("after-audit-rollback", data, headers["owner"], payload=body(),
                  expected=[item_signature(None, "1.000", {})])


async def quota_and_catalog(data, headers):
    peer = "127.0.0.250"
    h = headers["owner"]
    policy = DEFAULT_POLICIES[RateLimitPolicy.QUOTE_CREATE]
    require(policy.requests == 10 and policy.window_seconds == 60,
            "Frozen quote quota is not 10 requests per 60 seconds")
    started = time.monotonic()
    common = {"peer": peer, "headers": h}
    await request("quota-malformed-before", raw=b'{"items":', status=422,
                  code="validation_error", **common)
    decode_rejections = integer_decode_rejections()
    require(len(decode_rejections) == 4, "Integer decode rejection corpus size differs")
    unauthenticated_form = "quantity"
    require(sum(name == unauthenticated_form for name, _ in decode_rejections) == 1,
            "Expected exactly one unauthenticated integer decode control")
    for name, raw in decode_rejections:
        selected = {"peer": peer} if name == unauthenticated_form else common
        await integer_decode_rejection(f"quota-integer-4301-{name}-before", raw, **selected)
    # Auth/schema/storage failures all consume the same real bucket.
    await request("quota-auth-failure-1", body=body(), peer=peer, status=401,
                  code="authentication_required")
    await request("quota-schema-failure-2", body={"items": []}, status=422,
                  code="validation_error", **common)
    await request("quota-permission-failure-3", body=body(), peer=peer,
                  headers=headers["denied"], status=403, code="permission_denied")
    await request("quota-fk-failure-4", body=body(product_id=str(uuid.uuid4())),
                  status=500, code="internal_error", sqlstate="23503", **common)
    catalog_body = {"items": [{"quantity": "1",
                               "product_id": str(data["products"]["published"].id)}]}
    catalog_path = "/api/v1/quotes/catalog"
    await request("quota-catalog-key-failure-5", body=catalog_body, path=catalog_path,
                  status=422, code="validation_error", **common)
    ch = {**h, "Idempotency-Key": str(uuid.uuid4())}
    created, original, _ = await request("quota-catalog-create-6", body=catalog_body,
                                         path=catalog_path, headers=ch, peer=peer)
    require([original["counts_after"][i] - original["counts_before"][i] for i in range(3)]
            == [1, 1, 1], "Catalog create did not commit one quote/item/audit")
    require(created["items"][0]["product_snapshot"] != {}, "Catalog snapshot missing")
    replay, replay_record, _ = await request("quota-catalog-replay-7", body=catalog_body,
                                            path=catalog_path, headers=ch, peer=peer, status=200)
    require(replay == created and replay_record["counts_before"] == replay_record["counts_after"],
            "Catalog replay changed the result or persisted again")
    await request("quota-catalog-conflict-8", body={**catalog_body, "comment": "changed"},
                  path=catalog_path, headers=ch, peer=peer, status=409, code="idempotency_conflict")
    await success("quota-generic-create-9", data, h, payload=body(), peer=peer,
                  expected=[item_signature(None, "1.000", {})])
    await success("quota-generic-create-10", data, h, payload=body(), peer=peer,
                  expected=[item_signature(None, "1.000", {})])
    require(time.monotonic() - started < 55, "Quota controls took too long for one real window")
    await request("quota-generic-denied", body=body(), peer=peer,
                  status=429, code="rate_limit_exceeded")
    await request("quota-catalog-denied", body=catalog_body, path=catalog_path,
                  headers=ch, peer=peer, status=429, code="rate_limit_exceeded")
    await request("quota-malformed-still-parse-first", raw=b'{"items":', status=422,
                  code="validation_error", **common)
    for name, raw in decode_rejections:
        await integer_decode_rejection(f"quota-integer-4301-{name}-still-parse-first",
                                       raw, **common)
    # Let the *real* rolling window expire, with no limiter inspection/reset or fake clock.
    async with OWNER_ENGINE.connect() as conn:
        idle_transactions = await conn.scalar(text(
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
            "AND state LIKE 'idle in transaction%'"))
        require(idle_transactions == 0, "A fixture transaction remains open before quota wait")
    delay = max(0, 61 - (time.monotonic() - started))
    await asyncio.sleep(delay)
    replay, record, _ = await request("quota-natural-expiry-catalog", body=catalog_body,
                                      path=catalog_path, headers=ch, peer=peer, status=200)
    require(replay == created and record["counts_before"] == record["counts_after"],
            "Catalog replay after natural expiry changed persistence")
    await success("quota-natural-expiry-generic", data, h, payload=body(), peer=peer,
                  expected=[item_signature(None, "1.000", {})])
    REPORT["checks"].append({"name": "shared-real-quota", "limit": 10, "window_seconds": 60,
                             "natural_wait_seconds": round(delay, 3),
                             "idle_transactions_before_wait": idle_transactions,
                             "integer_decode_requests": 8, "integer_decode_digits": 4301,
                             "integer_decode_forms": [name for name, _ in decode_rejections],
                             "integer_decode_unauthenticated_form": unauthenticated_form,
                             "integer_decode_unauthenticated_requests": 1,
                             "integer_decode_before_authentication": True,
                             "integer_decode_before_quota_nonconsuming": True,
                             "integer_decode_before_full_quota_denial": True,
                             "catalog_replay_preserved": True, "catalog_conflict_preserved": True})


async def main():
    try:
        async with OWNER_ENGINE.connect() as conn:
            identity = (await conn.execute(text(
                "SELECT current_database(), current_user, host(inet_server_addr()), "
                "inet_server_port(), current_setting('data_directory')"))).one()
            require(tuple(identity) == ("generic_quote_reference_test", "reference_owner",
                                        "127.0.0.1", 39203, str(OWNED_ROOT / "data")),
                    "Case runner database ownership differs")
            columns = (await conn.execute(text(
                "SELECT table_name,column_name,data_type,is_nullable,numeric_precision,"
                "numeric_scale FROM information_schema.columns WHERE table_schema='public' "
                "AND table_name IN ('quote_requests','quote_request_items') "
                "ORDER BY table_name,ordinal_position"))).mappings().all()
            quantity = next(row for row in columns if row["column_name"] == "quantity")
            require((quantity["data_type"], quantity["numeric_precision"],
                     quantity["numeric_scale"]) == ("numeric", 18, 3),
                    "Migrated quote quantity storage differs")
            parameters = next(row for row in columns if row["column_name"] == "parameters")
            require(parameters["data_type"] == "jsonb", "Migrated parameters are not JSONB")
            REPORT["checks"].append({"name": "actual-migrated-quote-columns",
                                     "columns": [dict(row) for row in columns]})
        async with engine.connect() as conn:
            role = (await conn.execute(text(
                "SELECT current_user, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, "
                "has_schema_privilege(current_user, 'public', 'CREATE') "
                "FROM pg_roles WHERE rolname=current_user"))).one()
            require(tuple(role) == ("reference_app", False, False, False, False, False),
                    "Application role privileges exceed the fixture contract")
        require(not app.dependency_overrides, "Application dependency overrides are present")
        data = await seed()
        async with app.router.lifespan_context(app):
            headers = await login(data)
            first = await ordinary_cases(data, headers)
            await integer_boundary_cases(data, headers)
            await repetition_cases(data, headers)
            await authority_cases(data, headers, first)
            await audit_failure_case(data, headers)
            await quota_and_catalog(data, headers)
        require(QUOTE_REQUESTS == 94, "Complete finite corpus request count differs")
        REPORT["final_counts"] = await counts()
        REPORT["status"] = "passed"
    except BaseException as exc:
        REPORT["failure_type"] = type(exc).__name__
        if isinstance(exc, AssertionError):
            # Only this file's fixed assertion messages; never a DB/HTTP exception string.
            REPORT["failed_check"] = str(exc)
    finally:
        await engine.dispose()
        await OWNER_ENGINE.dispose()
        checkpoint()
    if REPORT["status"] != "passed":
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
