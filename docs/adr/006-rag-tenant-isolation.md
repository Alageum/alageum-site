# 006 — RAG tenant isolation

## Context
Knowledge may be public or tenant-private and retrieved documents may contain malicious instructions.

## Decision
Filter visibility before returning chunks to the model and mark retrieved content as untrusted data.

## Consequences
Users receive public+own tenant knowledge only; backend authorization remains decisive.

## Alternatives
Post-generation filtering and treating documents as prompts were rejected.

