# Backend dependency review, 2026-10-23

This is a code-handoff review, not production approval or a clean-audit claim.
Use the exact committed lockfile and Node 24. The JSON audit snapshots are the
full registry responses, including inherited findings and unresolved items.

## Changes

| Dependency | Previous | Reviewed pin | Reason |
| --- | --- | --- | --- |
| DOMPurify | 3.4.16 | 3.4.17 | Fix shadow-template, detached-hook and XHTML SMIL advisories. |
| markdown-it | 14.3.1 | 14.3.3 | Same-major fixes for pathological quote, inline HTML and link-reference parsing. |
| Vite | 6.4.3 | 6.4.5 | Same-major maintenance/security release; preserve Strapi build integration. |
| MCP server/core | 2.0.0 | 2.3.1 | Fix shared-transport isolation, validation resource exhaustion and bearer audience handling. |
| MCP Node transport | 2.0.0 | 2.1.1 | Compatible peer for server 2.3.x, also adopted by official Strapi 5.59.0. |

The lock update changes only these packages, MCP core's compatible nested Zod
patch (4.6.5 to 4.6.7), and Hono's peer/dependency classification. No force update,
major downgrade, integrity suppression, test removal or audit allowlist was used.

The current registry's Strapi release is 5.59.0. Its official tarballs were
inspected, rather than assuming that a core update fixes the audit. That release
still pins DOMPurify 3.4.16, markdown-it 14.3.1 and Vite 6.4.3. Its webpack watch
files match 5.56.0 byte-for-byte, but its native DocumentActions changes publish
queries and discard/draft-relation behavior; 6 of the 18 guarded native-editor
files differ (including source maps). Therefore this update retains Strapi
5.56.0 and both existing native-editor/Slate and webpack integrity manifests
unchanged. The finite, targeted leaf updates remove all current critical
findings without approving new CMS adapter bytes.

## Audit result and remaining work

- Before: 42 package findings, including 6 critical, 28 high, 3 moderate and 5 low.
- After: 32 package findings, including 0 critical, 29 high, 3 moderate and 0 low.
- These totals include inherited dependency findings. The remaining direct
  advisory roots are three packages, not 32 independent vulnerabilities.
- `npm audit` still exits nonzero. This is not suppressed or described as clean.

The 29 high findings are `braces`, `chokidar`, `micromatch`,
`find-yarn-workspace-root2`, `findup-sync`, `fork-ts-checker-webpack-plugin`,
`jscodeshift`, `liftoff`, `plop`, `preferred-pm`, and the Strapi packages `admin`,
`cloud-cli`, `content-manager`, `content-releases`, `content-type-builder`, `core`,
`data-transfer`, `database`, `email`, `generators`, `i18n`, `permissions`,
`plugin-users-permissions`, `provider-upload-local`, `review-workflows`, `strapi`,
`types`, `upload`, and `utils`. The three moderate findings are `react-router`,
`react-router-dom`, and `stream-json`. The raw snapshot retains all advisory
identifiers, severity labels, parent paths and npm's fix suggestions.

1. **braces 3.0.3**: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
   has no patched upstream release as of this review. Paths include Chokidar,
   code-generation/workspace tooling and the native content-type builder.
   Do not expose development servers or accept untrusted glob expressions in
   administrative tooling. Restrict native CMS access to trusted operators.
   Keep this advisory open and review the upstream fix when available.
   Source inspection found the native content-type-builder use in its browser
   AI code-upload hook, matching filenames against fixed defaults plus optional
   caller-provided ignore patterns; it did not establish request-controlled
   brace patterns in a public backend API.
   This is a reachability observation, not proof that every transitive caller
   is safe, and no blanket dev-only exemption is recorded.
