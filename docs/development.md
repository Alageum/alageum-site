# Developer onboarding

Start with `make bootstrap`, then use OpenAPI and the tests as executable contracts.

## Safe extension checklist

1. **Backend module:** create a bounded package under `backend/app`; keep router → application
   service → repository/provider direction and register the router under `/api/v1`.
2. **Endpoint:** define separate `APIRequest` and Pydantic response models, bounded pagination, an
   authentication dependency and a permission dependency. Route-inventory tests must pass.
3. **Permission:** add a generic permission code and DEV seed mapping only. Never branch on a role
   name. The real role matrix is client-owned.
4. **Tenant model:** add non-null `organization_id` where universally tenant-owned, indexes/FKs, and
   query by both object ID and organization ID. For nested IDs validate every child independently;
   add Organization A/B regression tests and DB composite constraints when possible.
5. **Migration:** import the model in `core/database.py`, generate/review Alembic, then run upgrade →
   downgrade → upgrade → check. Never use runtime `create_all` outside tests.
6. **Provider:** define a narrow interface, validate external DTOs, keep network I/O outside DB
   transactions, use idempotency/reconciliation and adversarial mock modes.
7. **AI tool:** call application services, never expose `AsyncSession`; declare permission and
   READ/WRITE. Every WRITE defaults to scoped, expiring, one-time confirmation.
8. **Frontend method:** add it under `frontend/lib/api`; components must not scatter `fetch`, store
   secrets, or treat UI permission checks as authorization.
9. **Tests:** cover own/foreign tenant, missing permission, malformed input, concurrency/replay and
   provider failure. Update the security matrix for new boundaries.

Never accept `organization_id`, owner, role, source, external ID or authoritative status from a
public request unless the contract explicitly and safely requires it.

