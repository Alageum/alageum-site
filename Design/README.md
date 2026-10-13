# ALAGEUM Electric — 2026 Styleboard

Cleaned design-system package.

## Included
- `index.html` — the only page; complete ALAGEUM 2026 styleboard/design system.
- `styles.css` — styleboard-only production CSS.
- `common.js` — interactions used by component demonstrations only.
- `design-tokens.json` — reusable visual tokens.
- `assets/logo-black.png` — light-surface logo.
- `assets/logo-white.png` — dark-surface logo.
- `assets/logo.png` — red brand-block logo.
- `assets/transformer.png` — the single non-photographic product asset required by the Product Row sample.

## Removed
All standalone screen/page instances, page-specific QA files, page-only CSS and all content photography.


## 2026-09-30 refinement
- 05 Buttons: demo states use one fixed 132 px width for clean state comparison.
- 07 Tabs & Selection: hover is a full neutral surface-state (`surface-hover`), not a line/accent change.
- Header Navigation: desktop dropdown groups with hover/focus/click behavior; mobile uses expandable groups.

## 2026-09-30 v3 refinement
- Header Navigation rebuilt as a single shared mega-area controlled by tab-style navigation; hover/focus changes the content without separate dropdown cards.
- 03 Typography: metadata role uses Futura Light (local font when available, with safe fallbacks) across repeated metadata/microcopy.
- 06 Forms: Select has separate chevron icon, left/right variants, and overlay list behavior that does not shift layout.
- 07 Selection: checkmark replaced by two centered circular states; neutral → inner red hover → both red selected, with stronger full-surface hover.
- 09 Technical Table: the entire row receives one neutral hover surface.
- 10 Status & Feedback: semantic chips repeat their state color as restrained tinted backgrounds.
- Shared controls are updated consistently wherever they recur.


## 2026-09-30 v4 refinement
- 02 Logo System: `Red block / rare use only` is now a fully filled ALAGEUM-red brand block with the white logo.
- 06 Forms: one canonical right-chevron Select only; the list attaches directly to the input with zero gap and inset option separators.
- Hover language: all demonstrated hoverable UI surfaces now receive a visible background-state change; semantic red/dark controls darken within their own color family.
- Shared Select instances (including modal usage) inherit the same attached-menu behavior.

## 2026-09-30 v5 refinement
- Hover gray is now a targeted production interaction state, limited to surfaces that are actually actionable. Static specimens, metadata, status chips and plain text links no longer receive artificial gray cards.
- 07 Selection Indicator now documents Default, Hover, Selected and Selected Hover. Selected Hover keeps the outer ring red while returning the center to neutral gray.
- Selection state changes use a restrained center-origin radial pulse; `prefers-reduced-motion` disables it.
- 09 Technical Table rows are full selection targets: hover/focus anywhere on a row drives the same Selection Indicator state, and clicking the row toggles selection.

### v6 interaction refinement
- Form-field hover now uses a restrained red border cue; field surfaces remain white until focus/open.
- Select option hover remains a gray surface state because the option itself is the direct selection target.
- Selection Indicator now documents standalone horizontal choices and compact button-like choices in addition to full-row selection.
- Status and feedback surfaces use light semantic tints with precise semantic borders instead of heavy badges.

### v7 interaction refinement
- Forms / Selection: pointer choice closes without retaining focus; keyboard-originated selection returns focus for accessibility.
- Technical Table: selected red-tinted rows preserve their red surface on hover/focus instead of switching to neutral gray.
- Tabs and header Navigation use a restrained brand-red hover surface instead of gray.
- All tab targets use one fixed width token (`144px`, `132px` on compact layouts).

### v8 corrected interaction patch
- Fixed an invalid escaped-newline CSS block from v7 that prevented the intended visual changes from being applied by the browser.
- Forms / Selection: mouse interaction no longer leaves a focus ring or active focus after opening/choosing; hover remains a light red border cue only.
- Technical Table: selected red-tinted rows keep exactly the same red surface on hover/focus.
- Tabs + Navigation: hover/focus surfaces use a clearly red-tinted brand state (`#FCE9EC`) rather than neutral gray.
- Every header/navigation tab and content tab uses the same 148 × 58 px desktop target (132 × 54 px on compact layouts).

### v9 coordinated motion system
- Header Navigation now uses one physical red underline that smoothly travels between tabs instead of independent per-tab lines.
- The same moving-indicator behavior is shared by content tabs for a consistent interaction language.
- Mega-navigation is one animated surface: open/close, panel crossfade, slight depth shift and staggered content all share the same motion tokens.
- Select menus unfold as attached surfaces with staggered options rather than appearing instantly.
- Buttons, inputs, selection indicators, product imagery, overlay specimens and mobile navigation use one coordinated duration/easing scale.
- Styleboard sections and grouped component samples use restrained scroll-entry choreography so the system reads as one connected interface.
- Motion is disabled/reduced automatically through `prefers-reduced-motion`.
- New motion tokens are included in `design-tokens.json` (`micro`, `control`, `component`, `surface`, `enter`, shared easings and indicator timing).

