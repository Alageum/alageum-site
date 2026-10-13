# EDS candidate verification — 2026-10-12

This is a local, disabled technical increment based on draft PR #45 commit
`a32f7878d25a7d4e26d063ec6914b72d2f814383`. No push, merge, deployment, SDK
registration, legal agreement or real signing was performed.

## Passed

- Locked installs: backend and frontend; no package or lockfile changes.
- Backend aggregate `npm run check`: **669/669** tests, syntax/package checks.
- Real isolated PostgreSQL **16.13** signing domain suite: **22/22** checks,
  including the suite container; no skips. It covers tenant/actor isolation,
  permissions, exact immutable byte/hash binding, expiry, malformed/oversize
  input, cancel, replay/conflicting retries, idempotency/concurrency, unavailable
  and untrusted providers, authority revocation, audit rollback, verified receipt
  precedence, schema drift and explicit recheck after reload.
- Concurrent finalization tests hold newer-version insertion, selected-file
  mutation and older-version renumbering until the accepted transaction commits.
- Actual Strapi HTTP wiring on a separate fresh database: **6/6** checks. Even
  with the feature flag on, the actual bootstrap cannot prepare signing because
  its verifier is unavailable. Multipart is rejected before upload parsing.
  Existing document detail still has exactly seven fields.
- Full Strapi administrator production build.
- Whole frontend ESLint and flag-on Next production build.
- Final frontend aggregate **729/729**, zero failures/skips. Final affected
  tests also pass **32/32** (20 signing, 12 unchanged document metadata).
- Actual cloud Chromium browser suite **26/26**, desktop and Pixel 7, zero retries.
  This covers explicit signing gestures, immutable preview/hash, unavailable
  verifier, pending/recheck status, lost-result retry, Close/Cancel, changed
  organization/logout/new-login scope, malformed/disconnected NCALayer results,
  navigation and Back. API and NCALayer responses are synthetic, not real EDS.
- `git diff --check`.
- Independent read-only security review: four P2 findings corrected; final
  re-review reports no remaining blocking finding for this narrow disabled
  increment. Fixes cover full-version locking, pending recheck recovery,
  unconditional database-trigger checks and verified-receipt precedence.

All cryptographic verification results in automated signing tests are explicitly
synthetic provider responses. They test our state/authorization boundary, not
Kazakhstan cryptography, real certificates, OCSP, a trusted timestamp or legal
signature validity.

## Not accepted / still required

- Initial shell Chromium attempts failed before app interaction with a
  local-socket restriction. The supported cloud-computer route subsequently
  executed and passed all 26 cases. This does not validate a real NCALayer install.
- A real NCALayer session, official SDK/runtime/license and cryptographic fixtures
  have not been exercised or acquired. Actual application signing remains off.
- Production private-byte ingestion/scanning/storage, certificate-to-company
  authority, distributed limits, retention/recovery, recipients/delivery and
  operational rollout remain open.
- Existing dependency-security findings and production startup/session/cutover
  blocks are not waived. Dependency audit was not reclassified by this work.
- The historical catalog/security approval files and their 614-file dependency
  closure are unchanged. Cancellation uses a new POST route and does not widen
  the existing CORS methods.

See [implementation and rollout boundaries](node-document-signing.md).
