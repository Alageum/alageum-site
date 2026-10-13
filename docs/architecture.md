# Architecture map

> The required target is now Node.js + Strapi + PostgreSQL with the existing Next.js frontend. This document describes the preserved legacy foundation; see [the bounded migration and cutover gaps](node-strapi-migration.md) for the new architecture.

ALAGEUM is a modular monolith: one FastAPI deployment and one PostgreSQL database with explicit
domain packages. This avoids distributed-system cost while preserving extractable boundaries.

```text
Browser -> Next.js App Router -> /api/v1 FastAPI routers
                                  |
                                  v
                         Application services
                           |              |
                           v              v
                    SQLAlchemy queries   Provider interfaces
                           |              |
                           v              v
                       PostgreSQL      External adapters
```

Dependency direction is `domain <- application service <- interface <- adapter`. Routers own HTTP
translation, not business rules. Response contracts are Pydantic models rather than ORM shapes.

Tenant path:

```text
access-token user -> active Membership -> organization context -> permission gate
                                                    |
                                                    v
                                      object-id + organization-id query
```

Every tenant aggregate carries `organization_id`; nested document/file ownership also has a DB
constraint. Foreign objects return 404 where enumeration resistance is useful.

AI boundary:

```text
AI provider -> Tool Registry -> permission + confirmation gate
                                    |
                                    v
                            Application services -> scoped repository query
```

RAG filters `PUBLIC` plus the active tenant before chunks reach the model. Retrieved text is data,
never system policy.

External boundaries:

```text
OrderService <- ERPProvider <- MockERPProvider / future OneC adapter
Lead/support <- CRMProvider <- MockCRMProvider / future CRM adapter
Documents    <- EDOProvider <- MockEDOProvider / future EDO adapter
Tracking     <- LogisticsProvider <- MockLogisticsProvider / future adapter
```

Integration work is durable in PostgreSQL. Leases, heartbeats and expiry recover abandoned
`running` jobs to `retrying`; provider-specific execution remains behind adapters.

See the short decisions in [ADR](adr/) and ownership classification in
[data-ownership.md](data-ownership.md).

