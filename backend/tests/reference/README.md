# Frozen generic quote application reference

This is a **test-only proof gate**, not a Node route/schema implementation. The
manifest pins 86 application, migration and lock files to
`8f8bd11a942e50686d7f8bbd52e1bb5ba3d9721a` (PR24). Test additions do not redefine
that oracle. Existing model, stubbed-ASGI, native-parser and minimal-PG reports
remain separate evidence.

The runner uses the actual FastAPI app and lifespan, middleware/error handlers,
password login/JWT/refresh sessions, authority dependencies, SQLAlchemy and
asyncpg. Transport is **in-process ASGI + ORM + loopback PostgreSQL**. There is no
deployed HTTP listener, proxy/TLS proof or network client simulator.

## Execution

Use an unprivileged Linux CI account, Python 3.12, PostgreSQL `initdb`, `pg_ctl`
and `postgres` from one declared installation, and the repository's existing
locked install pattern:

```sh
cd backend
pip install -r requirements-dev.lock
python tests/reference/run_generic_quote_reference.py \
  --postgres-bin /usr/lib/postgresql/16/bin \
  --output "$RUNNER_TEMP/generic-quote-reference-report.json"
```

The PostgreSQL path is the CI installation, not a download instruction. The
report records the actual server version and executable hashes; it must not be
described as the earlier PG17.11 minimal-schema run if a different server is used.
All 72 installed distribution versions must match the frozen dev lock. No package
installation occurs in either harness script.

The output path must not exist. Port `127.0.0.1:39203` must be free. The runner
never accepts a database URL or reuses a PostgreSQL service. It creates a private
cluster and the exact new `generic_quote_reference_test` database, proves its
identity and absence of user relations before migration, and runs the actual
Alembic chain to `f05b719aec42`. Repository dotenv files cause refusal. Inherited
APP/PG/database configuration is excluded from subprocess environments.

The cluster owner runs migrations and synthetic fixture setup. The application
uses a separate non-owner role with bounded table grants, no schema creation,
superuser, role/database creation, or row-security bypass. Passwords, signing
secret and ownership nonce are generated per invocation; only the owned fixture
is removed after verified shutdown. No pre-existing database, real data, external
service, production grant, frontend file, dependency lock or application source
is changed.

For a source/AST check without installed runtime dependencies or PostgreSQL:

```sh
python backend/tests/reference/run_generic_quote_reference.py --verify-only
```

That command does **not** execute the application or establish endpoint parity.
Normal `pytest` collection does not run this standalone proof. Its parent
`tests/conftest.py` would replace migrations with ORM tables and clear the limiter,
so this runner intentionally bypasses pytest entirely.

## Bounded coverage and evidence

The finite corpus currently makes 94 quote endpoint requests and four actual
login requests. A hard guard permits at most 100 quote requests; the parent
runner kills the case process after 180 seconds following setup. No POST is
automatically retried. Independent cases use declared synthetic ASGI peer
addresses. The shared-quota group uses one peer, unchanged 10-per-60-second
runtime policy, and a natural approximately 61-second expiry wait. No dependency
override, stubbed endpoint, limiter reset, policy mutation or fake clock is used.

Coverage includes nullable/repeated/global hidden/draft products, parameters,
generic defaults and audit identity, scoped reads, ignored idempotency headers,
Numeric rounding/check/overflow, exact JSON integer versus float decoding,
non-finite/NUL/surrogate and Unicode outcomes, UUID/extras/nullability and item
bounds, real authority denial, and generic/catalog quota order. Catalog controls
prove create/replay/conflict and snapshots in the shared bucket. A middle-item
FK/quantity failure and narrow temporary audit rejection trigger prove real
transaction rollback without replacing app functions. This is finite evidence,
not exhaustive parsing, concurrency, deployment or production readiness proof.

The runner asserts observed status/error code/message/request ID and committed
SQL state. Storage/serialization failure cases intentionally expect the frozen
500 `internal_error` envelope where applicable; an unexpected result fails the
gate and remains in the sanitized report for review, never silently replacing
the expectation. FK failures must also emit SQLSTATE `23503`, rounded-zero/check
failures `23514`, and numeric overflows `22003`. Audit rollback must emit `23514`
with the deliberately assigned `reference_audit_rejection` constraint identifier.
A generic 500 or unrelated grant failure cannot satisfy these database-fault
checks. Constraint capture is restricted to three known schema/fixture names;
driver exception text and SQL parameters are never retained.

