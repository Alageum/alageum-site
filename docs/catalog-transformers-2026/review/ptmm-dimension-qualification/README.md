# Bounded PTMM qualification successor

This candidate succeeds PR40 (`27e143efa1e0cbe850887a6807b17ea29a2877da`, tree `aa54618c5f6f6602899dc87422082ff5d1ca678e`). The source/UI review remains the unchanged PR38 eight-file freeze. It preserves the separately approved eight-file source/UI patch and its exact three-record/six-cell scope. Source dimensions and raw `мм` remain unchanged; the adjacent copy discloses applicability and unit uncertainty.

`source-ui-review.json` is the fresh independent source/UI report, not approval for these bridges or browser tests. `clearance.json` remains pending until the independent reviewer authors the new final report and approval. Historical clearances/reports stay byte-identical.

The new `ptmm-qualification-reviewed-dependencies.mjs` leaf binds exact predecessor hashes, the eight source/UI hashes, all new consumer/test/verifier files and fixed source, importer, API, quote and historical inputs. It never invokes an older gate, substitutes runtime bytes or caches approval. Protection/context partitions the reviewed successor pins before its previous browser adapter. The visual leaf forwards only exact reviewed predecessor changes to the new leaf. Missing, pending, mismatched, broadened, mixed-version and post-success edits are rejected.

Only synthetic authority-contract tests use the checked-in PR40 byte snapshot. Current successor tests execute the actual new leaf through protection, browser, visual, measurement and source-asset layers. The older scratch-checkout test copies the complete new verifier closure.

## Separate browser contract

`frontend/playwright.ptmm-qualification.config.mjs` collects sixteen tests: three cards and one comparison flow, each in static/API mode and narrow-desktop/mobile projects. It has two workers, no retries, a 45-second per-case timeout and a four-minute global test limit. API fixtures are actual importer/public DTO outputs with only volatile creation/update timestamps omitted. Negative source/value/UUID cases remain inside the same sixteen cases.

The configuration starts an existing production build on port 3118 unless `E2E_PTMM_BASE_URL` selects an already running build. It does not build or start development mode. Run from `frontend` after the reviewed build exists:

```
npx playwright test --config=playwright.ptmm-qualification.config.mjs
```

No local browser execution is part of this candidate review. `--list` is safe collection only. The existing 254 catalogue cases, assertions, thresholds, retries, configuration and eighteen-minute step are untouched.

Evidence belongs exclusively to `ptmm-qualification-evidence/` at the repository root: `results.json`, plus `test-results/` failure screenshots/traces/error context. The config overrides an inherited catalogue JSON reporter destination so the old `playwright-report/catalog-results.json` cannot be overwritten. No success screenshots or videos are collected.

## Separate workflow integration on the exact PR40 workflow

The new `ptmm-qualification-browser` job has a fifteen-minute outer limit, a five-minute production build and a six-minute browser step (ninety-second server-readiness bound plus four-minute global test limit). It starts/stops its own production server on port 3118. It retains complete isolated `ptmm-qualification-evidence/` as `ptmm-qualification-${run_id}-${run_attempt}` with seven-day retention and `if: always()`, including build/server/test-runner output (`runner-console.log`), head receipt, JSON report, failure evidence and per-case actual browser event files/attachments (`browser-events.json`).

The entire PR40 workflow is retained as an exact byte prefix. Its existing twenty-five-minute catalogue job, eighteen-minute254-case step, every artifact/receipt/budget and all other jobs are unchanged. The qualification job is appended separately; it never sends outputs through or edits the catalogue diagnostic exporter. New workflow bytes are included in this successor's exact dependency closure and require independent approval with the bridges and harness.

## Version 2 harness corrections

The original PR40 package remains frozen separately. This revision strengthens only the same sixteen cases: the exact browser DOM predicate checks cell width/height and every overflow/paint-clipping ancestor, while allowing tall text through ordinary vertical scrolling. The source link is scrolled into view, measured against visible scrollports and checked with a trial click. Node geometry counterexamples execute that exact predicate, including the two independently reported failures and valid tall/scrolling controls.

Stored units are asserted in the actual rendered DOM outside the caveat: the detail row's direct unit text, the static comparison value child, or the API comparison header. A fixture's `мм` or the `мм` appearing in warning text cannot satisfy these checks.

Before/after hooks capture actual page `console` and `pageerror` events for each case, including identity, project and viewport. Retention is capped at 128 events, 32 KiB of encoded event content, 2048 bytes per message and 48 KiB per artifact. Truncation, dropped-event counts, bounded read/persistence errors and transport status are explicit. Runtime error counts continue beyond the event cap and still fail the case. `afterEach` attempts both a standalone file and a report attachment even on assertion failure; either channel can preserve evidence if the other fails. Final capture/retention status is also added as a case annotation. Runner stdout is labelled separately and is never described as browser console data.

## Version 3 narrow review corrections

The version 2 checkout/package remains unchanged. Readability is now checked directly on the frozen source-value span, strong caveat, source link, and the actual unit-bearing node. Detail unit siblings resolve to their technical row; API comparison headers resolve to their own th cell. Serialized-predicate controls and the exact spec selection flow reject hidden, transparent or clipped targets while retaining normal tall-content scrolling.

Browser event evidence is committed through a same-directory temporary file and atomic rename, never by reopening the retained file for truncation. Each persisted candidate is read back and compared with the exact serialized bytes. Final saved status is recomputed from a currently verified file or a successfully retained independent attachment. A failed final temporary write preserves the first valid file; even an injected destructive rename cannot leave a stale saved flag when no usable transport remains. Exact beforeEach/afterEach controls cover the reviewer's sequence, attachment-only recovery and total loss; a native filesystem control verifies preservation after a partial temporary write.

An earlier retained snapshot can predate late transport errors. The returned afterEach annotation carries the final capture/retention status, including whether the file was preserved from the first write. No independent approval is authored by the implementation.
