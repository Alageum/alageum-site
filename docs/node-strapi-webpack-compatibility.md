# Webpack middleware compatibility candidate

This separate local candidate starts from PR7 commit
`cfb2c283ba370af278c80c3014e6536e89873d27`. Its dependency gate and local HTTP/build
checks pass. **Real-browser acceptance remains pending on the exact published
candidate.** This is an application-owned compatibility patch, not an upstream
Strapi fix or a production-ready fork. Production refusal is unchanged.

## Changes and ownership

Strapi remains 5.56.0. A parent-scoped override selects
`webpack-dev-middleware` 7.4.6. Both installed Strapi webpack watcher formats are
patched to use the middleware's official Koa wrapper, retaining its underlying
instance for readiness, output filesystem and shutdown. The old partial response
object could not correctly implement streaming, response headers and status.

The official wrapper exposed a separate upstream HEAD lifecycle bug: middleware
7.4.6 creates a stream and returns before registering cleanup. The candidate
adds its documented `modifyResponseData` hook, destroying only the unused HEAD
stream and preserving the original data/length. The exact `closeHeadStream`
function is embedded into both formats and reused by the protocol harness.

A separate, unmodified PR7 worktree with baseline middleware 6.1.3 reproduced
webpack's missing `util` import from content-type-builder → micromatch. This
pre-existing optional-webpack configuration issue required a documented
`src/admin/webpack.config.js` hook. It adds real browser implementations pinned to
path-browserify 1.0.1, util 0.12.5 and process 0.11.10. Vite configuration stays
unchanged; no byte-identical Vite output is assumed after adding dependencies.

Webpack 5.109 also selects generator-function 2.0.1's Node `module-sync` wrapper,
whose string `module.exports` alias is rejected by Strapi's browser-target
esbuild pass. The project hook selects only that package's publicly declared
CommonJS default, `./index.js`, guarded by exact version and export-map shape.
There are no false aliases, parser patches, loader exclusions, relaxed browser
targets, global condition rewrites or package downgrades.

Primary references:

- [Official middleware Koa wrapper](https://raw.githubusercontent.com/webpack/webpack-dev-middleware/v7.4.6/src/index.js)
- [Middleware 7.4.6 fix release](https://github.com/webpack/webpack-dev-middleware/releases/tag/v7.4.6)
- [Path-containment advisory](https://github.com/webpack/webpack-dev-middleware/security/advisories/GHSA-g84c-rxfj-3j2c)
- [Pinned upstream Strapi watcher](https://raw.githubusercontent.com/strapi/strapi/bc653e8ec3e897cd18717239441d2f471c88c9a3/packages/core/strapi/src/node/webpack/watch.ts)
- [Documented Strapi webpack hook](https://docs.strapi.io/cms/admin-panel-customization/bundlers)
- [Webpack browser fallbacks](https://webpack.js.org/configuration/resolve/#resolvefallback)
- [Vite's Node externalization limitation](https://v6.vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility)

The advisory prose contradicts its patched-version field. The official 7.4.6
release/package contain the final output-path containment check; the retained
protocol regressions exercise that check with a non-slash public path.

## Verification and retained evidence

Node 24.19.0, npm 11.9.0, webpack 5.109.2 and PostgreSQL 17.11 were used locally.
Fresh installs applied both expected patch hashes; repeat application changes
neither file. The complete dependency tree has no invalid peers.

- Fresh baseline audit: **16 affected packages, 3 high and 13 moderate**, exit 1
- [Fresh resolved-candidate audit](../backend-node/docs/webpack-dependency-audit.json):
  **15 affected packages, all moderate, 0 high/critical**, exit 0 for the unchanged
  `npm audit --audit-level=high --json` command. No advisory or severity waiver
- Backend syntax/unit checks: **47 pass**, including **12 patch guard/fault cases**
- Original [unmodified-wrapper protocol report](../backend-node/docs/webpack-protocol-results.json):
  **33 pass, 3 fail**; open HEAD descriptors are deliberately retained as evidence
- [Application-owned HEAD cleanup report](../backend-node/docs/webpack-protocol-head-cleanup-results.json):
  **42 pass**. Streamed/binary/empty GET, HEAD 200/206/416/304, range, validators,
  malformed requests, containment, genuine in-flight abort and shutdown pass;
  no response streams remain open
- [Actual Strapi webpack HTTP/SSE report](../backend-node/docs/webpack-strapi-http-results.json):
  cold and warm compilation, CMS assets/deep links, API isolation, SSE build
  events, matching hot-update files, intentional syntax-error recovery,
  disconnect readiness and port release pass. Temporary edits were restored
- [Exact-Strapi-config compiled equivalence report](../backend-node/docs/webpack-browser-polyfill-results.json):
  the actual loaders/targets and project hook compile without errors/warnings.
  A DOM-free VM matches **3,024 glob comparisons**, **112 upload-filter decisions**,
  POSIX path, util and process behavior. Its graph selects generator-function's
  declared index.js and excludes require.mjs. **This is not a browser pass**
- [Default-path regression report](../backend-node/docs/webpack-default-regression-results.json):
  Vite CMS build (288 JS/2 CSS files), four frontend builds, frontend lint and
  **150 units**, backend **45 PostgreSQL integration tests**, **12 Page contracts**,
  **58 Page HTTP fault cases**, and **12 native Page HTTP checks** pass. This
  evidence uses the final dependency lock; subsequent changes affect only the
  optional webpack hook or verification/CI source

The first 1280 MiB Vite build hit its V8 heap limit. The normal build passed with
2560 MiB; no build feature was disabled. All completed local server runs stopped
and released their ports; disposable PostgreSQL clusters were shut down.

Local Chromium fails before page creation because the executor rejects its Unix
socket. An approved escalation failed identically; no alternate route was used.
**All 43 default browser cases, the four optional-webpack CMS cases, and the
compiled real-browser equivalence probe remain unrun locally.** Prior PR7 browser
success is not substituted for this candidate's acceptance.

The separate `webpack-compatibility` CI job retains the existing jobs and their
43-case selection. It requires all 42 protocol checks, actual Chromium equivalence,
and complete cold/warm webpack HMR plus exactly four native CMS cases. The fifth
CMS case publishes into a separately running Next frontend and stays in the full
default job. VM-only, omitted, skipped or flaky phases cannot satisfy the new job.
Chromium uses Playwright's official installed browser unless explicitly provided
by CHROMIUM_PATH. Installation and execution have bounded timeouts.

## Installation guard and maintenance

The patch script checks exact package versions and original/patched SHA-256
hashes for both formats before writing. Symlinked node_modules roots, redirected
files and unknown contents are rejected. Writes are staged and renamed per file;
ordinary failure rollback revalidates target identity and expected patched bytes,
preserving detected concurrent changes. This is not a single atomic transaction
across both files or protection against arbitrary simultaneous filesystem attacks.
A crash between renames fails verification; reapplication repairs only known
original content. Staging failures and concurrent content/symlink changes are
covered by local fault tests.

Postinstall applies the patch; predevelop/prebuild/prestart and the normal check
verify it. Installs that skip scripts must explicitly run `npm run postinstall`.
Direct vendor CLI commands bypass npm pre-hooks, so the acceptance runners verify
first. Docker copies the patch inputs before npm ci. Generated source maps retain
upstream mappings. Review/remove the patch and the guarded export selection on
each relevant dependency upgrade; never refresh hashes blindly.

Only disposable, loopback test databases and fixture identities are used. HOME
and CODEX_HOME are preserved. Runtime evidence is sanitized; CI uploads explicit
logs/JSON/PNGs, excluding database directories, password files and browser profiles.

## Remaining security and release gates

The remaining moderate findings trace to React Router navigation/SSR hydration
and stream-json nested path filters. CMS navigation is an actual runtime entry
point; the redirect finding is not dismissed. The inspected CMS entry uses
client rendering, and the inspected Strapi transfer adapters import JSONL
Parser/Stringer rather than the vulnerable path filters. Those observations are
limited reachability evidence, not waivers. The router's patched major remains
outside Strapi's declared peer range; transfer upgrades need dedicated coverage.

Middleware HTTP reachability is Strapi's optional webpack development watcher.
The normal Vite watcher and already-built CMS serving paths do not execute it.
Windows-specific behavior, proxy deployment, custom output filesystems and real
production operation are not established by these Linux tests. The application
still refuses production startup and retains its other documented cutover gates.

Separately, the RFQ screenshot now clears focus and scrolls to the top only after
all functional assertions, then checks scroll position/header visibility before
capture. No app CSS or original functional assertion changes. Its corrected PNG
must be visually verified from the forthcoming hosted browser artifacts.