2. **React Router 6.30.6**: [redirect](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6)
   and [SSR hydration](https://github.com/advisories/GHSA-337j-9hxr-rhxg) fixes start
   at 7.18.0, outside Strapi's reviewed 6.x contract. No forced major override was
   made. Native CMS navigation requires a separately tested upstream upgrade;
   restrict CMS access and do not forward untrusted values into navigation.
   Strapi's declared peer range is `react-router-dom ^6.30.3`. Its admin uses
   `createRoot` and `createBrowserRouter`, rather than SSR `hydrateRoot`, so the
   SSR-hydration advisory's precondition was not found in that admin bootstrap.
   The navigation advisory still concerns the shipped CMS browser bundle;
   trusted-admin gating reduces exposure but is not the upstream fix.
3. **stream-json 1.9.1**: [filter depth](https://github.com/advisories/GHSA-528h-pc64-c93x),
   [JSONC scanning](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x) and
   [Assembler prototype handling](https://github.com/advisories/GHSA-mjw6-4jj6-33hc)
   require a 3.x upgrade. Strapi imports the 1.x CommonJS JSONL Parser/Stringer
   paths, which use native JSON.parse/JSON.stringify instead of those general
   Assembler/filter/JSONC paths. A targeted test verifies own `__proto__` keys
   remain data in the consumed JSONL API, but is not a blanket exemption for the
   package. Do not import untrusted archives; a supported transfer API migration
   and full import/export regression is still required before overriding it.

There is no remaining verified, drop-in compatible registry update for these
three roots in the pinned framework contract. Do not use `npm audit fix --force`
or an npm-suggested Strapi downgrade to make totals disappear. Before production
exposure, the administrator must explicitly review these unresolved findings,
define access restrictions, rerun the current audit, and schedule the supported
framework/transfer migration. Code delivery does not waive that security gate.

MCP remains disabled by the existing server configuration/default. The test does
not enable MCP in the application. Its synthetic HTTP harness nevertheless
exercises the official Strapi server factory and handler against the patched
SDK, including repeat initialization, simultaneous clients with identical RPC
IDs, user isolation, and rejection before server creation for unauthenticated
requests. Strapi's existing implementation creates each server and transport
per request, which is compatible with the SDK's new one-connect restriction.

## Verification

See [verification.json](verification.json) for the final counts and status.

Executed with Node 24.19.0 / npm 11.9.0:

```sh
npm ci --cache /tmp/alageum-backend-npm-cache
npm run check
SWC_NATIVE_BINDING_CACHE=/tmp/alageum-backend-swc-native-cache \
  XDG_CONFIG_HOME=/tmp/alageum-backend-build-config \
  npm_config_cache=/tmp/alageum-backend-npm-cache \
  node scripts/build-container.js
PG_BIN=/path/to/postgresql17/bin bash scripts/run-production-tests.sh
PG_BIN=/path/to/postgresql17/bin bash scripts/run-news-tests.sh
npm audit --json --cache /tmp/alageum-backend-npm-cache
```

The production build uses the repository's Docker build entry, which supplies
deliberately synthetic build configuration and never connects to a real DB.
Writable cache/config overrides were needed only for this restricted executor.
The original bare `npm run build` correctly refused absent required secrets;
the first container-build attempt failed on SWC's read-only default cache.
After the supported cache override, the real admin build completed successfully.
No fake runtime secrets were added to the application configuration.

Production and news proofs used invocation-owned PostgreSQL 17.11 fixtures;
production proof includes a local TLS endpoint and synthetic mail receiver.
They verify no actual public server, customer account, real mailbox or mounted
production storage. Both fixture database processes were stopped by their
existing cleanup paths.

The repeatable browser proof is:

```sh
# Requires the repository frontend's locked Playwright installation.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  node --test tests/dependency-browser.integration.cjs
```

It bundles the actual unchanged native Strapi rich-text renderer and sanitizer,
checks benign formatting and URL policy, and tests the three DOMPurify regression
boundaries. The initial local Playwright run was blocked before assertions by
this executor's Chromium Unix-socket sandbox restriction. Browser verification
must be recorded separately rather than inferred from package versions or the
successful admin build.
The supported separate cloud browser was also tried against the synthetic
fixture; isolated network namespaces returned connection refused before page
execution. The temporary fixture server was then stopped. No browser assertion
is marked passed.

## Primary upstream references

- [DOMPurify 3.4.17](https://github.com/cure53/DOMPurify/releases/tag/3.4.17)
- [Critical shadow-template advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7)
- [markdown-it 14.3.3](https://github.com/markdown-it/markdown-it/releases/tag/14.3.3)
- [Vite 6.4.5](https://github.com/vitejs/vite/releases/tag/v6.4.5)
- [MCP lifecycle advisory](https://github.com/advisories/GHSA-jm63-cq47-j5jp)
- [Strapi 5.59.0](https://github.com/strapi/strapi/releases/tag/v5.59.0)
