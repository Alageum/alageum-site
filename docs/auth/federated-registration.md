# Google registration and eGov integration boundary

Local candidate dated 2026-10-12. No deployment or provider project/application was created. Existing production startup guard remains in force.

## Implemented Google flow

- One Google button registers a new personal account or signs in the same account. Identity is keyed by the stable Google subject, never by a mutable email/name. Existing email collisions require the existing sign-in method; account linking is deliberately unavailable.
- Standard authorization-code flow with state, nonce and S256 PKCE; fixed official Google authorization/token/JWKS endpoints; server-side RS256 signature, issuer, audience/authorized-party, expiry/issued-at and verified-email checks. Only `openid email profile` scopes, online access; provider access/refresh tokens are not retained.
- Same-origin POST preparation/start/cancellation with strict Origin checks. Short-lived attempts are browser-bound and consumed before code exchange. Persistent latest-flow validation prevents a slow old callback recreating login after a newer flow/cancel/logout.
- Opaque eight-hour server sessions are stored by token hash. HttpOnly, host-only, SameSite=Lax cookies; Secure and `__Host-` names on HTTPS. HTTP is accepted solely for localhost/127.0.0.1 in development/test. Every authenticated browser request carries the public session ID as a tab-boundary header in addition to the cookie. That ID is not a bearer credential.
- Cookie rotation revokes the browser's earlier session. A late older cookie response therefore fails closed. Callback bootstrap must match the expected non-secret session ID, and stale frontend responses cannot install another account.
- Transactional callers such as document-signature finalization can use `auth.assertActiveSession(tx, ctx, userId)` to recheck and hold the cookie-session row until commit, then use `assertActiveContext` for the current role and organization. Acquire the session lock before domain locks; do not acquire a browser-flow row afterward. Existing bearer-token expiry semantics are unchanged.
- New personal accounts have zero memberships. Company access and `document.sign` are never inferred from a Google email, domain, name or account registration. Existing tenant and permission checks remain authoritative. External login is separate from Strapi CMS administration.
- App access logs omit query strings, including callback codes/state/errors. Reverse proxy/platform logs must also redact callback query strings before any live rollout.
- A suspended callback bootstrap preserves the previous still-owned session when a forged/expired callback URL is rejected. Logout treats an already-invalid old-tab session as locally signed out, without clearing another tab's newer server cookie.

## Configuration and topology

Keep `ALAGEUM_GOOGLE_ENABLED=false` until a reviewed Google web OAuth client exists. Configure only on the server:

- `ALAGEUM_GOOGLE_ENABLED=true`
- `ALAGEUM_BROWSER_ORIGIN=http://localhost:3000` for local testing, or the approved HTTPS app origin
- `ALAGEUM_GOOGLE_CLIENT_ID=<issued-web-client-id>.apps.googleusercontent.com`
- `ALAGEUM_GOOGLE_CLIENT_SECRET=<issued-secret>`

Google's exact registered redirect URI must be `${ALAGEUM_BROWSER_ORIGIN}/api/v1/auth/google/callback`. The frontend API must use the same origin (`NEXT_PUBLIC_API_URL=/api/v1` or unset). The existing separate-port/cross-origin demo setup does not support these cookie sessions. Use the existing same-origin deployment boundary or a reviewed development reverse proxy; do not enable permissive credentialed CORS.

The backend currently sets `proxy.koa=false`. For an HTTPS deployment with TLS termination, establish a trusted proxy boundary and secure request detection before enabling Google; do not blindly trust forwarded headers. Production remains blocked for the application's existing session/rate-limit/scanner/cutover requirements. Password/demo session storage is not promoted to production by this feature.

Client registration, consent configuration, credentials, DNS/HTTPS/proxy work, and any access grants require the appropriate authorized operator. This change only supplies code/configuration templates. Live Google login still needs real issued credentials and an end-to-end test at the intended origin.

## eGov: research-backed unavailable state

