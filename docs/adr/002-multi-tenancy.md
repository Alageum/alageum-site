# 002 — Membership-scoped multi-tenancy

## Context
Users may belong to multiple B2B organizations and private data must never cross tenants.

## Decision
Resolve active organization through user Membership, query tenant objects by object+organization ID, and reinforce nested ownership with DB constraints.

## Consequences
Every new tenant model/endpoint needs explicit scope and Organization A/B tests.

## Alternatives
Trusting request `organization_id` or attaching data directly to User was rejected.

