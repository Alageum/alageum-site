# Isolated Vite 6 compatibility experiment

Status on 2026-10-02: **local compatibility evidence passed; candidate adoption
and hosted browser acceptance remain pending**. This work is isolated on
`feature/node-strapi-vite-compat`, based on `443afd9`. It does not change the
baseline or editorial worktree, publish anything, or establish production safety.
`APP_ENV=production` is still refused and the dependency audit still hard-fails.

The original build/watch observations below belong to checkpoint `19dfd07`.
Preparation for a separate draft PR subsequently incorporated the four baseline
fixes through `995f52c`: native profile role verification, explicit CMS form
labels, collection of all bounded CMS cases, and the editor-scoped alert
assertion. The two successful CMS/RFQ screenshots now use per-test PNG output
paths and file attachments, with `preserveOutput: 'always'` in their Playwright
configs, so the existing `playwright-report` artifact upload retains them.
Assertions and credentials are unchanged. The updated candidate's full hosted
build/browser acceptance is still pending; the earlier local bundle fingerprint
is not evidence for the later label change.
Preparation checks passed: targeted lint and syntax checks for both screenshot
specs/configs, discovery of all five CMS cases and both RFQ projects, explicit
output-retention configuration checks, and backend syntax plus 31 unit tests.
No servers or browsers were started during this preparation step.

## Candidate and official compatibility evidence

The sole new package override is parent-scoped:

```json
"@strapi/strapi": { "vite": "6.4.3" }
```

Strapi remains exactly 5.56.0. Its own declaration still pins Vite 5.4.21; this is
an application-owned experiment, not an upstream Strapi endorsement. Remove or
revalidate the override when upstream changes. Existing Axios, DOMPurify,
markdown-it, PostCSS and scoped Nodemailer pins are unchanged.

Primary evidence:

