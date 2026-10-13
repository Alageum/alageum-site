# API v1 contract

`/api/v1` is frozen as the compatibility namespace. OpenAPI at `/api/openapi.json` is the endpoint
inventory and schema source of truth.

- Breaking request/response or semantic changes require `/api/v2` or an explicitly announced
  migration window.
- Additive optional fields and new endpoints are compatible changes.
- Deprecations are documented, announced for at least one supported client release, then removed
  only at the next major API version.
- Errors use `{ "error": { "code", "message", "details", "request_id" } }`.
- Lists use `{ "items", "page", "page_size", "total" }`; page size is globally bounded.
- Browser clients send short-lived bearer access tokens. Tenant endpoints resolve organization from
  an authenticated active membership selected by `X-Organization-ID`; payload organization IDs are
  not authoritative.
- `401` means authentication/refresh is required, `403` missing permission, `404` missing or hidden
  foreign object, `409` state/idempotency/confirmation conflict, `413` configured payload limit,
  `422` validation, and `429` rate policy.
- Frontend modules consume the frozen API response schemas through `frontend/lib/api`; ORM models and
  provider payloads are not public contracts.

The current refresh token is isolated behind a browser transport module but remains DEV-only
`sessionStorage`. Cookie/BFF, SameSite and CSRF details require the approved deployment topology.


## Catalogue RFQ increment

The additive catalogue workflow uses `POST /quotes/catalog` (required UUID `Idempotency-Key`),
`GET /quotes?mine=true` and `GET /quotes/{id}`. The generic legacy `POST /quotes` and default
organization-summary list are retained. See [catalogue RFQ boundary and guarantees](catalog-rfq.md).

## Node/Strapi compatibility phase

`backend-node/` implements the catalog/auth/catalog-RFQ subset behind the same v1 wire shapes. Strapi native IDs remain internal; outward catalog UUIDs/public keys remain stable. Other v1 endpoints are not yet migrated and fail closed; no Python proxy or fallback is used. Native Strapi CMS administrator credentials do not authorize B2B routes. See [scope and rollout gates](node-strapi-migration.md) and [identity/RFQ boundary](node-auth-rfq-boundary.md).

## Additive Node company profile

`GET /organizations/current/profile` requires `organization.profile.read`;
`PATCH /organizations/current/profile` requires that grant plus
`organization.profile.update` and a current integer `version`. This Node-only
addition leaves existing v1 responses unchanged. Optional business contact fields
are unverified; no default role receives the new grants. See the
[profile fields, clearing/no-op semantics and atomic authorization contract](company-profile.md).
