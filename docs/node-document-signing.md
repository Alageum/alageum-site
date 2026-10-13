# Kazakhstan EDS: disabled, local first increment

Base: draft PR #45, commit `a32f7878d25a7d4e26d063ec6914b72d2f814383`.
This candidate is additive to Node 24 / Strapi 5.56.0 / Next 16.3.8. It has not
been published, deployed or exercised with a real key or signature. It does not
clear the existing dependency-security or production-startup gates.

## What is implemented

- The existing seven-field GET document list/detail contracts are unchanged.
- A separate per-document panel displays the immutable version number, size and
  SHA-256 before a distinct user action can open NCALayer.
- The browser sends exact decoded document bytes to the fixed
  `wss://127.0.0.1:13579/` address. No key, password, certificate selection result,
  or signing secret passes through the application. CMS output is a candidate
  signature, not proof of server verification.
- Intent preparation, submission, cancellation and explicit re-verification are
  scoped to the authenticated user and selected organization. Mutations require
  both `document.read` and the new `document.sign` permission. No existing role,
  demo identity or native Strapi administrator receives the new permission.
- New private `b2b.eds_snapshots`, `b2b.eds_intents` and `b2b.eds_signatures` tables
  preserve exact reviewed PDF bytes and detached CMS separately. They are not
  Strapi public media, URLs or generic uploads. PDF limit: 5 MiB. CMS limit:
  256 KiB decoded; JSON request-body limit remains 1 MiB.
- Snapshot bytes are immutable under database triggers and tied to an existing
  same-tenant document version and file metadata. A server-internal provisioning
  function requires exact hash/size agreement; there is no provisioning/upload
  HTTP endpoint or arbitrary URL/path reader.
- Intents expire after five minutes; no more than five can be open per user and
  organization. The limit is serialized across concurrent preparations.
- Signature submission is idempotent for the same intent and exact CMS bytes.
  Conflicting retries and replay across documents/intents are rejected. Accepted
  bytes remain available for an explicit server-side recheck after a page reload.
- `pending_verification`, `verified` and `rejected` are distinct. A verified
  receipt takes precedence over later failed attempts for the same version.
  Browser messages do not say a pending signature is signed or delivered.
- Current document/version/file authority is held while transactions commit.
  Authorization is checked again after external verification; the trusted-state
  transition and audit event commit together. Provider work occurs outside the
  transaction, with a timeout and cancellation signal. Identical concurrent
  checks share one in-process call; at most four checks run in this service
  instance. These controls are not distributed production abuse protection.
- Close, Cancel, logout, organization/session changes, pagehide and unmount
  abort client work and suppress stale results. Cancellation cannot undo a CMS
  already created by NCALayer or an already accepted server submission; the UI
  distinguishes that uncertainty and offers a status check.
- Delivery remains `not_configured`. There is no recipient, email, CRM, EDO or
  automatic company-delivery action.

## Routes

All are beneath `/api/v1`, with private/no-store responses:

- GET `/documents/:id/signing`
- POST `/documents/:id/signing/intents`, body `{version_id}`
- POST `/documents/:id/signing/intents/:intentId`, body `{signature_base64}`
- POST `/documents/:id/signing/intents/:intentId/cancel`, body `{}`
- POST `/documents/:id/signing/signatures/:signatureId/verify`, body `{}`

Only the original submitting user may cancel, retry or recheck an attempt.
Organization peers with `document.read` can view its bounded status. Read and
sign permissions are separate from certificate-derived authority to bind a
company; the eventual verifier must establish that authority separately.

## Safe default and verification boundary

`ALAGEUM_EDS_ENABLED` defaults to `0`. The browser build-time flag
`NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED` also defaults off; setting it to `1`
requires rebuilding Next and exposes only the bounded panel. Neither flag
installs a verifier or grants permissions.

