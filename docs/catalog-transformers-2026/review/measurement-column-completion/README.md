# Three exact ZOM / ZNOM representative illustrations

Status: approved for bounded local integration by the independent review in
[independent-review.json](independent-review.json), with exact dependency authority in
[clearance.json](clearance.json). All 475 frontend unit tests and the source/legacy
release checks pass. Hosted browser/WebGL verification remains a required operational
check before production release; this review does not authorize release or deployment.

Baseline is public PR32 commit `1c705309c561130d34f79a367cd51c7ee864e59c`,
tree `5c59297893d4d1b52bf14c642c1ccc922073c89c`. The full baseline snapshot
SHA-256 is `dda99f863f2a27a114e2b36ad597d338395868ef8b36655827f6a52540d69c2f`.
It extends the older snapshot's enumeration with PR32's three accessory types:
125 model/name outputs and 135 actual rendered SVG/name outputs are protected.
The historical source-asset review, its 13 bindings and every earlier source
approval remain byte-identical.

The exact new records are `alageum-2026-zom-1p25-35` (page 99),
`alageum-2026-znom35-config1` and `alageum-2026-znom35-config2` (page 100).
They share only `tr26-measurement-column-zom-znom-source`; IDs, API UUIDs,
winding values, raw media and source pages remain separate. Page 99's printed
power unit and full/oil masses of 20/80 are preserved. Prototype metadata remains
`runtimeEligible:false`: only an exact, independently reviewed record manifest can
supply runtime authority. Invalid source identity, canonical shape, UUID or raw
media loses the new binding.

The visible reason beside every model combines the source review's exact
page-specific disclosure, omitted-small-details note and page-specific caveat.
Page 99 reuses a drawing under a different electrical context. Page 100 has one
common drawing for two voltage subrows. Neither establishes delivered configuration,
terminal functions, mechanical equivalence, dimensions, CAD or internal construction.
The five cover fittings remain electrically neutral. `tr26-instrument-column`
and every previous model and icon output are unchanged.

The icon retains the accepted ordered layers, opaque occlusion, transform and
stroke width 1.1. CSS sets `--equipment-icon-surface` to the actual opaque thumbnail,
comparison, selection, family-heading and viewer surfaces. The new type alone has
a solid viewer preview surface, including the no-WebGL fallback. Existing viewer
logic and all other model surfaces remain unchanged.

## Forward review boundary

`measurement-column-reviewed-dependencies.mjs` uses raw byte hashing and a closed
set of exact PR32-to-candidate amendments. Every unamended dependency still must
match PR32. The successor verifier, snapshot, inputs, tests, CSS and runtime binding
are themselves pinned. A pending clearance cannot authorize an amended historical
dependency. Only an independent reviewer may write the approved report and status.

The historical 13-record preservation checker now reports two explicit results:
its frozen PR32 checkpoint against the earlier baseline, and the successor's current
preservation against PR32. It does not claim that the three later bindings still
match the older 830-record assertion. Current checks preserve all 843 bodies/media,
840 other static/API bindings, 238 legacy records, all 13 previous admissions,
36 choice rows/74 choices and both NTMI source-context previews. Expected current
counts are 464 grounded default models, 465 grounded icons and 243 explicit
construction gaps across 29 families.

## Checks

From the repository root:

- `node scripts/check-measurement-column-completion.mjs --candidate` verifies
  exact source scope and current preservation without claiming approval
- `node scripts/check-source-asset-completion.mjs --candidate` composes the
  historical checkpoint with the current successor checks
- Omitting `--candidate` requires the independent successor approval and exact hashes
- `npm --prefix frontend run test:unit`, `npm --prefix frontend run lint`,
  `NEXT_TELEMETRY_DISABLED=1 npm --prefix frontend run build`
- `node frontend/scripts/render-measurement-column-prototype.mjs OUTPUT_DIRECTORY`
  retains the accepted offline geometry and icon inspection workflow

The existing catalogue Playwright suite includes the new `measurement column
completion:` cases for desktop/mobile, static/API, rendering, rotation, repeated
activation, close/navigation/history, no-WebGL/retry, source caveats, invalid API
records, comparison and selected-family views. Attachments include full visual
panels with visible caveats, canvas pixel metrics and computed icon surface colours.
Hosted browser execution is a separate required operational check; no local
Chromium retry or security workaround is used.

Current coverage/gap documents are derived and may be regenerated only after
independent approval. Historical source documents remain immutable.
