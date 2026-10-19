# Registration mail and authorized operator setup

This runbook covers the B2B account domain added on the `588dc98` feature baseline. It does not authorize a production deployment, external email, new credentials or a real permission grant. The production startup guard remains in force.

## 1. Choose the actual mail provider and sender

An operator must approve the SMTP provider, sender address/domain and any recipient used for a real smoke test. Put credentials in the deployment's approved private environment/secret store. Never commit them, paste them into chat, expose them as `NEXT_PUBLIC_*` variables, or log the environment.

The backend template now includes all required names:

| Variable | Meaning |
| --- | --- |
| `ALAGEUM_REGISTRATION_MAIL_PROVIDER` | `disabled` by default; explicitly choose `smtp` |
| `ALAGEUM_SMTP_HOST` | Approved SMTP DNS hostname or IP, without a URL scheme/path |
| `ALAGEUM_SMTP_PORT` | 465 for implicit TLS; 587 or 2525 for mandatory STARTTLS |
| `ALAGEUM_SMTP_TLS_SERVERNAME` | Optional DNS certificate hostname when connecting to an IP |
| `ALAGEUM_MAIL_FROM` | One approved bare sender mailbox, without a display name/list |
| `ALAGEUM_SMTP_USER`, `ALAGEUM_SMTP_PASSWORD` | Provider authentication; both supplied or both empty for an explicitly approved authenticated-network relay |
| `ALAGEUM_BROWSER_ORIGIN` | Exact same-origin site URL; HTTPS except explicit localhost development/test |

TLS certificate verification is always enabled and TLS 1.2+ is required. An invalid certificate, unavailable STARTTLS, or rejected authentication fails closed. An optional certificate server name changes hostname verification; it never disables verification. `NODE_TLS_REJECT_UNAUTHORIZED=0` is not a supported workaround.

## 2. Configuration check, then a separately authorized connection probe

From `backend-node`, after `npm ci`, check only local configuration:

    node --env-file=/absolute/path/to/private.env scripts/check-registration-mail.js --config-only

This command makes no network request and sends no email. It prints safe issue identifiers, not host credentials or values. Exit status is 0 for syntactically usable configuration and 2 for missing/invalid settings. It does not prove reachability or sender authorization.

Only after approval to use the selected provider/account, test its TLS and authentication:

    node --env-file=/absolute/path/to/private.env scripts/check-registration-mail.js --verify-connection

This explicitly contacts and authenticates with the configured SMTP server, but sends no message. Errors are reduced to safe codes. A successful connection does not establish sender acceptance, SPF/DKIM/DMARC, inbox placement, domain ownership or deliverability.

For a real email smoke test, separately authorize the sender, exact recipient and verification/reset message purpose. Have the account owner enter their own password in the application. Exercise signup and reset through the same-origin UI, confirm receipt and single-use links, and check the provider's approved sender/DNS configuration. No real smoke email was sent during this implementation.

## 3. Reproduce the local proof without external delivery

Create a fresh dedicated PostgreSQL database named `alageum_registration_mail_test` (an optional lowercase `_suffix` is supported). Do not point this test at a customer database. It refuses an existing `b2b` schema rather than deleting one.

    ALAGEUM_REGISTRATION_MAIL_TEST_DATABASE_URL=postgres://.../alageum_registration_mail_test \
      bash scripts/run-registration-mail-tests.sh

The test runner uses Node 24, the locked dependencies and OpenSSL. It creates an ephemeral one-day TLS identity under a temporary directory, trusts that certificate only in the test subprocess, and removes it on exit. The SMTP sink binds only `127.0.0.1:2525`, captures reserved `.test` addresses, and has no relay capability. SMTP credentials are fixed synthetic test values; they are not usable against any provider.

The test exercises actual Nodemailer SMTP/STARTTLS/authentication, PostgreSQL transactions, the registration domain and password login. It obtains verification/reset tokens from the captured MIME message rather than injecting tokens into the API response. Certificate mismatch, invalid authentication, missing STARTTLS, retries, restart/lease recovery, exhausted attempts, stale-worker acknowledgements, corrupted ciphertext and shutdown draining are covered. This is a local protocol/domain proof, not a full Strapi/browser deployment or external deliverability proof.