### v10 production Navigation + Forms/Selection
- Navigation selected state now uses a soft red surface plus the shared moving underline; labels stay neutral/dark instead of turning red.
- Mega-navigation links no longer shift horizontally on hover. Hover, selected and keyboard-focus states are separate and use one brand-surface state language.
- Navigation can retain a current destination with `aria-current="location"`, rendered as the same red-tinted selected surface.
- Forms / Selection selected options now mirror Technical Table: `#FFF1F3` selected background with neutral text; hover/focus use a lighter brand tint rather than red typography.
- Select ARIA wiring and keyboard navigation are tightened in `common.js` for production use.

### v14 production Tabs + Navigation
- Removed filled red hover surfaces from header Navigation and reusable Tabs. Hover now previews only through the shared moving underline plus neutral text emphasis.
- Committed tabs stay visually selected with bold dark typography and a restrained red glow rising from the bottom edge, rather than a full red-tinted block.
- Navigation now mirrors the 07/Tabs interaction model: hover previews the underline and mega-panel without changing the committed selected tab; click/keyboard activation commits; leaving Navigation returns the underline/content to the committed tab.
- Mega-navigation links no longer use red hover cards; current location uses a restrained lower red cue.

## v15 — 07 / Tabs dual underline
- Removed visible browser scrollbars/vertical overflow from the 07 tab rail.
- Added a 4 px committed underline that remains under the selected tab.
- Added an independent 2 px preview underline that flows to hover/focus and returns to the committed tab.
- Preserved equal tab sizing, keyboard interaction, motion tokens and reduced-motion behavior.


## v16 — Navigation dual underline parity
- Header Navigation now mirrors the 07 / Tabs dual-indicator model: a 4 px committed line remains under the selected section while an independent 2 px preview line follows hover/focus and returns on exit.
- Hover/focus previews do not commit selection; click or keyboard activation commits the destination.

## v17 — Persistent Navigation
- The primary header is now viewport-fixed rather than container-sticky, so Navigation remains available at the top throughout page scrolling.
- The page reserves exactly the header height, preventing content from sliding underneath the fixed header.
- Responsive header-height tokens keep the desktop and mobile offsets aligned; mobile navigation opens directly beneath the fixed header.
- In-page anchors retain a header-aware scroll margin, and print mode restores a normal static header.


## v18 — Navigation focus layer
- Added a precise neutral divider between the fixed header rail and the expanded mega-navigation surface.
- When Navigation is expanded, the rest of the viewport is de-emphasized with a restrained 6 px backdrop blur plus an approximately 5–6% neutral-grey veil, keeping white page surfaces visibly separate instead of washing into white.
- The header and mega-navigation remain crisp above the focus layer; the backdrop fades in/out with the shared motion system and can be clicked to dismiss Navigation.
- Mobile uses the same focus model with slightly reduced blur strength.
- `prefers-reduced-motion` removes the backdrop transition while preserving the visual hierarchy.

### v19 navigation refinement
Mega-navigation section dividers now sit below each section item. The surface stays clear; hover/focus transitions the lower divider from neutral grey to ALAGEUM Red.

## v20 — 12 October 2026: shared palette and corporate pages

Current palette: red `#CE1727`, ink `#1D1D1B`, divider `#C6C6C6`, red hover
`#B71322`. The user approved these after comparing the single-page “02 Леттеринг”
reference. The reference presents lettering alternatives, not a normative color
manual. No logo variant was selected or replaced. Image/logo pixels are unchanged.

The same approved values are in `design-tokens.json`, this panel's CSS/swatches,
and the frontend's later-loaded shared `site-shell.css`. The frozen engineering
`globals.css` and `catalog.css` stay byte-for-byte intact; the shared shell
applies only the approved color variables and focus tint. Brand-tinted navigation
and focus colors use the updated red RGB. Success, warning, information and error
semantics retain their own colors; muted text is intentionally darker than the
reference's decorative gray for readable body text.

The new Corporate surfaces section demonstrates the actual website composition:
light-gray canvas `#F2F3F4`, soft hero `#EFF1F3`, white reading cards and shared
graphite `#222528` for focused blocks. Corporate sections use 76 px desktop / 48 px
mobile spacing, 15–16 px body copy and precise sourced photography. Engineering
catalog, comparison, RFQ, workspace and admin layouts keep their existing structure.

`assets/corporate-production.webp` is the same verified KTZ photograph used on the
home page. Source: https://alageum.com/images/zavodi/ktz/3.jpg ; profile:
https://alageum.com/ru/predpriyatiya/ao-ktz . Reuse rights need the owner's confirmation
before production publication. It is not a generated illustration.

Earlier dated notes above describe prior iterations. This section and the current
rendered panel/token file are authoritative for the October revision.
