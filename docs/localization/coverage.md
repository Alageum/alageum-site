# Localization coverage — 12 November 2026

The selector and routes support RU / KZ / EN / CN / UZ using technical codes
`ru`, `kk`, `en`, `zh`, `uz`. Chinese URLs use `/zh`.

## Completed catalog and archive coverage

- All currently bundled 843 catalog records and 284 archive publications are
  inventoried from actual runtime records and presentation helpers.
- 5,864 language-bearing source strings have entries in all four non-Russian
  dictionaries. This includes headings, long paragraphs, lists, table cells,
  image descriptions, prose stored in designation/SKU fields, shortened intros,
  generated specification summaries, split facet values and block-module lists.
- Catalog search and facet counts support translated terms while exact model
  lookup, source filter values and numerical validation retain their contracts.
- Catalog descriptions, source notes, notifications, comparison, selection,
  accessible labels and CSV headings use the selected language.
- Archive bodies and metadata are translated on the server. Dates, attachment
  URLs, source records, table structure, numeric cells and model codes remain
  unchanged. The original Russian version remains available.
- 1,567 archive-body-only dictionary entries per language are stored separately
  in `frontend/lib/i18n/archive-dictionaries.json`. Only server archive pages
  import these; they are not bundled into the catalog/browser dictionary.

## Verification

- `node scripts/audit-localization-coverage.mjs --check`: no missing catalog or
  archive entries in KK/EN/ZH/UZ. Catalog coverage cannot be satisfied using the
  server-only archive dictionary.
- Focused tests cover actual corpus coverage, long paragraphs, table rendering,
  source immutability, model identifiers inside prose, adjacent Chinese text,
  voltage-versus-section notation, multilingual search, facets and CSV.
- Browser: English/Chinese/Uzbek catalog text checks, Uzbek translated-name search
  (31 results), Chinese product detail, and the same archive publication in all
  five languages. Exact model codes retain original spelling.
- Changed-file ESLint and production build are checked locally.

## Provenance and boundaries

Translations are pre-generated machine translations with selected technical
and navigation terms corrected manually. Source language autodetection is used
for Kazakh originals inside the historic archive. The site makes no translation
service requests at runtime. Native editorial review is not claimed.

Existing PDFs, source drawings, standard identifiers and product codes retain
source language/spelling. These are evidence documents and identifiers, not
untranslated website prose. Live CMS records were not rewritten: newly published
CMS content requires localized content supplied through the CMS contract. The
coverage guarantee above applies to the current bundled catalog/archive corpus.

Publication status is verified separately against the Git commit and Vercel deployment.
