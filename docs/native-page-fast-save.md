# Native Page fast-save investigation

The original bounded diagnostic checkpoint on top of frozen PR23 changed test
fixtures and verification only. The diagnostic remains intact. The current
candidate adds the scoped input adapter described below; it does not rewrite
Strapi vendor code, change dependency versions, or grant roles in an existing
database.

## Page deletion selection adapter, 2026-10-06

The diagnostic in PR37 captured a lost clear rather than a delayed Form update
([exact-head artifact](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37519467257/artifacts/11440355655)).
In scenario 4's second repeated clear, the DOM range was expanded at
`deleteContentForward`, while Slate's selection was null. The later observed
callback contained only `set_selection`; editor and Form retained the previous
body. The shortcut followed 49.4 ms later without a matching mutation request.
Passing clears in the same run synchronized selection before deletion, then
recorded `remove_text` and Form `null`. Capture microtasks are not native-handler
entry/exit observations, and instrumentation can affect scheduling.

The local follow-up uses Strapi's public rich-text block registration API and
Slate's public React context to obtain the actual editor. Only the Page `body`
input provides the registration boundary. Composed native block refs register
the editor's own editable host, including the fullscreen portal, with one
counted capture listener. Native rendering, attributes, toolbar metadata and
imperative refs are preserved. Unmounts and ref changes remove registrations;
StrictMode effect replay suspends and restores listeners.

Before a trusted, cancelable forward/backward delete, the adapter reconciles an
expanded in-editor DOM selection with that same editor's Slate selection. It
requires a connected, active, editable host with the matching public DOM map.
Read-only, disabled, composing, canceled, synthetic, collapsed, outside-editor
and unsupported events retain native behavior. Unavailable or invalid DOM
mappings do not force a guessed range. The helper changes selection only; the
unchanged native handler owns deletion, history and empty-body normalization.
There is no timer, event replay, synthetic selection event, manual content write
or application access to React fibers. Existing synchronous Page Form updates
remain in place.

Compatibility checks now also pin the content-manager registration API and the
two Slate packages. Before build/develop/start, version and lock integrity plus
18 content-manager files and four Slate runtime files must match. A mismatch
fails the command and requires review; it does not silently switch editor mode.
Installed package files and content format remain unchanged.

Focused regression tests execute the exact installed CJS and ESM beforeinput
handlers with real Slate/history/Strapi normalization. They retain the negative
null/stale-selection reproduction and cover reconciliation, both directions,
selected portions, marked multi-paragraph content, undo/redo and exclusions.
DOM mapping, event dispatch and the Form sink in this fixture are controlled,
so these tests are not native browser acceptance. Separate ReactDOM tests cover
the actual bridge, registered native renderers, refs, portal and cleanup.
Local `npm run check` passes all 647 backend tests, including 54 selection and
10 bridge checks. The actual production CMS build also passes with disposable
in-memory build keys and task-owned CLI/native caches; it starts no database.
Independent review identified and corrected reliance on an
unreliable `Selection.isCollapsed` flag; actual endpoint/range validation and
native conversion remain mandatory. Shadow-root behavior is covered with
controlled mappings, not a claim of a real shadow-DOM browser run.

The original seven-scenario browser probe and its fourteen explicit native
writes remain unchanged, including every rapid clear/restoration pair and
strict request/reload/public-content assertion. This candidate still requires
a fresh hosted build and native browser run before claiming the observed clear
path is corrected. The dependency audit gates remain enforced. No production
cutover, role grants, database migration or deployment is part of this change.

## Native clear-event diagnostic, 2026-10-06

PR36 head `c83265e76c3c671e84e97ed6d8527f788abe46e8` reproduced another
clear/publish failure with the PR35 application fix unchanged
([retained evidence](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37513290504/artifacts/11435976850)).
The initial clear's shortcut occurred 24.7ms after `beforeinput`; both request
and HTTP 200 response contained the preceding body. The first three lifecycle
scenarios passed, the fourth failed, and later scenarios were not reached.
Ordinary Page cases and the twelve-attempt fast-save probe passed. PR35's earlier
success remains historical evidence, not proof that this path is closed.

