> Historical catalog-only checkpoint. Current scope: [full-site verification](full-site-verification.md), [meeting questions](full-site-meeting-questions.md) and [public sources](public-content-sources.md).

# Catalog meeting questions / 2026-09-30

Current release: technical catalog. This register complements, rather than replaces,
`discovery/05-catalog/catalog-questionnaire.md`. No provisional assumption below is a client decision.
The user-facing meeting agenda uses the same priorities: assortment/source, parameters/units,
variants, documents/access, price/stock, languages, site structure, acceptance/date and future selection.

| Question | Why it matters | Temporary implementation assumption | Status |
|---|---|---|---|
| Which 5–10 real products and categories belong in the first release, and who owns their source export? | Establish trustworthy content and identifiers; avoid polishing a false taxonomy | Clearly synthetic local fixtures; existing DEMO-001 retained; API pathway preserved | Open · client/data owner |
| Which fields, data types and units are filterable, searchable and comparable for each category? | Drives category-specific facets and technical comparison | Power (kVA), voltage (kV), cooling and installation are demo UI examples only; absent values are `—` | Open · engineering/catalog owner |
| What is a product versus model, variant, configuration and SKU? | Determines product URLs, row identity and which differences are valid comparisons | One fixture represents one selectable row; no configurable/compatible-equipment claims | Open · catalog owner |
| Which passports, drawings and certificates may be public, where are approved versions stored, and who publishes them? | Prevents misleading downloads and unauthorized document access | Explicit empty documents state; no fake file links; API documents/auth unchanged | Open · engineering/legal/data owner |
| Should the public catalog display stock, price or lead time? From which source and with what freshness/meaning? | Wrong availability or pricing creates commercial expectations | Do not display fabricated values or imply an offer; price and availability are not supplied | Open · sales/data owner |
| Which languages are required at launch, and who approves translations? | Controls taxonomy, content fallback and accessibility testing | Russian demo UI; original API translation fallback RU → EN → slug; no language-switch promise | Open · business/content owner |
| Which main pages/navigation groups should ship with the catalog, and which corporate texts/contacts are approved? | Shared Header/Footer and page foundation must match approved information architecture | Home/catalog/solutions/company/contacts foundation; unapproved content is visibly pending | Open · business/design owner |
| Which demo flows and device sizes constitute acceptance, and what is the review date? | Makes release completion measurable | Test search, filters, URL/back/reload, details, comparison, local selection and desktop/mobile layouts; date not assumed | Open · project owner |
| Is the selected-product list only a local project list, a later RFQ, or a real shopping cart? | Avoids accidentally committing ordering/payment workflows | Local browser list + explicitly demo CSV; no personal data, request transmission or checkout | Open · sales/product owner |
| How should the existing backend attributes map to the UI, and what production pagination/filtering contract is approved? | Existing API exposes generic attribute codes and slug-only search; frontend must not infer semantics | Explicit API view retains raw code/value/unit; demo facets/comparison/selection are not represented as production integration | Open · backend/catalog owner |

## Evidence needed for next increment

Approved sample export, stable identifiers and units, representative variant examples, document/media
files with access rules, intended UI languages, approved corporate/contact content and a concrete
catalog acceptance checklist/date. Until supplied, the demo is suitable for UX discussion only.
