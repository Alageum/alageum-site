# Existing B2B organization selection

This bounded slice selects only existing active memberships. It creates no account,
organization, membership, role or permission, and changes neither the database
schema nor API v1 DTOs. The current DEV per-tab session transport remains in place;
production startup continues to refuse `APP_ENV=production`.

## Server authority and login

`GET /api/v1/organizations?page=N&page_size=100` remains the source of selectable
membership IDs, organization UUIDs/display names, role names and current grants.
The client reads every page, rejects inconsistent pagination and duplicate UUIDs,
and shows the UUID beside each choice. Identical display names never select an
arbitrary organization. Display names are editable and do not verify legal identity.

`GET /api/v1/auth/me` remains the authorization check. Single-membership login
continues into its approved internal return route. Multiple memberships require an
explicit choice. No memberships produces an honest empty state and a cancel option.
An interrupted authenticated login can reopen the chooser without retaining the
entered password. Cancellation clears only that incomplete login's generation; it
does not reinstall an earlier account or clear a newer login.

A candidate choice uses a dedicated `/auth/me` read with its explicit
`X-Organization-ID`. The current session/organization is not temporarily replaced.
Only a successful, matching server profile is committed, with the latest token pair
from the same login. Removed membership, missing or incorrectly scoped role,
inactive organization, a newer selection, a newer login, cancellation and a changed
session all prevent commitment. Revoked profile grants remain revoked. Selection
does not derive permissions from a cached membership list.

A stale saved UUID never falls back to another membership. The B2B content stays
gated while the user opens a fresh chooser. Expired read credentials may rotate once
within the same login boundary; expired refresh credentials require a new login.

## Switching, drafts and response ownership

The sidebar states the active organization's display name and UUID. Its chooser
loads memberships afresh on each opening. A native modal provides keyboard focus
containment, Escape/backdrop dismissal and return focus. Back/Forward dismisses a
pending choice and does not restore a tenant from browser history.

The profile and support editors register in-memory dirty and pending readers.
These readers update synchronously with edits/submissions, so clicking the switch
immediately after editing cannot skip confirmation. Cancel and failed candidate
validation preserve the original organization and draft. Successful switching
remounts tenant content and discards that page's unsaved draft. The pending-save
warning states that an already accepted server request may still finish: switching
cannot undo a server commit.

Tenant content is keyed by user, organization and login generation. The key remains
stable through ordinary token refresh and confirmed display-name edits. Already
loaded lists are remounted on a switch; old record detail routes are synchronously
gated and replaced by their list route before requesting a record under the new
organization. This also covers a fresh detail-page load whose stale organization
never produced a valid profile: its original live session generation still marks
the recovery boundary. Static B2B routes such as profile can stay selected. Initial login
still honors only the existing safe return-path allowlist.

The shared API response boundary also suppresses a successful authenticated
response after its originating login or organization changes, including a response
whose body finishes parsing later and a 204 response. This protects resource
callbacks outside the profile editor, including late mutation navigation. It
compares the original session context, not the intentional candidate header, and
allows ordinary token refresh within that context. Mutation methods never trigger
automatic 401 refresh/replay. A successful server write from the old organization
may remain saved, but cannot repaint or navigate the new organization's UI.

The catalogue RFQ has one deliberately narrower accepted-receipt path: a successful
quote POST returning 201-created or 200-replay may record only its validated quote UUID against the original
owner/organization and exact idempotency-attempt key before the shared response
guard rejects a stale continuation. The full old response is never returned to
the new flow. A replaced or reset attempt is untouched, including after a
same-account re-login; failed/unauthorized responses never record a receipt or
replay a write. This preserves recovery of an already accepted RFQ without
overwriting the current owner's private draft or navigating to the old record.
The RFQ UI lifetime additionally follows the existing login-aware auth scope;
ordinary refresh preserves it, while same-account re-login invalidates even an
error continuation before React unmounts the old form. Disposing that UI flow does
not suppress the original attempt's minimal accepted receipt.

Optional company business contacts remain unverified and require the existing
explicit profile-read permission. Profile PATCH still requires both read and update.
No default or real role receives those permissions; no contacts are copied between
organizations or persisted as a new draft transport.

## Verification and isolated browser runner

- `npm run check --prefix backend-node`: backend syntax/package checks and units
- `bash backend-node/scripts/run-local-tests.sh --integration-only`: existing full
  PostgreSQL suite in its dedicated disposable database
- `npm run lint --prefix frontend` and `npm run test:unit --prefix frontend`
- `ALAGEUM_ORGANIZATION_BUILD=1 npm run build --prefix frontend`: separate
  `.next-organization` production Next output
- `bash backend-node/scripts/run-organization-tests.sh --backend-only`: real HTTP
  membership, candidate, authority and expiration checks without browser claims
- `bash backend-node/scripts/run-organization-tests.sh --browser`: the same HTTP
  checks plus the separate production build and desktop/mobile Playwright suite

The runner requires Node 24 and PostgreSQL 16+ (`PG_BIN` can select its binaries).
It creates a new local cluster and exact `alageum_strapi_organization_test` database,
ignores caller database URLs, requires test mode and an explicit fixture flag, and
rejects any nonempty database before Strapi synchronization or fixture reseeding.
Passwords, keys and tokens are random runtime values, never committed fixtures.
Six disposable users cover single/multiple/zero memberships and restricted grants;
two organizations intentionally have identical display names. Fixture roles are
separate from real/default grants. Real SQL revocation tests restore only their own
disposable rows.

Evidence contains sanitized logs/results and deliberate screenshots only. Network
traces, videos, auth storage, raw database exports and automatic login screenshots
are disabled. The task-created PostgreSQL cluster is removed after a successful
stop. The unchanged 20-per-minute login limiter is respected: the browser phase
waits out the final HTTP setup login's 61-second window. Test retries remain zero.
The organization browser suite is separate from existing default, optional webpack
and company-profile suites. Its 19 cases (17 desktop, 2 mobile) make 19 login
attempts. The rendered-order and delayed-RFQ continuation scenarios explicitly
inject resource responses to test client lifecycle behavior, while keeping real
login, membership and candidate validation. They create no orders/RFQs or extra
server grants. Local Chromium is blocked by the executor socket
policy; listing tests does not constitute a browser pass. Hosted desktop/mobile
execution and review of successful screenshots are required before acceptance.

Local checkpoint: backend 88/88, frontend 230/230 unit tests, full PostgreSQL 74/74,
frontend lint and production organization Next build passed. Dedicated real HTTP
verification passed 7/7 groups; its raw task-created cluster and password file were
confirmed removed after shutdown. Hosted runs add production build and browser
groups for 9 total groups. Browser execution/screenshots remain pending.