The actual Strapi bootstrap always uses `unavailableVerifier` in this increment.
Even with both flags on, intent preparation is unavailable and no real
NCALayer signing can begin through the app. No environment URL can silently
route confidential documents to an external verifier. Successful verification
is injected only inside synthetic tests; there is no production mock mode.

The provider contract requires exact content SHA-256, cryptographic signature
validity, trusted chain, certificate time validity and signing usage,
non-revoked status, and authorization for the selected organization. Missing,
malformed or untrusted evidence cannot produce `verified`; provider outages,
exceptions and timeout remain pending. The adapter implementation must enforce
pinned trust roots, policy, authenticated fresh OCSP/CRL evidence and any trusted
signing timestamp. A boolean supplied by the browser or certificate parsing is
never a substitute.

## Verified official sources and remaining prerequisites

The public [NCA sample](https://github.com/pkigovkz/NCALayerJSExample/blob/dedd2f6c210ef4d532ade436914a2d58b5fc1dd8/js/ncalayer.js)
uses `kz.gov.pki.knca.basics` / `sign`, CMS, `decode:true`,
`encapsulate:false`, `digested:false`. The adapter deliberately omits chain
relaxations, expired/revoked allowances and `outputCert`. It accepts a nonempty
single CMS string or one-entry string array; ambiguous/malformed results fail.
Live NCALayer response/cancellation compatibility has not been established.

NCA's [September 2, 2026 announcement](https://pki.gov.kz/en/2026/09/02/%F0%9F%9B%A0%EF%B8%8F-ncalayer-update-%F0%9F%9B%A0%EF%B8%8F/)
announces CAdES/XAdES/PAdES levels. This prototype does not claim a compliant
B/T/LT/LTA profile. Current [Rules No. 500/НҚ](https://adilet.zan.kz/rus/docs/V2600039672)
and the selected document/signatory workflow require appropriate review.

The official [developer page](https://pki.gov.kz/ru/developers/) points to
[SDK registration](https://sdk.pki.gov.kz/) or
[repeat delivery](https://sdk.pki.gov.kz/get-sdk/). Registration can require
personal data, an explicit agreement and CAPTCHA. No agreement was accepted,
information submitted or SDK obtained for this work. Current SDK/runtime,
license, exact server API, trust/revocation fixtures and real interoperability
remain unverified. An [NCA-hosted backend example](https://forum.pki.gov.kz/t/poryadok-proverki-na-backend/3564)
separates cryptographic verification from certificate/OCSP validation.

Before enabling real signing:

1. Acquire and review the official SDK and permitted runtime/license.
2. Implement the real fail-closed verifier and validate real official fixtures,
   algorithms, chain, expiry, revocation, timestamps and substitution attacks.
3. Connect reviewed/generated or malware-cleared private document bytes; approve
   storage encryption, backup/restore, retention and schema rollout.
4. Establish certificate-to-user/company authority and explicitly grant roles.
5. Verify NCALayer on supported browsers, operating systems and certificate stores.
6. Configure the recipient/delivery workflow only when separately authorized.
7. Complete the existing production/session/dependency/hosting acceptance gates.

These prerequisites do not prevent reviewing the reversible technical foundation.

## Checks

- Backend aggregate: `npm --prefix backend-node run check`.
- Isolated real PostgreSQL domain suite:
  `PG_BIN=/path/to/postgresql/bin backend-node/scripts/run-signing-tests.sh`.
  The runner creates a fresh loopback-only database named
  `alageum_strapi_eds_test`; it never accepts a caller's customer database.
  Packaged PostgreSQL binaries may require their sibling `lib` directory in
  `LD_LIBRARY_PATH`. The runner owns startup and shutdown in one process tree.
- Frontend: `npm --prefix frontend run lint`, `npm --prefix frontend run test:unit`.
- Synthetic browser suite:
  `cd frontend && npx playwright test --config=playwright.document-signing.config.mjs`.
  Browser interception tests are UI tests, not real signatures or backend
  cryptographic acceptance.

See the companion validation report for exact passed, failed and blocked stages.
