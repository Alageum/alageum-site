# Bounded B2B company profile

This reversible local/CI product slice adds a company profile editor at `/b2b/profile` and two explicitly authorized Node endpoints. It is not a statement of contract-confirmed legal requisites. Optional business contact details remain visibly **unverified** and are separate from the signed-in person's identity. No email is delivered.

## Contract

`GET /api/v1/organizations/current/profile` requires `organization.profile.read`.
`PATCH /api/v1/organizations/current/profile` requires both `organization.profile.read` and `organization.profile.update`, because its response discloses the entire profile. `organization.manage_users` is unrelated. No existing or default/demo role gains either permission.

The active server membership determines the organization. A user with multiple active memberships must select one through the existing `X-Organization-ID` header. A body cannot supply identity, tenant, role, permissions, external ID, active state, timestamps, verification status, or legal/bank fields. Native CMS credentials are not B2B credentials. Responses, including authorization errors reached through the domain route, set `Cache-Control: private, no-store`.

The flat response contains:

| Field | Semantics |
| --- | --- |
| `organization_id` | Server-owned UUID |
| `name` | Existing organization display name, nonblank string, maximum 240 characters |
| `business_contact_name` | Optional, unverified string, maximum 200 characters |
| `business_contact_email` | Optional, unverified string, maximum 320 characters, basic email format only |
| `business_contact_phone` | Optional, unverified freeform international string, maximum 80 characters |
| `business_address` | Optional, unverified plain text, maximum 2,000 characters; internal line breaks preserved |
| `version` | Optimistic integer version; 0 before the first saved change |
| `updated_at` | Timestamp of the profile change; before the first change, the existing organization timestamp |

PATCH requires a nonnegative 32-bit integer `version` and at least one editable field. Unsupported fields, wrong types and control characters are rejected with 422. Boundary whitespace is trimmed; original email/phone spelling is retained. Optional `null`, empty or whitespace-only strings clear that field. Omitted fields retain their current values. `name` cannot be null or blank. No numeric phone coercion, guessed country rules, legal address parsing, or external validation is applied.

The submitted version is checked before no-op detection. A stale version yields 409 `version_conflict`, even if the fields match current values. A current-version no-op preserves the version/timestamp and creates neither a profile row nor an audit event. Each actual change advances the version exactly once. Integer exhaustion yields 409 with no changes. A successful save returns the confirmed snapshot; an explicit conflict reload is required before resubmission.

## Additive schema and atomic authority

`b2b.organizations.name` remains authoritative for all existing API v1 consumers. A new `b2b.organization_profiles` row, keyed by the existing organization UUID, holds only the four optional fields, version, and timestamp. GET does not create a row; the first changed PATCH inserts version 1. Existing organization rows, role grants, source assets and earlier slices are preserved. This table is outside generated Strapi content types and public schema synchronization.

Schema creation takes the existing advisory schema lock. An existing profile table must have the exact expected column types/lengths/nullability/defaults, an organization primary/foreign key and positive integer version constraint. A mismatch fails startup for an explicit reviewed migration; it is never automatically repaired, truncated or replaced. No customer/existing database has been migrated by this work. Local checks create dedicated disposable databases.

Unsupported additional constraints or unique indexes also fail preflight, so an
unreviewed required-email check or contact uniqueness rule cannot silently change
the optional-field contract.

Each read and write revalidates authority inside a transaction. Lock order is user SHARE → membership SHARE → organization SHARE for reads or UPDATE for writes → role SHARE. The organization lock is selected at first acquisition; there is no concurrent SHARE-to-UPDATE upgrade. This matches the existing domain order and serializes both first and later saves. Current role scope and grants are checked after locking. The version comparison, optional profile insert/update, existing display-name update, and one before/after audit event share the transaction. An audit failure rolls all fields back.

The existing role schema has no `is_active` flag. A missing/wrong-organization role or revoked required grant is denied; no new role lifecycle is implied. The existing production-start refusal remains in effect: `APP_ENV=production` is unsupported.

## Product decisions still needed

- Which real organization roles should receive read and update grants? Production assignment needs an explicit reviewed RBAC decision and migration; bootstrap never grants them.
- Should any business contact field become mandatory, and in which workflow? All four are optional here.
- What evidence, authority and process would verify contact details or legal requisites? This slice verifies none of them.
- Retention/access policy for contact values in before/after audit history must be agreed before real data is introduced.
- Bank/legal identifiers, documents, manager assignment, customer approval, payment, notifications and external email delivery are out of scope.

## Verification

`npm run check --prefix backend-node` includes strict profile validation tests. `bash backend-node/scripts/run-local-tests.sh --integration-only` creates a fresh isolated cluster and runs existing and new PostgreSQL suites. The company-profile integration file requires the exact `alageum_strapi_domain_test` database and drops only that dedicated database's `b2b` test schema.

Integration checks include unchanged organization/default role rows, repeatable schema creation, incompatible schema refusal, separate read-only/update-only/denied fixtures, cross-tenant and multi-membership boundaries, native CMS credential rejection, stale authority rechecks, simultaneous first/later writers, audit rollback, explicit no-op/clear/omitted semantics and no-store responses. All contacts used for verification are fictitious `example.test` data.

Browser acceptance lives in a separate profile Playwright suite and isolated fixture runner; it must not enter the existing default or optional webpack scope. A real saved-state reload, desktop/mobile layout, concurrency conflict, permission denial and interrupted session/navigation requests are acceptance requirements. Local Chromium execution is blocked by the executor's Unix-socket restriction; hosted execution is required, and a test listing is not a browser pass. Runtime passwords/tokens and raw databases are excluded from publishable evidence.

Run `bash backend-node/scripts/run-profile-tests.sh --browser` for the separate
17-case profile suite; `--backend-only` proves its real HTTP setup locally without
claiming a browser pass. A fresh profile build uses `ALAGEUM_PROFILE_BUILD=1` and
the isolated `.next-profile` output. The runner waits out the setup-login rate
window rather than weakening the existing login limiter.

Local verification on 2026-10-02: backend check 82/82, complete PostgreSQL
integration 74/74, frontend unit 190/190, full frontend lint, production Next
profile build and production Strapi admin build passed. The isolated HTTP runner
passed 4/4 groups, including real no-store headers. Hosted profile browser
execution and its saved-state screenshots remain pending; no local Chromium run
is claimed.

The controlled persisted-pageshow regression preserves a new unsaved draft after
a confirmed save, makes no automatic profile read or mutation replay, and checks
that the saved server snapshot remains unchanged. This is application lifecycle
coverage, not native BFCache evidence; see
[`node-session-read-invalidation.md`](node-session-read-invalidation.md).
