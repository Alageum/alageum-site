# Client-created КП → assigned manager → full ЭЦП: bounded foundation

This increment does **not** claim a working legal-signature integration. No real keys,
certificates, signing, outbound customer/manager message, or order conversion was used.

## Implemented

- Existing catalog quote capture remains authoritative: saved product snapshots and
  quantities, not browser-supplied prices. Existing quote status stays `submitted`.
- Additive `b2b.quote_signing_packets` binds canonical saved quote payload/hash to an
  already reviewed immutable EDS PDF snapshot/hash. Customer organization/creator
  are separate from supplier signing organization/assigned manager.
- Only trusted server rendering code may call `provisionPacket`; there is no public
  provisioning/upload URL. It must render the exact canonical payload, then provide
  `renderedQuoteSha256` and the already provisioned EDS snapshot ID. A hash alone is
  not proof that the PDF accurately represents its source; renderer review is required.
- Packet fields cannot be updated/deleted. Only first `requested_at` transition is
  allowed. Duplicate client requests return the same request state and do not repeat audit.
- Creator-only `GET/POST /api/v1/quotes/:id/signature-request`; POST body is `{}`.
  Missing routing or reviewed PDF produces `configuration_required` / HTTP 503,
  never fabricated assignment or success. A client request is not a signature.
- All existing EDS operations enforce assigned user + selected supplier organization,
  current active membership/read+sign permissions, client-request existence, exact
  current PDF binding. Authorization runs again after document locking and after
  external verification. Existing EDS expiry/cancel/replay logic is retained.
- Quote detail explains configuration-required state and, only for a prepared packet,
  can request full ЭЦП. The existing document signing panel remains the signing UI;
  no supplier inbox or external notification delivery is implemented here.

## Required operator/integration work — NOT completed

1. Confirm the supplier legal organization and designated manager. Configure both
   `ALAGEUM_QUOTE_SIGNING_ORGANIZATION_ID` and `ALAGEUM_QUOTE_SIGNING_MANAGER_ID`
   with actual UUIDs; leave both empty until confirmed. Partial/invalid config fails
   startup. The manager needs active membership and `document.read`/`document.sign`.
   An application role alone does not prove legal signing authority.
2. Implement/review deterministic server PDF rendering from the saved final list,
   including required document wording/format. Do not invent price, taxes, delivery,
   payment terms, or contractual obligations. Reuse reviewed private document storage
   and malware scanning, then `document-signing.provisionSnapshot` and `provisionPacket`.
   This pipeline is intentionally not auto-wired; therefore no live quote becomes
   ready solely by setting environment variables.
3. Obtain official NCA SDK/libraries, current integration/API documentation and test
   certificates through the company-authorized SDK access process. Supply supported
   runtime/architecture, approved trust anchors, revocation/OCSP policy, certificate
   usages and manager/company (BIN/IIN/authority) validation rules. No private keys
   or key passwords belong on this application server or in chat.
4. Implement a reviewed server adapter to the official SDK using exact signed bytes
   and detached CMS; verify signature, trusted chain, certificate validity/use,
   revocation and actual company/signatory authority. Retain immutable PDF/CMS plus
   bounded verification evidence (certificate fingerprint, provider/profile/version,
   verification timestamp and revocation result). Existing default verifier remains
   **unavailable**; no generic remote boolean endpoint or mock-success switch is added.
5. Test valid, changed payload, foreign company/manager, expired/revoked/untrusted
   cert, wrong key usage, unavailable OCSP, timeout, replay, concurrent requests and
   cancellation using official test fixtures. Verify current NCALayer response/profile
   against those fixtures. Test-only synthetic outcomes are not cryptographic evidence.
6. Design manager inbox/notification delivery and post-signature commercial workflow
   explicitly. Do not infer conversion into an order or external sending approval.

## Official references checked 2026-10-25

- NCA developer/SDK acquisition: <https://pki.gov.kz/ru/developers/>
- Current official NCALayer JS example:
  <https://raw.githubusercontent.com/pkigovkz/NCALayerJSExample/master/js/ncalayer.js>
- NCA September 2026 update states NCALayer now creates/verifies CAdES/XAdES/PAdES
  B/T/LT/LTA; avoid outdated blanket claims that NCALayer never verifies signatures:
  <https://pki.gov.kz/en/2026/09/02/%F0%9F%9B%A0%EF%B8%8F-ncalayer-update-%F0%9F%9B%A0%EF%B8%8F/>
  Browser verification still cannot replace independent server verification.
- NCA backend discussion (illustrative, not a substitute for current SDK docs):
  <https://forum.pki.gov.kz/t/poryadok-proverki-na-backend/3564>

## Verification boundary

New unit tests cover explicit routing, assignment/tenant/permission denial, canonical
payload binding and no invented amounts, DDL guard contract, production authorization
hook and UI receipt validation. Existing EDS policy tests continue to pass locally.
The PostgreSQL signing integration suite now includes packet provisioning/idempotency,
creator isolation, manager isolation, immutable update/delete rejection, cancel/expiry,
one audit event and schema drift rejection. It requires the existing disposable
`run-signing-tests.sh` runner; local PostgreSQL was unavailable during implementation.
Do not mark SQL integration, browser rendering, live SDK or real ЭЦП verified until
those exact tests have run. No merge or deployment belongs to this increment.