- [Vite 6.4.3 package metadata](https://registry.npmjs.org/vite/6.4.3) declares
  Node `^18.0.0 || ^20.0.0 || >=22.0.0`, which includes the tested Node 24.19.0
- [Vite 5-to-6 migration guidance](https://v6.vite.dev/guide/migration) documents
  the CommonJS strict-require default, JSON handling and configuration changes
- [Vite's Windows file-denial advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)
  identifies 6.4.3 as a patched release. Linux probes cannot verify its NTFS cases
- [Strapi 5.56.0 package metadata](https://registry.npmjs.org/@strapi/strapi/5.56.0)
  provides the original dependency pins

The installed `@vitejs/plugin-react-swc` 3.11.0 accepts Vite 4/5/6/7, and
`@tailwindcss/vite` 4.3.3 accepts Vite 5.2+/6/7/8. Full `npm ls --all` exits zero.
Both peers deduplicate to Vite 6.4.3. Tailwind's optional next-design-system mode
is not enabled in this application and was not separately tested.

The lock resolves Vite's supported esbuild range to 0.25.12, with its platform
binaries, and adds Vite's fdir/picomatch dependencies. YAML 1.10.3 and 2.9.1 are
re-hoisted, rather than globally forced across an API boundary. The other
esbuild consumers retain their existing 0.28.2. No direct esbuild override,
webpack middleware override, install force, peer waiver or audit waiver is used.

Inspection of Strapi's installed `dist/src/node/vite/{build,watch,config}.js`
found retained public Vite APIs: `build`, `createServer`, `middlewares`,
`transformIndexHtml` and `close`. Its SWC plugin, generated entry/index plugin,
base `/cms`, singletons/optimization configuration and same-port HMR server were
used unchanged by the tests. No custom Vite, PostCSS, Sass, SSR or library-mode
configuration was added to make the experiment pass.

## Observed results

All commands used the isolated worktree's dependencies and disk-backed workspace
cache, temporary directory and evidence directory. No main/Page dependencies were
replaced. Node was 24.19.0, npm 11.9.0, and disposable PostgreSQL was 17.11 on Linux.

- Clean `npm ci --no-audit --no-fund` passed with a 256 MiB Node heap and two
  download sockets. The full dependency tree had no invalid peers
- `npm run check` passed syntax checks and all **31 unit tests**, including the
  existing exact-provider Nodemailer test. No broad integration suite was rerun
- Fresh `npm audit --audit-level=high --json` exited **1**: **16 affected
  packages, 3 high, 13 moderate, 0 critical**. Vite and esbuild no longer appear
  in the report. The high findings are unchanged webpack middleware and
  propagated Strapi/users-permissions parents. See the full
  [audit JSON](../backend-node/docs/dependency-audit.json)
- The first cold CMS build, at a 2048 MiB V8 heap limit, exited **137** with
  `Killed` and no compiler diagnostic. That failed attempt is retained
- One tighter-heap attempt at **1280 MiB** then passed both ordinary unmodified
  `npm run build` runs: cold **23.690 s**, warm **23.770 s** for the admin step
- Each emitted **288 JavaScript chunks and 2 CSS files**, including the lazy
  catalog editor and `/cms`-prefixed entry references. Both complete file/name
  fingerprints were identical:
  `a2702b58915f0429a1db2dcbcff6140f42477045c9cd04e32133e414b16e9025`
- Actual Strapi `start`, using `NODE_ENV=production` but **APP_ENV=test**, served
  all **290 JS/CSS assets** with successful responses and correct MIME types.
  This tests the built bundle serving path without relaxing production refusal
- Actual Strapi `develop` passed with both a cold optimizer cache and a warm
  restart. Probes fetched the generated entry, catalog lazy JSX and **4 actual
  entry/catalog dependency modules**, plus JavaScript and CSS test fixtures
- A WebSocket connection to the **same loopback port** completed Vite's real HMR
  handshake. Editing the disposable JS and CSS modules produced update messages
  and refetches returned the changed content in both cold and warm runs
- CMS root, login, catalog and Content Manager deep-route HTML responses passed.
  JSON readiness and unknown business API routes stayed isolated from CMS HTML;
  the unauthenticated catalog CMS data API stayed protected
- Six sensitive/out-of-root file requests per cold/warm run, including `?raw`
  and `?import&raw`, returned 403/404 without disclosing disposable sentinels
- Every server stopped within the bounded shutdown window, its loopback port
  was immediately reusable, and PostgreSQL shut down cleanly. Fixtures were
  removed and generated type files moved into the disposable evidence folder

The first full server matrix passed. A subsequent harness rerun initially failed
the built-HTML precondition because Strapi's `createBuildContext` deliberately
removes `build/` when `develop` starts. This was an ordering issue in the new
test harness, not a Vite compiler failure. The harness now checks the build
precondition, preserves built output before a combined server run, and provides
`--watch` for independent cold/warm watch runs. The final enhanced watch run
(including dependency-module and CSS HMR probes) passed. The extra artifact
preservation branch was syntax-checked; no third build was performed just to
exercise that housekeeping branch.

## Reproduce in a disposable worktree

Install with a workspace/disk-backed npm cache and TMPDIR. Coordinate memory
usage before the actual CMS builds. Then, from `backend-node`:

```sh
export npm_config_cache=/absolute/disk/cache/npm
export TMPDIR=/absolute/disk/cache/tmp
export VITE_COMPAT_WORK_ROOT=/absolute/disk/evidence
export VITE_COMPAT_HEAP_MB=1280
export PG_BIN=/absolute/path/to/postgresql/bin
mkdir -p "$npm_config_cache" "$TMPDIR" "$VITE_COMPAT_WORK_ROOT"
npm_config_maxsockets=2 NODE_OPTIONS=--max-old-space-size=256 npm ci --no-audit --no-fund
npm run check
npm ls --all
npm audit --audit-level=high --json
# Audit currently exits 1; do not treat that as a pass or remove its CI gate.
bash scripts/run-vite-compat.sh --builds
bash scripts/run-vite-compat.sh --servers
# Optional repeat of watch-only probes, without an extra build:
bash scripts/run-vite-compat.sh --watch
```

The scripts intentionally create a fresh loopback-only PostgreSQL cluster and
`alageum_strapi_vite_compat` database. They do not consume an existing database
URL, create real CMS users, or use persistent/production credentials. Logs and
the disposable database are retained under the printed evidence directory;
the PostgreSQL password file has mode 0600. Do not publish those fixture folders.

## Adoption gates and limits

Local HTTP/WebSocket checks do **not** execute the React UI. Before adoption,
complete hosted browser acceptance on the exact candidate commit/lock: native
CMS login/session refresh, direct deep-link reload, catalog editor and lazy
chunks, Content Manager fields, console/network errors, and React/Redux/design
system singleton behavior. The later editorial Page delivery changes are not
in this base; Page editor/read delivery acceptance must be repeated after a
reviewed integration of those changes. Baseline PR5 browser evidence alone
cannot establish the Vite candidate's browser compatibility.

Windows NTFS/8.3 file-denial cases, proxy/HMR topology, non-Linux behavior,
optional next-design-system/Tailwind mode and real production operation remain
untested. Strapi's existing development `allowedHosts: true` remains unchanged;
keep this experimental server disposable and loopback-only, with no real secrets
or public network exposure. The six denial probes are bounded regressions, not
a proof that every development-server attack is blocked.

Webpack middleware remains at **6.1.3** and is still an audit blocker. Its
proposed patched 7.4.6 requires an explicit compatibility repair: Strapi's
optional webpack watch adapter supplies a partial response object without the
stream/EventEmitter and header-enumeration methods used by middleware 7. A
package override alone has not been justified. React Router and stream-json
major-version blockers are also unchanged. There is no production-readiness,
merge-readiness or audit-green claim for this checkpoint.
