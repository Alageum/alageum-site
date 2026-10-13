// Candidate source-context exterior only. Nothing in this module binds a record.
// Keep metadata independent of Three.js so icons do not load a 3D engine.
export const MEASUREMENT_COLUMN_2026_TYPE = 'tr26-measurement-column-zom-znom-source';
export const MEASUREMENT_COLUMN_2026_DISCLOSURE = 'Иллюстративный внешний вид по рисунку каталога, стр. 99/100. Показано расположение видимых элементов рисунка; назначение выводов и комплектность конкретного исполнения не подтверждены. Не CAD и не размерная модель.';
export const measurementColumn2026Types = Object.freeze({
  [MEASUREMENT_COLUMN_2026_TYPE]: Object.freeze({
    name: 'ЗОМ / ЗНОМ: внешний вид рисунка каталога',
    pages: Object.freeze([99, 100]),
    confidence: 'source-context-exterior-candidate',
    reviewStatus: 'independent-integration-review-required',
    runtimeEligible: false, dimensionAccurate: false, exactMeshReuseAllowed: false,
    units: 'arbitrary-scene-units',
    sourceDecisionSha256: '09369c076e66a8f117ca50dc96b3bddf97bf626d22dfb6649c30c04356d7367b',
    limits: Object.freeze([
      'Shared drawing interpretation only; no delivered-configuration equivalence',
      'Cover-bushing electrical roles and delivered terminal schedule are unverified',
      'No dimensions, installation clearances, manufacturing tolerances or accessory claims',
      'No hidden construction, wiring, internal parts or explanatory cutaways',
      'Small fasteners, mounting holes, drain and earthing details are omitted',
      'Neutral display colours and arbitrary proportions do not establish materials or finish',
      'Rear closure is plain; source-visible details are not mirrored onto unseen faces',
    ]),
  }),
});
// Evidence contexts are not a runtime binding table. The API accepts the one
// type ID only, never one of these record IDs; records and ratings stay separate.
export const measurementColumn2026SourceContexts = Object.freeze([
  Object.freeze({ recordId: 'alageum-2026-zom-1p25-35', page: 99,
    caveat: 'Стр. 99 повторяет более полное расположение выводов при другом табличном контексте; комплектность конкретного ЗОМ не подтверждена.' }),
  Object.freeze({ recordId: 'alageum-2026-znom35-config1', page: 100,
    caveat: 'Один рисунок на стр. 100 сопровождает две строки напряжений; механические различия или одинаковая комплектность исполнений не подтверждены.' }),
  Object.freeze({ recordId: 'alageum-2026-znom35-config2', page: 100,
    caveat: 'Один рисунок на стр. 100 сопровождает две строки напряжений; механические различия или одинаковая комплектность исполнений не подтверждены.' }),
]);
export const resolveMeasurementColumn2026Type = type => typeof type === 'string' && Object.hasOwn(measurementColumn2026Types, type) ? type : null;
