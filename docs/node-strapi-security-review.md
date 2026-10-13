# Node/Strapi phase-one security review

The subsequent local [webpack compatibility candidate](node-strapi-webpack-compatibility.md)
has a separate [fresh audit](../backend-node/docs/webpack-dependency-audit.json):
15 moderate affected packages, 0 high/critical; the unchanged high-severity gate
exits 0. Its application-owned patch passes local protocol/build/HTTP checks; real browser acceptance remains pending. The Vite
checkpoint audit below remains retained as the before-state evidence.

This local migration is **not production-ready**. `APP_ENV=production` remains
fail-closed. Existing Python/Vercel preview operation is not evidence of a Node
cutover. No external service, account, credential, deployment or data migration
was provisioned by this work.

## Dependency audit: 2026-10-02

The locked Strapi 5.56.0 tree is tested with Node 24.19.0 and npm 11.9.0.
The official npm registry still identifies Strapi 5.56.0 as the current stable
release. The prior 2026-10-01 snapshot had 20 affected packages (4 high,
16 moderate); a new audit of that unchanged lock reported 22 (4 high,
18 moderate). These are affected-package counts, including propagated parent
findings, not counts of independent vulnerabilities. Registry advisory metadata
can change without a dependency change.

The [current complete npm audit report](../backend-node/docs/dependency-audit.json)
on this isolated Vite compatibility branch records **16 affected packages:
3 high, 13 moderate, 0 critical**, down from 18 before the experiment. The exact command
`npm audit --audit-level=high --json` still exits **1**. The independent CI audit
job is unchanged and hard-fails; neither reachability analysis nor passing
functional tests waives that gate. No advisory ignore, severity downgrade,
`--force`, Strapi downgrade, or production-readiness claim was introduced.

### Bounded update applied

This branch also contains the separate, **not-yet-adopted Vite 6.4.3 candidate**
described in [the compatibility experiment](node-strapi-vite-compatibility.md).
Its clean install, peer tree, unit checks, cold/warm CMS builds and real local
Strapi asset/watch/HMR probes passed. Hosted browser acceptance remains pending;
the candidate has not been applied to the baseline or editorial worktree.

The preceding dependency pass changed **Nodemailer 9.0.1 → 10.0.13**,
using a parent-scoped override under `@strapi/provider-email-sendmail` rather than
a blanket override. Earlier Axios 1.20.0, PostCSS 8.5.28, DOMPurify 3.4.16,
markdown-it 14.3.1, uuid 11.1.1 and react-router-dom 6.30.6 pins are retained.
Nodemailer and its email-provider parent no longer have an audit finding.

The latest 9.x candidate, 9.1.1, was checked but not retained: it still has newer
parser, nested-recipient and DNS-cache advisories, including parser findings
whose affected range starts at 9.1.0. A same-major number alone was not sufficient
security evidence.

