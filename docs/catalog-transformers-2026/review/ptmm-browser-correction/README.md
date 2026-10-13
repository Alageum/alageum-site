# Bounded correction after the first hosted PTMM run

This separate successor starts at PR41 683134b3d7ef8e0424da752939308e7882a9937a, tree 620682e2539c6deee70901b44110c1702dc4bb90. Published qualification and all earlier approvals remain immutable. The new clearance is pending until an independent reviewer authors its report. No implementation-authored approval is supplied.

The sixteen-case hosted run had six full-text Range width failures and one null source-link exception. The null-link regression reproduces the production failure and preserves all 1686 canonical static/API visual renders. ProductVisual now renders the existing source-page text without a link when the authoritative URL resolver returns null. It invents no destination and changes no source identity.

For the six width failures, retained screenshots show complete caveats and links but the trace lacks raw coordinates. The inherited pre-wrap style makes hanging soft-line spaces a plausible explanation, not a verified Chromium cause. The predicate now measures each non-whitespace text-node run at original offsets, retaining all prior 1px cell/ancestor/viewport/scroll bounds and full-content/unit assertions. Missing word geometry fails. Bounded raw-versus-word diagnostics on failure and up to six successful difference witnesses allow the next hosted run to test that hypothesis.

Primary references: [CSS Text whitespace](https://drafts.csswg.org/css-text-3/#white-space-property) and [CSSOM text Range rectangles](https://drafts.csswg.org/cssom-view/#dom-range-getclientrects). Static doubles establish the predicate contract; they do not recover missing hosted measurements.

The new leaf reads fresh raw bytes, binds exact PR41 predecessors and the complete consumer/test/verifier closure, and checks an immutable map for source data, geometry, all eight approved UI files, CMS/Page files, workflow/security, and published approvals. It calls no previous gate, projects no historical runtime bytes and caches no authority. PTMM's reviewed-file checks and final predecessor comparison forward only recognized PR41 pins; protection's current partition forwards only ProductVisual's exact approved predecessor. Every other historical branch remains unchanged.

Only synthetic historical unit fixtures use historical-test-bytes.json through the clearly test-only helper. Default readers inspect current disk. The transformer corruption test copies the new leaf/docs too. New mutation controls cover missing/pending/mismatched approval, scope expansion, mixed versions, warm edits, same-size timestamp-restored changes and immutable re-attestation.

The 254 old browser cases, their workflow, all budgets and assertions, the sixteen-case matrix, UI8, raw records/IDs/quotes/CSV, and source geometry/materials are unchanged. No local browser, build or publication is part of this pending proposal.
