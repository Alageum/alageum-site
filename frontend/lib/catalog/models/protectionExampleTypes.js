// Offline candidates only. This module is deliberately absent from all runtime
// registries. Source contexts name possible future consumers, never bindings.
export const PTM_SOURCE_EXAMPLE_TYPE = 'source69-ptm-u1-example';
export const TDE_SOURCE_EXAMPLE_TYPE = 'source69-tde9-u3-example';
// Icon-only family comparison; deliberately absent from protectionExampleTypes.
export const PAIRED_PROTECTION_EXAMPLE_ICON_TYPE = 'source69-paired-protection-examples-icon';
export const PROTECTION_EXAMPLE_DISCLOSURE = 'Упрощённая иллюстрация примера из каталога. Мелкие элементы бокового вида и их пространственное расположение воспроизведены не полностью; см. исходный чертёж на стр. 69. Размеры, материалы и комплектация исполнения не утверждаются. Не CAD.';

const common = {
  runtimeEligible: false, dimensionAccurate: false, exactMeshReuseAllowed: false,
  confidence: 'source-example-prototype', reviewStatus: 'independent-integration-review-required',
  units: 'arbitrary-scene-units', sourceFamilyId: 'cat-ptm-tded',
  pages: Object.freeze([69]), sourcePageUrl: '/catalog/source?page=69',
  sourcePageImage: '/catalog-source/page-069.webp',
  sourceSha256: '4f0833448f3519f9519a2e09fa62b4c28016665b4cd8e95c7341b17042ff5885',
  disclosure: PROTECTION_EXAMPLE_DISCLOSURE,
  limits: Object.freeze([
    'Only the separately labelled page-69 source example, never a power-table execution',
    'Neutral shading and arbitrary proportions do not establish dimensions, material or finish',
    'Plain closures complete a schematic volume; unseen rear construction is unverified',
    'No internal apparatus, functional fitting names or mirrored hidden details',
    'The full source drawing remains authoritative; the product crop clips the TDE side projection',
  ]),
};
export const protectionExampleTypes = Object.freeze({
  [PTM_SOURCE_EXAMPLE_TYPE]: Object.freeze({
    ...common, name: 'ПТМ(Д)-У1: пример со стр. 69',
    omittedFeatures: Object.freeze(['Small upper side rectangle', 'Short under-cap segments', 'Support opening and construction depth']),
    simplification: 'Closed body, inset front outline, two flat round marks, overhanging cap and simplified low supports. Round marks have no assigned mechanical function.',
  }),
  [TDE_SOURCE_EXAMPLE_TYPE]: Object.freeze({
    ...common, name: 'ТДЕ(Д)-9-У3: пример со стр. 69',
    omittedFeatures: Object.freeze(['Two upper round marks in side projection', 'Side inset rectangle', 'One lower side projection and narrow step']),
    simplification: 'Plain closed body with inset front outline only. Small side details have uncertain depth, function and spatial placement.',
  }),
});
export const protectionExampleSourceContexts = Object.freeze([
  Object.freeze({ type: PTM_SOURCE_EXAMPLE_TYPE, recordId: 'cat-ptm-tded-v012', sourceLabel: 'ПТМ(Д)-У1', page: 69 }),
  Object.freeze({ type: TDE_SOURCE_EXAMPLE_TYPE, recordId: 'cat-ptm-tded-v013', sourceLabel: 'ТДЕ(Д)-9-У3', page: 69 }),
]);
export const protectionExampleFamilyIconContext = Object.freeze({
  type: PAIRED_PROTECTION_EXAMPLE_ICON_TYPE, recordId: 'cat-ptm-tded', page: 69,
  iconOnly: true, runtimeEligible: false, geometryType: null,
  sourcePageUrl: common.sourcePageUrl, sourcePageImage: common.sourcePageImage,
  disclosure: 'Парный символ двух отдельно подписанных примеров со стр. 69; не общий корпус семейства и не внешний вид табличного исполнения. Мелкие элементы боковых видов опущены.',
});
export const resolveProtectionExampleType = type => typeof type === 'string' && Object.hasOwn(protectionExampleTypes, type) ? type : null;
