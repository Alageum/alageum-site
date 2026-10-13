# AI foundation

`AIProvider` separates chat and embeddings from any vendor. Conversations and messages retain both user and organization scope. The tool flow is registry → permission gate → domain service. AI model output never grants access.

Tools declare READ or WRITE; registry registration rejects a WRITE tool without confirmation. Tool handlers receive a narrow `AIToolApplicationServices` boundary, never an unrestricted SQLAlchemy session. Confirmation is one-time and scoped to user, organization, tool, canonical argument hash, and expiry. The API records redacted denied/completed attempts; application queries remain tenant-constrained.

RAG uses `PUBLIC` and `TENANT_PRIVATE` visibility with a replaceable `VectorIndex`. Anonymous retrieval gets public data; a member gets public plus that organization only. Filtering occurs before content reaches a model. Source text is always `data_only` untrusted content, including instructions embedded in uploaded documents.
