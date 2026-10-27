# Client-created КП → assigned manager → full ЭЦП: bounded foundation

This increment does **not** claim a working legal-signature integration. No real keys,
certificates, signing, outbound customer/manager message, or order conversion was used.

## Implemented

- Existing catalog quote capture remains authoritative: saved product snapshots and
  quantities, not browser-supplied prices. Existing quote status stays `submitted`.
- Additive `b2b.quote_signing_packets` binds canonical saved quote payload/hash to an
  already reviewed immutable EDS PDF snapshot/hash. Customer organization/creator
  are separate from supplier signing organization/assigned manager.
- Server `quote-pdf.js` renders the canonical saved selection using pinned PDFKit and
  bundled OFL Noto Sans. It includes source SHA256 and reference-price/no-offer/no-order
  notice. No external resource fetching, executable document content, financial totals
  or invented terms. Output is bounded to 1 MiB and deterministic for the same payload.
- Creator-only `POST /quotes/:id/signature-request/prepare` renders outside the DB
  transaction, admits exact bytes via the same fail-closed ClamAV/storage boundary,
  then rechecks session, permission, catalog snapshot and manager authorization before
  atomically creating supplier document/version/snapshot/packet. Failed commit removes
  the private file; concurrent preparation discards its duplicate. No arbitrary PDF
  upload or caller-supplied supplier identity is accepted by this route.
- Creator-only `GET /quotes/:id/signature-request/pdf` returns the exact immutable
  snapshot. Client checks SHA256 before saving. Preparation is separate from the
  explicit client request to the manager. Hash binding complements, rather than
  replacing, renderer review.
- Packet fields cannot be updated/deleted. Only first `requested_at` transition is
  allowed. Duplicate client requests return the same request state and do not repeat audit.
- Creator-only `GET/POST /api/v1/quotes/:id/signature-request`; POST body is `{}`.
  Missing routing/storage produces `configuration_required` / HTTP 503,
  never fabricated assignment or success. A client request is not a signature.
- All existing EDS operations enforce assigned user + selected supplier organization,
  current active membership/read+sign permissions, client-request existence, exact
  current PDF binding. Authorization runs again after document locking and after
  external verification. Existing EDS expiry/cancel/replay logic is retained.
- Quote detail explains configuration-required state and, only for a prepared packet,
  can request full ЭЦП. `GET /quote-signature-requests` is a paginated assigned-manager
  inbox, shown in Documents with the existing signing panel. No external notification
  delivery is implemented.

## Required operator/integration work — NOT completed

1. Confirm the supplier legal organization and designated manager. Configure both
   `ALAGEUM_QUOTE_SIGNING_ORGANIZATION_ID` and `ALAGEUM_QUOTE_SIGNING_MANAGER_ID`
   with actual UUIDs; leave both empty until confirmed. Partial/invalid config fails
   startup. The manager needs active membership and `document.read`/`document.sign`.
   An application role alone does not prove legal signing authority.
2. Review the generated final-list document wording/format for the business use case.
   Rendering/storage/scan/binding pipeline is now implemented; deployment must configure
   protected document root and live ClamAV. It deliberately contains reference catalog
   values rather than inventing an enforceable seller offer, taxes, delivery/payment
   terms or obligations. Changing this commercial meaning requires explicit requirements.
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
6. Configure external notification delivery and post-signature commercial workflow
   explicitly; assigned-manager internal inbox is implemented. Do not infer conversion into an order or external sending approval.

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

## SDK acquisition barrier verified directly (2026-10-25)

Read-only inspection of official `https://sdk.pki.gov.kz/` and its public application
asset `/static/js/main.a7722edb.js` established the supported route:

- Initial registration selects physical/legal person and requires personal-data consent
  at `https://sdk.pki.gov.kz/user-check`, CAPTCHA, IIN and (legal entity) BIN/company.
- Application fields include information-system name, phone, email and user count.
  Submission invokes NCALayer to sign the application XML. Owner/authorized representative
  must perform this action; no registration, consent, CAPTCHA, signing or submission was
  performed by the assistant.
- Existing registrants can use `https://sdk.pki.gov.kz/get-sdk/` to request a download
  link at their previously registered email. No email dispatch was attempted.
- Official NCA 2025-10-23 announcement confirms updated test certificates are included
  in the SDK: https://pki.gov.kz/ru/2025/10/23/уважаемые-пользователи-10/

Needed handoff: authorized representative completes registration/retrieval and provides
SDK libraries + documentation + test fixtures through an approved file channel. Do not
send private keys/passwords. No public unauthenticated official SDK archive was identified;
third-party redistributed crypto libraries are not a substitute for this trust boundary.
