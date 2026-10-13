# 001 — Modular monolith

## Context
Business boundaries are broad, but real scale and workflows are unknown.

## Decision
Use one FastAPI application and PostgreSQL database with explicit module packages and service/provider boundaries.

## Consequences
Transactions and operations stay simple; a proven hot boundary can later be extracted.

## Alternatives
Microservices were rejected before workload and team ownership justify distributed complexity.

