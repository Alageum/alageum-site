# Corporate presentation and shared palette — 12 October 2026

## Scope

The home page, static company page, enterprise map/directory, six enterprise
profiles, project index and four project details, solutions index and three
solution details, contacts, documents, privacy presentation and CMS editorial
template now share an opt-in corporate layout. White content surfaces alternate
with light-gray chapters. Real sourced factory and project photography replaces
abstract project tiles; the homepage focuses on capabilities and the business.

Corporate copy now names the group's activities, enterprise specializations,
project participation and the next step in plain Russian. Existing dates, contact
facts, project status, technical data and source links are preserved. Privacy
wording is unchanged. No revenue, capacity, employee-count, delivery-time or
investment-return claims were added.

## Palette and reference panel

The user approved red `#CE1727`, ink `#1D1D1B` and structural divider `#C6C6C6`
after comparing the supplied one-page “02 Леттеринг.pdf”. It shows four lettering
alternatives and several close reds; it is not treated as a normative color
manual. No logo variant was selected and logo/photo pixels are not recolored.

Shared palette variables are applied through `frontend/app/site-shell.css`.
Brand hover is `#B71322`; muted body text remains `#676D73` or `#5B636A` for
readability. Corporate dark blocks use existing graphite `#222528`; the map uses
neutral gray depth. Gray canvas `#F2F3F4`, soft hero `#EFF1F3` and white reading
surfaces are composition choices, not colors claimed to be specified by the PDF.

The existing `Design/index.html`, `Design/styles.css`, `Design/design-tokens.json`
and `Design/README.md` are synchronized. The panel has a Corporate surfaces
example with actual production photography, responsive spacing, copy and caption
rules. Semantic success/warning/error/info colors remain distinct.

## Engineering boundary

Catalog, comparison, product, RFQ, workspace, login and admin composition are not
redesigned. Shared color variables change globally; a few existing focus/tint
colors are aligned. `globals.css` and `catalog.css` stay byte-for-byte equal to
PR45, preserving their existing independently reviewed catalog proof bindings.
No historical proof hashes or approval records were refreshed.

Product photography integration is a separate change. This candidate includes
only the corporate photography asset/helper commit and corporate photo wiring.

## Photography and evidence

`frontend/lib/public/photography-manifest.json` records the 13 verified assets,
source pages and image URLs, dimensions, exact byte hashes, captions and alt text.
The website owner still needs to confirm reuse rights before publication.

- Homepage: real KTZ production, Yassy building and Nura autotransformer.
- Factory profiles: actual photographs of all six represented enterprises.
- Projects: three attributable photographs. Nura's caption explicitly identifies
  supplied equipment; Petropavlovsk shows a site inspection during construction.
- Nur-Esil has a labeled reference-data panel because no exact photo was verified.
- Category protection keeps an equipment icon because no exact category photo
  was verified. Other categories use official category or production context.

1997/history and group capabilities follow `docs/company-pages-sources.md` and
`docs/public-content-sources.md`. Construction is not called completed, and
published equipment supply is not presented as full construction scope.

## Verification

See `verification.json` for the final executed checks and limitations. The
updated `npm run audit:company` script is reusable across all public corporate
routes and representative engineering routes at 1440, 768, 390 and 320 pixels.
The company Playwright suite retains URL/back/forward/reload, repeated click,
contact search/reset, FAQ and keyboard/reduced-motion coverage. New checks cover
readable sales-card text, SVG arrow sizes and graphite closing blocks.

No external publication, deployment, user account data or real request submission
is part of this candidate.

The recorded `public-audit.json` covers 108 real production renders.
`catalog-geometry.json` compares the final candidate to PR45: all six measured
catalog regions match exactly on desktop and mobile. `palette-contrast.json`
records seven representative text/background ratios, all at or above 4.5:1.
This scoped check is not a comprehensive accessibility certification.

The four added visual browser regressions run as named steps in the existing
company route cases. All assertions remain, while the historical general
Playwright collection stays at 170 tests in seven files. The KTPB isolation
contract and other historical catalog gates remain unmodified.
