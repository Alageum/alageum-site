# Shared request admission and trusted proxy boundary

This describes implementation safeguards, not an approval to expose or deploy
the application. The existing `APP_ENV=production` interlock remains in place.

## PostgreSQL admission

`b2b.rate_limit_buckets` is created and checked by the business auth schema.
The runtime uses shared PostgreSQL row locks and database time rather than
per-process clocks or maps. The same server-side secret must be supplied to
every replica. Keys are HMAC hashes; raw addresses and login emails are not
stored in quota rows.

- Password, browser preparation/cancellation and Google entry share 20 accepted
  admission events in a rolling 60-second window per resolved client address.
  Browser password login normally consumes preparation plus credential entry.
- Password identity checks independently allow 20 attempts per normalized email
  in 60 seconds, across client addresses and password transports.
- Explicit bearer refresh allows 60 attempts per address in 60 seconds.
- Native CMS login/registration/password-reset entry has a separate shared
  20-per-address/60-second quota before parsing and 20-per-email quota after
  parsing, before native authentication. CMS access-token refresh allows 60 per
  address. Native Strapi restrictions and roles remain enabled as well.
- Quote creation keeps its 10 accepted attempts per address in 60 seconds.
- Registration uses the same bounded DB-clock implementation: 20 mail/company
  attempts or 30 token attempts per address in 15 minutes, plus five requests per
  normalized identity in 15 minutes. Existing thresholds are retained; rolling
  windows remove fixed-window boundary bursts and replica clock-skew bypass.

Denied attempts do not evict existing identities. New-key allocation is bounded
to 10,000 active keys per policy; exhausted capacity rejects new identities until
expiry. Database loss, malformed state, conflicting replica policy, statement
failure or lock timeout fails closed with 503. Rate denial returns 429 and
`Retry-After`. Quota rows survive application restart. Historical in-memory
reference implementations remain only for compatibility evidence/unit fixtures;
the runtime entry and quote adapters do not use them.

Legacy login aliases are charged before JSON parsing and exactly once per
request. System health/readiness/metrics/version and ordinary reads do not write
quota state. Limits do not replace edge request-size/concurrency protection or
operational traffic monitoring.

Abandoned password/Google browser bindings are also bounded: preparation and
provider start prune at most 1,000 expired rows per session/attempt/binding table,
using `SKIP LOCKED` before any flow lock. A shared allocation lock caps new browser
bindings at 100,000 across replicas without evicting a live binding. Existing
browsers may renew their own flow at capacity. Capacity refusal returns 429;
no session or binding cookie is issued for the refused allocation.

## Explicit proxy trust

Koa's blanket proxy trust remains disabled. `ALAGEUM_TRUSTED_PROXY_IPS` accepts
only a comma-separated list of individual IP addresses (maximum 32), not DNS,
CIDR or wildcard trust. Its default is empty. Do not populate it until the actual
proxy peers and network access controls have been reviewed.

For an untrusted direct peer, all forwarding headers and `ctx.ip` are ignored;
the socket address is authoritative. For an explicitly trusted immediate peer,
the middleware walks `X-Forwarded-For` from right to left through trusted peers
and selects the nearest untrusted address. The trusted proxy must append the
actual incoming socket address and overwrite `X-Forwarded-Proto` with one exact
`http` or `https` value. Malformed or unbounded chains fail with 400. The resolved
identity is document-private server state and is reused by auth, quote and
registration limiters.

Only the trusted protocol overrides Koa's per-request protocol getter. This
allows `Secure`/`__Host-` cookies behind a reviewed HTTPS terminator without
trusting arbitrary forwarded hosts or direct-client headers. Browser cookie
mutations still require the exact configured `ALAGEUM_BROWSER_ORIGIN`; proxy
trust never relaxes Origin, public session-boundary or tenant authorization.

## Verification and remaining release work

The dedicated `ALAGEUM_RATE_LIMIT_TEST_DATABASE_URL` must point to a fresh
loopback database named `alageum_rate_limit_test`. Its integration test exercises
two independent pools, concurrent admission, restart, capacity, expiry, lock
timeouts, schema corruption and actual password/browser/Google adapter sharing.
Request-security tests exercise untrusted forwarding and real Koa cookie flags.
Existing cookie/Google/registration integration tests continue to exercise their
actual authorization and revocation behavior with these runtime limits enabled.

Before release, verify the deployed TLS/proxy chain and same-origin routing,
shared database/secret availability, traffic limits under expected load, private
media/scanner storage, SMTP delivery, backups and recovery. Do not disable the
production interlock or substitute test settings as evidence for those steps.

## Read-only production configuration report

From `backend-node/`, with the intended settings already injected by the operator:

```sh
node scripts/check-production-readiness.js
```

This command reads only configuration and filesystem metadata. It performs no
network requests, database/schema initialization, file writes or credential generation. It does not read arbitrary `.env` files. Its
JSON contains setting names and safe issue identifiers, never URLs, addresses,
secret values, SMTP recipients or credentials. Exit 1 means configuration issues;
exit 2 means configuration and required local directory checks passed but
production release is still blocked. Missing or unsafe storage directories also
return exit 1. It deliberately cannot exit 0 or approve a deployment.

The checks require an exact HTTPS browser origin and matching CORS origin,
explicit individual TLS-proxy peers, independently supplied strong secrets and
multiple distinct application keys, an isolated `alageum_strapi*` database,
certificate-verifying TLS for a non-loopback database, configured scanner and
valid account-mail settings. `ALAGEUM_MEDIA_PUBLIC_ROOT` must explicitly select
the pre-existing persistent-volume public root; its `uploads` directory and
separate private quarantine must pass ownership, permission and no-symlink
checks. The report explicitly leaves volume persistence and backup/restore
unverified. Connection-string query overrides are rejected.
Demo seeding, automatic catalog import and unfinished EDS signing must be
explicitly disabled; Google must be explicitly disabled or configured.

The existing startup interlock now names actual missing configuration or
release evidence rather than claiming cookie sessions, shared quotas or scanning
are unimplemented. Binary replacement is an explicitly unavailable optional
feature, not a blanket blocker for the supported new-upload/metadata workflow.
External evidence remains separate: an environment string
cannot demonstrate real HTTPS/cookie acceptance, network isolation, scanner
signatures, SMTP delivery, database/media restore or cutover approval. No
`APPROVE_PRODUCTION`/`SKIP_RELEASE_GATES` flag exists. After the listed implementation
and operational evidence is complete, a separately reviewed release change must
replace the interlock with these validated conditions; this checker alone does
not turn a development deployment into production.
