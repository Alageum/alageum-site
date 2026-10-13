// Proposed page-85 exterior vocabulary only. This module does not bind products.
export const ACCESSORY_2026_DISCLOSURE = 'Иллюстративная внешняя форма по фото на стр. 85; не CAD, не размеры и не все исполнения изделия';

const definition = (name, build, limits) => Object.freeze({
  name, build, pages: Object.freeze([85]), reference: '/catalog-source/transformers-2026/page-085.webp',
  confidence: 'source-photo-exterior-proposal', reviewStatus: 'independent-review-required',
  dimensionAccurate: false, exactMeshReuseAllowed: false, runtimeEligible: false,
  limits: Object.freeze(limits),
});
export const accessory2026Types = Object.freeze({
  'tr26-accessory-relay-tr100': definition('ТР-100: внешняя форма реле', 'relay', [
    'No terminal count or hidden connections', 'Plain unverified rear closure', 'Blank nonfunctional display',
  ]),
  'tr26-accessory-probe-pt100': definition('pt-100: показанный датчик с кабелем', 'probe', [
    'Only the pictured probe execution', 'Coil arrangement is illustrative, not cable length', 'Lead functions are not inferred',
  ]),
  'tr26-accessory-damper-ek290': definition('ЕК-290: внешняя форма виброопоры', 'damper', [
    'Only the one source-visible mounting hole', 'Seat curvature is illustrative', 'No internal damping layers or unseen hardware',
  ]),
});
export const accessory2026TypeIds = Object.freeze(Object.keys(accessory2026Types));
export const resolveAccessory2026Type = type => typeof type === 'string' && Object.hasOwn(accessory2026Types, type) ? type : null;
