# PTM / TDE page-69 examples: isolated prototypes

Baseline: public PR33 commit `a68a0fe2f234d7375338671cca20940257ab695b`, tree `48e8af658763f78c7a1efc7df54d9ab4388bea96`.
Authority: `/catalog/source?page=69`, full image `/catalog-source/page-069.webp`, SHA-256 `4f0833448f3519f9519a2e09fa62b4c28016665b4cd8e95c7341b17042ff5885`.
Independent feature review SHA-256 `9b5dab74676891728eea53145afbcdcc5a51961a6877cc520a372fb09c546758`; feature comparison SHA-256 `bc4ec0619409735aad7050f3d510f631c6cbdc30244fe825f1a9727c19eae5e5`.

These are two new offline-only model archetypes and three icon candidates. No existing geometry, icon, registry, record, runtime resolver, image, UUID, media, confidence or count was changed. Both model archetypes declare `runtimeEligible: false` and are absent from runtime registries. The dedicated model resolver accepts model type IDs only. The two possible future model consumers are exactly `cat-ptm-tded-v012` (ПТМ(Д)-У1) and `cat-ptm-tded-v013` (ТДЕ(Д)-9-У3); this document does not establish a new binding or extend earlier exemplar authority.

The third icon candidate is a dedicated paired family comparison for `cat-ptm-tded` only. It is composed exclusively from the two corrected front-view symbols, with no added strokes. The current `paired-protection-enclosures` icon repeats unsupported TDE roof posts (`sourceIconShapesB.js:151–157`); that existing output is preserved. The paired prototype has separate icon-only metadata, `geometryType: null`, and is deliberately absent from the two-model type list. Its dedicated disclosure says these are two separately labelled examples, not one family exterior. It does not justify family 3D or any table-row binding.

## Retained forms and removed additions

PTM retains the closed body, inset front outline, two round front marks, neutral overhanging cap and two low support silhouettes. The marks are flat rings without a functional name or mechanism. Low blocks summarize the front support outlines and broad low side rectangle, without inventing openings or concealed attachment. There are no rear ventilation slats, warning triangle or lightning symbol. All shading is neutral; no red finish or physical material is asserted.

TDE retains a plain closed body and inset front outline. Its local primitive adds no handle, four corner fasteners, cap or inherited continuous plinth. It does not call the shared shell constructor. This deliberately preserves the visible PTM/TDE distinction.

The inset outlines are graphical surface cues. Their tiny render offsets prevent z-fighting and are not evidence of physical panel depth. The source only supplies front/side projections. Plain closures complete a schematic volume, without asserting a verified rear construction. No numeric printed dimensions were converted to mesh dimensions.

## Explicit omissions

- PTM: small rectangle near the upper side centre, short under-cap segments, and exact support opening/depth are omitted. The cap gap is visible, but the prototype does not assign a mechanical function to those short segments
- TDE: the two upper round marks, large side inset rectangle, and one lower outward rectangular projection with a narrow step are omitted from 3D. Their function, depth and spatial placement are not established. The circles lie below the outer enclosure top in the source; they are not named lifting eyes or turned into roof loops
- Dedicated icons conservatively show the source front projection only. They omit those same small side details and short PTM under-cap segments, retain neutral source silhouettes, and add no roof posts, lightning or extra side strokes

Required visible disclosure for any future integrated presentation:

«Упрощённая иллюстрация примера из каталога. Мелкие элементы бокового вида и их пространственное расположение воспроизведены не полностью; см. исходный чертёж на стр. 69. Размеры, материалы и комплектация исполнения не утверждаются. Не CAD.»

Keep this note beside the illustrative model and preserve access to both `/catalog/source?page=69` and `/catalog-source/page-069.webp`. The existing product crop clips part of TDE's far-right projection. The full drawing remains authoritative and shows details omitted here. An unsupported addition is not proof that the actual product lacks that feature.

## Binding and review boundary

All eleven power-table rows keep their current typical icons and null 3D. The family keeps its existing paired icon and null 3D. Source-context links to a labelled example do not transfer its U1/U3 designation or define a table-row exterior. Future integration must be separately reviewed and limited to the two exact example records plus the family icon only, while keeping imported bodies, UUIDs, source media, confidence and coverage counts unchanged.

Run `node --test tests/protection-example-prototype.test.mjs` and `node scripts/render-protection-example-prototype.mjs <output-directory>` from `frontend`. Rendering uses the existing CPU z-buffer helper over the new actual Three.js triangles, plus the actual vector icon output. It uses no browser or WebGL and does not establish GPU appearance, browser lifecycle, exact dimensions, finish or manufacturing accuracy.
