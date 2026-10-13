# Native generic quote storage proof

This is a fresh-store-only storage candidate. It does not implement generic
`POST /api/v1/quotes`, upgrade any existing database, enable native CMS writes,
change parser behavior, or establish production readiness.

## Recorded local verification

The second owned native run passed on Node 24.19.0, Strapi 5.56.0 and PostgreSQL
17.11: 16 acceptance groups, all 27 refused-start cases, and four observed
two-transaction races. Every refused native start made zero schema-sync calls,
executed no mutating SQL, and preserved the captured schema/data fingerprints.
All 238 catalog identities and source rows, quote rows and audit rows survived a
matching native restart. Existing owner/peer GETs retained strict DTO fields,
exact quantity strings and unchanged rows/audits; generic POST remained 405.

The focused schema fingerprint was
`5ed42d3a8db67a78f1df1eb43b612960c4c7cdb08314377b8d76c5a0a0a32d5f`.
Results SHA-256:
`4ddd8bd2707c07be188fe8707728d0e54e4cc0257ababf292e2ed3207cd407cf`.
Cleanup report SHA-256:
`6cd7621e224e01f559b626507f96d731f83d14fd00f69526103c77ad9d554670`.
Peak owned disk use was 72,817,999 bytes. No owned process-group members remained;
PostgreSQL and HTTP ports were closed, the fixture was removed, and selected
source/dependency hashes were unchanged.

The first attempt created the intended DDL, then the strict verifier rejected a
canonical spelling mismatch: PostgreSQL quotes `"position"` in its CHECK/index
definitions. Four expected literals were corrected without changing the DDL or
relaxing verification. That failed attempt and its successful cleanup are
retained separately; they are not counted as a passing run.

Full backend source checks passed 553 tests. A separate fresh local cluster
passed all 102 existing catalog/auth/RFQ/profile integration tests after the
source-defined fixture adapters were updated. Its cluster was stopped and its
regenerable database/password removed; logs and a sanitized summary were kept.
The dedicated hosted PostgreSQL 16 job and full browser/CMS build verification
remain pending for this checkpoint. Existing dependency-security gates remain
blocking. These results do not prove an existing-data upgrade, a generic HTTP
writer, deployed operation or production readiness.

## Running the bounded proof

Use Node 24, the existing locked backend dependencies, and PostgreSQL 17 binaries
in `PG_BIN` by default. A separately installed PostgreSQL 16 is supported only
with the explicit `--postgres-major 16` option. The declared major must match both
the binary and the live server; actual version numbers are retained in evidence.
If those binaries need private shared libraries, set their existing
`LD_LIBRARY_PATH`. No install, build or browser is part of the runner.

```sh
python3 backend-node/scripts/run-native-generic-quote-storage.py \
  --evidence-dir /absolute/path/to/a/new/quote-storage-evidence
```

The runner refuses an existing evidence directory, any running PostgreSQL
process, and an occupied loopback port 39317. It creates one new task-owned
cluster, checks its exact data directory, system identifier, database owner,
server address, port and PostgreSQL major version, and enforces a 180 MiB fixture
cap. All database state is synthetic and disposable. It uses no inherited
database credentials or existing database. A private app copy uses the installed
dependencies without rebuilding them.

The harness invokes actual `createStrapi(...).load()` against a wholly blank
store, then invokes it again against the populated matching candidate. It uses
the reviewed importer and checks all 238 stable source-product identities. The
original imported product rows, candidate quote rows, audit rows, native key,
generated reference, foreign keys and complete focused catalog fingerprint are
compared across restart.

Storage probes cover repeated and null generic product lines; published, draft
and hidden native products in a hidden category; arbitrary nested JSONB with an
exact large integer; mode coupling; generated-column assignment refusal;
catalog-only constraints and partial uniqueness; numeric rounding/failure;
middle-item rollback; live-reference restriction; and parent cascade. Generic
HTTP creation remains a measured 405. Successful SQL probes are not claims
about an implemented generic request validator, service or HTTP error mapping.
Existing authenticated GET routes are checked with the seeded owner and peer:
both can see the organization summary, only the owner can read detail, and the
peer's `mine=true` list excludes the owner's quote. Exact quantity strings,
null/repeated product references, empty snapshots and strict DTO field allowlists
are verified, with all stored rows and audits unchanged by these reads. Login
tokens remain in process memory and are excluded from evidence.

Four independent two-session races exercise delete and transport-key update in
both orders relative to a generic insert. They use Knex transactions against the
actual Strapi-created `public.alageum_products` table. Each captures
`pg_stat_activity` plus `pg_blocking_pids` proving the second session waited on
the first transaction, then checks the resulting foreign-key failure and absence
of dangling references. Native query-service update/delete refusal is checked
separately; lifecycle guards are never disabled for these tests.

The exact-expression drift vector works on both declared majors. Within the
cloned synthetic database only, it moves the item table to a temporary schema,
recreates the table using its measured column/constraint/index definitions with
the generated expression changed, copies all non-generated values server-side,
then removes the temporary table/schema. Names and storage values are retained;
the vector needs no PostgreSQL 17-only `SET EXPRESSION` syntax and leaves no
dropped-column artifact that could substitute for checking the expression.

Rejected startup cases use sequential disposable copies of the proven candidate
database within the same cluster. Old empty and populated quote schemas,
partial quotes, a populated native store without quotes, and drift in columns,
checks, indexes, predicates, foreign-key validation/deferral, generated expression,
triggers or native identity are submitted to the actual native startup path.
Instrumentation records SQL text and native schema-sync call count. Acceptance
requires zero schema-sync calls, no mutating statements, and identical before/
after schema, table data, functions and sequence fingerprints.

`results.json`, the per-start `*-native.json` records and
`native-schema-fingerprint.json` contain the measured evidence. `lifecycle.json`
must also confirm source/dependency integrity, closed HTTP sockets, stopped
PostgreSQL and removal of the owned fixture. A suite result alone is insufficient
if cleanup failed. `source-sha256.json` ties results to the exact tested sources.
Never share a raw database or app fixture directory.

No existing-data migration, backup/restore drill, full HTTP generic acceptance,
browser print coverage, production deployment or old-binary rollback is implied.
