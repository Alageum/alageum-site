# Rebuilt native upload / sharp regression candidate

Date: 2026-10-08. Baseline: PR44 commit
`9dc634a9cc8f1f3341baca3d553703a71cb33d6d`, tree
`2cd6d6ad48632334f3409a2bf43578111cc81164`.

This is a fresh local rebuild. Historical tests and approvals for the lost
candidate do not qualify these test bytes. The separate independent review must
bind the final rebuilt files. No publication, merge or deployment is established.

## Bounded dependency change

The only manifest change is the `@strapi/upload`-scoped override of sharp
`0.35.4` to `0.35.5`. Exactly 27 sharp/native-image lock records change; every
other lock record remains identical to PR44. The package and lock bytes match
the historical dependency-pair hashes, but that fact does not transfer approval
of the rebuilt tests. Strapi remains `5.56.0`. Existing Page/Slate adapters,
application code, workflows and full high-severity audit gate are unchanged.

The installed upload-resolved sharp reports `0.35.5`, libvips `8.18.7` and
librsvg `2.63.2`. The relevant upstream advisory is
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
These bounded regressions check version resolution, decoding and native upload
compatibility; they are not an exploit reproducer or a general upload-security
assessment.

## Fresh qualification

- Physical locked backend `npm ci`: passed. A first attempt could not create the
  default home-directory npm cache; retry used a writable workspace cache.
- `npm run check --prefix backend-node`: 662 passed, 0 failed/cancelled/skipped.
  This includes the unchanged syntax, media-release, webpack and Page adapter
  checks and the complete backend unit suite.
- Focused image, harness-safety and quiescence tests: 15 passed.
- `bash backend-node/scripts/run-local-tests.sh --integration-only`: 110 passed,
  including six new real native upload HTTP cases.
- `bash backend-node/scripts/run-page-tests.sh --contracts`: 12 passed.
- `npm run build --prefix backend-node` with `NODE_ENV=production` and disposable
  test configuration: passed. An earlier attempt failed because the SWC native
  addon tried to materialize its secure cache under a read-only home directory.
  The successful retry used an explicit writable `SWC_NATIVE_BINDING_CACHE`, as
  the existing local runner does; no package or native payload was changed.
- Full `npm audit --prefix backend-node --audit-level=high --json`: exit 1,
  29 high and 3 moderate affected packages. No sharp finding remains. The
  required full audit is still failing; no waiver or production-only substitute
  was introduced.

The runs used Node `24.19.0`, npm `11.9.0`, Linux x64 and official PostgreSQL
`17.11` binaries in disposable loopback clusters. This is local PostgreSQL 17
qualification, not exact PostgreSQL 16 CI parity. Both final clusters were
verified stopped. Uploads returned to the original `.gitkeep`-only fixture state.
`native-upload-sharp-regression-results.json` records exact source hashes,
commands, counts, durations, sanitized evidence digests and the full audit JSON.

## Image and native HTTP coverage

PNG input is encoded independently using Node zlib and an explicit RGBA pattern.
The actual pinned upload image-manipulation service performs detection,
full-decode validation, optimization, thumbnail generation and large/medium/small
responsive output. Every decoded output pixel is compared with the expected
fixture; header or metadata inspection alone is insufficient. Safe SVG output is
fully decoded and its native served bytes remain exact. Small-image, stream
metadata/validation, no-responsive-format and malformed/truncated-image paths
are also checked.

The six native HTTP cases exercise the mounted Strapi server, its administrator
permission engine, multipart parser, native upload service, local provider and
PostgreSQL file rows:

1. Anonymous, B2B and denied-role identities fail without file/row writes.
2. PNG upload persists the original and four variants, then HTTP-served bytes
   fully decode to expected dimensions and pixels.
3. Safe SVG upload preserves exact bytes/pixels without inventing raster variants.
4. Malformed raster upload rejects without provider bytes or persisted rows.
5. A client aborts after admission to the native provider. Native processing
   still completes and creates the real file row before teardown is allowed.
6. A concurrent multipart branch fails while another provider remains pending.
   The late branch subsequently writes real provider bytes, enters a deliberately
   delayed native metric, enters deliberately delayed native FILE creation, and
   creates its row. Drain is asserted incomplete at both late stages.

Separate synthetic controls verify receiver/argument/result/descriptor
preservation, synchronous error identity, fixed-point draining of late siblings
and new descendants, cleanup descendants, unawaited native-event descendants,
recording detached event errors, unowned-call preservation, and fencing a
submitted but never-admitted request through inner teardown. Those controls are
not presented as additional native HTTP cases or as historical-count parity.

## Ownership and teardown

The harness requires explicit test opt-in, an approved disposable loopback
database name, matching loaded database identity, test-mode Strapi, the local
upload provider and the mounted loopback server. It reuses only the already-owned
disposable CMS administrator fixtures. Test grants and upload settings are
temporary; preexisting permission rows/IDs, settings, configuration, file rows
and file hashes are compared after restoration.

Owned request tickets establish async-local scope at Koa `handleRequest`.
Native upload/provider/image/file/metric/FILE-query promises and asynchronous
event delivery remain tracked through cleanup. Admission closes first, then
promises drain repeatedly to a fixed-point empty state. Expected injected
provider failure is separate from unexpected detached event failure; detached
failures are recorded and asserted only after cleanup/restoration has completed.

Only explicitly prefixed fixture rows and names registered before owned provider
work may be removed. Provider bytes left without a row by a failed upload are
removed by this exact ownership set. A narrow closed-admission request fence
remains until outer server close; inner teardown never waits for outer shutdown.
Native methods and their property descriptors are restored. A test abort signal
closes admission and releases injected test gates so tracked work can drain.

## Remaining limits

The rebuilt coverage is intentionally smaller and more explicit than the lost
test framework; its counts must not be described as the historical qualification.
Native client abort and native fail-fast persistence were executed; late-admission
and detached-error controls use synthetic collaborators. No hard process-kill or
operating-system crash recovery is claimed. Promise tracking covers the pinned
native seams described above, not arbitrary future unreturned background work.

No browser was attempted or retried. Browser acceptance, hosted exact-head CI,
PostgreSQL 16 parity, the failing security gate and production-release approval
remain separate. The existing application production startup guard is unchanged.