The [official Nodemailer changelog](https://raw.githubusercontent.com/nodemailer/nodemailer/master/CHANGELOG.md)
identifies Node 20+ as the 10.0.0 breaking runtime requirement, introduces dual
CommonJS/ESM builds, and records CommonJS compatibility repairs in 10.0.11.
Node 24 meets that requirement. This application uses the provider's small
`createTransport` / `sendMail` / `close` surface. Its exact installed adapter was
checked with Nodemailer 10.0.13 using an in-memory transport: CommonJS loading,
message composition, sender/reply defaults and envelope generation worked, and
file/URL attachment access remained blocked. No SMTP connection, message
delivery, real address or credential was used.

This is application-specific compatibility evidence, not an upstream Strapi
endorsement of the override. The repository maintainers own this scoped override
until a Strapi provider release adopts a patched compatible version. Recheck
its necessity and the adapter on every Strapi/provider upgrade. SMTP delivery,
MX fallback, DKIM, TLS and provider configuration require their own acceptance
before any real email integration or production use.

Verification for this dependency change:

- Clean `npm ci` completed successfully. One prior install attempt exited 137;
  a retry with a 256 MiB Node heap and two npm download sockets completed
- `npm run check` passed syntax checks and all 20 then-current unit tests
  (2026-10-02 06:33 UTC); the installed-adapter in-memory smoke also passed
- `npm ls nodemailer --all` resolves only scoped Nodemailer 10.0.13
- Full audit JSON is retained, with the high-severity gate still failing
- Broad CMS builds, server/browser tests and integration tests are performed
  separately against the final shared lock; this dependency pass does not
  substitute its small smoke test for those checks

### Remaining findings and actual entry points

All remaining packages appear in npm's production dependency classification
because Strapi ships CLI/build/development code alongside its server packages.
That classification does not prove every vulnerable code path runs in every
application mode. On this candidate branch the high findings are
**webpack-dev-middleware** and the propagated **@strapi/strapi** and
**@strapi/plugin-users-permissions** parent findings. Vite and esbuild are absent
from this audit's vulnerability list; unchanged high-package counts do not mean
the high findings themselves are unchanged.

- **Baseline Vite 5.4.21 / esbuild 0.21.5:** Strapi's `dist/src/node/vite/watch.js` creates
  the Vite development server; building the CMS also uses Vite. The reported
  file-read/UNC findings concern serving development endpoints, rather than
  merely serving already-built CMS assets. The Windows-specific advisory has
  additional filesystem/platform conditions. This is a Linux local checkpoint,
  and development listeners must remain loopback-only. Vite 5 has no current
  patched release for the listed findings. Moving to the patched 6.4.3+ line
  also changes its esbuild dependency. The isolated 6.4.3 candidate resolves its
  supported esbuild 0.25.12 and has local build/watch evidence in the linked
  report; browser acceptance is still open. A separate esbuild override is not applied
- **webpack-dev-middleware 6.1.3:** loaded by Strapi's optional webpack watch
  path, not by this project's default Vite bundler. The path-traversal advisory
  depends on a `publicPath` lacking a trailing slash. Strapi's supplied webpack
  configuration adds that slash; a custom webpack configuration could change
  it. This reduces the demonstrated reachability of this specific finding,
  but is not a package fix. There is no patched 6.x release; a supported
  upstream major and webpack-watch compatibility review are still needed
- **React Router 6.30.6:** used by the native CMS browser UI, not the Next.js
  business frontend. The redirect finding depends on attacker-influenced
  navigation targets and is not dismissed. The separate SSR-hydration advisory
  is not demonstrated by the inspected CMS entry point, which uses React
  `createRoot` and `createBrowserRouter`, not server hydration. The patched
  7.18+ line is outside Strapi's declared `react-router-dom ^6.30.3` peer range
- **stream-json 1.9.1:** the inspected Strapi data-transfer adapters import
  `jsonl/Parser` and `jsonl/Stringer`; no use of the affected path-filter APIs
  was found in those adapters. This is limited source reachability evidence,
  not a guarantee about every plugin or future data-transfer configuration.
  The patched 3.5+ API/module line needs dedicated import/export compatibility
  work; the transfer surface remains subject to review

Primary evidence:

- [Strapi stable release and declared dependency pins](https://registry.npmjs.org/@strapi/strapi/5.56.0)
- [Nodemailer 10.0.13 package metadata](https://registry.npmjs.org/nodemailer/10.0.13)
- [Nodemailer parser DoS and patched range](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j)
- [Vite development-server advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)
- [Vite major-version migration guidance](https://v6.vite.dev/guide/migration)
- [Webpack middleware path-traversal advisory](https://github.com/webpack/webpack-dev-middleware/security/advisories/GHSA-g84c-rxfj-3j2c)
- [React Router navigation advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6)
- [React Router hydration advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg)
- [stream-json path-filter advisory](https://github.com/uhop/stream-json/security/advisories/GHSA-528h-pc64-c93x)

## Security invariants exercised

- CMS administrator identity is separate from business users; generic Strapi
  business-user registration and generated B2B CRUD are disabled/absent
- Generated catalog Document Service/Content Manager writes remain lifecycle-blocked.
  The native ALAGEUM CMS plugin and existing Next editor use the same versioned,
  validated and audited catalog domain service with separate identity adapters
- CMS writes lock and recheck native administrator, roles, exact unrestricted
  permission and the complete refresh-session chain. A rotated parent cannot
  survive revocation of its current child session
- CMS mutations bind the native token captured for that request and reject 401
  outside the Strapi fetch client retry interceptor. They are never silently
  replayed after login; account changes discard stale editor state
- Global catalog authority cannot be acquired from a tenant-local role
- Membership/user/organization/role status is rechecked and locked within writes
- Catalog aliases cannot shadow another public key or UUID, including hidden rows
- Version conflicts and auditing share the catalog write transaction; failed
  audit leaves no product mutation. Before/after category evidence is accurate
- RFQ owner and tenant boundaries, immutable server snapshots, body hashes and
  tenant+owner+idempotency keys are enforced in PostgreSQL transactions
- Strapi overrides the pg driver's JSONB and NUMERIC parsers. JSONB is explicitly
  decoded; RFQ quantity is selected as text to preserve Decimal(18,3) precision
- Route casing and optional trailing slashes cannot bypass the local login
  throttle or compatibility error/no-store headers
- Reviewed import is atomic and insert-only; stable UUID/public keys and existing
  administrator changes/hides are retained on repeated import

The local login limiter is process-local. Browser sessionStorage, distributed
abuse controls, upload scanning/storage, legacy identity/data import, complete
API parity, backup/restore rehearsal, hosting and cutover are unresolved
production gates. Tests do not establish production compliance or a complete B2B
business process.
