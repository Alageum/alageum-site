# Node system reads

This bounded adapter corrects the existing health/readiness contract and adds the two missing legacy system reads. It starts from frozen PR21, head `74b92855d1dcc2997c471823f83686ac66972649`, tree `9b8711b768b9201fb03289abef0e9b48bdc98364`. It adds no business schema, role grant, provider, exporter or production configuration.

## Public contract

All four explicit routes are anonymous GETs under `/api/v1`, matching the frozen public surface. Unknown query parameters, Authorization and organization headers do not select a tenant, change metadata or add fields.

| Route | Successful response | Meaning |
|---|---|---|
| `/health` | `{status: "ok", timestamp}` | The already-started process can handle the request; no database call |
| `/readiness` | `{status: "ok", timestamp, database: "ok"}` | The application's PostgreSQL pool completed `SELECT 1`; timestamp is obtained afterward |
| `/metrics` | Flat object of observed numeric counters/sums/counts | One application's in-memory compatibility API activity |
| `/version` | `{name, version, environment}` | Explicit public application metadata |

Health cannot make a failed bootstrap serve requests. Initial Strapi startup still requires its guarded database/schema and valid application configuration. Readiness is a connectivity ping only: it does not verify schema migrations, write permissions, media, scanners, mail, ERP/CRM, workers, backups, cutover or production readiness. Ping failure remains HTTP 500. No new timeout, 503/degraded status or pool policy is introduced.

Timestamps are fresh UTC wall-clock values. Node's Date supplies milliseconds. The adapter uses the frozen Pydantic text shape for that real precision: `Z`, no zero fraction, otherwise six fractional digits with trailing zeros. It does not claim sub-millisecond measurement. Duration metrics use a separate monotonic clock.

Version metadata is deliberately restricted to public name `ALAGEUM API`, the checked-in `backend-node/package.json` version, and the validated `APP_ENV` mode (`test` or `development`). This explicitly adapts the legacy configurable `APP_NAME`/`APP_VERSION` fields: those arbitrary overrides are ignored, and a future package version is reported truthfully. `NODE_ENV`, other environment/config values, dependency versions, Git details, host addresses and credentials are never copied into the response.

## Metrics boundary and explicit adaptations

Only the `/api/v1` prefix is observed. Native CMS/admin/plugin routes, static files, uploads and native `/_health` are excluded. The old Python collector saw all of its application's requests; counting all Strapi traffic would additionally expose native CMS activity. There are no path, query, header, body, user, organization or other labels.

The only keys are:

- `http_requests_total`: completed API requests
- `http_errors_total`: completed API responses with status at least 400; absent until the first error
- `http_request_duration_seconds_sum`: cumulative valid duration, rounded to six decimal places
- `http_request_duration_seconds_count`: number of valid duration samples

A fresh recorder is `{}`. Keys appear only when observed. A metrics snapshot is detached and does not reset state; its own request is recorded after the snapshot. Counters use exact integer serialization, including values beyond JavaScript's safe integer range. Duration summation uses binary64 numbers and rounding is checked against the frozen Python recorder. Invalid, negative, nonfinite or overflow-producing duration samples are omitted rather than emitted as NaN/Infinity or invented zeroes; completed request/error counters still advance. Valid requests retain ordinary sum/count semantics.

The recorder belongs to one application instance, resets on recreation and is not persisted or aggregated across workers. There is no public reset route, rolling window, histogram, exporter, schedule or SLA claim. Missing AI, file-upload and integration-workflow counters remain absent until those features have real implementations; zero-valued placeholders would misrepresent them.

Instrumentation surrounds the existing compatibility error formatter. Final 4xx and 5xx are counted once, including failed readiness. This deliberately fixes the frozen Python middleware's omission of pre-response unhandled errors. Duration ends at middleware response availability, not completion of a streamed network download.

## Errors, state and exposure

Existing Node behavior is preserved: no-store responses, generated request IDs and the safe 500 envelope with `internal_error`, `Request failed`, null details and a correlated ID. The adapter does not recreate the old missing-header error path or change unrelated business/CMS errors. Incoming request IDs remain untrusted and are not echoed by Node.

These GETs perform no business, audit, session, token or grant write. Readiness only pings; metrics change solely because HTTP requests were served. Real database connections, exception text, SQL details and secret values are excluded from every public DTO and metric name/value.

The existing production-start refusal remains mandatory. Public diagnostic exposure, host/proxy/security policy and a real database rollout still need their separate deployment decisions. A production build or a successful readiness response does not remove those gates.

## Verification boundary

The candidate requires frozen DTO/rounding reference vectors with source hashes; focused service/middleware tests; a fresh disposable Strapi/PostgreSQL harness; and the existing complete hosted functional matrix. Required runtime cases include exact anonymous DTOs, first/self-scrape timing, fixed-key privacy, API-only scope, handled errors, concurrency and restart reset, full read-only state fingerprints, and a live database stop/restart showing healthy process liveness alongside failed and recovered readiness. An injected failure test does not substitute for that actual outage/recovery case.

Reference generation compiles only the frozen DTO/metrics definitions, without importing or starting the legacy application/database. Existing request/response transport adaptations and whole-application operational readiness remain explicit limits.

Local checkpoint on 2026-10-03: **497 backend checks passed**, including 130 system service/reference checks, five middleware checks and 11 runner safety/redaction/teardown checks. The existing complete Strapi/PostgreSQL regression passed **102 tests**. Both frozen-reference generators and the declaration inventory check passed.

The dedicated final runtime passed **23/23 groups** against actual Strapi and a new PostgreSQL cluster. With that cluster stopped under the running application, health/metrics/version returned 200, readiness returned the safe 500 envelope, and readiness recovered to 200 after the same cluster restarted. All 62 public/B2B tables' rows, columns and constraints retained their fingerprints across reads; B2B rows remained unchanged across application recreation while metrics reset. This is application recreation within one Node process, not multi-process replication testing. The independently reported application, owned-cluster and private-fixture cleanup all passed.

Independent source review identified a runner teardown failure path and a mismatched CI evidence-file assertion; both were corrected before this checkpoint. Inert child-process regressions verify that rejected or hung teardown with live handles preserves the original failed check and exits nonzero within its deadline. The final live run used that corrected runner. The exact dedicated CI evidence assertions also passed against its sanitized report. Complete hosted builds/browser regressions and current-head dependency reports remain pending at this local checkpoint; the PR records their later terminal outcome.

## Remaining migration

The generated [route inventory](node-legacy-route-inventory.json) now records 50 legacy declarations, 35 Node compatibility declarations, 33 overlaps and **17 absent legacy business routes**. All four system declarations are present; their documented adaptations still matter. These are presence counts, not full behavioral acceptance or a product-completion percentage.

The [previous read-contract correction](node-legacy-read-compatibility.md) and [dated dependency assessment](dependency-audit-2026-10-03.md) retain their scope. The last verified PR21 security gates remain blocked at backend 29 high/three moderate package entries and frontend five high. This candidate changes no lockfile, audit policy, deployment or merge state.
