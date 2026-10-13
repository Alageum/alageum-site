# Controlled account registration and company onboarding

This extension uses the existing `b2b` domain, Node 24 and PostgreSQL 16+. Strapi `users-permissions` remains disabled. The production startup refusal, static catalog/source approvals and CMS separation are unchanged.

## State and authority

1. `POST /auth/register` accepts `email`, `password` (12–128 characters), `display_name`. The normalized email is database-unique, including concurrent requests. It creates an inactive `b2b.users` identity and pending `registration_profiles` entry only.
2. Email verification consumes a random single-use, 24-hour token and activates the identity. Only SHA-256 token digests are stored in `account_tokens`. The plaintext exists transiently in memory and in an AES-256-GCM-encrypted mail outbox.
3. The user signs in through the shared HttpOnly browser-session flow. `/auth/account` is available without memberships. Membership-only APIs remain denied.
4. A company request provides a company name and exact external identifier (for example BIN). The identifier may route the pending request to an existing company; neither name, email/domain nor identifier creates a membership. Unknown identifiers remain pending without revealing whether a company exists.
5. A current selected-company manager with `organization.manage_users` explicitly approves a tenant-local role. The approved role must contain only permissions that manager holds. Global roles, `catalog.manage`, other-company roles, self-approval and replacement/reactivation of existing memberships are rejected. Every decision is audited atomically with the membership change.
6. The local operator command bootstraps an explicitly chosen existing email-verified user and organization. CMS admin registration does not grant business roles.

## HTTP contract

All public mutations require the configured exact Origin. Authenticated mutations additionally use the shared browser-session boundary and locked session checks. Responses use private/no-store. All paths below are relative to `/api/v1`.

- POST `/auth/register` `{email,password,display_name}` → 202 `{status:"accepted",message:...}`
- POST `/auth/resend-verification` `{email}` → same generic 202
- POST `/auth/forgot-password` `{email}` → same generic 202
- POST `/auth/verify-email` `{token}` → 200 `{status:"verified"}`
- POST `/auth/reset-password` `{token,password}` → 200 `{status:"password_reset"}`
- GET `/auth/account` → `{user,email_verified,onboarding_status,company_requests,permissions:[]}`
- POST `/auth/company-access-requests` `{company_name,company_identifier,message?}` → 201 `{request}` (repeated pending request is idempotent)
- GET `/organization/access-requests` → `{items}` for selected-company manager
- GET `/organization/access-roles` → `{items:[{id,name,code}]}` for selected-company manager
- POST `/organization/access-requests/:id/approve` `{role_id}` → `{request}`
- POST `/organization/access-requests/:id/reject` `{reason?}` → `{request}`

Invalid/expired/consumed verification or reset links give 400 `invalid_token`. Unsupported fields give 422. Per-IP and keyed-email quotas use atomic PostgreSQL buckets; callers cannot bypass them with untrusted forwarding headers. Limits: 20 mail attempts/IP/15 min, 5/email/15 min, 30 token attempts/IP/15 min. Behind a reverse proxy this conservatively limits the directly connected peer; production trusted-proxy client identification still needs operational review.

Password reset consumes a 30-minute single-use token and atomically increments `users.credential_version`. Browser sessions, refresh sessions and bearer tokens capture this version, and the shared auth service rejects mismatches on every authorization check. Reset does not automatically sign in the browser. Token operations lock user before token; reset never takes session-row locks while holding the user lock.

## SMTP configuration and honest delivery status

Registration mail defaults to disabled. Signup/resend/reset-request endpoints return a global 503 `mail_unavailable` until SMTP is explicitly configured. No demo inbox, real credentials, sendmail fallback or successful no-op delivery is supplied.

Required deployment configuration:

- `ALAGEUM_BROWSER_ORIGIN`: exact site origin, HTTPS outside permitted local development
- `ALAGEUM_REGISTRATION_MAIL_PROVIDER=smtp`
- `ALAGEUM_SMTP_HOST`
- `ALAGEUM_SMTP_PORT`: 465, 587 or 2525
- `ALAGEUM_MAIL_FROM`: bare sender email
- `ALAGEUM_SMTP_USER` and `ALAGEUM_SMTP_PASSWORD` if required by the provider

Wire these to `config.registrationMail.{provider,host,port,from,user,pass}`. Port 465 uses implicit TLS; other allowed ports require STARTTLS. Certificates are verified and TLS 1.2+ is mandatory. The adapter disables filesystem and URL access for mail content. No credentials are written by the implementation.

