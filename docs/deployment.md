# Deployment baseline

For the Vercel Services configuration, public routes, local checks and outstanding
deployment prerequisites, see [Vercel Services](vercel-services.md).

## DEV

Docker Compose, local file volume, mock providers, memory limiter/metrics and deterministic seed.
`make bootstrap` is the supported path.

## STAGING

Use production-like PostgreSQL/storage/network topology, explicit Alembic release job, synthetic
data and real security adapters where selected. Never run the DEV seed.

## PROD

The application validates secrets, PostgreSQL, distributed rate limiting, malware scanning and
browser auth transport. Migrations are an explicit reviewed step before application rollout;
SQLAlchemy does not create schema. Terminate TLS at an approved edge and pass only trusted proxy
headers. Secrets must be injected at runtime, never built into frontend or images.

**NEEDS_CLIENT:** hosting and network zones, domain/TLS termination, same-site/BFF topology,
reverse/trusted proxy chain, storage/scanner, secret manager, backup destination/retention,
monitoring/exporter stack, job runner, replicas, RPO/RTO, DR and rollback ownership.

Only `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_CATALOG_SOURCE` are approved public frontend variables.
CI should fail review if any secret-shaped
`NEXT_PUBLIC_*` variable is introduced.
