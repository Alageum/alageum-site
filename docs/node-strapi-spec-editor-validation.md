# Native catalog specification editor validation

## Hosted accepted baseline and pending literal-line presentation fix

All workflows passed at exact hosted commit
`48084bf605d929b1897661fb937ef849f418ecfc` (tree
`a1289b81a52a4e61fc8e71a37dba55f8a6749a7b`), including **all 43 default browser
cases and all four optional-webpack CMS cases without retries**. The earlier
feature head `a40d3242d7fe3a64df3195a489c9b90a93bf87ea` passed **55 backend units,
52 PostgreSQL integrations and 150 frontend units**; its audit reported **0 high
and 15 moderate** findings. Those functional assertions remain intact.

All five retained captures at 48084bf6 were visually inspected:

- `native-cms-literal-source-page.png`
- `native-cms-numeric-null-unit.png`
- `native-cms-multiline-configuration.png`
- `public-detail-specifications.png`
- `public-comparison-specifications.png`

The native forms clearly show the saved typed values and source metadata.
Inspection found that normal HTML whitespace collapsed the public configuration
value `0007\nSecond literal source line` onto one displayed line, despite exact
storage and API roundtrips. Thus that hosted success did not establish correct
public presentation of literal line breaks.

The focused correction at source commit
`6bed31304cb9537a69468a152cfca67bc21586d1` (tree
`2cd0932b68657f71919172d4df6abfe0d1554829`) applies one shared
`catalog-spec-text` class to literal labels, values, units and configuration
designations in live and shared static detail/comparison rendering. `pre-wrap`
preserves line breaks; `overflow-wrap: anywhere` and `min-width: 0` permit long
values to wrap. Ordinary prose and price cells are unchanged. Existing escaped
React text, exact values and data contracts are untouched; there is no HTML
insertion, dependency, schema or workflow change.

The existing native browser case reuses the LF-containing fixture in technical
and configuration values. Before retained detail/comparison captures it checks
exact DOM text, computed whitespace/wrapping styles, and DOM Range geometry
showing both source lines in separate rendered positions. No new login, suite,
retry or timeout relaxation was added. The five existing PNG paths and artifact
privacy allowlists are unchanged.

Local verification of the focused correction: frontend lint, **150 unit tests**,
JavaScript syntax/whitespace, five-case native browser discovery and production
Next API build all pass. The production CSS contains the shared literal-text
rule. **The new line-break/layout assertions and updated PNGs await a hosted run
and visual inspection; the green 48084bf6 result does not verify this correction.**

## Earlier local combined verification

Validation date: 2026-10-02. The feature was rebased without conflicts onto the
verified PR8 commit `7866ef10815059dc79a7015009d99fdd49706d5d` (tree
`9e3407a8ff65672b02e9ffc13ab9ff2c2c001b27`). Combined acceptance below ran against
feature code commit `f8a6e05934ede6901e578c1f292938ab06717d1f` (tree
`4bbc6998871db88603c16a8354f0a15b4adedb58`). A subsequent wording-only correction
keeps “Choose Text” guidance on typed row values, directs Power source text to a
text specification row, and requests a positive safe integer for Source page.
Validation/type behavior is unchanged. Its affected draft suite passed **8/8**,
and module syntax/whitespace checks passed; the broader combined checks below
were not repeated for that error-message correction.

This bounded native CMS authoring change preserves PR8's compatibility files,
dependency locks, guards and workflow. It adds no database migration, public
identity, dependency or v1 transport change. The earlier PR7-based checkpoint
passed 42 backend units and 52 integrations; those results are superseded by the
combined verification below.

## Completed locally

- Backend syntax and unit checks: **54 passed, 0 skipped**. Seven new draft
  cases include exact roundtrips for all 238 reviewed source specification
  objects, typed numeric edits, literal strings, absent/null/empty unit states,
  source metadata, lossless decimal conversion, negative zero rejection,
  explicit booleans, LF-containing literal text and validation-path mapping.
  The 12 existing PR8 patch-guard cases remain included.
