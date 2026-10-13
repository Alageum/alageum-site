# Bounded customer support tickets on Node/Strapi

This phase moves the three existing customer support v1 routes onto Node 24,
Strapi 5.56.0 and isolated PostgreSQL. Next remains the frontend. Python is the
contract reference and legacy preview, not the final backend architecture.
This is not a deployment, customer-data migration or production-readiness claim.
The existing production refusal, audit gate and default roles remain unchanged.

## Preserved boundary

| Route | Existing permission | Result |
| --- | --- | --- |
| GET `/api/v1/support/categories` | `ticket.create` | Global `{id, code, label}` references, ordered code then UUID |
| GET `/api/v1/support/tickets` | `ticket.read` | Current-organization summaries, ordered newest then UUID |
| POST `/api/v1/support/tickets` | `ticket.create` | HTTP 201 `{id, subject, category, status}` |

The summary list includes tickets created by other members of the same selected
organization. It never returns the initial message, author, organization record
or timestamps. Categories and ticket lists default to page 1 / size 50, clamp
sizes to 100, use the last exact scalar query parameter, and ignore unknown query
keys. Bracket keys do not become scalar parameters. Legacy integer coercions and
Unicode whitespace rules are preserved; very large pages return an empty page
without overflowing the database offset or rounding the page integer on the wire.

POST accepts only `category_id` (UUID), `subject` (1–300 Unicode code points), and
`message` (1–10000 Unicode code points). Values are not trimmed or normalized.
The accepted Pydantic UUID representations normalize to the same canonical UUID.
Unknown fields, including organization, creator, status, source and idempotency
fields, fail with the v1 validation-error envelope. Input is JSON, including an
absent Content-Type or an `application/*+json` media type. Form and multipart
requests are rejected before Strapi's upload parser. An absent category or the
missing initial status code `new` returns HTTP 422 `ticket_configuration_missing`.

The current B2B context supplies the organization and author. Inside one
transaction the backend revalidates and holds active user, membership,
organization and role rows, reads category/status references under shared locks,
and inserts the ticket, its initial message with source `portal`, and the
`ticket.create` audit event. Message or audit failure rolls back all three writes.
The audit does not copy message text. Revocation that precedes authorization-lock
acquisition denies the operation; a revocation racing an accepted transaction
waits for its lock, then prevents later operations.

The four support tables live in `b2b`, outside generated Strapi CRUD and public
schema synchronization. Bootstrap only creates missing support tables and verifies
columns, constraints and unique indexes; incompatible existing structures require
a reviewed migration. It does not repair or destructively synchronize them.
`ALAGEUM_SEED_DEMO=1` in test/development adds only the preserved `other` / `DEV
Other` category and `new` / `DEV New` status. It adds no permissions or real
customer reference data.

## Frontend behavior and limits

Read and create permissions are independent. Read-only users see summaries;
creation-only users can load categories and submit. Neither capability causes
requests for the other, and navigation is visible when either exists. Loading,
failed responses, empty reference data and denied access have distinct states.
The existing login generation, selected-organization checks and unsaved-form
navigation guard remain authoritative.

Submission has an immediate synchronous guard. POST is never automatically
refreshed, retried or replayed. There is no ticket idempotency contract: explicitly
posting twice can create two tickets. A lost, cancelled or malformed response can
leave the outcome unknown. The form warns about possible creation and duplicate
risk, preserves the draft, and keeps that submission locked. Refreshing summaries
is read-only and cannot establish that a missing ticket was never created.
Starting a new draft is a deliberate action with this limitation stated.

Ticket detail or message reading, replies, manager assignment, status transitions,
attachments/uploads, SLA, notifications, email and external integrations are not
implemented. Unresolved service/warranty decisions remain in the existing
questionnaire; this implementation invents no operational workflow.

## Isolated verification

From the repository root, with Node 24, PostgreSQL 16+ binaries in `PG_BIN`, locked
backend/frontend dependencies and Playwright Chromium installed:

```sh
bash backend-node/scripts/run-support-tests.sh --browser
```

The runner ignores the caller's `DATABASE_URL`, starts a new loopback cluster,
creates exactly `alageum_strapi_support_test`, generates disposable secrets and
fictitious roles/users, starts real Strapi, builds Next into `.next-support`, and
runs the dedicated support suite. Preflight rejects a wrong database, remote
host, or any pre-existing application relations before Strapi is constructed.
The runner also exercises reused-database refusal and rejects reseeding. No
customer database, default-role grant or persistent credentials are involved.

Acceptance requires 23 runner checks including 21 HTTP/PostgreSQL/fixture checks,
a production Next build, and all 20 browser cases (18 desktop, 2 mobile), with no
skips, flaky cases, retries or expected failures. Four explicit PNGs cover saved
fictitious tickets and validation at desktop/mobile sizes. Browser traces, video
and automatic failure screenshots are disabled. Broad/default and Vercel browser
discovery remain separate and unchanged. Focused unit and fixture tests are part
of the ordinary backend and frontend test commands.

`--backend-only` is a local diagnostic mode with 21 real backend checks and no
browser claim; CI refuses it. The local executor's Chromium Unix-socket limitation
does not prevent real loopback Strapi/PostgreSQL verification. Hosted CI is the
browser acceptance authority.

The runner reports the evidence directory. Share only sanitized `results.json`,
`browser-results.json`, logs and the explicitly captured fictitious PNGs. Never
upload the sibling PostgreSQL cluster, raw database, runtime credentials, tokens,
cookies or network traces. Artifacts stay in private staging until a complete sanitization pass; a failure
publishes only a minimal redacted summary. Teardown stops owned process groups
and bounds Strapi shutdown. The raw disposable cluster is removed only after
PostgreSQL has confirmed shutdown; transient secrets, config and raw logs are
removed by the wrapper.
