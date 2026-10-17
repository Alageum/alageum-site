# Dependency security status — 2026-10-14

Inspected exact feature source `588dc98e7f0ded7a31b8fdee21c724f8889dfbb7`, its unchanged lockfiles, official npm releases and upstream advisories. This is a dependency review, **not risk acceptance**. `npm audit --audit-level=high` stays enabled and red; no allowlist, downgrade, forced major override or fabricated patched version is introduced.

## Counts and dependency paths

- Backend: 32 affected package entries (29 high, 3 moderate, **0 critical**).
- Frontend: 5 high entries, all development dependencies. `npm audit --omit=dev` reports **0**.
- These are propagated dependency entries from **three root packages**, not 32 distinct vulnerabilities. There are six advisory records: one braces, two React Router and three stream-json.
- Existing Handlebars 4.7.10 and Nodemailer 10.0.13 are not implicated in this audit.

## braces 3.0.3

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects versions through 3.0.3; **no patched release exists**. The latest registry version is still 3.0.3. All 29 backend high entries and 5 frontend high entries propagate from this root advisory.

Frontend: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`, used during tooling/build checks rather than the shipped frontend runtime.

Backend: Strapi packages include chokidar, micromatch, content-type-builder, jscodeshift, findup-sync and workspace-discovery consumers. These are principally trusted filesystem/build patterns, but the backend package graph cannot honestly be labeled entirely build-only: content-type-builder includes micromatch in its native CMS browser bundle. The inspected `AIChat/hooks/useCodeUpload` consumer matches uploaded ZIP filenames against fixed ignores plus caller-supplied ignore patterns. A malicious filename is not itself the vulnerable glob pattern; deeply nested **attacker-controlled patterns** are the relevant condition. The inspection did not prove that every possible caller is safe.

Mitigation pending an upstream fix: keep glob patterns constant or trusted, prohibit arbitrary user-defined patterns from these paths, and scope CMS access to authorized operators. The [maintainer disputes the advisory](https://github.com/micromatch/braces/issues/84), but that does not resolve the audit or authorize an exception. A separately reviewed, explicit risk-acceptance decision would be required to waive this gate. No such decision is recorded here.

## React Router 6.30.6

- [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6): open redirect, affected `>=6.0.0 <7.18.0`, fixed in 7.18.0. Relevant when an attacker-controlled navigation target reaches affected browser navigation APIs.
- [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg): manual SSR/hydration error deserialization, affected `>=6.4.0 <7.18.0`, fixed in 7.18.0.

Strapi 5.56's inspected entry uses `createBrowserRouter` and React `createRoot`; it does not follow the SSR/hydration path described by the second advisory. Native login's `getRedirectTo` rejected protocol-relative and single/double-backslash external targets in direct checks. This narrows known exposure but is not an exhaustive navigation audit.

6.30.6 is the newest v6. Even [Strapi 5.57.0](https://github.com/strapi/strapi/releases/tag/v5.57.0) retains the `react-router-dom ^6.30.3` peer requirement. Forcing v7 violates that compatibility contract and requires a separately tested native CMS migration. Keep redirect targets restricted to validated local routes; do not invent a v6 patched release or substitute a major version merely to clear audit output.

## stream-json 1.9.1

- [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x): deeply nested path filters, affected `<=3.4.0`, fixed 3.5.0.
- [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x): JSONC comment scanning, affected `<=3.5.0`, fixed 3.6.0.
- [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc): Assembler prototype injection, affected `<3.6.0`, fixed 3.6.0.

The lockfile's direct consumer is `@strapi/data-transfer`. Its inspected filesystem import/export providers use `stream-json/jsonl/Parser` and `stream-json/jsonl/Stringer`; the v1 JSONL parser uses native `JSON.parse`. Those providers do not call JSONC, Assembler or path-filter APIs. These specific vulnerable entry points appear unreachable through the inspected consumers; unrestricted conclusions about unrelated consumers are not claimed. Keep import/export restricted to trusted operators and controlled archives.

Strapi 5.57 still pins 1.9.1. Although 3.6.0 fixes all three advisories (latest is 3.7.0), v3 changes to ESM, lowercase `.js` export paths and different streaming APIs. The old uppercase extensionless Strapi imports would fail. Remediation requires upstream support or a deliberately implemented and tested import/export adapter, including malformed input, backpressure, cancellation and round-trip checks. An unconditional package override is not a safe repair.

## Decision and verification

There is no released, compatible package-only update that eliminates this audit. Strapi 5.57 and Next/eslint-config-next 16.4 are maintenance candidates, but still carry these root dependencies; an unrelated minor upgrade would not resolve the blocker. npm's suggested downgrade to Strapi 4.26.2 or eslint-config-next 14.2.35 is inappropriate.

Reproduce from the repository's locked manifests:

```sh
(cd backend-node && npm audit --json)
(cd frontend && npm audit --json)
(cd frontend && npm audit --omit=dev --json)
```

The remaining choices are a compatible upstream release, a separately tested maintenance patch/adapter, or explicit documented security acceptance after the exposure review. Until one is completed, the audit gate remains red and this document does not certify production readiness.