- Real Strapi/PostgreSQL integration: **52 passed, 0 skipped**. Seven new native
  HTTP cases exercise typed JSONB/HTTP replacement, 15 invalid field paths,
  category absence/publication, native management versus tenant permissions,
  concurrent version conflicts, before/after CMS audit identity, atomic rollback
  after audit insertion, public detail/comparison, and immutable stored RFQ
  snapshots after subsequent specification edits. Existing transaction/session
  revocation and production-refusal checks also pass.
- Production Strapi administration build and built-asset checks: **passed** after
  the final UI changes.
- All four production frontend builds: **passed** (API catalog, isolated
  interruption build, live Page delivery, and static preview).
- Page contracts: **12 passed**. Page HTTP fault matrix: **58 passed**. Native
  Page HTTP delivery: **12 passed**. Servers started and stopped successfully.
- Frontend lint: **passed**. Frontend unit suite: **150 passed, 0 skipped**.
- All **43 default browser cases were discovered**, including the expanded five
  native CMS cases. They remain selected by the existing hosted workflow, with
  no added login, retries, timeout relaxation, skipped cases or weakened assertions.
  Discovery is not execution.
- Fresh unchanged dependency audit gate: **0 high/critical, 15 moderate**, exit 0.
- Webpack middleware protocol: **42 passed**. Exact-config compiled equivalence:
  **passed in the DOM-free VM only**, including 3,024 glob comparisons and 112
  upload-filter decisions. No browser-equivalence pass is claimed.
- Actual optional-webpack cold/warm Strapi compilation, CMS HTTP/assets,
  API isolation, SSE build updates, intentional syntax-error recovery and source
  restoration: **passed**. Both server ports were released and the disposable
  PostgreSQL cluster stopped. Its four browser cases were not executed.
- Git whitespace check: **passed**. Dependency manifests/locks, reviewed catalog
  data and public identifiers are unchanged from the base.

Local tests used a task-owned PostgreSQL 17 cluster on loopback TCP and separate
named disposable test databases. A fresh physical `npm ci` installed the exact
PR8 lock in this worktree;
postinstall applied both expected adapter patches and the guard verified them.
The pre-existing physical frontend install matches its unchanged lock.
Temporary/cache paths were workspace-backed; HOME and CODEX_HOME were
unchanged. Disposable application keys were process-only. The database server
was stopped after verification. The unchanged combined acceptance runner was
invoked with explicit `--http-builds`; its protected-file and cleanup checks
passed. Its generated compatibility report was retained in the feature-specific
[combined report](../backend-node/docs/spec-editor-combined-results.json), with
supplemental audit/protocol/webpack checks. The original PR8 compatibility
report was restored byte-for-byte.

## Browser coverage and local execution limit

The cloud executor's previously verified Unix-socket restriction blocks local
Chromium. No browser was launched or alternate route attempted for this slice.
Browser test discovery is not browser execution. Hosted 48084bf6 acceptance above
establishes the functional browser pass and reviewed baseline captures; the new
line-break/layout assertions remain unrun locally and await hosted evidence.

The existing native flows now additionally check:

1. Typed row/unit/page and multiline configuration authoring, unsafe-number
   field errors
   with zero network writes, exact published specs, and Next detail/comparison
   visibility. Hide/Restore preserves saved specs and is disabled while unsaved
   specification edits exist. The LF-containing literal is checked before save,
   in exact API JSON and after native reload, along with its unchanged unit/page.
2. Two-session spec conflicts retain the losing draft, keep status actions
   disabled while dirty, then reload the winning spec and re-enable them.
3. A denied native administrator cannot overwrite specs.
4. Native refresh retains unsaved specs.
5. A 401 mutation is not retried, preserves unsaved specs, and retains the
   existing late-response Close/Back/Forward assertions.

The existing workflow runs these cases with its actual built Strapi CMS and
production Next app. All 43 default cases, four optional webpack CMS cases and
the real-browser compiled equivalence probe remain unrun locally for this
feature. Hosted results are distinguished above. The broader Page
HTTP/contracts/builds did run locally as recorded. The moderate advisories and
production startup refusal remain; this report makes no production-readiness
claim.