## 4. Outbox operation and recovery

- Registration and password-reset requests return generic `202 accepted` after a transactional enqueue. They do not claim inbox delivery.
- The outbox holds AES-256-GCM-encrypted recipient/link data. The token table holds only token hashes. Account links use fragments, keeping tokens out of server access logs and normal Referer headers.
- Workers poll every 15 seconds, claim rows with `FOR UPDATE SKIP LOCKED`, and use a unique lease identifier. Leases last 60 seconds and a live worker renews them every 20 seconds.
- A crashed worker's expired lease can be reclaimed. Every claim counts toward a maximum of five attempts, including crashes. A stale worker cannot delete or reschedule a row owned by its replacement.
- Failed attempts back off by 30, 60, 120 and 240 seconds. Exhausted or corrupted jobs lose their encrypted payload and produce a redacted terminal audit event. The worker rechecks token expiry and consumption before sending. A message already in flight can arrive after a token is consumed or expires; the application still rejects that token.
- Invalid or disabled SMTP configuration preserves unexpired queued work without consuming attempts. Expiry cleanup continues.
- `registration.mailWorkerStatus()` reports safe polling/configuration state and last successful queue tick. A successful tick is not evidence of email delivery. Individual acceptance/failure is recorded in `account_mail_accepted` / `account_mail_failed` audit events, including attempt/terminal flags and bounded failure codes.
- SMTP provides at-least-once behavior around an ambiguous acceptance or process crash. Duplicate messages remain possible; retries retain a stable Message-ID, but receiver deduplication is not guaranteed. Verification/reset tokens remain single-use.
- The AES key is derived from the existing application JWT secret with a distinct label. Drain the outbox before an approved key rotation. Older ciphertext cannot be recovered after rotation; affected users must request fresh links.

Upgrade note: stop old mail workers before rolling out the additive `lease_id` migration. Do not mix pre-fencing and new workers. No queue payload needs to be decrypted for migration. On a clean shutdown `stopMailWorker()` stops polling and awaits active delivery work before database teardown.

## 5. Bootstrap business access only with explicit approval

Strapi CMS administrators and B2B business users have separate identities and permissions. Creating the first CMS administrator does not grant `/admin/catalog` or company access.

Before applying a business grant, verify the exact existing email-verified account, company identifier/UUID and intended role with the authorized decision maker. There is no shared password, demo-account shortcut or email-verification bypass.

Use the separate local-only database variable and start with a dry-run:

    APP_ENV=development ALAGEUM_OPERATOR_DATABASE_URL="$APPROVED_LOCAL_DATABASE_URL" \
      node scripts/provision-business-operator.js \
      --email approved.operator@example.test --mode organization-admin \
      --create-organization --organization-name 'Approved company' \
      --organization-identifier 'EXACT-APPROVED-BIN'

For an existing company, replace the create/name/identifier options with `--organization-id UUID`. Review the returned target account, company and mode. `--apply` is a consequential grant and requires approval for those exact details. The command refuses an existing membership rather than changing its privileges. Only explicit `--mode catalog-manager` grants platform `catalog.manage`; an organization administrator does not receive it.

Pending requests for a company created outside this bootstrap can be routed without approving them:

    APP_ENV=development ALAGEUM_OPERATOR_DATABASE_URL="$APPROVED_LOCAL_DATABASE_URL" \
      node scripts/provision-business-operator.js --route-pending --organization-id UUID

Review the matching request IDs, then add `--apply` only when authorized. Routing matches the company's exact external identifier and leaves every request pending. An authorized company manager must still approve a tenant-local role.

The commands accept only loopback PostgreSQL with an explicit database user/name and explicit development/test APP_ENV. Database URL query parameters and fragments are rejected so they cannot override the verified destination. They never create authentication credentials. New/expanded real account access is outside the automated local proof and was not performed. Test grants were confined to disposable synthetic databases.

## References

- [Nodemailer SMTP transport and TLS options](https://nodemailer.com/smtp)
- [PostgreSQL row-locking and SKIP LOCKED semantics](https://www.postgresql.org/docs/18/sql-select.html)
