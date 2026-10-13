# ZOM / ZNOM shared drawing exterior: isolated prototype

Status: candidate only, independent source/integration review pending. This work
makes no runtime-binding, source-data, asset-completion or clearance change.
It does not decide whether a later approved use is a bounded representative
record illustration or a separately attributed source-context preview.

## Evidence and scope

Baseline: `a8f4f88845823105b242499bbe7b804368fcd0c8`.
Source: retained original ALAGEUM catalogue PDF, physical/printed pages 99 and
100, SHA-256 `8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e`.
The source-topology decision is SHA-256
`09369c076e66a8f117ca50dc96b3bddf97bf626d22dfb6649c30c04356d7367b`.
Native-resolution page drawing, plan, front/end fitting and upper-chamber crops
were inspected directly. No OCR counts, circuit-theory extrapolation or source
measurements were used. Full render provenance and crop hashes are preserved in
the separate review bundle. No embedded PDF content was executed.

One dedicated type, `tr26-measurement-column-zom-znom-source`, interprets the
shared drawn exterior. The creator resolves only that type, never product IDs.
It does not reuse or modify `tr26-instrument-column`; every baseline file remains
byte-identical. No rating, dimension, unit or anomaly is corrected.

The three evidence contexts remain distinct:

- `alageum-2026-zom-1p25-35`, page 99: the fuller marked cover arrangement is
  repeated despite the different table context; it is not verified for every
  delivered ZOM configuration
- `alageum-2026-znom35-config1`, page 100: one common drawing accompanies both
  winding-voltage subrows; mechanical differences or equality are unverified
- `alageum-2026-znom35-config2`, page 100: the same source limitation applies;
  the two electrical records are not merged

## Implemented visible construction

- Closed low tank: rectangular cover plan and long elevation, inward-sloping
  lower walls in the short-axis elevation, one thin base plate with no generic
  raised rails
- Single continuous capped lathe column with five broad shed profiles; its core
  joins the collar and upper chamber without an extra intermediate contact
- Cylindrical opaque upper chamber, one central top contact, a separate offset
  plug and a single source-visible opaque level-indicator cue
- Five stepped cover bushings in the printed plan's asymmetric arrangement:
  upper-left, mid-left, lower-left outer/inner pair and mid-right
- Mounting collar/flanges, two diagonal lifting-ear plates with real open holes,
  and one blank nameplate on the source-visible short elevation

Every cover bushing has `electricalRole: 'unverified'`. None is labelled HV or LV.
The top contact, its collar, and the plug are individually named; the plug is not
counted as a contact. Only the five cover studs plus the central top contact are
contact features. The model contains no wiring, internal parts, transparent tank,
source cutaways, manufactured clearances, dimensions or hidden hardware.

Small perimeter and flange fasteners, mounting holes, drain and earthing details
are deliberately omitted. The simplified flange/neck does not imply a hidden
bolt pattern. Plain unseen closure faces have no mirrored fittings. Colours and
material response are neutral display choices, not verified finish/material.
All proportions are arbitrary scene units.

## Icon

The reusable SVG uses native vector paths with the same five sheds, four-left /
one-right cover-bushing arrangement, one top contact and distinct offset plug.
The oblique cover is widened for small-size legibility. Tiny fittings and ear-hole
interiors are omitted. Opaque path layers keep back lines from crossing front
features. `--equipment-icon-surface` controls their surface colour, with white as
the standalone default; future integration must set it for other backgrounds.

The raster inspection sheet covers actual 28/40/48/56px UI contexts plus 32/64/96/
148px. At the smallest sizes it reads as a recognizable column/tank silhouette;
small fitting detail is necessarily dense. The path topology is retained, but
neither the tiny icon nor any size should serve as a terminal schedule. The
independent reviewer must judge its eventual display context. Icon/type metadata
imports no Three.js and is not wired into the existing icon registry.

## Contracts and validation

- Longest world bound normalizes to 2.8; base is at y=0 and x/z are centered,
  matching the existing viewer contract
- Standard BufferGeometry and MeshStandardMaterial resources only, no textures,
  listeners, render loop, browser access or remote assets
- Each call creates isolated resources; the dedicated disposer and existing
  generic disposer release each resource once; the dedicated disposer is also
  safe on repeat calls
- Focused tests examine actual vertices/rays for five shed bands, column
  continuity, tank closure/taper, non-overlapping cover contacts, true ear holes,
  finite opaque geometry, independent resources and SVG raster clipping
- Six CPU projections show long/short elevations, enlarged printed-orientation
  plan and three oblique views. Projection aspect is preserved. They are an
  offline mesh-inspection aid, not WebGL, browser or viewer-interaction testing

Local Chromium/Playwright was not retried or bypassed. Hosted WebGL validation,
independent source/integration review, display wording review and any eventual
binding or publication are separate later gates.

Suggested page-specific disclosure, pending review:

> Иллюстративный внешний вид по рисунку каталога, стр. 99/100. Показано
> расположение видимых элементов рисунка; назначение выводов и комплектность
> конкретного исполнения не подтверждены. Не CAD и не размерная модель.

Replace 99/100 with the applicable page and display its record-specific caveat.
The source's page-99 power-unit and 20/80 mass anomalies remain untouched.