The installed Slate implementation flushes queued selection handlers before
handling input, but it does not necessarily read the current DOM selection if
no selection event was queued or reconciliation is temporarily suppressed. Its
forward-delete path ignores native target ranges and operates on Slate's stored
selection. A null selection or a collapsed caret at the end can produce no edit
operation; in that case the Page callback and its form-commit flush never run.
This path is reproducible with the native Slate core, but the retained browser
record does not identify it conclusively. Missing DOM `input` is also normal for
a successful Slate-managed deletion and cannot settle the question.

The next checkpoint therefore changes diagnostics only. A test-only React
DevTools hook locates the mounted editor and nearest native Page Form. Capture
is allowed only on the loopback Page route for the exact synthetic UUID slug
created by this fixture. It records bounded beforeinput/selection observations,
native operation types, and allowlisted Page body snapshots around the real
callback. It never serializes React fibers, renderer internals, arbitrary Form
fields, authentication state, tokens or browser storage. Existing hooks and
incompatible editor references must be rejected explicitly.

The real callback is observed and forwarded; no selection is forced, no form
value is set, and no timeout, automatic retry or publication delay is added.
Instrumentation can still affect scheduling, so an instrumented pass cannot
establish absence of the race. The strict request/native reload/public-content
assertions and existing timing limits remain mandatory. This checkpoint does
not claim a further application fix; its purpose is to distinguish a lost
native deletion from a later callback, form-commit or reset failure before
choosing a correction. Hosted diagnostic execution and review are still needed.
Local verification passed all 562 frontend unit checks (including 18 controlled
probe tests), frontend lint, lifecycle discovery and 16 unchanged native Page
commit/integrity/evidence checks. Independent review confirmed fixture-only
capture and callback forwarding; failure paths also drain the probe before
reporting the original operation failure. Native browser attachment remains
unverified locally because Chromium cannot create its IPC socket in this
environment. No application, dependency, workflow or vendor file is changed.

## Form commitment follow-up, 2026-10-06

The unchanged adapter later failed the strict clear-and-keyboard-publish case at
PR31 head `a8f4f88845823105b242499bbe7b804368fcd0c8`
([retained evidence](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37455508135/artifacts/11408853636)).
The shortcut followed native `beforeinput` by 7.8ms. Both the outgoing request and
the successful published response contained the previous nonempty body, instead
of null. The first three lifecycle scenarios passed; the fifth through seventh
were not reached. The existing seven Page cases and twelve rapid-save attempts
also passed, so those prior passes do not close this newly demonstrated gap.

Removing the editor's debounce delivers AST changes immediately, but native
`Form.onChange` still dispatches a batched React state update. Native `getValues`
and validation read a ref updated during the next Form render. Publish's single
microtask yield does not guarantee that lower-priority render has committed.
Slate-handled deletion prevents default `beforeinput`, so the absence of a DOM
`input` event does not establish that its AST callback was skipped.

The follow-up candidate wraps only Page/body's native change callback in
ReactDOM `flushSync`, using the public `useField` hook. This commits the received
AST change before returning to Slate. The native input, normalization, refs,
validation, permissions and Save/Publish endpoints remain in place; other
models and field names keep their existing callback behavior. No vendor bytes,
dependency versions, authentication controls or database schemas are changed.
This guarantees commitment after the AST callback runs; it does not manufacture
missing editor events or claim to finish an in-progress composition.

The deterministic regression uses installed React 18 `createRoot`, native
Form/context/reducer and editor callbacks with an inert DOM root and visual
substitutes. It distinguishes an immediately delivered callback from a committed
form value, including native submitting, validation and serialization ordering.
That is a scheduling test, not a real contenteditable/browser proof. The strict
hosted lifecycle scenario additionally repeats four explicit nonempty/clear
publication pairs, verifies native reload and public content each time, and
still stops on the first mismatch. It requires fourteen explicit writes, with
no automatic retry or delay before the shortcut. Existing timing and child
process deadlines remain unchanged.

