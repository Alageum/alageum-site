# Bounded organization member reads on Node/Strapi

This slice adds GET `/api/v1/organizations/members` and a minimal read-only
`/b2b/members` page to the Node 24 / Strapi 5.56.0 migration. The legacy authority
is `backend/app/identity/router.py` (`MemberOut` and `members`) together with its
identity models and permission matrix. This is functional fixture acceptance,
not production approval. Production startup refusal and the blocked dependency
security gate remain unchanged; no dependencies or security exemptions change.

## Contract and authority

The selected active organization requires exactly `organization.manage_users`.
The existing demo administrator already has that permission; buyer, accountant,
engineer and catalog-manager mappings remain unchanged. Profile permissions are
independent. A native Strapi CMS identity does not authorize this B2B endpoint,
and a global caller role does not permit reading organizations without an active
selected membership. Query and body fields cannot select an organization.

The list envelope is exactly `{items, page, page_size, total}`. Each item contains
six required, non-null fields: UUID `membership_id`, UUID `user_id`, string
`email`, string `display_name`, UUID `role_id` and string `role_name`. Email is a
plain legacy string, not an email-validation type. Blank and nonstandard emails,
Unicode, whitespace and HTML-looking text are preserved without normalization.
No permissions, password hashes, activity flags or relationship internals appear.

Ordering is `membership.created_at ASC, membership.id ASC`. The unchanged shared
`support.requestPagination` parser defaults to page 1 and size 50, caps size at
100, consumes the last exact scalar duplicate, ignores unknown/bracketed keys,
retains the legacy accepted integer forms and preserves huge integers on the
wire. Far-away pages return no items with the original total. Count and rows may
differ briefly under concurrent target changes, as with the legacy list.

`private, no-store` is set before authentication. After the initial permission
check, the transaction revalidates and holds shared locks on the caller's user,
membership, organization and current role, in that order. The read derives its
organization from that fresh context, so revocation or role reassignment between
checks cannot reuse stale authority. Concurrent revocation waits for an accepted
read to commit; a revocation committed before fresh authorization is honored.
The GET writes no audit event, session record or business data on any path.
Existing stateless access-JWT and refresh/logout semantics remain unchanged.

## Valid legacy data and intentional malformed-relation hardening

Inactive target memberships and inactive target users remain visible. A target
role may belong to the selected organization or have null organization ownership
(a global role). Neither case is silently filtered. The API provides no target
activity status, so the UI explicitly says disabled records may appear and does
not invent active/disabled badges.

The existing membership foreign key refers to `role_id` alone, so it can contain
a role owned by another tenant. This slice intentionally hardens that malformed
case: the affected page fails with the generic `internal_error` / `Request failed`
response instead of revealing the foreign role label, returning null/fallback
values, omitting the row or changing the total. Missing joined users/roles and
invalid DTO types fail the same way. LEFT JOINs and explicit relationship markers
keep these rows observable to validation. An unaffected page may still succeed.
This is an explicit deviation for malformed relationships; valid local/global and
inactive records retain legacy behavior.

No identity table, migration, grant or schema-repair code is added. Existing
identity bootstrap is not a comprehensive schema-drift validator. Missing-row
projection tests inject malformed driver results without weakening foreign keys
or modifying identity schema; the cross-tenant-role regression uses actual
PostgreSQL rows, which the existing simple foreign key permits.

## Browser navigation

The navigation label and page title are `Участники`. Both the link and page check
`organization.manage_users`; a denied page does not prefetch member data. Profile
and other B2B navigation retain their own existing permission checks. The page
shows escaped name/email/role text, total and pagination, with no invitations,
role changes, grants, exports, file controls or account-management actions.

The UI always requests `page_size=50`. Its URL contract is deliberately stricter
than the backend parser: `/b2b/members` is canonical page 1; `?page=1` is accepted
and replaced with the bare path. Pages 2 through `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991) use a single
canonical decimal `page` value. This browser bound preserves exact integer
representation and does not change the backend arbitrary-precision parser. Leading zeros, signed/decimal/encoded values, duplicate or
unrelated query keys, fragments, child paths and external destinations are not
valid member return destinations. Existing login and organization return paths
retain their previous behavior.

Pagination pushes browser history. Reload and Back/Forward retain the selected
page, and organization selection preserves a valid member page destination.
Invalid local URLs show an error with first-page recovery without making a member
request. Out-of-range pages retain the total and offer recovery; they do not
claim the organization has no members. Loading, errors, denied access and empty
page results are distinct. Captured session/organization scope, cancellation and
request ownership suppress obsolete responses after paging, retry, logout,
new login, organization change, canceled selection or history navigation.

## Isolated verification

Run with Node 24, locked installed dependencies, PostgreSQL 16+ binaries in
`PG_BIN` and Playwright Chromium:

```sh
bash backend-node/scripts/run-member-tests.sh --browser
```

The wrapper ignores caller `DATABASE_URL`, creates a new loopback cluster and
exact `alageum_strapi_member_test` database, and requires `APP_ENV=test`,
`ALAGEUM_TEST_MEMBER_FIXTURES=1` and a generated `E2E_MEMBER_PASSWORD`. It refuses
non-test, remote, wrong-name, query-overridden, reused or populated databases,
CMS administrators and preexisting B2B data. Freshness is checked before Strapi
construction. Demo/catalog seeding stays disabled. Only these explicitly invoked
fixtures create test roles; existing organization/profile fixtures are unchanged.

Synthetic reader/peer/other/multi users get only `organization.manage_users`,
a denied user gets no permissions, and a profile-only user gets only the two
profile grants. Organization A has 55 memberships: 50 tied by creation time and
ordered by ID, then five whose timestamps reverse their IDs. B has two disjoint
memberships. Targets cover inactive memberships, inactive users, global roles,
blank strings, nonstandard emails, Unicode and inert HTML-looking strings.

The backend module supplies 17 real HTTP/PostgreSQL checks. The runner adds fresh
pre-sync isolation, fixture/reseed protection, complete Strapi restart
preservation, and final identity/business/non-auth-audit invariance checks. The
browser run adds a production Next build and the explicit member acceptance
matrix. `--backend-only` is a local diagnostic mode and is rejected in CI.

Raw output remains in private staging until secret redaction and artifact
verification succeed. Only `/tmp/alageum-member-tests.*/evidence` may be published;
it includes sanitized `results.json`, logs, browser results and fixture-only
screenshots. Owned process groups use bounded teardown; the invocation removes
only its own stopped PostgreSQL data and private artifacts. Default/Vercel browser
discovery excludes the dedicated member suite and retains its existing inventory.
The dedicated Next output is `.next-member` and is ignored by Git.