### Integer decoder boundary extension

The previous hosted corpus had 80 quote requests. This extension adds exactly
six independent controls and eight shared-quota requests, for 94 total; the
runner asserts both the six-control count and complete 94-request count. The
extension's application/ORM/PostgreSQL outcomes remain **unverified until its
dedicated hosted workflow passes**. Source/model inspection and `--verify-only`
are not an execution of this gate. Existing passing reports remain unchanged.

The six independent requests have fixed source-derived expectations:

1. A bare 4,300-digit quantity decodes, validates as a `Decimal`, and reaches the
   migrated `Numeric(18,3)` column: 500 `internal_error`, SQLSTATE `22003`, no writes.
2. A quoted 4,300-digit quantity has the same range failure and no writes.
3. A quoted 4,301-digit quantity bypasses the JSON integer limit but has the same
   range failure and no writes.
4. A bare 4,300-digit integer nested under item parameters persists with 201.
   ORM values and SQL JSONB text must match all digits exactly; SQL must report
   JSON type `number`.
5. One request carries nested quoted-digit strings of lengths 4,300 and 4,301.
   Both persist with 201, exact ORM/SQL text, and SQL JSON type `string`.
6. One raw request contains 4,300-digit quantity and nested parameter integers,
   each overwritten by a duplicate key with value 1. It must persist the final
   values with 201, proving the at-limit duplicate-collapse control.

Four raw 4,301-digit forms are each sent before shared-quota consuming attempt 1
and again after attempt 10: bare quantity, overwritten quantity, nested parameter
integer, and overwritten nested parameter integer. All eight must return the
exact 400 `http_error` envelope with message `There was an error parsing the body`,
null details, and the matching body/header request ID. They must have no SQL
errors and no quote/item/audit writes. The existing ten consuming attempts,
generic/catalog 429 controls, malformed-JSON 422 controls, and natural expiry
remain intact. Attempts 9 and 10 must still create generic quotes, so unexpected
quota consumption by any new pre-quota error fails the gate. Each over-limit
form must still produce 400 after the bucket is full, proving decode-before-quota
ordering without inspecting or resetting the limiter. The pre-quota bare-quantity
case omits both bearer and organization headers and must still return 400,
directly proving decode-before-authentication ordering. The other seven boundary
requests use valid owner headers. The shared-quota check records the unauthenticated
form and count without retaining authentication material.

These expectations follow the locked Python 3.12 integer guard of 4,300 digits,
Starlette 1.6.0 `Request.json()` calling `json.loads`, and FastAPI 0.141.1
`get_request_handler()` reading/decoding the body before `solve_dependencies()`.
An over-limit integer raises `ValueError` even when a later duplicate would
overwrite it. FastAPI maps that exception to HTTP 400; its separate
`JSONDecodeError` path still produces validation 422 for malformed JSON. The
frozen `app/core/errors.py` maps HTTP 400 to the asserted envelope.
`app/commerce/router.py` defines a positive `Decimal` quantity without a maximum
digit count and untyped nested parameter values; `app/commerce/models.py` and
the real migrations determine the different quantity/JSONB storage outcomes.
No surprising runtime result may silently change these expectations.

Only the JSON report is a publication artifact: provenance, selected synthetic
results, statuses, selected response headers, validation locations/types,
SQLSTATE/type, counts, assertion outcomes and lifecycle. It excludes raw request
headers, cookies, tokens, passwords, environment, exception text/tracebacks,
server/application logs and database archives. Sanitized request checkpoints are
retained on assertion failure or timeout. SIGINT and SIGTERM record a sanitized
interruption phase and enter cleanup. An active case child is terminated, given
five seconds to exit, then killed and given another five seconds to be reaped.
Its exit must be verified before cluster shutdown or fixture removal. PostgreSQL
shutdown has a 30-second subprocess bound; subsequent signals do not interrupt
cleanup. Give the outer workflow timeout at least 60 seconds of cleanup grace.

The final report is published atomically only after cleanup; `passed` requires
verified cases, child exit, server shutdown and fixture removal, with no handled
interruption. Cleanup failure makes the gate fail and preserves any fixture that
cannot safely be removed. SIGKILL, host loss and forced CI teardown cannot run
Python cleanup: they can leave an owned temporary fixture or child until the
disposable CI machine is reclaimed. A kill before final publication leaves no
complete final report, never a passing cleanup claim. An already published pass
means all those checks and cleanup finished before publication.
