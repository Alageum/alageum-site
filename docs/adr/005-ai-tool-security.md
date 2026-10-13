# 005 — AI tool security

## Context
Model output is untrusted and cannot authorize access or consequential actions.

## Decision
Tools call normal application services through permission gates. WRITE tools require one-time user+tenant+tool+argument-hash confirmation.

## Consequences
AI has no unrestricted session/database access; future external writes also need idempotency.

## Alternatives
Direct model-to-database/tool execution was rejected.