`flushSync` can run pending effects and increases rendering work; it is scoped
to this field and exercised with reset/unmount checks. See the
[React API caveats](https://react.dev/reference/react-dom/flushSync).
Hosted verification of this follow-up is still required. The prior socket
restriction was reproduced locally on 2026-10-06 before Chromium created a page.
Local verification passed 582 backend checks (including the five new scheduling
regressions), 443 frontend checks, lint, the actual CMS build, unchanged native
file integrity checks and lifecycle test discovery. The build used a task-owned
SWC cache because the environment's default cache directory is read-only.

## Observed failure and scoped input adapter

PR29 head `6594535257fd044a865f8f218419cac77d1b9805` reproduced a mismatch in
[the retained browser artifact](https://github.com/StiveMan1/Alageum_Temp/actions/runs/37300508866/artifacts/11340787609).
Attempt 2 typed Blocks before the title and clicked Publish 59.9ms after the
last body input event. The outgoing request omitted `body`; native response and
reload returned null, and the public API/page were empty. Title and slug survived.
The same attempt included a real body blur before Publish, so adding a blur alone
does not establish a fix.

In pinned Strapi 5.56, the editor debounces form synchronization for 300ms. Its
blur flush can be skipped by Slate while updating selection. Native reset-key
bookkeeping also distinguishes editor changes from form-value changes, so an
intervening field render while the body remains unset can reset the editor.
The browser evidence establishes loss before submission; these source paths
explain why a Publish-only delay or an extra draft save is inadequate.

`src/admin/app.js` registers an application field wrapper. Only `api::page.page`
and its `body` field use the native input's existing `livePreviewSync` mode.
That mode updates form state on each AST change without creating the delayed
callback. Other fields keep their supplied mode and all native props, including
disabled state. Native rendering, rich-text structure, empty normalization,
Save/Publish actions, validation, authorization and endpoints are retained.
This trades debounced form updates for synchronous updates on Page body edits.

The native `BlocksInput` module is not a public package export. This is a pinned
internal compatibility adapter, not a claim of a stable public input API. Its
16 compiled editor/action files and source maps were compared byte-for-byte with
the official `@strapi/content-manager@5.56.0` npm tarball, whose integrity matches
the lockfile. `check-page-editor-adapter.js` verifies those hashes, package version
and lock integrity before checks, development, build and start. A changed package
must fail for explicit adapter review; the check never patches vendor files.

Five deterministic callback tests load the unchanged installed BlocksEditor
module with real React server rendering and Slate. They prove immediate repeated
edits, preserved structured content, clear-to-null, selection-only no-ops, and no
pending timer in synchronous mode. The old mode demonstrably retains a pre-reset
callback. Visual child modules and timer scheduling are controlled in that test;
it is not a browser, React-effect or full discard/unmount proof. Four additional
checks cover vendor/version drift, missing files and redirected paths.

The existing seven native Page cases and twelve-attempt fast-save diagnostic
remain mandatory. Additional bounded browser coverage exercises keyboard Save
and Publish, repeated revisions, clearing, cancel/leave and native discard. Any
post-cancel observation across the old debounce window is labeled separately;
there is no sleep before a save/publish action to make it pass.

The original scoped adapter checkpoint passed 573 backend checks, 377 frontend checks,
frontend lint and the CMS build. The official npm registry still reports 5.56.0
as latest on 2026-10-05. Local Chromium still
fails before page creation with a socket-permission error, so the candidate's
actual browser lifecycle behavior requires hosted verification. No new browser
pass or production-readiness claim is implied by the local results.

The new keyboard cases focus the title field immediately after body input and
record that target explicitly. Native Blocks handles modified Enter before the
global document shortcuts, so exact-body shortcut behavior while Blocks itself
remains focused is not covered by this adapter's verification. Reset-dialog
timing is measured separately; a slower dialog is not claimed as a sub-300ms
reset. Existing hard dependency audit gates remain unchanged.

The first hosted adapter run passed all seven existing Page cases and all twelve
original fast-save attempts, each measured inside 300ms. The new keyboard create,
publish and revision scenarios passed at 25–41ms. Its select-all/backspace clear
sequence submitted a one-character deletion, which the server preserved exactly;
it did not establish a lost empty-body update. The clear fixture now uses the
explicit contenteditable `fill('')` operation and still requires native null and
public empty content. Native selection behavior for rapid Ctrl+A/Backspace is
not claimed by that fixture. Leave/discard confirmations are selected by their
actual native `alertdialog` role.

## Reason for the probe

An earlier PR23 browser run received a successful first-create response with the
correct synthetic Page slug and title but a null Blocks body. That run did not
retain the outgoing request body, so it cannot establish where the value was
lost. The native HTTP publication checks passed. Three subsequent source heads
passed the seven Page browser cases, including a strict outgoing-payload check.
Those results do not establish that every fast interaction is reliable.

Installed Strapi 5.56.0 already contains the related upstream fixes in
[#26020](https://github.com/strapi/strapi/pull/26020) and
[#27042](https://github.com/strapi/strapi/pull/27042). The official registry and
release check on 2026-10-03 found no newer stable release or demonstrated narrow
fix. This checkpoint does not attribute the earlier failure to a vendor defect.
The installed BlocksEditor, BlocksContent and DocumentActions compiled files
and source maps were also compared with the official npm tarball: all 12 files
matched, and tarball integrity matched both the lockfile and registry metadata.
The three embedded TypeScript sources matched the official release tag.

## Bounded matrix

One serial Chromium test plans 12 measured attempts:

- Create with body entered before title, following the earlier entry order
- Create with title entered before body
- Edit the body of an existing, verified native draft

Each scenario uses both default-speed sequential key input and Playwright's
contenteditable `fill`, followed by immediate Save or dirty-form Publish.
`fill` is a browser input method, not proof of a physical clipboard paste. Setup
saves for the existing-draft cases are distinguished from measured attempts.
Reload and public API/page checks verify the exact saved body and publication
state after each attempt.

The test has no retries, artificial delays, timer overrides, mocked writes or
automatic resaves. It stops at the first mismatch. Its browser budget is 180
seconds. The parent starts stopping the child at 195 seconds and permits up to
five seconds for termination before a forced stop. The existing outer Page
delivery deadline remains 780 seconds, with an 800-second CI process limit.
The existing seven Page browser cases and native
publication checks run first and keep their original assertions.

## Fixture and evidence boundaries

The extra actor exists only when both `--fast-save-probe` and
`ALAGEUM_TEST_PAGE_FAST_SAVE=1` are explicit. The harness still requires test mode
and a fresh loopback database named exactly `alageum_strapi_pages_test` before
Strapi loads. The additional native role grants only Page read, create, update
and publish. The existing separate editor, publisher and denied actors retain
their original permissions. No existing database or user is provisioned.

Native authentication traces and video are disabled. Evidence contains selected
synthetic Page fields, mutation method/status, passive input/blur/action timing,
and explicit screenshots. It excludes cookies, authorization headers, passwords,
tokens, browser storage and unrelated network payloads. Child output passes
through the existing complete-line secret redactor.

The timing report distinguishes attempts whose final native Blocks
`beforeinput`/`input` event reached the save/publish action within 300ms. This
measures browser input intent, not the time React commits a form value. The
event type and separate native input timestamp are retained because Slate can
handle input while preventing the default DOM input event. A clean run only
establishes the measured attempts; it is not proof that every scheduling race is
absent. A mismatch in the submitted body points to the client/form path. An exact
submitted body followed by a mismatched saved or reloaded body points to a later
stage. After a mismatch the same attempt may finish read-only reload/public
checks for diagnosis; no later attempt or repeated write runs. Either outcome
requires inspection before choosing a corrective change.

## Original diagnostic verification

The local checkpoint passed 549 backend checks, including 11 new fixture and
evidence-gate tests, plus seven real PostgreSQL/native HTTP fixture checks.
Frontend lint passed. Discovery retained the existing 58 general and seven Page
cases, with exactly one new diagnostic under its separate configuration.
Independent source review found no remaining blocking issue in the diagnostic.

Hosted execution is required to establish the 12 actual outcomes and measured
timing coverage. Its exact source head, run and artifacts are recorded in the
draft PR. Local validation does not claim a reproduced or fixed race. The
existing hard dependency-security gates remain enabled and blocked; a functional
probe cannot approve deployment.