No public self-service eGov OIDC contract or documented endpoint was verified. eGov is visibly disabled rather than routed to an invented OAuth endpoint, fake QR, or simulated identity. This is an access/documentation gap, not proof that integration is unsupported.

Verified official leads:

1. The National Certification Authority explicitly offers eGov Mobile QR **signing** to owners of government and non-government information systems via Smart Bridge service `NITEC-S-5096`: <https://pki.gov.kz/ru/2022/10/07/qr-подписание-посредством-egov-mobile/> and <https://sb.egov.kz/smart-bridge/services/passport/NITEC-S-5096>. Signing eligibility does not establish ordinary federated account registration or company representation rights.
2. The official tax authority's electronic-invoice example uses QR signing within authentication, then system-specific account credentials: <https://www.gov.kz/memleket/entities/kgd/press/news/details/578217?lang=ru>.
3. Smart Bridge announced legal-entity EDS-only portal access on 18 December 2025: <https://sb.egov.kz/blog/ru/post/cmjr7d64g0004n7z3mjuwru82>.
4. Its 7 April 2026 notice describes paid B2B/G2B integration access and contracts, with a separate free-service list. QR service pricing/exemption was not verified: <https://sb.egov.kz/blog/ru/post/cmnoga9y5000007p4tc93wxmx>.
5. Its 15 July 2026 connection notice distinguishes test handling from production service-owner approval: <https://sb.egov.kz/blog/ru/post/cmrm17c4g000007p47m7s2u96>. Service-specific applicability must be confirmed.
6. Another official catalogue lead is `NITEC-S-1620 / MGOV_NOTIFICATION_AUTH`, eGov Mobile push-based digital authentication: <https://sb.egov.kz/services-catalogue?tagsLabels=%D0%91%D0%9C%D0%93&tagsValues=2723>. Commercial eligibility, exact claims and protocol remain unverified.
7. Digital ID's commercial partner site advertises identity verification and separately mentions OAuth 2.0 for cloud signing. It is a separate product; the page does not establish Google-style eGov OIDC: <https://digital-id.kz/partner>.

Service passport pages were blank in both public reader and cloud browser. No sign-in, application, agreement, communication or access grant was performed. Before implementation: select the applicable official service; obtain Alageum's eligibility/approval and service-specific contract/pricing; obtain sandbox/production specification, allowed identity claims and consent rules, callback/challenge verification and trust/revocation requirements; then implement and test the actual protocol. No IIN/BIN or biometric information is collected by this candidate.

## Verification

Tests use real locally generated RSA signatures and PostgreSQL transactions, with an explicitly injected fake Google transport. They do not contact Google or create live identities. Browser UI tests use labeled API fixtures and do not claim a live provider round trip.

Commands:

- `node --test backend-node/tests/google-oidc.test.js`
- `ALAGEUM_FEDERATED_TEST_DATABASE_URL=postgresql://.../alageum_federated_test node --test backend-node/tests/federated-auth.integration.js` (fresh dedicated database; refuses an existing b2b schema)
- `node --test frontend/tests/federated-auth.test.mjs frontend/tests/session-transport.test.mjs frontend/tests/session-races.test.mjs frontend/tests/organization-selection.test.mjs`
- `APP_ENV=test ALAGEUM_AUTH_HTTP_TEST_DATABASE_URL=postgresql://.../alageum_strapi_auth_http_test node backend-node/tests/federated-auth.http-auth.js` (fresh local database, actual Strapi HTTP and injected RSA provider transport)
- `npm --prefix backend-node run check`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- Frontend running locally: `E2E_BASE_URL=http://127.0.0.1:3118 npx playwright test --config=playwright.federated.config.js`

Full source-review aggregate verification must account for the intentional auth/middleware changes through a new independently reviewed successor amendment. Historical review approvals must not be edited to make new code appear previously approved.

Google primary references: <https://developers.google.com/identity/openid-connect/openid-connect> and <https://developers.google.com/identity/openid-connect/reference>.
