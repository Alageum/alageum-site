# Transformer catalog review and activation record

The source transcriptions below began as a review-only checkpoint. Independent data and asset reviews are now complete: the bundled catalog contains 823 records, including 238 unchanged legacy records and 585 newly admitted records. Exactly 251 new geometry bindings and 257 new icon bindings are active. See [data clearance](data-clearance.json), [asset clearance](assets-clearance.json), [runtime verification](assets-runtime-verification.json), and the [authoritative all-record coverage ledger](../runtime-coverage/index.json). No merge or deployment is implied.

The user-supplied 18 March 2026 transformer catalog has 187 physical pages and 844,084,378 bytes. The source SHA-256 is recorded in source-manifest.json. The original PDF is deliberately excluded. Optimized page-image hashes are preserved in source-page-assets.json.

The pages 6–45 transcription contains 144 explicit model rows, 15 execution families and 310 separate connection configurations. Standard, 01, Х1К1, copper-winding and switchable executions remain distinct even when short model names repeat. No full orderable SKU, price, stock, legal manufacturer or unspecified dimensional unit is inferred.

The independently reviewed source inventory contains 78 families and 540 entries: 534 explicit model/variation rows, 2 drawing-only names and 4 accessories, plus 407 configurations. After identity holds, 508 model/variation entries and 77 family parents are admitted; the all-held NTMI parent is excluded. The cleared input digest and source corrections are recorded in data-clearance.json.

Of the 540 entries, 508 have no old identity candidate. The 32 candidates against 14 old IDs are held out of automatic merges and duplicate card creation. All 238 old IDs and source facts are retained. Shared construction assets never merge distinct product records.

Construction evidence is not a CAD claim. Generic photos do not establish a specific model's exterior. Missing drawings, ambiguous execution bindings and unknown units remain explicit. The Asia Trafo section says dimensions, masses and drawings are provided on request.

Physical page 166 prints 168. Reactors continue through page 177; questionnaires start at 178. Source inconsistencies stay raw with warnings. Verified Uк transcription corrections for 100-kVA ТМГ, ТМ and ТМГС use 4,5 / 4,7 / 4,5.

Base: verified PR28 commit 790692fb0a0a4809c75cab05b6e4e751257a3323. No main merge or deployment is included.

## Published evidence locations

Historical inspection reports retain their original local inspection paths for traceability. Their published equivalents are the [asset QA images and render report](../assets/qa/) and [focused regression log](assets-final-focused-tests.log). In particular, the `final-qa` and `final-focused-tests.log` references inside `assets-non-power-topology-final.json` correspond to these shipped artifacts. The hash-bound independent review and clearance records are preserved unchanged.

The [runtime coverage index](../runtime-coverage/index.json) covers all 823 admitted records, including the 77 new family parents. It lists geometry and icon decisions separately, preserves legacy generic/typical approximations as such, keeps the 32 excluded identity candidates in a separate ledger, and distinguishes registered-but-unused presets from missing or unapproved record bindings. The 540-row proposal ledger remains source-review evidence rather than runtime activation authority.
