import { protectionExampleTypes } from './protectionExampleTypes.js';
import { measurementColumn2026Types } from './measurementColumn2026Types.js';
import { accessory2026Types } from './accessory2026Types.js';
import { transformer2026Types } from './transformer2026Types.js';
import { sourceConstructionDefinitions } from './sourceConstructions.js';

/**
 * Shared visual vocabulary, deliberately independent of catalogue records/SKUs.
 * Geometry is an illustrative interpretation of the cited representative sources,
 * not a dimensioned model, approved construction or evidence of a variant's layout.
 * Source photographs and drawings remain unchanged in the catalogue's source view.
 */
export const equipmentModelTypes = Object.freeze({
  'oil-transformer': { name: 'Масляный трансформатор', reference: '/brand/transformer.png' },
  'dry-transformer': { name: 'Сухой трансформатор', reference: null },
  'instrument-transformer': { name: 'Измерительный трансформатор', reference: null },
  substation: { name: 'Комплектная подстанция', reference: '/catalog-products/cat-ktp-25-250.webp' },
  'modular-substation': { name: 'Блочно-модульная подстанция', reference: '/catalog-products/cat-bktp-modular.webp' },
  'pole-substation': { name: 'Мачтовая подстанция', reference: '/catalog-products/cat-mtp-25-100.webp' },
  switchgear: { name: 'Распределительное устройство', reference: '/catalog-products/cat-kru-kerneu-6-10.webp' },
  disconnector: { name: 'Разъединитель', reference: null },
  'distribution-cabinet': { name: 'Распределительный шкаф', reference: '/catalog-products/cat-shcho-70.webp' },
  'control-cabinet': { name: 'Шкаф управления', reference: '/catalog-products/cat-pusk-3m.webp' },
  'compensation-cabinet': { name: 'Шкаф компенсации', reference: null },
  'protection-cabinet': { name: 'Шкаф электрохимической защиты', reference: '/catalog-products/cat-ptm-tded.webp' },
  'metering-box': { name: 'Контрольно-измерительный пункт', reference: '/catalog-products/cat-kik.webp' },
  'wall-box': { name: 'Навесной ящик', reference: '/catalog-products/cat-ya5000-rusm5000.webp' },
  'wall-control-box': { name: 'Навесной ящик с приборами', reference: '/catalog-products/cat-shtz.webp' },
  'plain-floor-cabinet': { name: 'Напольный однодверный шкаф', reference: '/catalog-products/cat-shchsu-04.webp' },
  'single-door-switchgear': { name: 'Однодверная камера КСО', reference: '/catalog-products/kso-366.webp' },
  'compact-substation': { name: 'Закрытая КТП с вводами на крыше', reference: '/catalog-products/cat-ktpn-25-3150.webp' },
  'double-compact-substation': { name: 'Двухтрансформаторная закрытая КТП', reference: '/catalog-products/cat-2ktpn-25-3150.webp' },
  'kiosk-substation': { name: 'КТП в киоске', reference: '/catalog-products/cat-ktpg-25-3150.webp' },
  'outdoor-switchgear-shelter': { name: 'Наружное КРУ в укрытии', reference: '/catalog-products/cat-k8m.webp' },
  'wall-canopy-box': { name: 'Навесной блок с козырьком', reference: '/catalog-products/cat-bdrm.webp' },
  'mining-skid-substation': { name: 'Передвижная КТП на полозьях', reference: '/catalog-products/cat-pktp.webp' },
  'railway-frame-substation': { name: 'Железнодорожная КТП на раме', reference: '/catalog-products/cat-ktpzh-25-1000.webp' },
  'upper-input-protection': { name: 'Установка защиты с воздушным вводом', reference: '/catalog-products/cat-ukzv.webp' },
  'outdoor-floor-cabinet': { name: 'Наружный шкаф с козырьком', reference: '/catalog-products/cat-ukzn.webp' },
  ...sourceConstructionDefinitions,
  equipment: { name: 'Электрооборудование', reference: null },
});

export const resolveModelType = (type) => Object.hasOwn(equipmentModelTypes, type) || Object.hasOwn(transformer2026Types, type) || Object.hasOwn(accessory2026Types, type) || Object.hasOwn(measurementColumn2026Types, type) || Object.hasOwn(protectionExampleTypes, type) ? type : 'equipment';
export const equipmentModelName = (type) => (protectionExampleTypes[type] || measurementColumn2026Types[type] || accessory2026Types[type] || transformer2026Types[type] || equipmentModelTypes[resolveModelType(type)]).name;
export const MODEL_DISCLOSURE = 'Иллюстративная 3D-модель типа; не CAD и не чертёж конкретного исполнения';