`startMailWorker()` polls durable outbox rows every 15 seconds; `stopMailWorker()` clears the timer and drains active work before database shutdown. Jobs are claimed with row locks/leases, retried up to five attempts with exponential delay, and removed after expiry. SMTP acceptance is audited as `account_mail_accepted`, which is not an inbox-delivery guarantee. Provider failures are recorded without the provider error, address or token. After exhausted attempts the user can request another link. The generic HTTP 202 describes acceptance only and does not assert email delivery.

Links target `/verify-email#token=...` and `/reset-password#token=...`; fragments keep tokens out of web server logs and Referer headers. The browser consumes the fragment locally and posts the token in the request body. Do not add analytics/logging that capture these bodies/fragments.

The outbox encryption key is derived from the existing application JWT secret with a distinct domain label. Keep that secret stable until queued jobs complete; rotation makes older queued ciphertext unreadable. Outbox jobs do not expose their payload in ordinary API responses or logs. Unused expired tokens are retained as hashed audit state; deployments should establish a reviewed retention policy.

## Bootstrap an authorized operator locally

This is implementation, not permission to run it against someone else's account/database. Obtain approval for the exact existing user, organization and privilege grant before applying. It never creates a password, bypasses verification or uses demo credentials. It only accepts a local loopback PostgreSQL URL and explicit development/test APP_ENV.

Run a dry-run first using an existing email-verified registration:

    APP_ENV=development ALAGEUM_OPERATOR_DATABASE_URL="$LOCAL_DATABASE_URL" \
      node scripts/provision-business-operator.js \
      --email operator@example.test --mode organization-admin \
      --create-organization --organization-name "Company name" \
      --organization-identifier "EXACT-BIN"

Review the selected account/company. Add `--apply` only with authorization. To use an existing company, replace the create/name/identifier arguments with `--organization-id UUID`. A new company gets a bounded organization-admin role plus a basic company-member role; pending matching identifier requests are routed, never approved automatically.

If a company was created through a different administrator workflow after a request arrived, route the pending requests explicitly:

    APP_ENV=development ALAGEUM_OPERATOR_DATABASE_URL="$LOCAL_DATABASE_URL" \
      node scripts/provision-business-operator.js \
      --route-pending --organization-id UUID

The dry-run lists only request IDs matching that company's exact external identifier. Review, then add `--apply` with authorization. This sets routing only; status remains pending and the company manager must still approve an allowed role. Incorrect identifiers require the applicant to submit corrected information or contact the administrator.

A separate explicit `--mode catalog-manager` grants the existing platform `catalog.manage` role. It is not implied by organization administrator or signup. Existing memberships are never silently replaced by this command. No operator command or real SMTP delivery was performed as part of implementation/tests.

## Verification

Focused tests:

    node --test tests/registration.test.js

Real database test (fresh dedicated database, never an existing domain schema):

    ALAGEUM_REGISTRATION_TEST_DATABASE_URL=postgres://.../alageum_registration_test \
      node --test tests/registration.integration.js

The integration suite refuses a pre-existing `b2b` schema rather than dropping it. It covers duplicate/race identity creation, inactive login, single-winner verification/reset, expired and superseded tokens, no implicit membership, company request deduplication, cross-tenant/role denials, concurrent approval, encrypted mail handling and transactional quotas. Email delivery is mocked and uses reserved synthetic addresses. This does not establish actual SMTP deliverability or production readiness.

### Implementation verification, 13 October 2026

Node 24.19.0 with a disposable PostgreSQL 18.4 cluster: all 31 registration-related tests passed (8 unit, 18 PostgreSQL domain-suite results, 5 integrated cookie/auth-suite results, including the two enclosing suites). No skips. The combined suite calls the real registration, browser-session and auth services for signup → verification → cookie login → personal account → company request → explicit approval, then password reset and old-cookie/access/refresh rejection. Database state and emails are synthetic. Real SMTP delivery, browser screenshots, full Strapi startup and production release are not established by these tests.

Combined cookie flow test:

    ALAGEUM_REGISTRATION_BROWSER_TEST_DATABASE_URL=postgres://.../alageum_registration_browser_test \
      node --test tests/registration-browser.integration.js

In environments with per-command network isolation, start PostgreSQL and invoke the tests within the same command environment. The test database must be new on each run; optional `_suffix` names are supported for these two registration suites.

Independent review also covered logged-out account/session loops and newer same-route token links in the frontend. The backend regression suite deterministically blocks both concurrent manager decisions after their authorization locks, then releases them together; existing memberships are rejected without reciprocal row-lock deadlock. Operator bootstrap audit identifies the target account as metadata, never as the unverified actor of the local CLI.
